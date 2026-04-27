from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.document import Department
from app.models.record import Record, RecordStatus
from app.models.evidence import Evidence
from app.schemas.search import SearchResponse, SearchResult
from app.schemas.record import EvidenceResponse
from app.services.source_metadata import attach_source_metadata

router = APIRouter()


@router.get("/search", response_model=SearchResponse)
async def search_knowledge(
    q: str = Query(..., min_length=1, description="Suchbegriff"),
    department: Optional[Department] = None,
    schema_type: Optional[str] = Query(default=None, alias="schema"),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Search approved knowledge records.

    This endpoint is designed for AI agents to query structured knowledge.
    Only APPROVED records are returned.
    """
    # Build base query - ONLY approved records
    query = db.query(Record).filter(Record.status == RecordStatus.APPROVED)

    if department:
        query = query.filter(Record.department == department)
    if schema_type:
        query = query.filter(Record.schema_type == schema_type)

    # Simple text search in data_json
    # In production, this should use full-text search or vector similarity
    search_term = q.lower()

    # Get all matching records
    all_records = query.all()

    # Score and filter by relevance
    scored_results = []
    for record in all_records:
        score = _calculate_relevance(record, search_term)
        if score > 0:
            # Load evidence
            evidence = db.query(Evidence).filter(Evidence.record_id == record.id).all()

            scored_results.append({
                "record": record,
                "evidence": evidence,
                "score": score
            })

    # Sort by score and limit
    scored_results.sort(key=lambda x: x["score"], reverse=True)
    scored_results = scored_results[:limit]

    attach_source_metadata(db, [item["record"] for item in scored_results])

    # Build response
    results = []
    for item in scored_results:
        record = item["record"]
        results.append(SearchResult(
            record_id=record.id,
            department=record.department,
            schema_type=record.schema_type,
            primary_key=record.primary_key,
            data_json=record.data_json,
            evidence=[EvidenceResponse.model_validate(e) for e in item["evidence"]],
            relevance_score=item["score"],
            source_metadata=getattr(record, "source_metadata", None),
        ))

    return SearchResponse(
        results=results,
        total=len(results),
        query=q
    )


def _calculate_relevance(record: Record, search_term: str) -> float:
    """
    Calculate relevance score for a record.

    Simple implementation - in production use vector similarity.
    """
    score = 0.0
    data_str = str(record.data_json).lower()

    # Check primary key
    if search_term in record.primary_key.lower():
        score += 2.0

    # Check data fields
    if search_term in data_str:
        # Count occurrences
        occurrences = data_str.count(search_term)
        score += min(occurrences * 0.5, 3.0)  # Cap at 3.0

    # Boost by completeness
    score *= (0.5 + record.completeness_score * 0.5)

    return round(score, 2)


@router.get("/{record_id}")
async def get_knowledge_record(
    record_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a single approved knowledge record by ID.

    Only APPROVED records are returned.
    """
    from uuid import UUID
    from app.models.attachment import RecordAttachment
    from app.services.storage import get_storage_service

    try:
        rid = UUID(record_id)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Ungültige Record-ID")

    record = db.query(Record).filter(
        Record.id == rid,
        Record.status == RecordStatus.APPROVED
    ).first()

    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Record nicht gefunden oder nicht genehmigt")
    attach_source_metadata(db, [record])

    # Load evidence
    evidence = db.query(Evidence).filter(Evidence.record_id == rid).all()

    # Load attachments with URLs
    attachments = db.query(RecordAttachment).filter(RecordAttachment.record_id == rid).all()
    storage = get_storage_service()
    attachment_list = []
    for att in attachments:
        attachment_list.append({
            "id": str(att.id),
            "filename": att.filename,
            "file_type": att.file_type,
            "url": storage.get_file_url(att.file_path),
        })

    return {
        "id": str(record.id),
        "department": record.department.value if hasattr(record.department, 'value') else record.department,
        "schema_type": record.schema_type,
        "primary_key": record.primary_key,
        "data_json": record.data_json,
        "completeness_score": record.completeness_score,
        "version": record.version,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "evidence": [EvidenceResponse.model_validate(e) for e in evidence],
        "attachments": attachment_list,
        "source_metadata": getattr(record, "source_metadata", None),
    }


@router.get("/schemas")
async def list_schemas():
    """List all available schemas with their fields."""
    from app.schemas.knowledge.registry import get_schema_registry

    registry = get_schema_registry()
    schemas = registry.get_all_schemas()

    result = {}
    for name, schema in schemas.items():
        fields = []
        for field_name, field_info in schema.model_fields.items():
            fields.append({
                "name": field_name,
                "type": str(field_info.annotation),
                "required": field_info.is_required(),
                "description": field_info.description or ""
            })

        result[name] = {
            "required_fields": schema.get_required_fields(),
            "primary_key_fields": schema.get_primary_key_fields(),
            "fields": fields
        }

    return result


@router.get("/stats")
async def knowledge_stats(
    db: Session = Depends(get_db)
):
    """Get statistics about the knowledge base."""
    from sqlalchemy import func

    # Count by status
    status_counts = db.query(
        Record.status,
        func.count(Record.id)
    ).group_by(Record.status).all()

    status_dict = {s.value: c for s, c in status_counts}

    # Count by department
    dept_counts = db.query(
        Record.department,
        func.count(Record.id)
    ).filter(
        Record.status == RecordStatus.APPROVED
    ).group_by(Record.department).all()

    dept_dict = {d.value: c for d, c in dept_counts}

    # Count by schema
    schema_counts = db.query(
        Record.schema_type,
        func.count(Record.id)
    ).filter(
        Record.status == RecordStatus.APPROVED
    ).group_by(Record.schema_type).all()

    return {
        "by_status": status_dict,
        "by_department": dept_dict,
        "by_schema": {s: c for s, c in schema_counts},
        "total_approved": status_dict.get("approved", 0)
    }
