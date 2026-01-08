import zipfile
import xml.etree.ElementTree as ET
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection


class DocxParser(DocumentParser):
    """Parser for Microsoft Word documents."""

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.docx', '.doc']

    def _extract_text_from_xml(self, file_path: str) -> tuple[str, list[str]]:
        """Fallback: Extract text directly from document.xml when python-docx fails."""
        warnings = []
        text_parts = []

        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                xml_content = z.read('word/document.xml')
                root = ET.fromstring(xml_content)

                # Word namespace
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

                # Find all text elements
                for t in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                    if t.text:
                        text_parts.append(t.text)

                warnings.append("Dokument mit Fallback-Parser gelesen (beschädigte Referenzen)")
        except Exception as e:
            warnings.append(f"Fallback-Parser fehlgeschlagen: {str(e)}")

        return ' '.join(text_parts), warnings

    def parse(self, file_path: str) -> ParsedDocument:
        try:
            doc = Document(file_path)
        except KeyError as e:
            # Handle corrupted DOCX files with invalid references
            if 'NULL' in str(e) or 'word/' in str(e):
                raw_text, warnings = self._extract_text_from_xml(file_path)
                if raw_text:
                    return ParsedDocument(
                        raw_text=raw_text,
                        sections=[ParsedSection(
                            title=None,
                            content=raw_text,
                            level=0,
                            start_offset=0,
                            end_offset=len(raw_text),
                            path=""
                        )],
                        metadata={},
                        confidence=0.7,  # Lower confidence for fallback
                        file_type="docx",
                        warnings=warnings
                    )
            raise
        sections: list[ParsedSection] = []
        raw_text_parts: list[str] = []
        current_offset = 0
        warnings: list[str] = []

        current_section_content: list[str] = []
        current_section_title: str | None = None
        current_section_level: int = 0
        section_start_offset: int = 0

        def save_current_section():
            nonlocal current_section_content, current_section_title, current_section_level, section_start_offset
            if current_section_content:
                content = "\n".join(current_section_content)
                section_path = self._build_section_path(sections, current_section_level)
                sections.append(ParsedSection(
                    title=current_section_title,
                    content=content,
                    level=current_section_level,
                    start_offset=section_start_offset,
                    end_offset=current_offset,
                    path=section_path
                ))
                current_section_content = []

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            # Check for heading style
            style_name = para.style.name if para.style else ""
            heading_level = 0

            if style_name.startswith("Heading"):
                try:
                    heading_level = int(style_name.replace("Heading ", "").strip())
                except ValueError:
                    heading_level = 1
            elif style_name in ["Title", "Titel"]:
                heading_level = 1

            if heading_level > 0:
                # Save previous section and start new one
                save_current_section()
                current_section_title = text
                current_section_level = heading_level
                section_start_offset = current_offset
            else:
                current_section_content.append(text)

            raw_text_parts.append(text)
            current_offset += len(text) + 1  # +1 for newline

        # Save final section
        save_current_section()

        # If no sections found, create one from all content
        raw_text = "\n".join(raw_text_parts)
        if not sections and raw_text:
            sections.append(ParsedSection(
                title=None,
                content=raw_text,
                level=0,
                start_offset=0,
                end_offset=len(raw_text),
                path=""
            ))

        # Extract metadata from core properties
        metadata = {}
        try:
            core_props = doc.core_properties
            if core_props.title:
                metadata["title"] = core_props.title
            if core_props.author:
                metadata["author"] = core_props.author
            if core_props.created:
                metadata["created"] = str(core_props.created)
        except Exception as e:
            warnings.append(f"Metadaten konnten nicht gelesen werden: {str(e)}")

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=1.0,
            file_type="docx",
            warnings=warnings
        )
