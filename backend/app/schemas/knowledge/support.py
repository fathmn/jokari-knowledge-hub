from pydantic import Field
from typing import Optional, ClassVar
from app.schemas.knowledge.base import KnowledgeSchema


class FAQ(KnowledgeSchema):
    """Frequently Asked Question schema."""
    _required_fields: ClassVar[list[str]] = ["question", "answer"]
    _primary_key_fields: ClassVar[list[str]] = ["question"]

    question: str = Field(..., description="Die häufig gestellte Frage")
    answer: str = Field(..., description="Die Antwort")
    category: Optional[str] = Field(None, description="Kategorie")
    related_products: list[str] = Field(default_factory=list, description="Betroffene Produkte")


class TroubleshootingStep(KnowledgeSchema):
    """Single troubleshooting step."""
    step_number: int = Field(..., description="Schrittnummer")
    instruction: str = Field(..., description="Anweisung")
    expected_result: Optional[str] = Field(None, description="Erwartetes Ergebnis")


class TroubleshootingGuide(KnowledgeSchema):
    """Troubleshooting guide schema."""
    _required_fields: ClassVar[list[str]] = ["title", "problem", "solution"]
    _primary_key_fields: ClassVar[list[str]] = ["title"]

    title: str = Field(..., description="Titel des Guides")
    problem: str = Field(..., description="Problembeschreibung")
    steps: list[TroubleshootingStep] = Field(default_factory=list, description="Fehlerbehebungsschritte")
    solution: str = Field(..., description="Lösung/Ergebnis")


class HowToStep(KnowledgeSchema):
    """Single how-to step."""
    step_number: int = Field(..., description="Schrittnummer")
    instruction: str = Field(..., description="Anweisung")
    note: Optional[str] = Field(None, description="Zusätzlicher Hinweis")


class HowToSteps(KnowledgeSchema):
    """How-to guide schema."""
    _required_fields: ClassVar[list[str]] = ["title", "steps"]
    _primary_key_fields: ClassVar[list[str]] = ["title"]

    title: str = Field(..., description="Titel der Anleitung")
    steps: list[HowToStep] = Field(..., min_length=1, description="Anleitungsschritte")
