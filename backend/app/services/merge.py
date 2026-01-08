from typing import Any, Optional
from uuid import UUID
from deepdiff import DeepDiff
from sqlalchemy.orm import Session
from app.models.record import Record, RecordStatus
from app.models.proposed_update import ProposedUpdate, UpdateStatus
from app.schemas.knowledge.registry import get_schema_registry
from app.models.document import DocType


class MergeService:
    """Service for handling record merges and updates."""

    def __init__(self):
        self.registry = get_schema_registry()

    def find_existing_record(
        self,
        db: Session,
        schema_type: str,
        primary_key: str
    ) -> Optional[Record]:
        """Find an existing approved record with the same primary key."""
        return db.query(Record).filter(
            Record.schema_type == schema_type,
            Record.primary_key == primary_key,
            Record.status == RecordStatus.APPROVED
        ).first()

    def compute_primary_key(self, doc_type: DocType, data: dict) -> str:
        """Compute the stable primary key for a record."""
        schema = self.registry.get_schema(doc_type)
        return schema.compute_primary_key(data)

    def compute_diff(self, old_data: dict, new_data: dict) -> dict:
        """
        Compute a structured diff between old and new data.

        Returns a dict with:
        - added: fields only in new
        - removed: fields only in old
        - changed: fields with different values
        - unchanged: fields that are the same
        """
        diff = DeepDiff(old_data, new_data, ignore_order=True)

        result = {
            "added": {},
            "removed": {},
            "changed": {},
            "unchanged": {}
        }

        # Process additions
        if "dictionary_item_added" in diff:
            for key in diff["dictionary_item_added"]:
                field = self._extract_field_name(key)
                result["added"][field] = new_data.get(field)

        # Process removals
        if "dictionary_item_removed" in diff:
            for key in diff["dictionary_item_removed"]:
                field = self._extract_field_name(key)
                result["removed"][field] = old_data.get(field)

        # Process changes
        if "values_changed" in diff:
            for key, change in diff["values_changed"].items():
                field = self._extract_field_name(key)
                result["changed"][field] = {
                    "old": change["old_value"],
                    "new": change["new_value"]
                }

        # Find unchanged fields
        all_fields = set(old_data.keys()) | set(new_data.keys())
        changed_fields = set(result["added"].keys()) | set(result["removed"].keys()) | set(result["changed"].keys())
        for field in all_fields - changed_fields:
            if field in old_data and field in new_data:
                result["unchanged"][field] = old_data[field]

        return result

    def _extract_field_name(self, diff_key: str) -> str:
        """Extract field name from DeepDiff key format."""
        # DeepDiff uses format like "root['field_name']"
        import re
        match = re.search(r"\['([^']+)'\]", diff_key)
        if match:
            return match.group(1)
        return diff_key

    def create_proposed_update(
        self,
        db: Session,
        existing_record: Record,
        new_data: dict,
        source_document_id: UUID
    ) -> ProposedUpdate:
        """Create a proposed update for an existing record."""
        diff = self.compute_diff(existing_record.data_json, new_data)

        update = ProposedUpdate(
            record_id=existing_record.id,
            source_document_id=source_document_id,
            new_data_json=new_data,
            diff_json=diff,
            status=UpdateStatus.PENDING
        )

        db.add(update)
        db.commit()
        db.refresh(update)

        return update

    def apply_update(
        self,
        db: Session,
        update: ProposedUpdate,
        reviewer: str = "system"
    ) -> Record:
        """Apply a proposed update to the record."""
        from datetime import datetime

        record = update.record

        # Increment version and update data
        record.data_json = update.new_data_json
        record.version += 1
        record.updated_at = datetime.utcnow()

        # Mark update as approved
        update.status = UpdateStatus.APPROVED
        update.reviewed_at = datetime.utcnow()
        update.reviewed_by = reviewer

        db.commit()
        db.refresh(record)

        return record

    def reject_update(
        self,
        db: Session,
        update: ProposedUpdate,
        reviewer: str = "system"
    ):
        """Reject a proposed update."""
        from datetime import datetime

        update.status = UpdateStatus.REJECTED
        update.reviewed_at = datetime.utcnow()
        update.reviewed_by = reviewer

        db.commit()
