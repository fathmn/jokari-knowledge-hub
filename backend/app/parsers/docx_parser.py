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
from app.config import get_settings


class DocxParser(DocumentParser):
    """Parser for Microsoft Word documents."""

    _WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    _DOC_PROPS_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    _DC_NS = "http://purl.org/dc/elements/1.1/"
    _DCTERMS_NS = "http://purl.org/dc/terms/"
    _INLINE_SECTION_PATTERNS = (
        re.compile(r"^(?:titel|title|produkt|artikel|modul|abschnitt)\s*:\s*(.+)$", re.IGNORECASE),
    )
    _SUBSECTION_PATTERNS = (
        re.compile(r"^beschreibung\s*:\s*$", re.IGNORECASE),
        re.compile(r"^weitere informationen\s*:\s*$", re.IGNORECASE),
        re.compile(r"^anwendung(?:\s+.+)?\s*:\s*.*$", re.IGNORECASE),
        re.compile(r"^titelbild\s*:\s*.*$", re.IGNORECASE),
        re.compile(r"^medien\s*:\s*.*$", re.IGNORECASE),
        re.compile(r"^umsetzung als(?:\s+column)?\s*:\s*.*$", re.IGNORECASE),
    )
    _NUMBERED_HEADING_PATTERN = re.compile(r"^\d+(?:[.)]\d+)*[.)]?\s+.+$")
    _UPPERCASE_HEADING_PATTERN = re.compile(r"^[A-Z0-9ÄÖÜ/&+.\- ]{4,80}$")
    _PRODUCT_NAME_PATTERN = re.compile(r"^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\-]*(?:\s+[A-Z0-9ÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\-]*){0,5}$")

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() == ".docx"

    def _extract_blocks_from_xml(self, file_path: str) -> tuple[list[dict], dict, list[str]]:
        """Fallback: Recover document structure directly from XML when python-docx fails."""
        warnings: list[str] = []
        blocks: list[dict] = []
        metadata: dict = {}
        ns = {"w": self._WORD_NS}

        try:
            with zipfile.ZipFile(file_path, "r") as archive:
                root = ET.fromstring(archive.read("word/document.xml"))
                body = root.find("w:body", ns)
                if body is None:
                    raise ValueError("word/document.xml enthaelt keinen body")

                for child in list(body):
                    local_name = child.tag.split("}")[-1]

                    if local_name == "p":
                        paragraph_data = self._xml_paragraph_to_block(child, ns)
                        if paragraph_data:
                            blocks.append(paragraph_data)
                        continue

                    if local_name == "tbl":
                        table_text = self._xml_table_to_text(child, ns)
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

                metadata = self._extract_metadata_from_xml(archive)
                warnings.append("Dokument mit XML-Fallback-Parser gelesen (beschädigte Referenzen)")
        except Exception as exc:
            warnings.append(f"Fallback-Parser fehlgeschlagen: {exc}")

        return blocks, metadata, warnings

    def parse(self, file_path: str) -> ParsedDocument:
        settings = get_settings()
        try:
            doc = Document(file_path)
        except KeyError as exc:
            if "NULL" in str(exc) or "word/" in str(exc):
                blocks, metadata, warnings = self._extract_blocks_from_xml(file_path)
                if blocks:
                    return self._build_parsed_document_from_blocks(
                        blocks=blocks,
                        metadata=metadata,
                        confidence=settings.docx_fallback_confidence,
                        warnings=warnings,
                    )
            raise

        warnings: list[str] = []
        blocks = self._extract_blocks(doc)
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

        return self._build_parsed_document_from_blocks(
            blocks=blocks,
            metadata=metadata,
            confidence=1.0,
            warnings=warnings,
        )

    def _build_parsed_document_from_blocks(
        self,
        blocks: list[dict],
        metadata: dict,
        confidence: float,
        warnings: list[str],
    ) -> ParsedDocument:
        sections: list[ParsedSection] = []
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

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=confidence,
            file_type="docx",
            warnings=warnings,
        )

    def _build_block(
        self,
        text: str,
        style_name: str,
        is_list: bool,
        bold_ratio: float,
    ) -> dict:
        alpha_chars = [char for char in text if char.isalpha()]
        uppercase_ratio = (
            sum(1 for char in alpha_chars if char.isupper()) / len(alpha_chars)
            if alpha_chars
            else 0.0
        )

        return {
            "kind": "paragraph",
            "text": text,
            "style_name": style_name,
            "is_list": is_list,
            "bold_ratio": bold_ratio,
            "uppercase_ratio": uppercase_ratio,
        }

    def _extract_blocks(self, doc: DocxDocument) -> list[dict]:
        blocks: list[dict] = []

        for item in self._iter_block_items(doc):
            if isinstance(item, Paragraph):
                text = item.text.strip()
                if not text:
                    continue

                blocks.append(
                    self._build_block(
                        text=text,
                        style_name=item.style.name if item.style else "",
                        is_list=self._paragraph_is_list(item),
                        bold_ratio=self._paragraph_bold_ratio(item),
                    )
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

    def _xml_paragraph_to_block(self, paragraph: ET.Element, ns: dict[str, str]) -> dict | None:
        text_parts: list[str] = []
        total_runs = 0
        bold_runs = 0

        for run in paragraph.findall("w:r", ns):
            run_text_parts: list[str] = []
            for node in list(run):
                local_name = node.tag.split("}")[-1]
                if local_name == "t" and node.text:
                    run_text_parts.append(node.text)
                elif local_name in {"br", "cr"}:
                    run_text_parts.append("\n")
                elif local_name == "tab":
                    run_text_parts.append("\t")

            run_text = "".join(run_text_parts)
            if run_text:
                text_parts.append(run_text)
                total_runs += 1
                if run.find("w:rPr/w:b", ns) is not None or run.find("w:rPr/w:bCs", ns) is not None:
                    bold_runs += 1

        text = "".join(text_parts).strip()
        if not text:
            return None

        style_name = ""
        style = paragraph.find("w:pPr/w:pStyle", ns)
        if style is not None:
            style_name = style.attrib.get(f"{{{self._WORD_NS}}}val", "")

        is_list = paragraph.find("w:pPr/w:numPr", ns) is not None
        bold_ratio = bold_runs / total_runs if total_runs else 0.0

        return self._build_block(
            text=text,
            style_name=style_name,
            is_list=is_list,
            bold_ratio=bold_ratio,
        )

    def _xml_table_to_text(self, table: ET.Element, ns: dict[str, str]) -> str:
        rows: list[str] = []
        for row in table.findall("w:tr", ns):
            cells: list[str] = []
            for cell in row.findall("w:tc", ns):
                paragraph_texts: list[str] = []
                for paragraph in cell.findall("w:p", ns):
                    block = self._xml_paragraph_to_block(paragraph, ns)
                    if block and block["text"]:
                        paragraph_texts.append(block["text"])

                cell_text = " ".join(paragraph_texts).strip()
                if cell_text:
                    cells.append(cell_text)

            if cells:
                rows.append(" | ".join(cells))

        return "\n".join(rows).strip()

    def _extract_metadata_from_xml(self, archive: zipfile.ZipFile) -> dict:
        metadata: dict = {}
        try:
            core_xml = archive.read("docProps/core.xml")
        except KeyError:
            return metadata

        root = ET.fromstring(core_xml)
        title = root.find(f"{{{self._DC_NS}}}title")
        creator = root.find(f"{{{self._DC_NS}}}creator")
        created = root.find(f"{{{self._DCTERMS_NS}}}created")

        if title is not None and title.text:
            metadata["title"] = title.text
        if creator is not None and creator.text:
            metadata["author"] = creator.text
        if created is not None and created.text:
            metadata["created"] = created.text

        return metadata

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

        for pattern in self._SUBSECTION_PATTERNS:
            if pattern.match(text):
                return 2, text

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
