from pydantic import BaseModel, Field
from typing import ClassVar


class KnowledgeSchema(BaseModel):
    """Base class for all knowledge schemas with metadata."""

    # Class-level attributes for schema metadata
    _required_fields: ClassVar[list[str]] = []
    _primary_key_fields: ClassVar[list[str]] = []

    @classmethod
    def get_required_fields(cls) -> list[str]:
        """Return list of required field names for completeness scoring."""
        return cls._required_fields

    @classmethod
    def get_primary_key_fields(cls) -> list[str]:
        """Return fields used to generate stable primary key."""
        return cls._primary_key_fields

    @classmethod
    def compute_primary_key(cls, data: dict) -> str:
        """Generate a stable primary key from data (max 500 chars)."""
        key_parts = []
        for field in cls._primary_key_fields:
            value = data.get(field, "")
            if isinstance(value, str):
                # Truncate long values to keep primary key reasonable
                truncated = value.lower().strip()[:100]
                key_parts.append(truncated)
            else:
                key_parts.append(str(value)[:100])
        result = "|".join(key_parts)
        return result[:500]  # Ensure total length doesn't exceed DB limit

    class Config:
        extra = "allow"  # Allow extra fields for flexibility
