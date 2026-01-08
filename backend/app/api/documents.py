from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import Optional
from app.database import get_db
from app.models.document import Document, Department, DocumentStatus
from app.models.chunk import Chunk
from app.models.record import Record
from app.schemas.document import (
    DocumentResponse,
    DocumentListResponse,
    DocumentStatusResponse
)

router = APIRouter()


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    department: Optional[Department] = None,
    status: Optional[DocumentStatus] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List documents with optional filtering."""
    query = db.query(Document)

    if department:
        query = query.filter(Document.department == department)
    if status:
        query = query.filter(Document.status == status)

    # Count total
    total = query.count()

    # Paginate
    offset = (page - 1) * limit
    documents = query.order_by(Document.uploaded_at.desc()).offset(offset).limit(limit).all()

    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in documents],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a single document by ID."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    return DocumentResponse.model_validate(document)


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: UUID,
    db: Session = Depends(get_db)
):
    """Get document processing status."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    errors = []
    if document.error_message:
        errors.append(document.error_message)

    progress = None
    if document.status == DocumentStatus.PARSING:
        progress = "Dokument wird geparst..."
    elif document.status == DocumentStatus.EXTRACTING:
        progress = "Daten werden extrahiert..."
    elif document.status == DocumentStatus.PENDING_REVIEW:
        progress = "Bereit zur Überprüfung"
    elif document.status == DocumentStatus.COMPLETED:
        progress = "Abgeschlossen"

    return DocumentStatusResponse(
        id=document.id,
        status=document.status,
        progress=progress,
        errors=errors
    )


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: UUID,
    db: Session = Depends(get_db)
):
    """Get all chunks for a document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    chunks = db.query(Chunk).filter(
        Chunk.document_id == document_id
    ).order_by(Chunk.chunk_index).all()

    return {
        "document_id": str(document_id),
        "chunks": [
            {
                "id": str(c.id),
                "section_path": c.section_path,
                "text": c.text,
                "confidence": c.confidence,
                "chunk_index": c.chunk_index
            }
            for c in chunks
        ]
    }


@router.get("/{document_id}/records")
async def get_document_records(
    document_id: UUID,
    db: Session = Depends(get_db)
):
    """Get all records extracted from a document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    records = db.query(Record).filter(Record.document_id == document_id).all()

    return {
        "document_id": str(document_id),
        "records": [
            {
                "id": str(r.id),
                "schema_type": r.schema_type,
                "primary_key": r.primary_key,
                "status": r.status.value,
                "completeness_score": r.completeness_score,
                "data_json": r.data_json
            }
            for r in records
        ]
    }


@router.delete("/{document_id}")
async def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db)
):
    """Delete a document and all associated data."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    # Delete from storage
    from app.services.storage import get_storage_service
    storage = get_storage_service()
    try:
        storage.delete_file(document.file_path)
    except Exception:
        pass  # Ignore storage errors

    # Delete from database (cascades to chunks, records, etc.)
    db.delete(document)
    db.commit()

    return {"message": "Dokument gelöscht", "document_id": str(document_id)}
