"""add quality_score to dataset_registry

Revision ID: e8b4c2d71f5a
Revises: d7f3a9b12c4e
Create Date: 2026-03-16 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e8b4c2d71f5a"
down_revision = "d7f3a9b12c4e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_registry",
        sa.Column("quality_score", sa.Float(), nullable=True, comment="0-100 data quality score"),
    )


def downgrade() -> None:
    op.drop_column("dataset_registry", "quality_score")
