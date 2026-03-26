from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

from app.extractors.base import EvidencePointer, ExtractedRecord, ExtractionResult
from app.models.document import Department, DocType
from app.services.ingestion import IngestionService


class FakeChunkExtractor:
    def __init__(self):
        self.calls = []

    async def extract(self, text, schema, context):
        self.calls.append((text, context))
        return ExtractionResult(
            records=[
                ExtractedRecord(
                    data={
                        "title": "JOKARI XL",
                        "content": "Produktueberblick fuer groessere Kabeldurchmesser.",
                        "key_points": ["Robust fuer groessere Durchmesser"],
                    },
                    schema_type=schema.__name__,
                    evidence=[
                        EvidencePointer(
                            field_path="key_points[0]",
                            excerpt="Robust fuer groessere Durchmesser",
                            chunk_index=context.chunk_index,
                        )
                    ],
                    confidence=0.85,
                    source_section="JOKARI XL",
                )
            ],
            valid=True,
            confidence=0.85,
        )


def test_ingestion_extracts_per_chunk_and_merges_duplicate_training_records(monkeypatch):
    fake_extractor = FakeChunkExtractor()
    monkeypatch.setattr("app.services.ingestion.get_storage_service", lambda: object())
    monkeypatch.setattr("app.services.ingestion.get_extractor", lambda: fake_extractor)

    service = IngestionService(db=SimpleNamespace())
    created_records = []

    monkeypatch.setattr(service, "_create_record_from_extraction", lambda **kwargs: created_records.append(kwargs))
    monkeypatch.setattr(service, "_create_audit_log", lambda *args, **kwargs: None)

    document = SimpleNamespace(
        id=uuid4(),
        department=Department.SALES,
        doc_type=DocType.TRAINING_MODULE,
        filename="Konzept_Vertriebsschulung_Entmanteler_Stand_25.02.2021.docx",
        version_date=datetime(2021, 2, 25),
    )
    chunks = [
        SimpleNamespace(
            id=uuid4(),
            text="JOKARI XL\nProduktueberblick fuer groessere Kabeldurchmesser.",
            section_path="Vertriebsschulung > JOKARI XL",
            chunk_index=0,
        ),
        SimpleNamespace(
            id=uuid4(),
            text="Weitere Verkaufsargumente fuer JOKARI XL und die Zielgruppe im Vertrieb.",
            section_path="Vertriebsschulung > JOKARI XL",
            chunk_index=1,
        ),
    ]

    service._extract_records(document, chunks, full_text="\n\n".join(chunk.text for chunk in chunks))

    assert len(fake_extractor.calls) == 1
    assert fake_extractor.calls[0][1].section_path == "Vertriebsschulung"
    assert "Weitere Verkaufsargumente" in fake_extractor.calls[0][0]
    assert len(created_records) == 1

    created = created_records[0]
    assert created["data"]["title"] == "JOKARI XL"
    assert created["data"]["version"] == "2021-02-25"
    assert created["data"]["key_points"] == ["Robust fuer groessere Durchmesser"]
    assert created["confidence"] == 0.85
