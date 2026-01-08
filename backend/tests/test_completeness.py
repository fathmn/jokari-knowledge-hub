import pytest
from app.services.completeness import CompletenessService
from app.models.document import DocType


class TestCompletenessService:
    """Tests for completeness scoring."""

    def setup_method(self):
        self.service = CompletenessService()

    def test_completeness_score_all_fields_filled(self):
        """Test scoring when all required fields are present."""
        data = {
            "id": "OBJ-001",
            "objection_text": "Das ist zu teuer",
            "response": "Verstehe ich, aber..."
        }

        score = self.service.calculate_score(DocType.OBJECTION, data)

        assert score == 1.0

    def test_completeness_score_missing_required(self):
        """Test scoring when required fields are missing."""
        data = {
            "id": "OBJ-001",
            "objection_text": "Das ist zu teuer"
            # response is missing
        }

        score = self.service.calculate_score(DocType.OBJECTION, data)

        # Objection has 3 required fields, 2 are filled
        assert score == pytest.approx(2/3, rel=0.01)

    def test_completeness_score_empty_values(self):
        """Test that empty strings count as missing."""
        data = {
            "id": "OBJ-001",
            "objection_text": "",
            "response": "Antwort"
        }

        score = self.service.calculate_score(DocType.OBJECTION, data)

        # Empty string should count as missing
        assert score < 1.0

    def test_completeness_score_optional_fields(self):
        """Test that optional fields don't affect score."""
        data = {
            "id": "OBJ-001",
            "objection_text": "Einwand",
            "response": "Antwort"
            # category and effectiveness_score are optional
        }

        score = self.service.calculate_score(DocType.OBJECTION, data)

        # All required fields present = 100%
        assert score == 1.0

    def test_get_missing_fields(self):
        """Test identification of missing fields."""
        data = {
            "id": "OBJ-001"
            # objection_text and response are missing
        }

        missing = self.service.get_missing_fields(DocType.OBJECTION, data)

        assert "objection_text" in missing
        assert "response" in missing
        assert "id" not in missing

    def test_calculate_score_with_details(self):
        """Test detailed scoring breakdown."""
        data = {
            "id": "OBJ-001",
            "objection_text": "Einwand",
            "category": "Preis"  # optional
        }

        details = self.service.calculate_score_with_details(DocType.OBJECTION, data)

        assert details["total_required"] == 3
        assert details["filled_required"] == 2
        assert "response" in details["missing_fields"]
        assert details["optional_filled"] == 1
