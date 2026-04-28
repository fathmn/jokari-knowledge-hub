from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from app.models.document import Department
from app.models.record import RecordStatus


class EvidenceResponse(BaseModel):
    id: UUID
    field_path: str
    excerpt: str
    chunk_id: Optional[UUID] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None

    class Config:
        from_attributes = True


class AttachmentResponse(BaseModel):
    id: UUID
    filename: str
    file_type: str
    file_size: Optional[str] = None
    url: Optional[str] = None
    source_url: Optional[str] = None
    content_hash: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SourceMetadataResponse(BaseModel):
    source_kind: str
    label: str
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    source_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    trust_type: Optional[str] = None
    authenticated_source: Optional[bool] = None
    status: Optional[str] = None
    content_hash: Optional[str] = None
    imported_at: Optional[datetime] = None
    document_filename: Optional[str] = None
    document_owner: Optional[str] = None
    document_uploaded_at: Optional[datetime] = None
    details_json: Optional[dict[str, Any]] = None


class RecordResponse(BaseModel):
    id: UUID
    document_id: Optional[UUID] = None
    department: Department
    schema_type: str
    primary_key: str
    data_json: dict[str, Any]
    completeness_score: float
    status: RecordStatus
    version: int
    created_at: datetime
    updated_at: datetime
    evidence_items: list[EvidenceResponse] = []
    attachments: list[AttachmentResponse] = []
    source_metadata: Optional[SourceMetadataResponse] = None

    class Config:
        from_attributes = True


class RecordListResponse(BaseModel):
    records: list[RecordResponse]
    total: int
    page: int
    pages: int


class RecordUpdate(BaseModel):
    data_json: dict[str, Any]
