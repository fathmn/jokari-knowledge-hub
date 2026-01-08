from pydantic import Field
from typing import Optional, ClassVar
from app.schemas.knowledge.base import KnowledgeSchema


class MessagingPillars(KnowledgeSchema):
    """Brand messaging pillars schema."""
    _required_fields: ClassVar[list[str]] = ["pillar_name", "key_messages"]
    _primary_key_fields: ClassVar[list[str]] = ["pillar_name"]

    pillar_name: str = Field(..., description="Name des Messaging-Pfeilers")
    key_messages: list[str] = Field(..., min_length=1, description="Kernbotschaften")
    tone: Optional[str] = Field(None, description="Tonalität")
    audience: Optional[str] = Field(None, description="Zielgruppe")


class ContentGuidelines(KnowledgeSchema):
    """Content guidelines schema."""
    _required_fields: ClassVar[list[str]] = ["topic", "dos", "donts"]
    _primary_key_fields: ClassVar[list[str]] = ["topic"]

    topic: str = Field(..., description="Thema/Bereich")
    dos: list[str] = Field(..., min_length=1, description="Was man tun sollte")
    donts: list[str] = Field(..., min_length=1, description="Was man vermeiden sollte")
    examples: list[str] = Field(default_factory=list, description="Beispiele")
