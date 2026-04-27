from datetime import datetime, timedelta

from app.models.document import Department
from app.models.external_import import ExternalImport, ExternalImportStatus, ExternalSourceType, ExternalTrustType
from app.models.record import Record, RecordStatus
from app.services.source_metadata import attach_source_metadata, source_label


def test_source_label_prefers_direct_pim_api_over_jokari_hostname():
    kind, label = source_label("https://jokari.de/produkte/detail/example", "direct_pim_api")

    assert kind == "pim_api"
    assert label == "PIM/API"


def test_source_label_matches_real_hostname_not_query_string():
    kind, label = source_label("https://example.com/redirect?next=https://www.jostudy.de/jowiki", "crawlee")

    assert kind == "external"
    assert label == "Crawlee"


def test_source_label_classifies_jostudy_subdomain():
    kind, label = source_label("https://www.jostudy.de/jowiki/moderne-isolierstoffe", "crawlee")

    assert kind == "jostudy"
    assert label == "JO!Study / JOWiki"


def test_source_metadata_ignores_pending_import_for_current_record_provenance(db_session):
    record = Record(
        department=Department.PRODUCT,
        schema_type="ProductSpec",
        primary_key="30199",
        status=RecordStatus.APPROVED,
        completeness_score=1.0,
        data_json={
            "artnr": "30199",
            "name": "Entmanteler PV-Strip Pro",
            "_source": {
                "source_type": ExternalSourceType.DIRECT_PIM_API.value,
                "source_id": "pim:product:30199",
                "content_hash": "old-pim-hash",
            },
        },
    )
    db_session.add(record)
    db_session.flush()

    db_session.add_all(
        [
            ExternalImport(
                source_type=ExternalSourceType.DIRECT_PIM_API,
                source_id="pim:product:30199",
                source_url="https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
                api_endpoint="/pim/products/30199",
                trust_type=ExternalTrustType.AUTHENTICATED_PIM,
                content_hash="old-pim-hash",
                authenticated_actor="pim-service",
                status=ExternalImportStatus.IMPORTED,
                record_id=record.id,
                imported_at=datetime.utcnow() - timedelta(hours=1),
            ),
            ExternalImport(
                source_type=ExternalSourceType.CRAWLEE,
                source_id="crawlee:https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
                source_url="https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
                trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
                content_hash="pending-crawler-hash",
                status=ExternalImportStatus.NEEDS_REVIEW,
                record_id=record.id,
                imported_at=datetime.utcnow(),
            ),
        ]
    )
    db_session.commit()

    attach_source_metadata(db_session, [record])

    assert record.source_metadata["source_kind"] == "pim_api"
    assert record.source_metadata["label"] == "PIM/API"
    assert record.source_metadata["content_hash"] == "old-pim-hash"
