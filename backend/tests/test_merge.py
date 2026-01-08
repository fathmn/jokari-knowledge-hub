import pytest
from app.services.merge import MergeService
from app.models.document import DocType


class TestMergeService:
    """Tests for merge logic."""

    def setup_method(self):
        self.service = MergeService()

    def test_compute_primary_key_single_field(self):
        """Test primary key computation for single field."""
        data = {"id": "OBJ-001", "objection_text": "Test"}

        key = self.service.compute_primary_key(DocType.OBJECTION, data)

        assert key == "obj-001"

    def test_compute_primary_key_multiple_fields(self):
        """Test primary key computation for multiple fields."""
        data = {
            "title": "Sales Training",
            "version": "1.0",
            "content": "Training content"
        }

        key = self.service.compute_primary_key(DocType.TRAINING_MODULE, data)

        assert key == "sales training|1.0"

    def test_compute_diff_added_fields(self):
        """Test diff computation for added fields."""
        old_data = {"id": "001", "name": "Test"}
        new_data = {"id": "001", "name": "Test", "description": "New field"}

        diff = self.service.compute_diff(old_data, new_data)

        assert "description" in diff["added"]
        assert diff["added"]["description"] == "New field"

    def test_compute_diff_removed_fields(self):
        """Test diff computation for removed fields."""
        old_data = {"id": "001", "name": "Test", "old_field": "Remove me"}
        new_data = {"id": "001", "name": "Test"}

        diff = self.service.compute_diff(old_data, new_data)

        assert "old_field" in diff["removed"]

    def test_compute_diff_changed_fields(self):
        """Test diff computation for changed fields."""
        old_data = {"id": "001", "name": "Old Name"}
        new_data = {"id": "001", "name": "New Name"}

        diff = self.service.compute_diff(old_data, new_data)

        assert "name" in diff["changed"]
        assert diff["changed"]["name"]["old"] == "Old Name"
        assert diff["changed"]["name"]["new"] == "New Name"

    def test_compute_diff_unchanged_fields(self):
        """Test diff computation identifies unchanged fields."""
        old_data = {"id": "001", "name": "Same"}
        new_data = {"id": "001", "name": "Same", "extra": "New"}

        diff = self.service.compute_diff(old_data, new_data)

        assert "id" in diff["unchanged"]
        assert "name" in diff["unchanged"]

    def test_compute_diff_no_changes(self):
        """Test diff when data is identical."""
        data = {"id": "001", "name": "Test"}

        diff = self.service.compute_diff(data, data.copy())

        assert len(diff["added"]) == 0
        assert len(diff["removed"]) == 0
        assert len(diff["changed"]) == 0
        assert len(diff["unchanged"]) == 2
