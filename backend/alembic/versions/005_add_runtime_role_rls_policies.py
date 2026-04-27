"""add runtime role rls policies

Revision ID: 005
Revises: 004
Create Date: 2026-04-27 18:48:00.000000
"""

from alembic import op


revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


TABLES = (
    "documents",
    "chunks",
    "records",
    "evidence",
    "proposed_updates",
    "record_attachments",
    "audit_logs",
    "external_imports",
    "jobs",
)


def upgrade() -> None:
    for table in TABLES:
        policy_name = f"{table}_jokari_backend_all"
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jokari_backend') THEN
                    DROP POLICY IF EXISTS {policy_name} ON public.{table};
                    CREATE POLICY {policy_name}
                    ON public.{table}
                    FOR ALL
                    TO jokari_backend
                    USING (true)
                    WITH CHECK (true);
                END IF;
            END
            $$;
            """
        )


def downgrade() -> None:
    for table in TABLES:
        policy_name = f"{table}_jokari_backend_all"
        op.execute(f"DROP POLICY IF EXISTS {policy_name} ON public.{table};")
