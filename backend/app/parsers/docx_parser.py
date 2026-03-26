import re
import zipfile
import xml.etree.ElementTree as ET
from collections.abc import Iterator

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph

from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection


class DocxParser(DocumentParser):
    """Parser for Microsoft Word documents."""

    _INLINE_SECTION_PATTERNS = (
        re.compile(r"^(?:titel|title|produkt|artikel|modul|abschnitt)\s*:\s*(.+)$", re.IGNORECASE),
    )
    _NUMBERED_HEADING_PATTERN = re.compile(r"^\d+(?:[.)]\d+)*[.)]?\s+.+$")
    _UPPERCASE_HEADING_PATTERN = re.compile(r"^[A-Z0-9ÄÖÜ/&+.\- ]{4,80}$")
    _PRODUCT_NAME_PATTERN = re.compile(r"^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\-]*(?:\s+[A-Z0-9ÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\-]*){0,5}$")

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() == ".docx"

    def _extract_text_from_xml(self, file_path: str) -> tuple[str, list[str]]:
        """Fallback: Extract text directly from document.xml when python-docx fails."""
        warnings = []
        text_parts = []

        try:
            with zipfile.ZipFile(file_path, "r") as z:
                xml_content = z.read("word/document.xml")
                root = ET.fromstring(xml_content)

                for node in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
                    if node.text:
                        text_parts.append(node.text)

                warnings.append("Dokument mit Fallback-Parser gelesen (beschädigte Referenzen)")
        except Exception as exc:
            warnings.append(f"Fallback-Parser fehlgeschlagen: {exc}")

        return "\n\n".join(text_parts), warnings

    def parse(self, file_path: str) -> ParsedDocument:
        try:
            doc = Document(file_path)
        except KeyError as exc:
            if "NULL" in str(exc) or "word/" in str(exc):
                raw_text, warnings = self._extract_text_from_xml(file_path)
                if raw_text:
                    return ParsedDocument(
                        raw_text=raw_text,
                        sections=[
                            ParsedSection(
                                title=None,
                                content=raw_text,
                                level=0,
                                start_offset=0,
                                end_offset=len(raw_text),
                                path="",
                            )
                        ],
                        metadata={},
                        confidence=0.7,
                        file_type="docx",
                        warnings=warnings,
                    )
            raise

        warnings: list[str] = []
        sections: list[ParsedSection] = []
        blocks = self._extract_blocks(doc)
        raw_text_parts: list[str] = []
        current_offset = 0
        current_section_title: str | None = None
        current_section_level = 0
        current_section_content: list[str] = []
        section_start_offset = 0

        def save_current_section(end_offset: int):
            nonlocal current_section_content, current_section_title, current_section_level, section_start_offset
            content = "\n\n".join(part for part in current_section_content if part).strip()
            if not content:
                current_section_content = []
                return

            section_path = self._build_section_path(sections, current_section_level)
            sections.append(
                ParsedSection(
                    title=current_section_title,
                    content=content,
                    level=current_section_level,
                    start_offset=section_start_offset,
                    end_offset=end_offset,
                    path=section_path,
                )
            )
            current_section_content = []

        for index, block in enumerate(blocks):
            text = block["text"]
            if not text:
                continue

            next_text = None
            for candidate in blocks[index + 1 :]:
                if candidate["text"]:
                    next_text = candidate["text"]
                    break

            heading_level, heading_title = self._detect_heading(block, next_text)
            if heading_level > 0:
                save_current_section(current_offset)
                current_section_title = heading_title
                current_section_level = heading_level
                section_start_offset = current_offset
                current_section_content = [text]
            else:
                current_section_content.append(text)

            raw_text_parts.append(text)
            current_offset += len(text) + 2

        save_current_section(max(current_offset - 2, 0))

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

        metadata = {}
        try:
            core_props = doc.core_properties
            if core_props.title:
                metadata["title"] = core_props.title
            if core_props.author:
                metadata["author"] = core_props.author
            if core_props.created:
                metadata["created"] = str(core_props.created)
        except Exception as exc:
            warnings.append(f"Metadaten konnten nicht gelesen werden: {exc}")

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=1.0,
            file_type="docx",
            warnings=warnings,
        )

    def _extract_blocks(self, doc: DocxDocument) -> list[dict]:
        blocks: list[dict] = []

        for item in self._iter_block_items(doc):
            if isinstance(item, Paragraph):
                text = item.text.strip()
                if not text:
                    continue

                style_name = item.style.name if item.style else ""
                alpha_chars = [char for char in text if char.isalpha()]
                uppercase_ratio = (
                    sum(1 for char in alpha_chars if char.isupper()) / len(alpha_chars)
                    if alpha_chars
                    else 0.0
                )

                blocks.append(
                    {
                        "kind": "paragraph",
                        "text": text,
                        "style_name": style_name,
                        "is_list": self._paragraph_is_list(item),
                        "bold_ratio": self._paragraph_bold_ratio(item),
                        "uppercase_ratio": uppercase_ratio,
                    }
                )
                continue

            table_text = self._table_to_text(item)
            if table_text:
                blocks.append(
                    {
                        "kind": "table",
                        "text": table_text,
                        "style_name": "",
                        "is_list": False,
                        "bold_ratio": 0.0,
                        "uppercase_ratio": 0.0,
                    }
                )

        return blocks

    def _iter_block_items(self, parent: DocxDocument | _Cell) -> Iterator[Paragraph | Table]:
        if isinstance(parent, DocxDocument):
            parent_element = parent.element.body
        elif isinstance(parent, _Cell):
            parent_element = parent._tc
        else:
            raise ValueError("Unsupported parent type for DOCX block iteration")

        for child in parent_element.iterchildren():
            if isinstance(child, CT_P):
                yield Paragraph(child, parent)
            elif isinstance(child, CT_Tbl):
                yield Table(child, parent)

    def _table_to_text(self, table: Table) -> str:
        rows: list[str] = []

        for row in table.rows:
            cells = [" ".join(cell.text.split()) for cell in row.cells]
            normalized = [cell for cell in cells if cell]
            if normalized:
                rows.append(" | ".join(normalized))

        return "\n".join(rows).strip()

    def _paragraph_is_list(self, paragraph: Paragraph) -> bool:
        style_name = paragraph.style.name.lower() if paragraph.style else ""
        if "list" in style_name or "aufzählung" in style_name:
            return True

        num_pr = getattr(getattr(paragraph._p, "pPr", None), "numPr", None)
        return num_pr is not None

    def _paragraph_bold_ratio(self, paragraph: Paragraph) -> float:
        fragments = [run.text.strip() for run in paragraph.runs if run.text and run.text.strip()]
        if not fragments:
            return 0.0

        bold_fragments = sum(1 for run in paragraph.runs if run.text and run.text.strip() and run.bold)
        return bold_fragments / len(fragments)

    def _detect_heading(self, block: dict, next_text: str | None) -> tuple[int, str | None]:
        if block["kind"] != "paragraph":
            return 0, None

        text = block["text"].strip()
        if not text:
            return 0, None

        style_name = (block.get("style_name") or "").lower()
        if style_name.startswith("heading"):
            level = self._extract_heading_level(style_name)
            return level, text
        if style_name in {"title", "titel", "subtitle", "untertitel"}:
            return 1, text

        for pattern in self._INLINE_SECTION_PATTERNS:
            match = pattern.match(text)
            if match:
                return 1, match.group(1).strip()

        if block.get("is_list"):
            return 0, None

        if self._looks_like_heading(text, next_text, block):
            return 2 if self._NUMBERED_HEADING_PATTERN.match(text) else 1, text

        return 0, None

    def _extract_heading_level(self, style_name: str) -> int:
        parts = style_name.replace("heading", "").strip()
        try:
            return max(1, int(parts))
        except ValueError:
            return 1

    def _looks_like_heading(self, text: str, next_text: str | None, block: dict) -> bool:
        if len(text) < 3 or len(text) > 120:
            return False

        if text.endswith((".", ";", "?", "!")):
            return False

        if self._NUMBERED_HEADING_PATTERN.match(text):
            return True

        if block.get("bold_ratio", 0.0) >= 0.8 and next_text and len(next_text) > len(text):
            return True

        if self._UPPERCASE_HEADING_PATTERN.match(text):
            return True

        if not next_text:
            return False

        if len(next_text) < 40:
            return False

        if self._PRODUCT_NAME_PATTERN.match(text):
            return True

        title_case_words = [word for word in text.split() if word[:1].isupper()]
        return len(title_case_words) >= max(1, len(text.split()) - 1)
