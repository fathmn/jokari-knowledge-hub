"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('department', sa.Enum('sales', 'support', 'marketing', 'product', 'legal', name='department'), nullable=False),
        sa.Column('doc_type', sa.Enum(
            'training_module', 'objection', 'persona', 'pitch_script', 'email_template',
            'faq', 'troubleshooting_guide', 'how_to_steps',
            'product_spec', 'compatibility_matrix', 'safety_notes',
            'messaging_pillars', 'content_guidelines',
            'compliance_notes', 'claims_do_dont',
            name='doctype'
        ), nullable=False),
        sa.Column('version_date', sa.DateTime(), nullable=False),
        sa.Column('owner', sa.String(255), nullable=False),
        sa.Column('confidentiality', sa.Enum('internal', 'public', name='confidentiality'), nullable=False, server_default='internal'),
        sa.Column('status', sa.Enum('uploading', 'parsing', 'extracting', 'pending_review', 'completed', 'parse_failed', 'extraction_failed', name='documentstatus'), nullable=False, server_default='uploading'),
        sa.Column('file_path', sa.String(1000), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Create chunks table
    op.create_table(
        'chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section_path', sa.String(500), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('start_offset', sa.Integer(), nullable=True),
        sa.Column('end_offset', sa.Integer(), nullable=True),
        sa.Column('chunk_index', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_chunks_document_id', 'chunks', ['document_id'])

    # Create records table
    op.create_table(
        'records',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('department', sa.Enum('sales', 'support', 'marketing', 'product', 'legal', name='department', create_type=False), nullable=False),
        sa.Column('schema_type', sa.String(100), nullable=False),
        sa.Column('primary_key', sa.String(500), nullable=False),
        sa.Column('data_json', postgresql.JSONB(), nullable=False),
        sa.Column('completeness_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', 'needs_review', name='recordstatus'), nullable=False, server_default='pending'),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_records_schema_primary', 'records', ['schema_type', 'primary_key'])
    op.create_index('ix_records_department', 'records', ['department'])
    op.create_index('ix_records_status', 'records', ['status'])

    # Create evidence table
    op.create_table(
        'evidence',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('records.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('field_path', sa.String(255), nullable=False),
        sa.Column('excerpt', sa.Text(), nullable=False),
        sa.Column('start_offset', sa.Integer(), nullable=True),
        sa.Column('end_offset', sa.Integer(), nullable=True),
    )
    op.create_index('ix_evidence_record_id', 'evidence', ['record_id'])

    # Create proposed_updates table
    op.create_table(
        'proposed_updates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('record_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('records.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('new_data_json', postgresql.JSONB(), nullable=False),
        sa.Column('diff_json', postgresql.JSONB(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='updatestatus'), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(255), nullable=True),
    )
    op.create_index('ix_proposed_updates_record_id', 'proposed_updates', ['record_id'])

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('actor', sa.String(255), nullable=False, server_default='system'),
        sa.Column('details_json', postgresql.JSONB(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'])
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('proposed_updates')
    op.drop_table('evidence')
    op.drop_table('records')
    op.drop_table('chunks')
    op.drop_table('documents')

    op.execute('DROP TYPE IF EXISTS updatestatus')
    op.execute('DROP TYPE IF EXISTS recordstatus')
    op.execute('DROP TYPE IF EXISTS documentstatus')
    op.execute('DROP TYPE IF EXISTS confidentiality')
    op.execute('DROP TYPE IF EXISTS doctype')
    op.execute('DROP TYPE IF EXISTS department')
