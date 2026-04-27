"""Add durable jobs

Revision ID: 004
Revises: 003
Create Date: 2026-04-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(100), nullable=False),
        sa.Column("idempotency_key", sa.String(500), nullable=True, unique=True),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("result_json", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("locked_by", sa.String(255), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_jobs_status_type_created", "jobs", ["status", "job_type", "created_at"])
    op.create_index("ix_jobs_locked_at", "jobs", ["locked_at"])


def downgrade() -> None:
    op.drop_index("ix_jobs_locked_at", table_name="jobs")
    op.drop_index("ix_jobs_status_type_created", table_name="jobs")
    op.drop_table("jobs")
