from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.models.document import Department
from app.models.record import Record, RecordStatus
from app.models.evidence import Evidence
from app.models.proposed_update import ProposedUpdate, UpdateStatus
from app.models.audit_log import AuditLog
from app.models.attachment import RecordAttachment
from app.schemas.record import RecordResponse, RecordListResponse, RecordUpdate, EvidenceResponse
from app.schemas.review import ReviewAction, ProposedUpdateResponse

router = APIRouter()


@router.get("", response_model=RecordListResponse)
async def list_review_queue(
    department: Optional[Department] = None,
    schema_type: Optional[str] = None,
    status: Optional[RecordStatus] = Query(default=None),
    sort_by: str = Query(default="completeness", regex="^(completeness|created|updated)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List records in the review queue."""
    query = db.query(Record)

    if department:
        query = query.filter(Record.department == department)
    if schema_type:
        query = query.filter(Record.schema_type == schema_type)
    if status:
        query = query.filter(Record.status == status)
    else:
        # By default, show all review-relevant statuses
        query = query.filter(Record.status.in_([
            RecordStatus.PENDING,
            RecordStatus.NEEDS_REVIEW
        ]))

    # Sort
    if sort_by == "completeness":
        query = query.order_by(Record.completeness_score.asc())
    elif sort_by == "created":
        query = query.order_by(Record.created_at.desc())
    else:
        query = query.order_by(Record.updated_at.desc())

    # Count total
    total = query.count()

    # Paginate
    offset = (page - 1) * limit
    records = query.offset(offset).limit(limit).all()

    return RecordListResponse(
        records=[RecordResponse.model_validate(r) for r in records],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit
    )


@router.get("/{record_id}", response_model=RecordResponse)
async def get_record(
    record_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a single record with evidence and attachments."""
    from app.services.storage import get_storage_service

    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    # Load evidence
    evidence = db.query(Evidence).filter(Evidence.record_id == record_id).all()
    record.evidence_items = evidence

    # Load attachments with URLs
    attachments = db.query(RecordAttachment).filter(RecordAttachment.record_id == record_id).all()
    storage = get_storage_service()

    # Add URL to each attachment
    for att in attachments:
        att.url = storage.get_presigned_url(att.file_path)
    record.attachments = attachments

    return RecordResponse.model_validate(record)


@router.post("/{record_id}/approve")
async def approve_record(
    record_id: UUID,
    action: ReviewAction,
    db: Session = Depends(get_db)
):
    """Approve a record."""
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    if record.status == RecordStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Record ist bereits genehmigt")

    record.status = RecordStatus.APPROVED
    record.updated_at = datetime.utcnow()

    # Audit log
    audit = AuditLog(
        action="approve",
        entity_type="Record",
        entity_id=record.id,
        actor=action.actor,
        details_json={"reason": action.reason} if action.reason else None
    )
    db.add(audit)
    db.commit()

    return {"message": "Record genehmigt", "record_id": str(record_id)}


@router.post("/{record_id}/reject")
async def reject_record(
    record_id: UUID,
    action: ReviewAction,
    db: Session = Depends(get_db)
):
    """Reject a record."""
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    record.status = RecordStatus.REJECTED
    record.updated_at = datetime.utcnow()

    # Audit log
    audit = AuditLog(
        action="reject",
        entity_type="Record",
        entity_id=record.id,
        actor=action.actor,
        details_json={"reason": action.reason} if action.reason else None
    )
    db.add(audit)
    db.commit()

    return {"message": "Record abgelehnt", "record_id": str(record_id)}


@router.put("/{record_id}")
async def update_record(
    record_id: UUID,
    update: RecordUpdate,
    db: Session = Depends(get_db)
):
    """Manually edit a record's data."""
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    # Update data
    record.data_json = update.data_json
    record.updated_at = datetime.utcnow()

    # Recalculate completeness
    from app.services.completeness import CompletenessService
    from app.models.document import DocType
    completeness = CompletenessService()
    doc_type = DocType(record.document.doc_type) if record.document else None
    if doc_type:
        record.completeness_score = completeness.calculate_score(doc_type, update.data_json)

    # Audit log
    audit = AuditLog(
        action="edit",
        entity_type="Record",
        entity_id=record.id,
        actor="user",
        details_json={"updated_fields": list(update.data_json.keys())}
    )
    db.add(audit)
    db.commit()

    return {"message": "Record aktualisiert", "record_id": str(record_id)}


# Proposed Updates endpoints

@router.get("/updates/pending")
async def list_pending_updates(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List pending proposed updates."""
    query = db.query(ProposedUpdate).filter(
        ProposedUpdate.status == UpdateStatus.PENDING
    )

    total = query.count()
    offset = (page - 1) * limit
    updates = query.order_by(ProposedUpdate.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "updates": [ProposedUpdateResponse.model_validate(u) for u in updates],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.get("/updates/{update_id}", response_model=ProposedUpdateResponse)
async def get_proposed_update(
    update_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a proposed update with diff."""
    update = db.query(ProposedUpdate).filter(ProposedUpdate.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update nicht gefunden")

    return ProposedUpdateResponse.model_validate(update)


@router.post("/updates/{update_id}/approve")
async def approve_update(
    update_id: UUID,
    action: ReviewAction,
    db: Session = Depends(get_db)
):
    """Approve a proposed update."""
    from app.services.merge import MergeService

    update = db.query(ProposedUpdate).filter(ProposedUpdate.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update nicht gefunden")

    if update.status != UpdateStatus.PENDING:
        raise HTTPException(status_code=400, detail="Update ist nicht ausstehend")

    merge_service = MergeService()
    merge_service.apply_update(db, update, action.actor)

    # Audit log
    audit = AuditLog(
        action="approve_update",
        entity_type="ProposedUpdate",
        entity_id=update.id,
        actor=action.actor,
        details_json={"record_id": str(update.record_id)}
    )
    db.add(audit)
    db.commit()

    return {"message": "Update genehmigt", "update_id": str(update_id)}


@router.post("/updates/{update_id}/reject")
async def reject_update(
    update_id: UUID,
    action: ReviewAction,
    db: Session = Depends(get_db)
):
    """Reject a proposed update."""
    from app.services.merge import MergeService

    update = db.query(ProposedUpdate).filter(ProposedUpdate.id == update_id).first()
    if not update:
        raise HTTPException(status_code=404, detail="Update nicht gefunden")

    if update.status != UpdateStatus.PENDING:
        raise HTTPException(status_code=400, detail="Update ist nicht ausstehend")

    merge_service = MergeService()
    merge_service.reject_update(db, update, action.actor)

    # Audit log
    audit = AuditLog(
        action="reject_update",
        entity_type="ProposedUpdate",
        entity_id=update.id,
        actor=action.actor,
        details_json={"record_id": str(update.record_id), "reason": action.reason}
    )
    db.add(audit)
    db.commit()

    return {"message": "Update abgelehnt", "update_id": str(update_id)}


# Attachment endpoints

@router.post("/{record_id}/attachments")
async def upload_attachments(
    record_id: UUID,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """Upload attachments to a record."""
    from app.services.storage import get_storage_service

    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    storage = get_storage_service()
    uploaded = []

    for file in files:
        # Generate unique path
        file_path = f"attachments/{record_id}/{file.filename}"

        # Read file content
        content = await file.read()

        # Upload to storage
        try:
            storage.upload_file(file_path, content, file.content_type)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Upload fehlgeschlagen: {str(e)}")

        # Create attachment record
        attachment = RecordAttachment(
            record_id=record_id,
            filename=file.filename,
            file_type=file.content_type or "application/octet-stream",
            file_path=file_path,
            file_size=f"{len(content) / 1024:.1f} KB" if len(content) < 1024 * 1024 else f"{len(content) / (1024 * 1024):.1f} MB"
        )
        db.add(attachment)
        uploaded.append({
            "filename": file.filename,
            "file_type": file.content_type
        })

    db.commit()

    return {
        "message": f"{len(uploaded)} Datei(en) hochgeladen",
        "files": uploaded
    }


@router.get("/{record_id}/attachments")
async def list_attachments(
    record_id: UUID,
    db: Session = Depends(get_db)
):
    """List all attachments for a record."""
    from app.services.storage import get_storage_service

    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record nicht gefunden")

    storage = get_storage_service()
    attachments = db.query(RecordAttachment).filter(
        RecordAttachment.record_id == record_id
    ).order_by(RecordAttachment.created_at.desc()).all()

    result = []
    for att in attachments:
        url = storage.get_presigned_url(att.file_path)
        result.append({
            "id": str(att.id),
            "filename": att.filename,
            "file_type": att.file_type,
            "file_size": att.file_size,
            "url": url,
            "created_at": att.created_at.isoformat()
        })

    return {"attachments": result}


@router.delete("/{record_id}/attachments/{attachment_id}")
async def delete_attachment(
    record_id: UUID,
    attachment_id: UUID,
    db: Session = Depends(get_db)
):
    """Delete an attachment."""
    from app.services.storage import get_storage_service

    attachment = db.query(RecordAttachment).filter(
        RecordAttachment.id == attachment_id,
        RecordAttachment.record_id == record_id
    ).first()

    if not attachment:
        raise HTTPException(status_code=404, detail="Anhang nicht gefunden")

    # Delete from storage
    storage = get_storage_service()
    try:
        storage.delete_file(attachment.file_path)
    except Exception:
        pass  # Ignore storage errors

    # Delete from database
    db.delete(attachment)
    db.commit()

    return {"message": "Anhang gelöscht", "attachment_id": str(attachment_id)}
