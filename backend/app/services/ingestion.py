import os
import asyncio
from uuid import UUID
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.document import Document, DocumentStatus, DocType
from app.models.chunk import Chunk
from app.models.record import Record, RecordStatus
from app.models.evidence import Evidence
from app.models.audit_log import AuditLog
from app.parsers import get_parser
from app.services.storage import get_storage_service
from app.services.chunking import ChunkingService
from app.services.completeness import CompletenessService
from app.services.merge import MergeService
from app.extractors import get_extractor, ExtractionContext
from app.schemas.knowledge.registry import get_schema_registry


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
            # Step 1: Parse document
            self._update_status(document, DocumentStatus.PARSING)
            parsed_doc = self._parse_document(document)

            # Step 2: Create chunks
            chunks = self._create_chunks(document, parsed_doc)

            # Step 3: Extract records
            self._update_status(document, DocumentStatus.EXTRACTING)
            self._extract_records(document, chunks, parsed_doc.raw_text)

            # Step 4: Complete
            self._update_status(document, DocumentStatus.PENDING_REVIEW)

            self._create_audit_log(
                "ingestion_complete",
                "Document",
                document.id,
                {"chunks_created": len(chunks)}
            )

        except Exception as e:
            self._update_status(document, DocumentStatus.EXTRACTION_FAILED, str(e))
            self._create_audit_log(
                "ingestion_failed",
                "Document",
                document.id,
                {"error": str(e)}
            )
            raise

    def _update_status(self, document: Document, status: DocumentStatus, error: str = None):
        """Update document status."""
        document.status = status
        if error:
            document.error_message = error
        self.db.commit()

    def _parse_document(self, document: Document):
        """Parse the document file."""
        # Download to temp file
        temp_path = self.storage.download_to_temp(document.file_path)

        try:
            parser = get_parser(temp_path)
            return parser.parse(temp_path)
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _create_chunks(self, document: Document, parsed_doc) -> list[Chunk]:
        """Create and store chunks."""
        text_chunks = self.chunking.create_chunks(parsed_doc)
        db_chunks = []

        for tc in text_chunks:
            embedding = self.chunking.generate_dummy_embedding(tc.text)

            chunk = Chunk(
                document_id=document.id,
                section_path=tc.section_path,
                text=tc.text,
                embedding=embedding,
                confidence=tc.confidence,
                start_offset=tc.start_offset,
                end_offset=tc.end_offset,
                chunk_index=tc.chunk_index
            )
            self.db.add(chunk)
            db_chunks.append(chunk)

        self.db.commit()
        return db_chunks

    def _extract_records(self, document: Document, chunks: list[Chunk], full_text: str):
        """Extract structured records from chunks. Supports multi-record extraction."""
        extractor = get_extractor()
        schema = self.registry.get_schema(document.doc_type)

        context = ExtractionContext(
            department=document.department.value,
            doc_type=document.doc_type.value,
            document_id=str(document.id),
            filename=document.filename,
            chunk_index=0
        )

        # Run extraction (sync wrapper for async)
        result = asyncio.get_event_loop().run_until_complete(
            extractor.extract(full_text, schema, context)
        )

        records_created = 0

        # Check for multi-record extraction
        if result.records:
            # Multi-record mode: process each extracted record
            for extracted_record in result.records:
                self._create_record_from_extraction(
                    document=document,
                    data=extracted_record.data,
                    schema_type=extracted_record.schema_type or schema.__name__,
                    evidence_pointers=extracted_record.evidence,
                    chunks=chunks,
                    confidence=extracted_record.confidence,
                    source_section=extracted_record.source_section
                )
                records_created += 1

        elif result.data:
            # Single record mode (legacy)
            self._create_record_from_extraction(
                document=document,
                data=result.data,
                schema_type=schema.__name__,
                evidence_pointers=result.evidence,
                chunks=chunks,
                confidence=result.confidence,
                needs_review=result.needs_review or not result.valid
            )
            records_created += 1

        self._create_audit_log(
            "records_extracted",
            "Document",
            document.id,
            {"records_created": records_created}
        )

    def _create_record_from_extraction(
        self,
        document: Document,
        data: dict,
        schema_type: str,
        evidence_pointers: list,
        chunks: list[Chunk],
        confidence: float = 0.5,
        needs_review: bool = False,
        source_section: str = None
    ):
        """Create a single record from extracted data."""

        # Compute primary key
        primary_key = self.merge.compute_primary_key(document.doc_type, data)

        # Check for existing record
        existing = self.merge.find_existing_record(
            self.db,
            schema_type,
            primary_key
        )

        if existing:
            # Create proposed update
            self.merge.create_proposed_update(
                self.db,
                existing,
                data,
                document.id
            )
            return

        # Calculate completeness
        completeness = self.completeness.calculate_score(
            document.doc_type,
            data
        )

        # Determine status
        status = RecordStatus.PENDING
        if needs_review or confidence < 0.5:
            status = RecordStatus.NEEDS_REVIEW

        # Add source section to data if available
        if source_section:
            data["_source_section"] = source_section

        record = Record(
            document_id=document.id,
            department=document.department,
            schema_type=schema_type,
            primary_key=primary_key,
            data_json=data,
            completeness_score=completeness,
            status=status
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        # Create evidence entries
        for ev in evidence_pointers:
            chunk = next(
                (c for c in chunks if c.chunk_index == ev.chunk_index),
                chunks[0] if chunks else None
            )

            evidence = Evidence(
                record_id=record.id,
                chunk_id=chunk.id if chunk else None,
                field_path=ev.field_path,
                excerpt=ev.excerpt[:1000] if ev.excerpt else None,  # Limit excerpt length
                start_offset=ev.start_offset,
                end_offset=ev.end_offset
            )
            self.db.add(evidence)

        self.db.commit()

    def _create_audit_log(
        self,
        action: str,
        entity_type: str,
        entity_id: UUID,
        details: dict = None
    ):
        """Create an audit log entry."""
        log = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor="system",
            details_json=details
        )
        self.db.add(log)
        self.db.commit()
