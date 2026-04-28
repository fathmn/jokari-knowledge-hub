from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import case, func
from datetime import datetime, timedelta
from app.database import get_db
from app.models.document import Document, Department
from app.models.record import Record, RecordStatus
from app.schemas.dashboard import DashboardStats, StaleRecord, MissingField

router = APIRouter()
_MISSING_FIELD_SAMPLE_SIZE = 250


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db)
):
    """Get dashboard statistics."""
    return _build_dashboard_stats(db)


def _build_dashboard_stats(db: Session) -> DashboardStats:
    """Build dashboard statistics with a bounded number of DB roundtrips."""
    total_documents = db.query(func.count(Document.id)).scalar() or 0

    record_counts = db.query(
        func.coalesce(
            func.sum(
                case(
                    (Record.status.in_([RecordStatus.PENDING, RecordStatus.NEEDS_REVIEW]), 1),
                    else_=0,
                )
            ),
            0,
        ).label("pending_reviews"),
        func.coalesce(
            func.sum(case((Record.status == RecordStatus.APPROVED, 1), else_=0)),
            0,
        ).label("approved_records"),
        func.coalesce(
            func.sum(case((Record.status == RecordStatus.REJECTED, 1), else_=0)),
            0,
        ).label("rejected_records"),
    ).one()

    completeness_by_dept = {}
    dept_rows = db.query(
        Record.department,
        func.avg(Record.completeness_score),
    ).filter(
        Record.status == RecordStatus.APPROVED
    ).group_by(Record.department).all()

    for dept, avg in dept_rows:
        dept_key = dept.value if isinstance(dept, Department) else str(dept)
        completeness_by_dept[dept_key] = round(float(avg), 2) if avg else 0.0

    return DashboardStats(
        total_documents=int(total_documents),
        pending_reviews=int(record_counts.pending_reviews or 0),
        approved_records=int(record_counts.approved_records or 0),
        rejected_records=int(record_counts.rejected_records or 0),
        completeness_by_department=completeness_by_dept,
        stale_records=_get_stale_records(db),
        top_missing_fields=_calculate_missing_fields(db),
    )


def _get_stale_records(db: Session) -> list[StaleRecord]:
    """Get approved records that have not been updated recently."""
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    now = datetime.utcnow()
    stale_records_query = db.query(
        Record.id,
        Record.schema_type,
        Record.primary_key,
        Record.updated_at,
    ).filter(
        Record.status == RecordStatus.APPROVED,
        Record.updated_at < six_months_ago,
    ).limit(10).all()

    return [
        StaleRecord(
            record_id=str(record.id),
            schema_type=record.schema_type,
            primary_key=record.primary_key,
            age_months=(now - record.updated_at).days // 30,
        )
        for record in stale_records_query
    ]


def _calculate_missing_fields(db: Session) -> list[MissingField]:
    """Calculate most frequently missing fields across review records."""
    from app.services.completeness import CompletenessService
    from app.schemas.knowledge.registry import get_schema_registry
    from app.models.document import DocType

    registry = get_schema_registry()
    completeness = CompletenessService()
    schema_to_doc_type = {}
    for doc_type in DocType:
        schema = registry.get_schema(doc_type)
        schema_to_doc_type[schema.__name__] = doc_type

    records = db.query(
        Record.schema_type,
        Record.data_json,
    ).filter(
        Record.status.in_([RecordStatus.PENDING, RecordStatus.NEEDS_REVIEW])
    ).order_by(
        Record.updated_at.desc(),
        Record.id.desc(),
    ).limit(_MISSING_FIELD_SAMPLE_SIZE).all()

    field_counts = {}

    for record in records:
        try:
            doc_type = schema_to_doc_type.get(record.schema_type)
            if doc_type:
                missing = completeness.get_missing_fields(doc_type, record.data_json)
                for field in missing:
                    field_key = f"{record.schema_type}.{field}"
                    field_counts[field_key] = field_counts.get(field_key, 0) + 1
        except Exception:
            continue

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
