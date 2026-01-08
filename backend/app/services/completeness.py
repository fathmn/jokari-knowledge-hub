from typing import Type
from pydantic import BaseModel
from app.schemas.knowledge.base import KnowledgeSchema
from app.schemas.knowledge.registry import get_schema_registry
from app.models.document import DocType


class CompletenessService:
    """Service for calculating completeness scores."""

    def __init__(self):
        self.registry = get_schema_registry()

    def calculate_score(self, doc_type: DocType, data: dict) -> float:
        """
        Calculate completeness score for extracted data.

        Returns a score between 0.0 and 1.0.
        """
        return self.registry.compute_completeness_score(doc_type, data)

    def get_missing_fields(self, doc_type: DocType, data: dict) -> list[str]:
        """Get list of missing required fields."""
        return self.registry.get_missing_required_fields(doc_type, data)

    def calculate_score_with_details(
        self,
        doc_type: DocType,
        data: dict
    ) -> dict:
        """
        Calculate completeness with detailed breakdown.

        Returns dict with:
        - score: float
        - total_required: int
        - filled_required: int
        - missing_fields: list[str]
        - optional_filled: int
        """
        schema = self.registry.get_schema(doc_type)
        required_fields = schema.get_required_fields()

        filled_required = 0
        missing_fields = []

        for field in required_fields:
            value = data.get(field)
            if self._is_filled(value):
                filled_required += 1
            else:
                missing_fields.append(field)

        # Count optional fields
        all_fields = list(schema.model_fields.keys())
        optional_fields = [f for f in all_fields if f not in required_fields]
        optional_filled = sum(1 for f in optional_fields if self._is_filled(data.get(f)))

        score = filled_required / len(required_fields) if required_fields else 1.0

        return {
            "score": round(score, 2),
            "total_required": len(required_fields),
            "filled_required": filled_required,
            "missing_fields": missing_fields,
            "optional_filled": optional_filled,
            "total_optional": len(optional_fields)
        }

    def _is_filled(self, value) -> bool:
        """Check if a value counts as filled."""
        if value is None:
            return False
        if isinstance(value, str) and value.strip() == "":
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        if isinstance(value, dict) and len(value) == 0:
            return False
        return True
