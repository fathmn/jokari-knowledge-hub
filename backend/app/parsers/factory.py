import os
from app.parsers.base import DocumentParser
from app.parsers.docx_parser import DocxParser
from app.parsers.markdown_parser import MarkdownParser
from app.parsers.csv_parser import CsvParser
from app.parsers.pdf_parser import PdfParser


# Available parsers
_PARSERS: list[DocumentParser] = [
    DocxParser(),
    MarkdownParser(),
    CsvParser(),
    PdfParser(),
]


def get_parser(file_path: str) -> DocumentParser:
    """Get the appropriate parser for a file based on its extension."""
    _, ext = os.path.splitext(file_path)

    for parser in _PARSERS:
        if parser.supports(ext):
            return parser

    raise ValueError(f"Kein Parser für Dateityp gefunden: {ext}")


def get_supported_extensions() -> list[str]:
    """Get list of all supported file extensions."""
    extensions = []
    for ext in ['.docx', '.doc', '.md', '.markdown', '.csv', '.xlsx', '.xls', '.pdf']:
        for parser in _PARSERS:
            if parser.supports(ext):
                extensions.append(ext)
                break
    return extensions
