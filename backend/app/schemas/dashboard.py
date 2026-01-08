from pydantic import BaseModel
from typing import Any


class StaleRecord(BaseModel):
    record_id: str
    schema_type: str
    primary_key: str
    age_months: int


class MissingField(BaseModel):
    field: str
    count: int


class DashboardStats(BaseModel):
    total_documents: int
    pending_reviews: int
    approved_records: int
    rejected_records: int
    completeness_by_department: dict[str, float]
    stale_records: list[StaleRecord]
    top_missing_fields: list[MissingField]
