import uuid
from datetime import datetime
from typing import ClassVar, Optional
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class RecordAttachment(Base):
    __tablename__ = "record_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(500), nullable=False)
    file_type = Column(String(100), nullable=False)  # MIME type
    file_path = Column(String(1000), nullable=False)  # Path in MinIO
    file_size = Column(String(50), nullable=True)  # Human-readable size
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Non-persistent attribute for presigned URL (not a DB column)
    url: Optional[str] = None
    __allow_unmapped__ = True

    # Relationships
    record = relationship("Record", back_populates="attachments")

    def __repr__(self):
        return f"<RecordAttachment {self.filename}>"
