"""Add O*NET importance/level weights to occupation-skill mapping

Revision ID: b7e2a1f9c345
Revises: a3f7c8e21b4d
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7e2a1f9c345"
down_revision: Union[str, None] = "a3f7c8e21b4d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add O*NET element ID to dim_skill for precise taxonomy linking
    op.add_column("dim_skill", sa.Column("onet_element_id", sa.String(20), nullable=True))
    op.create_index("ix_dim_skill_onet_element_id", "dim_skill", ["onet_element_id"])

    # Add index on code_soc (used heavily in O*NET lookups)
    op.create_index("ix_dim_occupation_code_soc", "dim_occupation", ["code_soc"])

    # Add importance and level weight columns to fact_occupation_skills
    op.add_column("fact_occupation_skills", sa.Column("importance", sa.Float(), nullable=True))
    op.add_column("fact_occupation_skills", sa.Column("level", sa.Float(), nullable=True))

    # Deduplicate existing rows before adding unique constraint
    # Keeps the row with the lowest id for each (occupation_id, skill_id, source) group
    op.execute("""
        DELETE FROM fact_occupation_skills
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM fact_occupation_skills
            GROUP BY occupation_id, skill_id, source
        )
    """)

    # Unique constraint: one row per (occupation, skill, source)
    op.create_unique_constraint(
        "uq_occ_skill_source", "fact_occupation_skills",
        ["occupation_id", "skill_id", "source"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_occ_skill_source", "fact_occupation_skills", type_="unique")
    op.drop_column("fact_occupation_skills", "level")
    op.drop_column("fact_occupation_skills", "importance")
    op.drop_index("ix_dim_occupation_code_soc", table_name="dim_occupation")
    op.drop_index("ix_dim_skill_onet_element_id", table_name="dim_skill")
    op.drop_column("dim_skill", "onet_element_id")
