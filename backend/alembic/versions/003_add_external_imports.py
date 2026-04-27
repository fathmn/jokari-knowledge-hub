"""Add external import history

Revision ID: 003
Revises: 002
Create Date: 2026-04-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(500), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("api_endpoint", sa.String(1000), nullable=True),
        sa.Column("trust_type", sa.String(100), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("source_version", sa.String(255), nullable=True),
        sa.Column("authenticated_actor", sa.String(255), nullable=True),
        sa.Column("status", sa.String(100), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("details_json", postgresql.JSONB(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("source_type", "source_id", "content_hash", name="uq_external_import_source_hash"),
    )
    op.create_index("ix_external_imports_source", "external_imports", ["source_type", "source_id"])
    op.create_index("ix_external_imports_record_id", "external_imports", ["record_id"])


def downgrade() -> None:
    op.drop_index("ix_external_imports_record_id", table_name="external_imports")
    op.drop_index("ix_external_imports_source", table_name="external_imports")
    op.drop_table("external_imports")
