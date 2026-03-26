import asyncio
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


class SlowExtractor:
    async def extract(self, text, schema, context):
        await asyncio.sleep(0.05)
        return ExtractionResult(valid=False, confidence=0.0)


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.result


class FakeDB:
    def __init__(self, document):
        self.document = document
        self.rollback_calls = 0

    def query(self, _model):
        return FakeQuery(self.document)

    def commit(self):
        pass

    def rollback(self):
        self.rollback_calls += 1


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


def test_process_document_rolls_back_and_marks_document_failed(monkeypatch):
    document = SimpleNamespace(
        id=uuid4(),
        department=Department.SALES,
        doc_type=DocType.TRAINING_MODULE,
        filename="broken.docx",
        version_date=datetime(2021, 2, 25),
        status=None,
        error_message=None,
    )
    fake_db = FakeDB(document)

    monkeypatch.setattr("app.services.ingestion.get_storage_service", lambda: object())

    service = IngestionService(db=fake_db)
    monkeypatch.setattr(service, "_parse_document", lambda _document: SimpleNamespace(raw_text="x"))
    monkeypatch.setattr(service, "_create_chunks", lambda _document, _parsed: [])
    monkeypatch.setattr(service, "_extract_records", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db write failed")))
    monkeypatch.setattr(service, "_create_audit_log", lambda *args, **kwargs: None)

    try:
        service.process_document(document.id)
    except RuntimeError as exc:
        assert str(exc) == "db write failed"
    else:
        raise AssertionError("process_document should re-raise extraction errors")

    assert fake_db.rollback_calls == 1
    assert document.status.value == "extraction_failed"
    assert document.error_message == "db write failed"


def test_extract_unit_uses_stub_fallback_on_timeout(monkeypatch):
    monkeypatch.setattr("app.services.ingestion.get_storage_service", lambda: object())
    monkeypatch.setattr(
        "app.services.ingestion.get_settings",
        lambda: SimpleNamespace(llm_provider="claude", llm_timeout_seconds=0.01),
    )

    service = IngestionService(db=SimpleNamespace())
    schema = service.registry.get_schema(DocType.TRAINING_MODULE)
    context = service._build_context(
        document=SimpleNamespace(
            id=uuid4(),
            department=Department.SALES,
            doc_type=DocType.TRAINING_MODULE,
            filename="slow.docx",
            version_date=datetime(2021, 2, 25),
        ),
        unit={"section_path": "JOKARI XL", "chunk_index": 0},
        chunk_total=1,
    )

    result, used_stub = service._extract_unit(
        extractor=SlowExtractor(),
        schema=schema,
        context=context,
        text="Titel: JOKARI XL\nBeschreibung: Produktueberblick fuer grosse Kabeldurchmesser.",
        loop=service._get_event_loop(),
    )

    assert used_stub is True
    assert result.valid is True
    assert result.data is not None or result.records
