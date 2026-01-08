from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Type, Any, Optional
from pydantic import BaseModel


@dataclass
class EvidencePointer:
    """Pointer to source text for an extracted field."""
    field_path: str
    excerpt: str
    chunk_index: Optional[int] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None


@dataclass
class ExtractionContext:
    """Context for extraction."""
    department: str
    doc_type: str
    document_id: str
    filename: str
    chunk_index: int = 0


@dataclass
class ExtractedRecord:
    """A single extracted record from a document."""
    data: dict[str, Any]
    schema_type: str  # e.g., "ProductSpec", "TrainingModule"
    evidence: list[EvidencePointer] = field(default_factory=list)
    confidence: float = 1.0
    source_section: Optional[str] = None  # Section title/path where found


@dataclass
class ExtractionResult:
    """Result of LLM extraction - can contain multiple records."""
    data: Optional[dict[str, Any]] = None  # Single record (legacy)
    records: list[ExtractedRecord] = field(default_factory=list)  # Multiple records
    valid: bool = False
    errors: list[str] = field(default_factory=list)
    evidence: list[EvidencePointer] = field(default_factory=list)
    confidence: float = 0.0
    needs_review: bool = False
    raw_response: Optional[str] = None


class LLMExtractor(ABC):
    """Abstract base class for LLM-based extraction."""

    @abstractmethod
    async def extract(
        self,
        text: str,
        schema: Type[BaseModel],
        context: ExtractionContext
    ) -> ExtractionResult:
        """
        Extract structured data from text according to schema.

        Args:
            text: The source text to extract from
            schema: Pydantic model defining the expected structure
            context: Additional context about the extraction

        Returns:
            ExtractionResult with extracted data, validation status, and evidence
        """
        pass

    def _validate_with_schema(
        self,
        data: dict,
        schema: Type[BaseModel]
    ) -> tuple[bool, list[str]]:
        """Validate extracted data against Pydantic schema."""
        try:
            schema.model_validate(data)
            return True, []
        except Exception as e:
            errors = []
            if hasattr(e, 'errors'):
                for error in e.errors():
                    field = '.'.join(str(loc) for loc in error['loc'])
                    msg = error['msg']
                    errors.append(f"{field}: {msg}")
            else:
                errors.append(str(e))
            return False, errors

    def _get_schema_description(self, schema: Type[BaseModel]) -> str:
        """Generate a description of the schema for the LLM."""
        lines = [f"Schema: {schema.__name__}"]

        if schema.__doc__:
            lines.append(f"Description: {schema.__doc__}")

        lines.append("\nFields:")
        for field_name, field_info in schema.model_fields.items():
            field_type = str(field_info.annotation)
            required = field_info.is_required()
            description = field_info.description or ""

            req_str = "required" if required else "optional"
            lines.append(f"  - {field_name} ({field_type}, {req_str}): {description}")

        return "\n".join(lines)
