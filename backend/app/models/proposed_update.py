import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class UpdateStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ProposedUpdate(Base):
    __tablename__ = "proposed_updates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id", ondelete="CASCADE"), nullable=False)
    source_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    new_data_json = Column(JSONB, nullable=False)
    diff_json = Column(JSONB, nullable=False)  # Structured diff between old and new
    status = Column(SQLEnum(UpdateStatus), nullable=False, default=UpdateStatus.PENDING)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String(255), nullable=True)

    # Relationships
    record = relationship("Record", back_populates="proposed_updates")

    def __repr__(self):
        return f"<ProposedUpdate {self.id} for {self.record_id}>"
