from typing import Type
from functools import lru_cache
from app.schemas.knowledge.base import KnowledgeSchema
from app.schemas.knowledge.sales import (
    TrainingModule, Objection, Persona, PitchScript, EmailTemplate
)
from app.schemas.knowledge.support import (
    FAQ, TroubleshootingGuide, HowToSteps
)
from app.schemas.knowledge.product import (
    ProductSpec, CompatibilityMatrix, SafetyNotes
)
from app.schemas.knowledge.marketing import (
    MessagingPillars, ContentGuidelines
)
from app.schemas.knowledge.legal import (
    ComplianceNotes, ClaimsDoDont
)
from app.models.document import Department, DocType


class SchemaRegistry:
    """Registry mapping departments and doc types to their schemas."""

    def __init__(self):
        # Map DocType to Schema class
        self._schemas: dict[DocType, Type[KnowledgeSchema]] = {
            # Sales
            DocType.TRAINING_MODULE: TrainingModule,
            DocType.OBJECTION: Objection,
            DocType.PERSONA: Persona,
            DocType.PITCH_SCRIPT: PitchScript,
            DocType.EMAIL_TEMPLATE: EmailTemplate,
            # Support
            DocType.FAQ: FAQ,
            DocType.TROUBLESHOOTING_GUIDE: TroubleshootingGuide,
            DocType.HOW_TO_STEPS: HowToSteps,
            # Product
            DocType.PRODUCT_SPEC: ProductSpec,
            DocType.COMPATIBILITY_MATRIX: CompatibilityMatrix,
            DocType.SAFETY_NOTES: SafetyNotes,
            # Marketing
            DocType.MESSAGING_PILLARS: MessagingPillars,
            DocType.CONTENT_GUIDELINES: ContentGuidelines,
            # Legal
            DocType.COMPLIANCE_NOTES: ComplianceNotes,
            DocType.CLAIMS_DO_DONT: ClaimsDoDont,
        }

        # Map Department to allowed DocTypes
        self._department_doc_types: dict[Department, list[DocType]] = {
            Department.SALES: [
                DocType.TRAINING_MODULE,
                DocType.OBJECTION,
                DocType.PERSONA,
                DocType.PITCH_SCRIPT,
                DocType.EMAIL_TEMPLATE,
            ],
            Department.SUPPORT: [
                DocType.FAQ,
                DocType.TROUBLESHOOTING_GUIDE,
                DocType.HOW_TO_STEPS,
            ],
            Department.PRODUCT: [
                DocType.PRODUCT_SPEC,
                DocType.COMPATIBILITY_MATRIX,
                DocType.SAFETY_NOTES,
            ],
            Department.MARKETING: [
                DocType.MESSAGING_PILLARS,
                DocType.CONTENT_GUIDELINES,
            ],
            Department.LEGAL: [
                DocType.COMPLIANCE_NOTES,
                DocType.CLAIMS_DO_DONT,
            ],
        }

    def get_schema(self, doc_type: DocType) -> Type[KnowledgeSchema]:
        """Get the schema class for a document type."""
        if doc_type not in self._schemas:
            raise ValueError(f"No schema registered for doc type: {doc_type}")
        return self._schemas[doc_type]

    def get_schema_by_name(self, name: str) -> Type[KnowledgeSchema]:
        """Get schema by its class name (e.g., 'Objection', 'ProductSpec')."""
        for schema in self._schemas.values():
            if schema.__name__ == name:
                return schema
        raise ValueError(f"No schema found with name: {name}")

    def get_doc_types_for_department(self, department: Department) -> list[DocType]:
        """Get allowed document types for a department."""
        return self._department_doc_types.get(department, [])

    def validate_department_doc_type(self, department: Department, doc_type: DocType) -> bool:
        """Check if a doc type is valid for a department."""
        allowed = self._department_doc_types.get(department, [])
        return doc_type in allowed

    def get_all_schemas(self) -> dict[str, Type[KnowledgeSchema]]:
        """Get all registered schemas by name."""
        return {schema.__name__: schema for schema in self._schemas.values()}

    def compute_completeness_score(self, doc_type: DocType, data: dict) -> float:
        """Calculate completeness score for extracted data."""
        schema = self.get_schema(doc_type)
        required_fields = schema.get_required_fields()

        if not required_fields:
            return 1.0

        filled = 0
        for field in required_fields:
            value = data.get(field)
            if value is not None and value != "" and value != []:
                filled += 1

        return filled / len(required_fields)

    def get_missing_required_fields(self, doc_type: DocType, data: dict) -> list[str]:
        """Get list of missing required fields."""
        schema = self.get_schema(doc_type)
        required_fields = schema.get_required_fields()

        missing = []
        for field in required_fields:
            value = data.get(field)
            if value is None or value == "" or value == []:
                missing.append(field)

        return missing


@lru_cache()
def get_schema_registry() -> SchemaRegistry:
    """Get singleton schema registry instance."""
    return SchemaRegistry()
