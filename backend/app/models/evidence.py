import uuid
from sqlalchemy import Column, String, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id", ondelete="CASCADE"), nullable=False)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True)
    field_path = Column(String(255), nullable=False)  # e.g., "response", "steps[0].instruction"
    excerpt = Column(Text, nullable=False)  # The source text snippet
    start_offset = Column(Integer, nullable=True)  # Position in chunk
    end_offset = Column(Integer, nullable=True)

    # Relationships
    record = relationship("Record", back_populates="evidence_items")
    chunk = relationship("Chunk", back_populates="evidence_items")

    def __repr__(self):
        return f"<Evidence {self.field_path} for {self.record_id}>"
