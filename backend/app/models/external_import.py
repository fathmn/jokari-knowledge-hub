import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class ExternalSourceType(str, enum.Enum):
    SITEMAP = "sitemap"
    CLOUDFLARE_API = "cloudflare_api"
    CLOUDFLARE_MCP = "cloudflare_mcp"
    FIRECRAWL = "firecrawl"
    CRAWLEE = "crawlee"
    BROWSER_MCP = "browser_mcp"
    DIRECT_PIM_API = "direct_pim_api"
    MANUAL_UPLOAD = "manual_upload"


class ExternalTrustType(str, enum.Enum):
    UNAUTHENTICATED_PUBLIC = "unauthenticated_public"
    AUTHENTICATED_PIM = "authenticated_pim"
    AUTHENTICATED_CLOUDFLARE = "authenticated_cloudflare"
    MANUAL_REVIEW = "manual_review"


class ExternalImportStatus(str, enum.Enum):
    IMPORTED = "imported"
    UPDATED = "updated"
    SKIPPED_DUPLICATE = "skipped_duplicate"
    NEEDS_REVIEW = "needs_review"
    REJECTED_UNTRUSTED = "rejected_untrusted"
    FAILED = "failed"


class ExternalImport(Base):
    __tablename__ = "external_imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(
        SQLEnum(
            ExternalSourceType,
            values_callable=lambda x: [e.value for e in x],
            create_constraint=False,
            native_enum=False,
        ),
        nullable=False,
    )
    source_id = Column(String(500), nullable=False)
    source_url = Column(String(1000), nullable=True)
    api_endpoint = Column(String(1000), nullable=True)
    trust_type = Column(
        SQLEnum(
            ExternalTrustType,
            values_callable=lambda x: [e.value for e in x],
            create_constraint=False,
            native_enum=False,
        ),
        nullable=False,
        default=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
    )
    content_hash = Column(String(64), nullable=False)
    source_version = Column(String(255), nullable=True)
    authenticated_actor = Column(String(255), nullable=True)
    status = Column(
        SQLEnum(
            ExternalImportStatus,
            values_callable=lambda x: [e.value for e in x],
            create_constraint=False,
            native_enum=False,
        ),
        nullable=False,
    )
    record_id = Column(UUID(as_uuid=True), ForeignKey("records.id", ondelete="SET NULL"), nullable=True)
    details_json = Column(JSONB, nullable=True)
    imported_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "content_hash", name="uq_external_import_source_hash"),
        Index("ix_external_imports_source", "source_type", "source_id"),
        Index("ix_external_imports_record_id", "record_id"),
    )
