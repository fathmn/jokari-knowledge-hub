from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedSection:
    """A section of parsed content."""
    title: Optional[str]
    content: str
    level: int = 0  # Heading level (0 = no heading, 1 = H1, etc.)
    start_offset: int = 0
    end_offset: int = 0
    path: str = ""  # e.g., "Chapter 1 > Section 1.1"


@dataclass
class ParsedDocument:
    """Result of parsing a document."""
    raw_text: str
    sections: list[ParsedSection] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    confidence: float = 1.0  # Lower for PDF, uncertain parses
    file_type: str = ""
    warnings: list[str] = field(default_factory=list)


class DocumentParser(ABC):
    """Abstract base class for document parsers."""

    @abstractmethod
    def parse(self, file_path: str) -> ParsedDocument:
        """Parse a document and return structured content."""
        pass

    @abstractmethod
    def supports(self, file_extension: str) -> bool:
        """Check if this parser supports the given file extension."""
        pass

    def _build_section_path(self, sections: list[ParsedSection], current_level: int) -> str:
        """Build hierarchical path from previous sections."""
        path_parts = []
        for section in reversed(sections):
            if section.level > 0 and section.level < current_level and section.title:
                path_parts.insert(0, section.title)
                current_level = section.level
        return " > ".join(path_parts)
