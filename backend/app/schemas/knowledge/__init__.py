"""
Knowledge Schemas - Predefined JSON schemas for each department and document type.
These are used for LLM extraction and validation.
"""

from app.schemas.knowledge.sales import (
    TrainingModule,
    Objection,
    Persona,
    PitchScript,
    EmailTemplate
)
from app.schemas.knowledge.support import (
    FAQ,
    TroubleshootingGuide,
    HowToSteps
)
from app.schemas.knowledge.product import (
    ProductSpec,
    CompatibilityMatrix,
    SafetyNotes
)
from app.schemas.knowledge.marketing import (
    MessagingPillars,
    ContentGuidelines
)
from app.schemas.knowledge.legal import (
    ComplianceNotes,
    ClaimsDoDont
)
from app.schemas.knowledge.registry import SchemaRegistry, get_schema_registry

__all__ = [
    # Sales
    "TrainingModule",
    "Objection",
    "Persona",
    "PitchScript",
    "EmailTemplate",
    # Support
    "FAQ",
    "TroubleshootingGuide",
    "HowToSteps",
    # Product
    "ProductSpec",
    "CompatibilityMatrix",
    "SafetyNotes",
    # Marketing
    "MessagingPillars",
    "ContentGuidelines",
    # Legal
    "ComplianceNotes",
    "ClaimsDoDont",
    # Registry
    "SchemaRegistry",
    "get_schema_registry"
]
