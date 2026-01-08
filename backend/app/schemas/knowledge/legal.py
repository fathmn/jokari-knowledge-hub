from pydantic import Field
from typing import Optional, ClassVar
from datetime import date
from app.schemas.knowledge.base import KnowledgeSchema


class ComplianceNotes(KnowledgeSchema):
    """Compliance notes schema."""
    _required_fields: ClassVar[list[str]] = ["topic", "requirements"]
    _primary_key_fields: ClassVar[list[str]] = ["topic", "region"]

    topic: str = Field(..., description="Compliance-Thema")
    requirements: list[str] = Field(..., min_length=1, description="Anforderungen")
    effective_date: Optional[date] = Field(None, description="Gültigkeitsdatum")
    region: Optional[str] = Field(None, description="Region/Land")


class ClaimsDoDont(KnowledgeSchema):
    """Marketing claims do's and don'ts schema."""
    _required_fields: ClassVar[list[str]] = ["claim_type", "allowed", "prohibited"]
    _primary_key_fields: ClassVar[list[str]] = ["claim_type"]

    claim_type: str = Field(..., description="Art der Werbeaussage")
    allowed: list[str] = Field(..., min_length=1, description="Erlaubte Aussagen")
    prohibited: list[str] = Field(..., min_length=1, description="Verbotene Aussagen")
    examples: list[str] = Field(default_factory=list, description="Beispiele")
