from pydantic import Field
from typing import Optional, ClassVar
from app.schemas.knowledge.base import KnowledgeSchema


class TrainingModule(KnowledgeSchema):
    """Sales training module schema."""
    _required_fields: ClassVar[list[str]] = ["title", "version", "content"]
    _primary_key_fields: ClassVar[list[str]] = ["title", "version"]

    title: str = Field(..., description="Titel des Trainingsmoduls")
    version: str = Field(..., description="Versionsnummer (z.B. '1.0', '2.1')")
    content: str = Field(..., description="Hauptinhalt des Trainings")
    objectives: list[str] = Field(default_factory=list, description="Lernziele")
    target_audience: Optional[str] = Field(None, description="Zielgruppe")


class Objection(KnowledgeSchema):
    """Sales objection handling schema."""
    _required_fields: ClassVar[list[str]] = ["id", "objection_text", "response"]
    _primary_key_fields: ClassVar[list[str]] = ["id"]

    id: str = Field(..., description="Eindeutige ID des Einwands")
    objection_text: str = Field(..., description="Der Kundeneinwand")
    response: str = Field(..., description="Empfohlene Antwort")
    category: Optional[str] = Field(None, description="Kategorie (z.B. 'Preis', 'Zeit')")
    effectiveness_score: Optional[float] = Field(None, ge=0, le=10, description="Wirksamkeitsbewertung 0-10")


class Persona(KnowledgeSchema):
    """Buyer persona schema."""
    _required_fields: ClassVar[list[str]] = ["name", "role"]
    _primary_key_fields: ClassVar[list[str]] = ["name"]

    name: str = Field(..., description="Name der Persona")
    role: str = Field(..., description="Rolle/Position")
    pain_points: list[str] = Field(default_factory=list, description="Schmerzpunkte")
    goals: list[str] = Field(default_factory=list, description="Ziele")
    triggers: list[str] = Field(default_factory=list, description="Kaufauslöser")


class PitchScript(KnowledgeSchema):
    """Sales pitch script schema."""
    _required_fields: ClassVar[list[str]] = ["title", "scenario", "script_text"]
    _primary_key_fields: ClassVar[list[str]] = ["title", "scenario"]

    title: str = Field(..., description="Titel des Pitch-Scripts")
    scenario: str = Field(..., description="Anwendungsszenario")
    script_text: str = Field(..., description="Der Pitch-Text")
    key_points: list[str] = Field(default_factory=list, description="Kernbotschaften")


class EmailTemplate(KnowledgeSchema):
    """Email template schema."""
    _required_fields: ClassVar[list[str]] = ["name", "subject", "body"]
    _primary_key_fields: ClassVar[list[str]] = ["name"]

    name: str = Field(..., description="Name des Templates")
    subject: str = Field(..., description="Betreffzeile")
    body: str = Field(..., description="E-Mail-Text")
    use_case: Optional[str] = Field(None, description="Anwendungsfall")
    variables: list[str] = Field(default_factory=list, description="Platzhalter-Variablen")
