from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
from uuid import UUID
from app.database import get_db, SessionLocal
from app.models.document import Document, Department, DocType, Confidentiality, DocumentStatus
from app.models.audit_log import AuditLog
from app.services.storage import get_storage_service
from app.services.ingestion import IngestionService
from app.schemas.knowledge.registry import get_schema_registry

router = APIRouter()


def process_document_background(document_id: str):
    """Background task to process a document."""
    db = SessionLocal()
    try:
        service = IngestionService(db)
        service.process_document(UUID(document_id))
    except Exception as e:
        print(f"Error processing document {document_id}: {e}")
    finally:
        db.close()


@router.post("")
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    department: Department = Form(...),
    doc_type: DocType = Form(...),
    version_date: datetime = Form(...),
    owner: str = Form(...),
    confidentiality: Confidentiality = Form(default=Confidentiality.INTERNAL),
    db: Session = Depends(get_db)
):
    """
    Upload multiple documents for processing.

    Returns list of created document IDs and their processing job IDs.
    """
    # Validate department/doc_type combination
    registry = get_schema_registry()
    if not registry.validate_department_doc_type(department, doc_type):
        raise HTTPException(
            status_code=400,
            detail=f"Dokumenttyp '{doc_type}' ist nicht gültig für Abteilung '{department}'"
        )

    storage = get_storage_service()
    results = []

    for file in files:
        # Check file type
        allowed_extensions = ['.docx', '.doc', '.md', '.markdown', '.csv', '.xlsx', '.xls', '.pdf']
        ext = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            results.append({
                "filename": file.filename,
                "error": f"Dateityp '{ext}' wird nicht unterstützt"
            })
            continue

        try:
            # Read file content
            content = await file.read()

            # Upload to storage
            file_path = storage.upload_file(
                content,
                file.filename,
                file.content_type
            )

            # Create document record
            document = Document(
                filename=file.filename,
                department=department,
                doc_type=doc_type,
                version_date=version_date,
                owner=owner,
                confidentiality=confidentiality,
                status=DocumentStatus.UPLOADING,
                file_path=file_path
            )
            db.add(document)
            db.commit()
            db.refresh(document)

            # Create audit log
            audit = AuditLog(
                action="upload",
                entity_type="Document",
                entity_id=document.id,
                actor=owner,
                details_json={"filename": file.filename, "department": department.value}
            )
            db.add(audit)
            db.commit()

            # Process document in background (using FastAPI BackgroundTasks instead of Celery)
            background_tasks.add_task(process_document_background, str(document.id))

            results.append({
                "document_id": str(document.id),
                "filename": file.filename,
                "status": "processing"
            })

        except Exception as e:
            results.append({
                "filename": file.filename,
                "error": str(e)
            })

    return {
        "uploaded": len([r for r in results if "document_id" in r]),
        "failed": len([r for r in results if "error" in r]),
        "results": results
    }


@router.get("/doc-types")
async def get_doc_types():
    """Get available document types grouped by department."""
    registry = get_schema_registry()

    return {
        dept.value: [dt.value for dt in registry.get_doc_types_for_department(dept)]
        for dept in Department
    }
