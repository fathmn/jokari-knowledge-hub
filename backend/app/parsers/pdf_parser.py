import re

import pdfplumber

from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection
from app.config import get_settings


class PdfParser(DocumentParser):
    """Parser for PDF documents with lightweight section detection."""

    _HEADING_PATTERN = re.compile(r"^(?:\d+(?:[.)]\d+)*[.)]?\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\- ]{2,100}$")

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() == ".pdf"

    def parse(self, file_path: str) -> ParsedDocument:
        settings = get_settings()
        warnings: list[str] = [
            "PDF-Extraktion: Nur Textinhalte werden extrahiert. "
            "Formatierung, Tabellen und Bilder werden möglicherweise nicht korrekt erfasst."
        ]
        sections: list[ParsedSection] = []
        raw_text_parts: list[str] = []
        current_offset = 0
        metadata = {}

        try:
            with pdfplumber.open(file_path) as pdf:
                if pdf.metadata:
                    if pdf.metadata.get("Title"):
                        metadata["title"] = pdf.metadata["Title"]
                    if pdf.metadata.get("Author"):
                        metadata["author"] = pdf.metadata["Author"]
                    if pdf.metadata.get("CreationDate"):
                        metadata["created"] = pdf.metadata["CreationDate"]

                for page_num, page in enumerate(pdf.pages, start=1):
                    page_text = page.extract_text()
                    if not page_text:
                        continue

                    normalized_page = self._normalize_page_text(page_text)
                    if not normalized_page:
                        continue

                    raw_text_parts.append(normalized_page)
                    page_sections = self._split_page_sections(normalized_page, page_num, current_offset)
                    sections.extend(page_sections)
                    current_offset += len(normalized_page) + 2

                metadata["page_count"] = len(pdf.pages)

        except Exception as exc:
            warnings.append(f"Fehler beim Lesen der PDF: {exc}")
            return ParsedDocument(
                raw_text="",
                sections=[],
                metadata={},
                confidence=0.0,
                file_type="pdf",
                warnings=warnings,
            )

        raw_text = "\n\n".join(raw_text_parts)
        if not sections and raw_text:
            sections.append(
                ParsedSection(
                    title=None,
                    content=raw_text,
                    level=0,
                    start_offset=0,
                    end_offset=len(raw_text),
                    path="",
                )
            )

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=settings.pdf_parser_confidence,
            file_type="pdf",
            warnings=warnings,
        )

    def _normalize_page_text(self, text: str) -> str:
        normalized_lines = []
        for line in text.splitlines():
            stripped = " ".join(line.split())
            if stripped:
                normalized_lines.append(stripped)

        return "\n".join(normalized_lines).strip()

    def _split_page_sections(
        self,
        page_text: str,
        page_num: int,
        base_offset: int,
    ) -> list[ParsedSection]:
        lines = page_text.splitlines()
        sections: list[ParsedSection] = []
        current_title: str | None = None
        current_lines: list[str] = []
        section_start = base_offset
        search_cursor = 0

        def save_current_section():
            nonlocal current_lines, current_title, section_start
            content = "\n".join(current_lines).strip()
            if not content:
                current_lines = []
                return

            title = current_title or f"Seite {page_num}"
            path = f"Seite {page_num}" if current_title else ""
            sections.append(
                ParsedSection(
                    title=title,
                    content=content,
                    level=1,
                    start_offset=section_start,
                    end_offset=section_start + len(content),
                    path=path,
                )
            )
            current_lines = []

        for index, line in enumerate(lines):
            next_line = next((candidate for candidate in lines[index + 1 :] if candidate.strip()), None)
            if self._is_heading_like(line, next_line):
                save_current_section()
                current_title = line.strip()
                current_lines = [current_title]
                line_position = page_text.find(line, search_cursor)
                if line_position >= 0:
                    section_start = base_offset + line_position
                    search_cursor = line_position + len(line)
                continue

            if not current_lines and current_title is None:
                line_position = page_text.find(line, search_cursor)
                if line_position >= 0:
                    section_start = base_offset + line_position
                    search_cursor = line_position + len(line)

            current_lines.append(line)

        save_current_section()

        if not sections:
            sections.append(
                ParsedSection(
                    title=f"Seite {page_num}",
                    content=page_text,
                    level=1,
                    start_offset=base_offset,
                    end_offset=base_offset + len(page_text),
                    path="",
                )
            )

        return sections

    def _is_heading_like(self, line: str, next_line: str | None) -> bool:
        stripped = line.strip()
        if len(stripped) < 3 or len(stripped) > 100:
            return False
        if stripped.endswith((".", ";", "?", "!")):
            return False
        if not self._HEADING_PATTERN.match(stripped):
            return False
        if not next_line or len(next_line.strip()) < 30:
            return False
        return True
