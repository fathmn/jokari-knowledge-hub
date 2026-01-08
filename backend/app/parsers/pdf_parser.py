import pdfplumber
from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection


class PdfParser(DocumentParser):
    """Parser for PDF documents. Text extraction only, marked as low-confidence."""

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() == '.pdf'

    def parse(self, file_path: str) -> ParsedDocument:
        warnings: list[str] = [
            "PDF-Extraktion: Nur Textinhalte werden extrahiert. "
            "Formatierung, Tabellen und Bilder werden möglicherweise nicht korrekt erfasst."
        ]
        sections: list[ParsedSection] = []
        raw_text_parts: list[str] = []
        current_offset = 0

        try:
            with pdfplumber.open(file_path) as pdf:
                metadata = {}

                # Extract metadata
                if pdf.metadata:
                    if pdf.metadata.get("Title"):
                        metadata["title"] = pdf.metadata["Title"]
                    if pdf.metadata.get("Author"):
                        metadata["author"] = pdf.metadata["Author"]
                    if pdf.metadata.get("CreationDate"):
                        metadata["created"] = pdf.metadata["CreationDate"]

                # Extract text from each page
                for page_num, page in enumerate(pdf.pages, start=1):
                    page_text = page.extract_text()

                    if page_text:
                        page_text = page_text.strip()
                        raw_text_parts.append(page_text)

                        section = ParsedSection(
                            title=f"Seite {page_num}",
                            content=page_text,
                            level=1,
                            start_offset=current_offset,
                            end_offset=current_offset + len(page_text),
                            path=""
                        )
                        sections.append(section)
                        current_offset += len(page_text) + 2  # +2 for double newline

                metadata["page_count"] = len(pdf.pages)

        except Exception as e:
            warnings.append(f"Fehler beim Lesen der PDF: {str(e)}")
            return ParsedDocument(
                raw_text="",
                sections=[],
                metadata={},
                confidence=0.0,
                file_type="pdf",
                warnings=warnings
            )

        raw_text = "\n\n".join(raw_text_parts)

        # If no sections, create one from all content
        if not sections and raw_text:
            sections.append(ParsedSection(
                title=None,
                content=raw_text,
                level=0,
                start_offset=0,
                end_offset=len(raw_text),
                path=""
            ))

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=0.7,  # Lower confidence for PDF
            file_type="pdf",
            warnings=warnings
        )
