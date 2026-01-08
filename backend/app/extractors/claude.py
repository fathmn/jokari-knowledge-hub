from __future__ import annotations
import json
import re
from typing import Type, Optional, List
from pydantic import BaseModel
import anthropic
from app.extractors.base import (
    LLMExtractor,
    ExtractionContext,
    ExtractionResult,
    EvidencePointer
)
from app.config import get_settings


class ClaudeExtractor(LLMExtractor):
    """
    Claude-based extractor for production use.
    Uses Anthropic API for structured extraction.
    """

    def __init__(self):
        settings = get_settings()
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-20250514"
        self.max_retries = 2

    async def extract(
        self,
        text: str,
        schema: Type[BaseModel],
        context: ExtractionContext
    ) -> ExtractionResult:
        """Extract structured data using Claude."""

        schema_description = self._get_schema_description(schema)
        json_schema = schema.model_json_schema()

        system_prompt = self._build_system_prompt(schema_description, json_schema, context)
        user_prompt = self._build_user_prompt(text)

        errors = []
        last_response = None

        for attempt in range(self.max_retries + 1):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[
                        {"role": "user", "content": user_prompt}
                    ]
                )

                last_response = response.content[0].text

                # Parse JSON from response
                extracted_data = self._parse_json_response(last_response)

                if extracted_data is None:
                    errors.append(f"Versuch {attempt + 1}: Konnte kein JSON aus Antwort extrahieren")
                    continue

                # Validate with schema
                valid, validation_errors = self._validate_with_schema(extracted_data, schema)

                if valid:
                    # Extract evidence
                    evidence = self._extract_evidence(extracted_data, text, context)

                    return ExtractionResult(
                        data=extracted_data,
                        valid=True,
                        errors=[],
                        evidence=evidence,
                        confidence=0.9,
                        needs_review=False,
                        raw_response=last_response
                    )
                else:
                    errors.extend([f"Versuch {attempt + 1}: {e}" for e in validation_errors])

                    # Retry with error feedback
                    if attempt < self.max_retries:
                        user_prompt = self._build_retry_prompt(text, validation_errors, last_response)

            except anthropic.APIError as e:
                errors.append(f"Versuch {attempt + 1}: API Fehler - {str(e)}")
            except Exception as e:
                errors.append(f"Versuch {attempt + 1}: Fehler - {str(e)}")

        # All retries failed
        return ExtractionResult(
            data=None,
            valid=False,
            errors=errors,
            evidence=[],
            confidence=0.0,
            needs_review=True,
            raw_response=last_response
        )

    def _build_system_prompt(
        self,
        schema_description: str,
        json_schema: dict,
        context: ExtractionContext
    ) -> str:
        return f"""Du bist ein präziser Daten-Extraktions-Assistent für die Jokari Knowledge Hub Plattform.

Deine Aufgabe ist es, strukturierte Informationen aus Dokumenten zu extrahieren.

KONTEXT:
- Abteilung: {context.department}
- Dokumenttyp: {context.doc_type}
- Datei: {context.filename}

SCHEMA ZU EXTRAHIEREN:
{schema_description}

JSON SCHEMA:
{json.dumps(json_schema, ensure_ascii=False, indent=2)}

WICHTIGE REGELN:
1. Extrahiere NUR Informationen, die explizit im Text vorhanden sind
2. Erfinde KEINE Daten - wenn eine Information fehlt, lasse das Feld leer oder null
3. Zitiere relevante Textpassagen als Beleg (evidence)
4. Antworte NUR mit validem JSON im angegebenen Format
5. Bei Listen: Extrahiere alle relevanten Einträge
6. Bei fehlenden Pflichtfeldern: Setze sie auf leere Strings oder leere Listen

AUSGABEFORMAT:
Antworte mit einem JSON-Objekt, das zwei Schlüssel hat:
- "data": Die extrahierten Daten gemäß Schema
- "evidence": Eine Liste von Objekten mit "field" und "excerpt" für jeden belegten Wert
"""

    def _build_user_prompt(self, text: str) -> str:
        return f"""Extrahiere die strukturierten Daten aus folgendem Text:

---
{text}
---

Antworte nur mit dem JSON-Objekt."""

    def _build_retry_prompt(
        self,
        text: str,
        errors: list[str],
        previous_response: str
    ) -> str:
        error_list = "\n".join(f"- {e}" for e in errors)
        return f"""Die vorherige Extraktion hatte Validierungsfehler:

{error_list}

Deine vorherige Antwort war:
{previous_response}

Bitte korrigiere die Extraktion. Hier nochmal der Originaltext:

---
{text}
---

Antworte nur mit dem korrigierten JSON-Objekt."""

    def _parse_json_response(self, response: str) -> dict | None:
        """Extract JSON from LLM response."""
        # Try to parse as-is first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try to find JSON in code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON object directly
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                # If it has "data" key, extract that
                if "data" in parsed:
                    return parsed["data"]
                return parsed
            except json.JSONDecodeError:
                pass

        return None

    def _extract_evidence(
        self,
        data: dict,
        text: str,
        context: ExtractionContext
    ) -> list[EvidencePointer]:
        """Find evidence in source text for extracted values."""
        evidence = []
        text_lower = text.lower()

        def find_evidence(value, field_path: str):
            if isinstance(value, str) and len(value) > 3:
                # Search for the value in text
                value_lower = value.lower()
                idx = text_lower.find(value_lower[:50])  # Use first 50 chars

                if idx >= 0:
                    # Get surrounding context (100 chars before and after)
                    start = max(0, idx - 50)
                    end = min(len(text), idx + len(value) + 50)
                    excerpt = text[start:end]

                    evidence.append(EvidencePointer(
                        field_path=field_path,
                        excerpt=excerpt,
                        chunk_index=context.chunk_index,
                        start_offset=idx,
                        end_offset=idx + len(value)
                    ))

            elif isinstance(value, list):
                for i, item in enumerate(value):
                    find_evidence(item, f"{field_path}[{i}]")

            elif isinstance(value, dict):
                for k, v in value.items():
                    find_evidence(v, f"{field_path}.{k}")

        for field, value in data.items():
            find_evidence(value, field)

        return evidence
