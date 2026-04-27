from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.external_import import ExternalImport, ExternalImportStatus
from app.models.record import Record


def source_label(source_url: str | None, source_type: str | None) -> tuple[str, str]:
    if source_type == "direct_pim_api":
        return "pim_api", "PIM/API"
    if source_type == "manual_upload":
        return "manual_upload", "Manueller Upload"
    if source_url:
        hostname = (urlparse(source_url).hostname or "").lower()
        if hostname == "jostudy.de" or hostname.endswith(".jostudy.de"):
            return "jostudy", "JO!Study / JOWiki"
        if hostname == "jokari.de" or hostname.endswith(".jokari.de"):
            return "jokari_website", "JOKARI Website"
    if source_type:
        return "external", source_type.replace("_", " ").title()
    return "external", "Externe Quelle"


def attach_source_metadata(db: Session, records: list[Record]) -> None:
    if not records:
        return

    record_ids = [record.id for record in records]
    imports = (
        db.query(ExternalImport)
        .filter(ExternalImport.record_id.in_(record_ids))
        .order_by(ExternalImport.imported_at.desc())
        .all()
    )
    imports_by_record: dict[str, list[ExternalImport]] = {}
    for external_import in imports:
        imports_by_record.setdefault(str(external_import.record_id), []).append(external_import)

    document_ids = [record.document_id for record in records if record.document_id]
    documents_by_id = {}
    if document_ids:
        documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
        documents_by_id = {str(document.id): document for document in documents}

    for record in records:
        external_import = _select_current_import(record, imports_by_record.get(str(record.id), []))
        if external_import:
            kind, label = source_label(external_import.source_url, external_import.source_type)
            record.source_metadata = {
                "source_kind": kind,
                "label": label,
                "source_type": external_import.source_type,
                "source_id": external_import.source_id,
                "source_url": external_import.source_url,
                "api_endpoint": external_import.api_endpoint,
                "trust_type": external_import.trust_type,
                "authenticated_source": external_import.authenticated_actor is not None,
                "status": external_import.status,
                "content_hash": external_import.content_hash,
                "imported_at": external_import.imported_at,
                "details_json": external_import.details_json,
            }
            continue

        document = documents_by_id.get(str(record.document_id))
        if document:
            record.source_metadata = {
                "source_kind": "manual_upload",
                "label": "Manueller Upload",
                "source_type": "manual_upload",
                "trust_type": "manual_upload",
                "authenticated_source": True,
                "document_filename": document.filename,
                "document_owner": document.owner,
                "document_uploaded_at": document.uploaded_at,
            }
            continue

        record.source_metadata = {
            "source_kind": "unknown",
            "label": "Unbekannte Quelle",
        }


def _select_current_import(record: Record, imports: list[ExternalImport]) -> ExternalImport | None:
    if not imports:
        return None

    source = record.data_json.get("_source") if isinstance(record.data_json, dict) else None
    source = source if isinstance(source, dict) else {}
    record_content_hash = source.get("content_hash")
    record_source_id = source.get("source_id")
    record_source_type = source.get("source_type")

    if record_content_hash:
        for external_import in imports:
            if external_import.content_hash != record_content_hash:
                continue
            if record_source_id and external_import.source_id != record_source_id:
                continue
            if record_source_type and _enum_value(external_import.source_type) != str(record_source_type):
                continue
            return external_import

        # A pending crawler import can point at an approved existing record while
        # the actual change lives in ProposedUpdate. Do not present that pending
        # import as the current record provenance.
        return None

    for external_import in imports:
        if external_import.status in {
            ExternalImportStatus.IMPORTED,
            ExternalImportStatus.UPDATED,
            ExternalImportStatus.SKIPPED_DUPLICATE,
        }:
            return external_import

    return imports[0]


def _enum_value(value) -> str:
    return str(getattr(value, "value", value))
