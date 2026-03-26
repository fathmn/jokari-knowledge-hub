import asyncio
import os
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import get_settings
from app.extractors import ExtractionContext, get_extractor
from app.extractors.stub import LocalStubExtractor
from app.models.audit_log import AuditLog
from app.models.chunk import Chunk
from app.models.document import DocType, Document, DocumentStatus
from app.models.evidence import Evidence
from app.models.record import Record, RecordStatus
from app.parsers import get_parser
from app.schemas.knowledge.registry import get_schema_registry
from app.services.chunking import ChunkingService
from app.services.completeness import CompletenessService
from app.services.merge import MergeService
from app.services.storage import get_storage_service


class IngestionService:
    """Main service for document ingestion pipeline."""

    def __init__(self, db: Session):
        self.db = db
        self.storage = get_storage_service()
        self.chunking = ChunkingService()
        self.completeness = CompletenessService()
        self.merge = MergeService()
        self.registry = get_schema_registry()

    def process_document(self, document_id: UUID):
        """Run the full ingestion pipeline for a document."""
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError(f"Dokument nicht gefunden: {document_id}")

        try:
            self._update_status(document, DocumentStatus.PARSING)
            parsed_doc = self._parse_document(document)

            chunks = self._create_chunks(document, parsed_doc)

            self._update_status(document, DocumentStatus.EXTRACTING)
            self._extract_records(document, chunks, parsed_doc.raw_text)

            self._update_status(document, DocumentStatus.PENDING_REVIEW)
            self._create_audit_log(
                "ingestion_complete",
                "Document",
                document.id,
                {"chunks_created": len(chunks)},
            )
        except Exception as exc:
            self._safe_rollback()
            try:
                self._update_status(document, DocumentStatus.EXTRACTION_FAILED, str(exc))
                self._create_audit_log(
                    "ingestion_failed",
                    "Document",
                    document.id,
                    {"error": str(exc)},
                )
            except Exception:
                self._safe_rollback()
            raise

    def _update_status(self, document: Document, status: DocumentStatus, error: str = None):
        """Update document status."""
        document.status = status
        if error:
            document.error_message = error
        self.db.commit()

    def _parse_document(self, document: Document):
        """Parse the document file."""
        temp_path = self.storage.download_to_temp(document.file_path)

        try:
            parser = get_parser(temp_path)
            return parser.parse(temp_path)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _create_chunks(self, document: Document, parsed_doc) -> list[Chunk]:
        """Create and store chunks."""
        text_chunks = self.chunking.create_chunks(parsed_doc)
        db_chunks = []

        for text_chunk in text_chunks:
            embedding = self.chunking.generate_dummy_embedding(text_chunk.text)

            chunk = Chunk(
                document_id=document.id,
                section_path=text_chunk.section_path,
                text=text_chunk.text,
                embedding=embedding,
                confidence=text_chunk.confidence,
                start_offset=text_chunk.start_offset,
                end_offset=text_chunk.end_offset,
                chunk_index=text_chunk.chunk_index,
            )
            self.db.add(chunk)
            db_chunks.append(chunk)

        self.db.commit()
        return db_chunks

    def _extract_records(self, document: Document, chunks: list[Chunk], full_text: str):
        """Extract structured records from document chunks and merge duplicate findings."""
        extractor = get_extractor()
        schema = self.registry.get_schema(document.doc_type)
        extraction_units = self._build_extraction_units(document, chunks, full_text)
        aggregated_records: list[dict] = []
        aggregated_index: dict[str, int] = {}
        stub_fallback_count = 0

        loop = self._get_event_loop()

        for unit in extraction_units:
            context = self._build_context(
                document=document,
                unit=unit,
                chunk_total=len(extraction_units),
            )
            result, used_stub = self._extract_unit(
                extractor=extractor,
                schema=schema,
                context=context,
                text=unit["text"],
                loop=loop,
            )
            if used_stub:
                stub_fallback_count += 1

            candidates = self._normalize_result(
                document=document,
                default_schema_type=schema.__name__,
                result=result,
                context=context,
            )

            for candidate in candidates:
                self._aggregate_record(candidate, aggregated_records, aggregated_index)

        # Start the write phase with a clean session after potentially long LLM calls.
        self._safe_rollback()
        records_created = 0
        for candidate in aggregated_records:
            try:
                self._create_record_from_extraction(
                    document=document,
                    data=candidate["data"],
                    schema_type=candidate["schema_type"],
                    evidence_pointers=candidate["evidence_pointers"],
                    chunks=chunks,
                    confidence=candidate["confidence"],
                    needs_review=candidate["needs_review"],
                    source_section=candidate["source_section"],
                )
                records_created += 1
            except Exception as exc:
                self._safe_rollback()
                record_label = (
                    candidate["data"].get("title")
                    or candidate["data"].get("name")
                    or candidate["source_section"]
                    or candidate["schema_type"]
                )
                raise RuntimeError(
                    f"Fehler beim Persistieren von Record '{record_label}': {exc}"
                ) from exc

        if stub_fallback_count:
            self._create_audit_log(
                "extraction_fallback_used",
                "Document",
                document.id,
                {"provider": "stub", "units": stub_fallback_count},
            )

        self._create_audit_log(
            "records_extracted",
            "Document",
            document.id,
            {
                "records_created": records_created,
                "extraction_units": len(extraction_units),
            },
        )

    def _build_extraction_units(self, document: Document, chunks: list[Chunk], full_text: str) -> list[dict]:
        if not chunks:
            return [{"text": full_text, "section_path": "", "chunk_index": 0}]

        if document.doc_type == DocType.TRAINING_MODULE and chunks and self._should_group_training_module_chunks(chunks):
            return self._group_training_module_units(chunks)

        if len(chunks) == 1:
            chunk = chunks[0]
            return [
                {
                    "text": chunk.text or full_text,
                    "section_path": chunk.section_path or "",
                    "chunk_index": chunk.chunk_index,
                }
            ]

        return [
            {
                "text": chunk.text,
                "section_path": chunk.section_path or "",
                "chunk_index": chunk.chunk_index,
            }
            for chunk in sorted(chunks, key=lambda item: item.chunk_index)
            if chunk.text and chunk.text.strip()
        ]

    def _should_group_training_module_chunks(self, chunks: list[Chunk]) -> bool:
        return any(chunk.section_path and " > " in chunk.section_path for chunk in chunks)

    def _group_training_module_units(self, chunks: list[Chunk]) -> list[dict]:
        grouped: dict[str, dict] = {}
        ordered_chunks = sorted(chunks, key=lambda item: item.chunk_index)
        current_root: str | None = None

        for chunk in ordered_chunks:
            text = (chunk.text or "").strip()
            if not text:
                continue

            section_path = chunk.section_path or ""
            root_section = section_path.split(" > ")[0].strip() if section_path else ""
            if not root_section:
                root_section = f"chunk_{chunk.chunk_index}"
            elif self._is_media_like_training_section(root_section) and current_root:
                root_section = current_root
            else:
                current_root = root_section

            group = grouped.setdefault(
                root_section,
                {
                    "text_parts": [],
                    "section_path": root_section,
                    "chunk_index": chunk.chunk_index,
                },
            )
            group["text_parts"].append(text)

        units = []
        for root_section, group in grouped.items():
            combined_text = "\n\n".join(group["text_parts"]).strip()
            if not combined_text:
                continue
            units.append(
                {
                    "text": combined_text,
                    "section_path": group["section_path"],
                    "chunk_index": group["chunk_index"],
                }
            )

        return units

    def _is_media_like_training_section(self, section_name: str) -> bool:
        normalized = section_name.lower()
        return (
            normalized.startswith("titelbild:")
            or normalized.startswith("anwendungsbilder:")
            or normalized.startswith("medien:")
            or normalized.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".tif", ".tiff"))
        )

    def _build_context(self, document: Document, unit: dict, chunk_total: int) -> ExtractionContext:
        return ExtractionContext(
            department=document.department.value,
            doc_type=document.doc_type.value,
            document_id=str(document.id),
            filename=document.filename,
            chunk_index=unit["chunk_index"],
            chunk_total=chunk_total,
            section_path=unit.get("section_path") or None,
            document_version=self._document_version(document),
        )

    def _extract_unit(self, extractor, schema, context: ExtractionContext, text: str, loop) -> tuple:
        settings = get_settings()
        timeout_seconds = max(float(getattr(settings, "llm_timeout_seconds", 120.0)), 1.0)

        try:
            result = loop.run_until_complete(
                asyncio.wait_for(
                    extractor.extract(text, schema, context),
                    timeout=timeout_seconds,
                )
            )
        except asyncio.TimeoutError:
            if settings.llm_provider == "claude":
                fallback_result = loop.run_until_complete(LocalStubExtractor().extract(text, schema, context))
                if fallback_result.records or fallback_result.data:
                    return fallback_result, True
            raise RuntimeError(
                f"LLM-Timeout nach {timeout_seconds:.0f}s fuer Chunk {context.chunk_index + 1}/{context.chunk_total}"
            )

        if self._should_use_stub_fallback(result):
            fallback_result = loop.run_until_complete(LocalStubExtractor().extract(text, schema, context))
            if fallback_result.records or fallback_result.data:
                return fallback_result, True
        return result, False

    def _normalize_result(
        self,
        document: Document,
        default_schema_type: str,
        result,
        context: ExtractionContext,
    ) -> list[dict]:
        candidates: list[dict] = []

        if result.records:
            for extracted_record in result.records:
                prepared_data = self._prepare_data(
                    document=document,
                    data=extracted_record.data,
                    source_section=extracted_record.source_section or context.section_path,
                )
                candidates.append(
                    {
                        "data": prepared_data,
                        "schema_type": extracted_record.schema_type or default_schema_type,
                        "evidence_pointers": extracted_record.evidence,
                        "confidence": extracted_record.confidence,
                        "needs_review": extracted_record.confidence < 0.5,
                        "source_section": extracted_record.source_section or context.section_path,
                    }
                )

        elif result.data:
            prepared_data = self._prepare_data(
                document=document,
                data=result.data,
                source_section=context.section_path,
            )
            candidates.append(
                {
                    "data": prepared_data,
                    "schema_type": default_schema_type,
                    "evidence_pointers": result.evidence,
                    "confidence": result.confidence,
                    "needs_review": result.needs_review or not result.valid,
                    "source_section": context.section_path,
                }
            )

        return [candidate for candidate in candidates if candidate["data"]]

    def _prepare_data(self, document: Document, data: dict, source_section: str | None) -> dict:
        prepared = dict(data or {})

        if document.doc_type == DocType.TRAINING_MODULE:
            title = prepared.get("title") or prepared.get("name") or self._section_leaf(source_section)
            if title:
                prepared["title"] = title.strip()

            version = prepared.get("version") or self._document_version(document)
            if version:
                prepared["version"] = version

            product_code = prepared.get("product_code") or prepared.get("artnr") or prepared.get("product_id")
            if product_code:
                prepared["product_code"] = str(product_code).strip()

            for list_field in ("objectives", "key_points", "related_products"):
                value = prepared.get(list_field)
                if isinstance(value, str) and value.strip():
                    prepared[list_field] = [value.strip()]

        return prepared

    def _aggregate_record(self, candidate: dict, aggregated_records: list[dict], aggregated_index: dict[str, int]):
        batch_key = self._build_batch_key(
            schema_type=candidate["schema_type"],
            data=candidate["data"],
            source_section=candidate["source_section"],
        )
        if not batch_key:
            aggregated_records.append(candidate)
            return

        existing_index = aggregated_index.get(batch_key)
        if existing_index is None:
            aggregated_index[batch_key] = len(aggregated_records)
            aggregated_records.append(candidate)
            return

        existing = aggregated_records[existing_index]
        existing["data"] = self._merge_record_data(existing["data"], candidate["data"])
        existing["evidence_pointers"] = self._merge_evidence(
            existing["evidence_pointers"],
            candidate["evidence_pointers"],
        )
        existing["confidence"] = max(existing["confidence"], candidate["confidence"])
        existing["needs_review"] = existing["needs_review"] and candidate["needs_review"]
        existing["source_section"] = existing["source_section"] or candidate["source_section"]

    def _build_batch_key(self, schema_type: str, data: dict, source_section: str | None) -> str | None:
        try:
            schema = self.registry.get_schema_by_name(schema_type)
        except ValueError:
            schema = None

        if schema:
            primary_fields = schema.get_primary_key_fields()
            if primary_fields and all(self._is_filled(data.get(field)) for field in primary_fields):
                return f"{schema_type}:{schema.compute_primary_key(data)}"

        fallback_key = source_section or data.get("title") or data.get("name")
        if fallback_key:
            return f"{schema_type}:section:{str(fallback_key).strip().lower()}"

        return None

    def _merge_record_data(self, base_data: dict, new_data: dict) -> dict:
        merged = dict(base_data)

        for field, new_value in new_data.items():
            if not self._is_filled(new_value):
                continue

            current_value = merged.get(field)
            if not self._is_filled(current_value):
                merged[field] = new_value
                continue

            if isinstance(current_value, list) and isinstance(new_value, list):
                merged[field] = list(dict.fromkeys([*current_value, *new_value]))
                continue

            if isinstance(current_value, dict) and isinstance(new_value, dict):
                merged[field] = {**current_value, **{key: value for key, value in new_value.items() if self._is_filled(value)}}
                continue

            if isinstance(current_value, str) and isinstance(new_value, str):
                if field == "content":
                    if new_value in current_value:
                        continue
                    if current_value in new_value:
                        merged[field] = new_value
                    else:
                        merged[field] = f"{current_value}\n\n{new_value}".strip()
                    continue
                if len(new_value) > len(current_value):
                    merged[field] = new_value
                continue

            merged[field] = new_value

        return merged

    def _merge_evidence(self, current_items: list, new_items: list) -> list:
        seen = set()
        merged = []

        for item in [*(current_items or []), *(new_items or [])]:
            key = (item.field_path, item.excerpt, item.chunk_index)
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)

        return merged

    def _document_version(self, document: Document) -> str | None:
        if not document.version_date:
            return None
        return document.version_date.date().isoformat()

    def _section_leaf(self, source_section: str | None) -> str | None:
        if not source_section:
            return None
        return source_section.split(">")[-1].strip()

    def _is_filled(self, value) -> bool:
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        if isinstance(value, list) and not value:
            return False
        if isinstance(value, dict) and not value:
            return False
        return True

    def _get_event_loop(self):
        try:
            return asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop

    def _create_record_from_extraction(
        self,
        document: Document,
        data: dict,
        schema_type: str,
        evidence_pointers: list,
        chunks: list[Chunk],
        confidence: float = 0.5,
        needs_review: bool = False,
        source_section: str = None,
    ):
        """Create a single record from extracted data."""
        primary_key = self.merge.compute_primary_key(document.doc_type, data)

        existing = self.merge.find_existing_record(
            self.db,
            schema_type,
            primary_key,
        )

        if existing:
            self.merge.create_proposed_update(
                self.db,
                existing,
                data,
                document.id,
            )
            return

        completeness = self.completeness.calculate_score(document.doc_type, data)

        status = RecordStatus.PENDING
        if needs_review or confidence < 0.5:
            status = RecordStatus.NEEDS_REVIEW

        if source_section:
            data["_source_section"] = source_section

        record = Record(
            document_id=document.id,
            department=document.department,
            schema_type=schema_type,
            primary_key=primary_key,
            data_json=data,
            completeness_score=completeness,
            status=status,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        for evidence_pointer in evidence_pointers:
            chunk = next(
                (candidate for candidate in chunks if candidate.chunk_index == evidence_pointer.chunk_index),
                chunks[0] if chunks else None,
            )

            evidence = Evidence(
                record_id=record.id,
                chunk_id=chunk.id if chunk else None,
                field_path=evidence_pointer.field_path,
                excerpt=evidence_pointer.excerpt[:1000] if evidence_pointer.excerpt else None,
                start_offset=evidence_pointer.start_offset,
                end_offset=evidence_pointer.end_offset,
            )
            self.db.add(evidence)

        self.db.commit()

    def _should_use_stub_fallback(self, result) -> bool:
        """Fallback to heuristics only when Claude returns no usable records."""
        settings = get_settings()
        if settings.llm_provider != "claude":
            return False

        return not result.records and not result.data

    def _safe_rollback(self):
        if not self.db:
            return
        rollback = getattr(self.db, "rollback", None)
        if callable(rollback):
            rollback()

    def _create_audit_log(
        self,
        action: str,
        entity_type: str,
        entity_id: UUID,
        details: dict = None,
    ):
        """Create an audit log entry."""
        log = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor="system",
            details_json=details,
        )
        self.db.add(log)
        self.db.commit()
