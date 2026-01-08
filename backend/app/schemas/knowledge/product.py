from pydantic import Field
from typing import Optional, Any, ClassVar
from app.schemas.knowledge.base import KnowledgeSchema


class ProductSpec(KnowledgeSchema):
    """Product specification schema."""
    _required_fields: ClassVar[list[str]] = ["artnr", "name"]
    _primary_key_fields: ClassVar[list[str]] = ["artnr"]

    artnr: str = Field(..., description="Artikelnummer")
    name: str = Field(..., description="Produktname")
    description: Optional[str] = Field(None, description="Produktbeschreibung")
    specs: dict[str, Any] = Field(default_factory=dict, description="Technische Spezifikationen")
    compatibility: list[str] = Field(default_factory=list, description="Kompatible Produkte/Systeme")


class CompatibilityMatrix(KnowledgeSchema):
    """Product compatibility matrix schema."""
    _required_fields: ClassVar[list[str]] = ["product_id"]
    _primary_key_fields: ClassVar[list[str]] = ["product_id"]

    product_id: str = Field(..., description="Produkt-ID oder Artikelnummer")
    compatible_with: list[str] = Field(default_factory=list, description="Kompatible Produkte")
    incompatible_with: list[str] = Field(default_factory=list, description="Inkompatible Produkte")
    notes: Optional[str] = Field(None, description="Zusätzliche Hinweise")


class SafetyNotes(KnowledgeSchema):
    """Product safety notes schema."""
    _required_fields: ClassVar[list[str]] = ["product_id", "warnings"]
    _primary_key_fields: ClassVar[list[str]] = ["product_id"]

    product_id: str = Field(..., description="Produkt-ID oder Artikelnummer")
    warnings: list[str] = Field(..., min_length=1, description="Sicherheitswarnungen")
    certifications: list[str] = Field(default_factory=list, description="Zertifizierungen")
    handling_instructions: Optional[str] = Field(None, description="Handhabungshinweise")
