from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.database import get_db
from app.models.document import Document, Department
from app.models.record import Record, RecordStatus
from app.schemas.dashboard import DashboardStats, StaleRecord, MissingField

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db)
):
    """Get dashboard statistics."""

    # Total documents
    total_documents = db.query(func.count(Document.id)).scalar()

    # Pending reviews (records with PENDING or NEEDS_REVIEW status)
    pending_reviews = db.query(func.count(Record.id)).filter(
        Record.status.in_([RecordStatus.PENDING, RecordStatus.NEEDS_REVIEW])
    ).scalar()

    # Approved records
    approved_records = db.query(func.count(Record.id)).filter(
        Record.status == RecordStatus.APPROVED
    ).scalar()

    # Rejected records
    rejected_records = db.query(func.count(Record.id)).filter(
        Record.status == RecordStatus.REJECTED
    ).scalar()

    # Completeness by department
    completeness_by_dept = {}
    for dept in Department:
        avg = db.query(func.avg(Record.completeness_score)).filter(
            Record.department == dept,
            Record.status == RecordStatus.APPROVED
        ).scalar()
        completeness_by_dept[dept.value] = round(float(avg), 2) if avg else 0.0

    # Stale records (older than 6 months)
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    stale_records_query = db.query(Record).filter(
        Record.status == RecordStatus.APPROVED,
        Record.updated_at < six_months_ago
    ).limit(10).all()

    stale_records = []
    for r in stale_records_query:
        age_months = (datetime.utcnow() - r.updated_at).days // 30
        stale_records.append(StaleRecord(
            record_id=str(r.id),
            schema_type=r.schema_type,
            primary_key=r.primary_key,
            age_months=age_months
        ))

    # Top missing fields
    missing_fields = _calculate_missing_fields(db)

    return DashboardStats(
        total_documents=total_documents or 0,
        pending_reviews=pending_reviews or 0,
        approved_records=approved_records or 0,
        rejected_records=rejected_records or 0,
        completeness_by_department=completeness_by_dept,
        stale_records=stale_records,
        top_missing_fields=missing_fields
    )


def _calculate_missing_fields(db: Session) -> list[MissingField]:
    """Calculate most frequently missing fields across records."""
    from app.services.completeness import CompletenessService
    from app.schemas.knowledge.registry import get_schema_registry
    from app.models.document import DocType

    registry = get_schema_registry()
    completeness = CompletenessService()

    # Get pending/needs_review records
    records = db.query(Record).filter(
        Record.status.in_([RecordStatus.PENDING, RecordStatus.NEEDS_REVIEW])
    ).limit(100).all()

    field_counts = {}

    for record in records:
        try:
            # Find the doc_type for this schema
            doc_type = None
            for dt in DocType:
                schema = registry.get_schema(dt)
                if schema.__name__ == record.schema_type:
                    doc_type = dt
                    break

            if doc_type:
                missing = completeness.get_missing_fields(doc_type, record.data_json)
                for field in missing:
                    field_key = f"{record.schema_type}.{field}"
                    field_counts[field_key] = field_counts.get(field_key, 0) + 1
        except Exception:
            continue

    # Sort and return top 10
    sorted_fields = sorted(field_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return [
        MissingField(field=field, count=count)
        for field, count in sorted_fields
    ]


@router.get("/activity")
async def get_recent_activity(
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get recent audit log activity."""
    from app.models.audit_log import AuditLog

    logs = db.query(AuditLog).order_by(
        AuditLog.timestamp.desc()
    ).limit(limit).all()

    return {
        "activity": [
            {
                "id": str(log.id),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": str(log.entity_id),
                "actor": log.actor,
                "timestamp": log.timestamp.isoformat(),
                "details": log.details_json
            }
            for log in logs
        ]
    }
