import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.document import Department
import enum


class RecordStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"


class Record(Base):
    __tablename__ = "records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    department = Column(SQLEnum(Department, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False)
    schema_type = Column(String(100), nullable=False)  # e.g., "Objection", "ProductSpec"
    primary_key = Column(String(500), nullable=False)  # Stable ID for merge
    data_json = Column(JSONB, nullable=False)
    completeness_score = Column(Float, nullable=False, default=0.0)
    status = Column(SQLEnum(RecordStatus, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False, default=RecordStatus.PENDING)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="records")
    evidence_items = relationship("Evidence", back_populates="record", cascade="all, delete-orphan")
    proposed_updates = relationship("ProposedUpdate", back_populates="record", cascade="all, delete-orphan")
    attachments = relationship("RecordAttachment", back_populates="record", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Record {self.schema_type}:{self.primary_key}>"
