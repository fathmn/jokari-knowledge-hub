from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from uuid import UUID
from app.models.document import Department, DocType, Confidentiality, DocumentStatus


class DocumentCreate(BaseModel):
    department: Department
    doc_type: DocType
    version_date: datetime
    owner: str = Field(..., min_length=1, max_length=255)
    confidentiality: Confidentiality = Confidentiality.INTERNAL


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    department: Department
    doc_type: DocType
    version_date: datetime
    owner: str
    confidentiality: Confidentiality
    status: DocumentStatus
    file_path: Optional[str] = None
    error_message: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    page: int
    pages: int


class DocumentStatusResponse(BaseModel):
    id: UUID
    status: DocumentStatus
    progress: Optional[str] = None
    errors: list[str] = []
