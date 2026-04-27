from datetime import datetime, timedelta
from uuid import uuid4

from app.api.dashboard import _build_dashboard_stats, _calculate_missing_fields
from app.models.document import Confidentiality, Department, DocType, Document, DocumentStatus
from app.models.record import Record, RecordStatus


def test_dashboard_stats_are_built_from_aggregated_queries(db_session):
    document = Document(
        id=uuid4(),
        filename="source.md",
        department=Department.SUPPORT,
        doc_type=DocType.FAQ,
        version_date=datetime.utcnow(),
        owner="qa",
        confidentiality=Confidentiality.INTERNAL,
        status=DocumentStatus.COMPLETED,
    )
    db_session.add(document)
    db_session.add_all(
        [
            Record(
                id=uuid4(),
                department=Department.SUPPORT,
                schema_type="FAQ",
                primary_key="approved",
                data_json={"question": "Q", "answer": "A"},
                completeness_score=0.75,
                status=RecordStatus.APPROVED,
                updated_at=datetime.utcnow() - timedelta(days=210),
            ),
            Record(
                id=uuid4(),
                department=Department.SUPPORT,
                schema_type="FAQ",
                primary_key="review",
                data_json={"question": "Missing answer"},
                completeness_score=0.5,
                status=RecordStatus.NEEDS_REVIEW,
            ),
            Record(
                id=uuid4(),
                department=Department.SALES,
                schema_type="Objection",
                primary_key="rejected",
                data_json={},
                completeness_score=0.0,
                status=RecordStatus.REJECTED,
            ),
        ]
    )
    db_session.commit()

    stats = _build_dashboard_stats(db_session)

    assert stats.total_documents == 1
    assert stats.pending_reviews == 1
    assert stats.approved_records == 1
    assert stats.rejected_records == 1
    assert stats.completeness_by_department["support"] == 0.75
    assert stats.completeness_by_department["sales"] == 0.0
    assert len(stats.stale_records) == 1
    assert stats.stale_records[0].primary_key == "approved"
    assert [field.model_dump() for field in stats.top_missing_fields] == [
        {"field": "FAQ.answer", "count": 1},
    ]


def test_missing_fields_query_ignores_unknown_schema_types(db_session):
    db_session.add_all(
        [
            Record(
                id=uuid4(),
                department=Department.SUPPORT,
                schema_type="FAQ",
                primary_key="faq",
                data_json={"question": "Q"},
                completeness_score=0.5,
                status=RecordStatus.NEEDS_REVIEW,
            ),
            Record(
                id=uuid4(),
                department=Department.SUPPORT,
                schema_type="UnknownSchema",
                primary_key="unknown",
                data_json={},
                completeness_score=0.0,
                status=RecordStatus.NEEDS_REVIEW,
            ),
        ]
    )
    db_session.commit()

    assert [field.model_dump() for field in _calculate_missing_fields(db_session)] == [
        {"field": "FAQ.answer", "count": 1},
    ]
