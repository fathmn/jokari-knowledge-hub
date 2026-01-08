import re
import json
from typing import Type, Optional
from pydantic import BaseModel
from app.extractors.base import (
    LLMExtractor,
    ExtractionContext,
    ExtractionResult,
    ExtractedRecord,
    EvidencePointer
)


class LocalStubExtractor(LLMExtractor):
    """
    Rule-based extractor for development and testing.
    Supports multi-record extraction from documents containing multiple entities.
    """

    # Patterns that indicate a new product/entity section
    SECTION_MARKERS = [
        r"Titel:\s*(.+?)(?:\n|Beschreibung:)",  # German: "Titel: Product Name"
        r"^#{1,3}\s+(.+)$",  # Markdown headers
        r"^Produkt:\s*(.+)$",  # "Produkt: Name"
        r"^Artikel:\s*(.+)$",  # "Artikel: Name"
        r"^Name:\s*(.+)$",  # "Name: Value"
    ]

    async def extract(
        self,
        text: str,
        schema: Type[BaseModel],
        context: ExtractionContext
    ) -> ExtractionResult:
        """Extract data using rule-based heuristics with multi-record support."""

        # Try to detect multiple entities in the document
        sections = self._split_into_sections(text)

        if len(sections) > 1:
            # Multi-record extraction
            records = []
            all_errors = []

            for section_title, section_text in sections:
                record = self._extract_single_record(
                    section_text,
                    section_title,
                    schema,
                    context
                )
                if record:
                    records.append(record)

            return ExtractionResult(
                data=None,  # Multi-record mode
                records=records,
                valid=len(records) > 0,
                errors=all_errors,
                evidence=[],
                confidence=0.7 if records else 0.3,
                needs_review=len(records) == 0,
                raw_response=f"Extracted {len(records)} records"
            )
        else:
            # Single record extraction (legacy mode)
            return await self._extract_single(text, schema, context)

    def _split_into_sections(self, text: str) -> list[tuple[str, str]]:
        """
        Split document into sections, each representing a potential entity.
        Returns list of (section_title, section_content) tuples.
        """
        sections = []

        # Find all "Titel:" positions first
        # Use lookahead to find "Titel:" followed by content
        titel_positions = [m.start() for m in re.finditer(r"Titel:\s*", text, re.IGNORECASE)]

        if len(titel_positions) >= 2:
            # Document has multiple "Titel:" sections
            for i, start_pos in enumerate(titel_positions):
                # Get content from this Titel to the next (or end)
                if i + 1 < len(titel_positions):
                    end_pos = titel_positions[i + 1]
                else:
                    end_pos = len(text)

                section_text = text[start_pos:end_pos].strip()

                # Extract title (text between "Titel:" and "Beschreibung:" or first 100 chars)
                title_match = re.match(
                    r"Titel:\s*(.+?)(?:\s*Beschreibung:|$)",
                    section_text,
                    re.IGNORECASE | re.DOTALL
                )
                if title_match:
                    title = title_match.group(1).strip()
                    # Clean up title - take first line or first 100 chars
                    title = title.split('\n')[0].strip()[:100]
                else:
                    title = section_text[7:107].strip()  # Skip "Titel: " prefix

                # Skip very short sections or generic intro sections
                if len(section_text) > 200 and "Beschreibung:" in section_text:
                    sections.append((title, section_text))

            return sections

        # Fallback: Try markdown headers
        header_pattern = r"^(#{1,3})\s+(.+)$"
        lines = text.split('\n')
        current_title = None
        current_content = []

        for line in lines:
            header_match = re.match(header_pattern, line)
            if header_match:
                title = header_match.group(2).strip()

                # Save previous section
                if current_title and current_content:
                    content = '\n'.join(current_content)
                    if len(content) > 100:
                        sections.append((current_title, content))

                current_title = title
                current_content = []
            else:
                current_content.append(line)

        # Save last section
        if current_title and current_content:
            content = '\n'.join(current_content)
            if len(content) > 100:
                sections.append((current_title, content))

        # If no sections found, return entire document as one section
        if not sections:
            first_line = text.split('\n')[0].strip()[:100]
            sections.append((first_line, text))

        return sections

    def _extract_single_record(
        self,
        text: str,
        section_title: str,
        schema: Type[BaseModel],
        context: ExtractionContext
    ) -> Optional[ExtractedRecord]:
        """Extract a single record from a text section."""

        schema_name = schema.__name__
        extracted_data = {}
        evidence = []

        # Set title from section
        if "title" in schema.model_fields:
            extracted_data["title"] = section_title
            evidence.append(EvidencePointer(
                field_path="title",
                excerpt=section_title,
                chunk_index=context.chunk_index
            ))

        # Extract other fields
        for field_name, field_info in schema.model_fields.items():
            if field_name == "title":
                continue

            value, excerpt = self._extract_field(text, field_name, field_info, schema_name)

            if value is not None:
                extracted_data[field_name] = value
                if excerpt:
                    evidence.append(EvidencePointer(
                        field_path=field_name,
                        excerpt=excerpt[:500],  # Limit excerpt length
                        chunk_index=context.chunk_index
                    ))

        # Try to extract additional structured fields from Jokari-style docs
        extracted_data = self._extract_jokari_product_fields(text, extracted_data)

        if not extracted_data:
            return None

        # Validate
        valid, errors = self._validate_with_schema(extracted_data, schema)

        return ExtractedRecord(
            data=extracted_data,
            schema_type=schema_name,
            evidence=evidence,
            confidence=0.6 if valid else 0.4,
            source_section=section_title
        )

    def _extract_jokari_product_fields(self, text: str, data: dict) -> dict:
        """Extract Jokari-specific product fields from text."""

        # Extract description
        desc_match = re.search(
            r"Beschreibung:\s*(.+?)(?=Welche Kabeltypen|Weitere Informationen|Anwendung:|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if desc_match and "description" not in data:
            desc = desc_match.group(1).strip()
            # Clean up description
            desc = re.sub(r'\s+', ' ', desc)
            data["description"] = desc[:2000]  # Limit length

        # Extract article number
        artnr_match = re.search(r"(\d{5})[_\-]", text)
        if artnr_match:
            data["artnr"] = artnr_match.group(1)

        # Extract cable types
        kabel_match = re.search(
            r"Welche Kabeltypen.+?bearbeiten\?(.+?)(?=Weitere Informationen|Anwendung:|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if kabel_match:
            kabel_text = kabel_match.group(1)
            # Extract cable types like "NYM-J 3x1,5 mm²"
            cables = re.findall(r"([A-Z]{2,}[-\s]?[A-Z]*\s+\d+x[\d,]+\s*mm²)", kabel_text)
            if cables:
                data["kabeltypen"] = list(set(cables))

        # Extract application steps
        anwendung_match = re.search(
            r"Anwendung[^:]*:\s*(.+?)(?=Titel:|$|Umsetzung als Column)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if anwendung_match:
            steps_text = anwendung_match.group(1)
            # Extract numbered steps or bullet points
            steps = re.findall(r"(?:^|\n)\s*(?:\d+\.|\-|\•)\s*([^\n]+)", steps_text)
            if steps:
                data["anwendung"] = [s.strip() for s in steps[:20]]  # Max 20 steps

        # Extract features (bullet points starting with specific patterns)
        features = []
        feature_patterns = [
            r"(?:^|\n)\s*(?:\-|\•)\s*(TÜV[^\n]+)",
            r"(?:^|\n)\s*(?:\-|\•)\s*(Wabenstruktur[^\n]+)",
            r"(?:^|\n)\s*(?:\-|\•)\s*(Klingen mit[^\n]+)",
            r"(?:^|\n)\s*(?:\-|\•)\s*(Sicherheitsverschluss[^\n]+)",
        ]
        for pattern in feature_patterns:
            match = re.search(pattern, text)
            if match:
                features.append(match.group(1).strip())

        if features:
            data["features"] = features

        # Extract images
        image_matches = re.findall(r"(\d{5}_[^\s]+\.(?:jpg|png|tif|jpeg))", text, re.IGNORECASE)
        if image_matches:
            data["medien"] = list(set(image_matches))

        return data

    async def _extract_single(
        self,
        text: str,
        schema: Type[BaseModel],
        context: ExtractionContext
    ) -> ExtractionResult:
        """Legacy single-record extraction."""

        schema_name = schema.__name__
        extracted_data = {}
        evidence = []

        for field_name, field_info in schema.model_fields.items():
            value, excerpt = self._extract_field(text, field_name, field_info, schema_name)

            if value is not None:
                extracted_data[field_name] = value
                if excerpt:
                    evidence.append(EvidencePointer(
                        field_path=field_name,
                        excerpt=excerpt,
                        chunk_index=context.chunk_index
                    ))

        valid, errors = self._validate_with_schema(extracted_data, schema)

        return ExtractionResult(
            data=extracted_data if extracted_data else None,
            records=[],
            valid=valid,
            errors=errors,
            evidence=evidence,
            confidence=0.6 if valid else 0.3,
            needs_review=not valid,
            raw_response=json.dumps(extracted_data, ensure_ascii=False, indent=2)
        )

    def _extract_field(
        self,
        text: str,
        field_name: str,
        field_info,
        schema_name: str
    ) -> tuple:
        """Extract a single field value using heuristics."""

        text_lower = text.lower()
        annotation = str(field_info.annotation)

        # Field name patterns in German and English
        field_patterns = {
            "title": ["titel:", "überschrift:", "name:"],
            "question": ["frage:", "question:"],
            "answer": ["antwort:", "answer:", "lösung:"],
            "content": ["inhalt:", "content:", "text:"],
            "description": ["beschreibung:", "description:"],
            "problem": ["problem:", "fehler:", "issue:"],
            "solution": ["lösung:", "solution:"],
            "steps": ["schritte:", "steps:", "anleitung:"],
            "name": ["name:", "bezeichnung:"],
            "id": ["id:", "nummer:", "kennung:"],
            "artnr": ["artikelnummer:", "artnr:", "art.nr:", "art-nr:"],
            "version": ["version:", "v.:"],
            "subject": ["betreff:", "subject:"],
            "body": ["text:", "body:", "inhalt:"],
            "warnings": ["warnung:", "warning:", "achtung:", "vorsicht:"],
            "requirements": ["anforderung:", "requirement:"],
            "objection_text": ["einwand:", "objection:"],
            "response": ["antwort:", "response:", "erwiderung:"],
            "role": ["rolle:", "position:", "role:"],
            "category": ["kategorie:", "category:"],
        }

        patterns = field_patterns.get(field_name.lower(), [f"{field_name.lower()}:"])

        excerpt = None
        value = None

        for pattern in patterns:
            # Look for "Pattern Value" format
            regex = rf'{re.escape(pattern)}\s*([^\n]+)'
            match = re.search(regex, text_lower)

            if match:
                start = match.start(1)
                end = match.end(1)

                # Get original case
                original_start = text_lower.index(match.group(1), start)
                excerpt = text[original_start:original_start + (end - start)].strip()

                # Type conversion
                if "list" in annotation.lower():
                    if "," in excerpt:
                        value = [item.strip() for item in excerpt.split(",")]
                    else:
                        value = [excerpt]
                elif "int" in annotation.lower():
                    try:
                        value = int(re.search(r'\d+', excerpt).group())
                    except:
                        value = None
                elif "float" in annotation.lower():
                    try:
                        value = float(re.search(r'[\d.]+', excerpt).group())
                    except:
                        value = None
                else:
                    value = excerpt

                break

        # Fallbacks
        if value is None and field_name.lower() in ["title", "name"]:
            first_line = text.split("\n")[0].strip()
            if first_line and len(first_line) < 200:
                value = first_line
                excerpt = first_line

        if value is None and field_name.lower() in ["content", "body"]:
            value = text.strip()[:5000]  # Limit to 5000 chars
            excerpt = text[:200] + "..."

        return value, excerpt
