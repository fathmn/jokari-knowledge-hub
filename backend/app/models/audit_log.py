import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(100), nullable=False)  # e.g., "approve", "reject", "upload", "update"
    entity_type = Column(String(100), nullable=False)  # e.g., "Record", "Document", "ProposedUpdate"
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    actor = Column(String(255), nullable=False, default="system")
    details_json = Column(JSONB, nullable=True)  # Additional context
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<AuditLog {self.action} on {self.entity_type}:{self.entity_id}>"
