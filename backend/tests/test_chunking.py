from app.parsers.base import ParsedDocument, ParsedSection
from app.services.chunking import ChunkingService


def test_chunking_splits_multi_entity_text_into_multiple_chunks():
    service = ChunkingService(max_chunk_size=80, overlap=10, min_chunk_size=20)
    content = "\n".join(
        [
            "Das Entmanteler-Prinzip",
            " ".join(["Grundlagen und Nutzenargumente fuer die Vertriebsschulung."] * 12),
            "JOKARI XL",
            " ".join(["Produktdetails und Verkaufsargumente fuer den JOKARI XL."] * 18),
            "SECURA No. 15",
            " ".join(["Einsatzbereich, Zielgruppe und USPs fuer SECURA No. 15."] * 18),
        ]
    )

    parsed_doc = ParsedDocument(
        raw_text=content,
        sections=[
            ParsedSection(
                title=None,
                content=content,
                level=0,
                start_offset=0,
                end_offset=len(content),
                path="",
            )
        ],
        confidence=1.0,
        file_type="docx",
    )

    chunks = service.create_chunks(parsed_doc)

    assert len(chunks) >= 3
    assert any("JOKARI XL" in chunk.text for chunk in chunks)
    assert max(len(chunk.text) for chunk in chunks) <= service.max_chars + service.overlap_chars
