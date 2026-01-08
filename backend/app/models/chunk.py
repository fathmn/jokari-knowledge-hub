import uuid
from sqlalchemy import Column, String, Text, Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    section_path = Column(String(500), nullable=True)  # e.g., "Chapter 1 > Section 1.1"
    text = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)  # OpenAI embedding dimension
    confidence = Column(Float, nullable=False, default=1.0)  # Lower for PDF
    start_offset = Column(Integer, nullable=True)  # Character offset in original
    end_offset = Column(Integer, nullable=True)
    chunk_index = Column(Integer, nullable=False, default=0)

    # Relationships
    document = relationship("Document", back_populates="chunks")
    evidence_items = relationship("Evidence", back_populates="chunk", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chunk {self.id} from {self.document_id}>"
