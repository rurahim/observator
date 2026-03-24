"""Add source_type and source_url to evidence_store

Revision ID: a3f7c8e21b4d
Revises: 132039ec7832
Create Date: 2026-03-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3f7c8e21b4d"
down_revision: Union[str, None] = "132039ec7832"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evidence_store",
        sa.Column("source_type", sa.String(30), server_default="internal", nullable=False),
    )
    op.add_column(
        "evidence_store",
        sa.Column("source_url", sa.String(2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evidence_store", "source_url")
    op.drop_column("evidence_store", "source_type")
