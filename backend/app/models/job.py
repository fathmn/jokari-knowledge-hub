import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class JobType(str, enum.Enum):
    DOCUMENT_INGESTION = "document_ingestion"
    WEBSITE_IMPORT = "website_import"
    EXTERNAL_IMPORT = "external_import"
    LLM_EXTRACTION = "llm_extraction"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_type = Column(
        SQLEnum(
            JobType,
            values_callable=lambda x: [e.value for e in x],
            create_constraint=False,
            native_enum=False,
        ),
        nullable=False,
    )
    status = Column(
        SQLEnum(
            JobStatus,
            values_callable=lambda x: [e.value for e in x],
            create_constraint=False,
            native_enum=False,
        ),
        nullable=False,
        default=JobStatus.QUEUED,
    )
    idempotency_key = Column(String(500), nullable=True, unique=True)
    payload_json = Column(JSONB, nullable=False, default=dict)
    result_json = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    locked_by = Column(String(255), nullable=True)
    locked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_jobs_status_type_created", "status", "job_type", "created_at"),
        Index("ix_jobs_locked_at", "locked_at"),
    )

    def __repr__(self):
        return f"<Job {self.job_type}:{self.status}>"
