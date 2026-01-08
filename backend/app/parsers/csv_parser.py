import pandas as pd
from app.parsers.base import DocumentParser, ParsedDocument, ParsedSection


class CsvParser(DocumentParser):
    """Parser for CSV and Excel files."""

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() in ['.csv', '.xlsx', '.xls']

    def parse(self, file_path: str) -> ParsedDocument:
        warnings: list[str] = []
        file_ext = file_path.lower().split('.')[-1]

        try:
            if file_ext == 'csv':
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
        except Exception as e:
            return ParsedDocument(
                raw_text="",
                sections=[],
                metadata={},
                confidence=0.0,
                file_type=file_ext,
                warnings=[f"Fehler beim Lesen der Datei: {str(e)}"]
            )

        # Convert DataFrame to text representation
        raw_text_lines = []
        sections: list[ParsedSection] = []
        current_offset = 0

        # Add header information
        headers = list(df.columns)
        header_line = " | ".join(headers)
        raw_text_lines.append(header_line)

        # Each row becomes a section
        for idx, row in df.iterrows():
            row_text_parts = []
            for col in headers:
                value = row[col]
                if pd.notna(value):
                    row_text_parts.append(f"{col}: {value}")

            row_text = "\n".join(row_text_parts)
            raw_text_lines.append(row_text)

            # Create section for each row
            section = ParsedSection(
                title=f"Zeile {idx + 1}",
                content=row_text,
                level=1,
                start_offset=current_offset,
                end_offset=current_offset + len(row_text),
                path=""
            )
            sections.append(section)
            current_offset += len(row_text) + 1

        raw_text = "\n\n".join(raw_text_lines)

        metadata = {
            "columns": headers,
            "row_count": len(df),
            "column_count": len(headers)
        }

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            metadata=metadata,
            confidence=1.0,
            file_type=file_ext,
            warnings=warnings
        )
