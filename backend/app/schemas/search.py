from pydantic import BaseModel, Field
from typing import Optional, Any
from uuid import UUID
from app.models.document import Department
from app.schemas.record import EvidenceResponse


class SearchQuery(BaseModel):
    department: Optional[Department] = None
    schema_type: Optional[str] = None
    q: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=100)


class SearchResult(BaseModel):
    record_id: UUID
    department: Department
    schema_type: str
    primary_key: str
    data_json: dict[str, Any]
    evidence: list[EvidenceResponse]
    relevance_score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query: str
