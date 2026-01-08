import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class Department(str, enum.Enum):
    SALES = "sales"
    SUPPORT = "support"
    MARKETING = "marketing"
    PRODUCT = "product"
    LEGAL = "legal"


class DocType(str, enum.Enum):
    # Sales
    TRAINING_MODULE = "training_module"
    OBJECTION = "objection"
    PERSONA = "persona"
    PITCH_SCRIPT = "pitch_script"
    EMAIL_TEMPLATE = "email_template"
    # Support
    FAQ = "faq"
    TROUBLESHOOTING_GUIDE = "troubleshooting_guide"
    HOW_TO_STEPS = "how_to_steps"
    # Product
    PRODUCT_SPEC = "product_spec"
    COMPATIBILITY_MATRIX = "compatibility_matrix"
    SAFETY_NOTES = "safety_notes"
    # Marketing
    MESSAGING_PILLARS = "messaging_pillars"
    CONTENT_GUIDELINES = "content_guidelines"
    # Legal
    COMPLIANCE_NOTES = "compliance_notes"
    CLAIMS_DO_DONT = "claims_do_dont"


class Confidentiality(str, enum.Enum):
    INTERNAL = "internal"
    PUBLIC = "public"


class DocumentStatus(str, enum.Enum):
    UPLOADING = "uploading"
    PARSING = "parsing"
    EXTRACTING = "extracting"
    PENDING_REVIEW = "pending_review"
    COMPLETED = "completed"
    PARSE_FAILED = "parse_failed"
    EXTRACTION_FAILED = "extraction_failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(500), nullable=False)
    department = Column(SQLEnum(Department, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False)
    doc_type = Column(SQLEnum(DocType, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False)
    version_date = Column(DateTime, nullable=False)
    owner = Column(String(255), nullable=False)
    confidentiality = Column(SQLEnum(Confidentiality, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False, default=Confidentiality.INTERNAL)
    status = Column(SQLEnum(DocumentStatus, values_callable=lambda x: [e.value for e in x], create_constraint=False, native_enum=False), nullable=False, default=DocumentStatus.UPLOADING)
    file_path = Column(String(1000), nullable=True)
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")
    records = relationship("Record", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document {self.filename}>"
