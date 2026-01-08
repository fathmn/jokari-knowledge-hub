import re
from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection


class MarkdownParser(DocumentParser):
    """Parser for Markdown documents."""

    # Regex for markdown headings
    HEADING_PATTERN = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.md', '.markdown']

    def parse(self, file_path: str) -> ParsedDocument:
        with open(file_path, 'r', encoding='utf-8') as f:
            raw_text = f.read()

        sections: list[ParsedSection] = []
        warnings: list[str] = []

        # Find all headings
        headings = list(self.HEADING_PATTERN.finditer(raw_text))

        if not headings:
            # No headings, treat entire doc as one section
            sections.append(ParsedSection(
                title=None,
                content=raw_text.strip(),
                level=0,
                start_offset=0,
                end_offset=len(raw_text),
                path=""
            ))
        else:
            # Process content before first heading (if any)
            if headings[0].start() > 0:
                pre_content = raw_text[:headings[0].start()].strip()
                if pre_content:
                    sections.append(ParsedSection(
                        title=None,
                        content=pre_content,
                        level=0,
                        start_offset=0,
                        end_offset=headings[0].start(),
                        path=""
                    ))

            # Process each heading and its content
            for i, match in enumerate(headings):
                level = len(match.group(1))
                title = match.group(2).strip()

                # Content is from end of heading line to start of next heading (or end of doc)
                content_start = match.end() + 1
                content_end = headings[i + 1].start() if i + 1 < len(headings) else len(raw_text)
                content = raw_text[content_start:content_end].strip()

                # Build section path
                section_path = self._build_section_path(sections, level)
                if section_path:
                    full_path = f"{section_path} > {title}"
                else:
                    full_path = title

                sections.append(ParsedSection(
                    title=title,
                    content=content,
                    level=level,
                    start_offset=match.start(),
                    end_offset=content_end,
                    path=section_path
                ))

        # Extract metadata from frontmatter (if present)
        metadata = self._extract_frontmatter(raw_text)

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=1.0,
            file_type="markdown",
            warnings=warnings
        )

    def _extract_frontmatter(self, text: str) -> dict:
        """Extract YAML frontmatter if present."""
        metadata = {}
        if text.startswith('---'):
            end_match = re.search(r'\n---\n', text[3:])
            if end_match:
                frontmatter = text[3:end_match.start() + 3]
                # Simple key: value parsing
                for line in frontmatter.split('\n'):
                    if ':' in line:
                        key, value = line.split(':', 1)
                        metadata[key.strip()] = value.strip()
        return metadata
