"""add file_type and file_size to dataset_registry

Revision ID: c5a2d8f91e3b
Revises: b4e9d1f53a2c
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "c5a2d8f91e3b"
down_revision = "b4e9d1f53a2c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dataset_registry", sa.Column("file_type", sa.String(50), nullable=True))
    op.add_column("dataset_registry", sa.Column("file_size", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("dataset_registry", "file_size")
    op.drop_column("dataset_registry", "file_type")
