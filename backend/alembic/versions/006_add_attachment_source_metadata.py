"""Add attachment source metadata

Revision ID: 006
Revises: 005
Create Date: 2026-04-28
"""
from alembic import op


revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE record_attachments ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000)")
    op.execute("ALTER TABLE record_attachments ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_record_attachments_source_url "
        "ON record_attachments (source_url)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_record_attachments_content_hash "
        "ON record_attachments (content_hash)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_record_attachments_content_hash")
    op.execute("DROP INDEX IF EXISTS ix_record_attachments_source_url")
    op.execute("ALTER TABLE record_attachments DROP COLUMN IF EXISTS content_hash")
    op.execute("ALTER TABLE record_attachments DROP COLUMN IF EXISTS source_url")
