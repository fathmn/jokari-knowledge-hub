from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from app.models.proposed_update import UpdateStatus


class ReviewAction(BaseModel):
    reason: Optional[str] = None
    actor: str = "user"


class ProposedUpdateResponse(BaseModel):
    id: UUID
    record_id: UUID
    source_document_id: Optional[UUID] = None
    new_data_json: dict[str, Any]
    diff_json: dict[str, Any]
    status: UpdateStatus
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None

    class Config:
        from_attributes = True
