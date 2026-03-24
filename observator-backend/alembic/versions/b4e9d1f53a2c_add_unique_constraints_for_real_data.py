"""Add unique constraints for real data seeding

- dim_occupation.code_esco: UNIQUE (enables ON CONFLICT for ESCO seed)
- dim_skill.uri_esco: UNIQUE (enables ON CONFLICT for ESCO seed)
- fact_occupation_skills(occupation_id, skill_id, source): UNIQUE

Revision ID: b4e9d1f53a2c
Revises: a3f7c8e21b4d
Create Date: 2026-03-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "b4e9d1f53a2c"
down_revision: Union[str, None] = "a3f7c8e21b4d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear FK-dependent tables first, then remove duplicates
    # The real data seed (seed_real_data.py) will repopulate everything
    op.execute("DELETE FROM fact_occupation_skills")
    op.execute("DELETE FROM fact_ai_exposure_occupation")
    op.execute("DELETE FROM fact_forecast")
    op.execute("DELETE FROM fact_demand_vacancies_agg")
    op.execute("DELETE FROM fact_supply_talent_agg")
    op.execute("DELETE FROM fact_supply_graduates")

    # Now safe to remove duplicate occupations and skills
    op.execute("""
        DELETE FROM dim_occupation a USING dim_occupation b
        WHERE a.occupation_id > b.occupation_id AND a.code_esco = b.code_esco
        AND a.code_esco IS NOT NULL
    """)
    op.execute("""
        DELETE FROM dim_skill a USING dim_skill b
        WHERE a.skill_id > b.skill_id AND a.uri_esco = b.uri_esco
        AND a.uri_esco IS NOT NULL
    """)

    op.create_unique_constraint("uq_dim_occupation_code_esco", "dim_occupation", ["code_esco"])
    op.create_unique_constraint("uq_dim_skill_uri_esco", "dim_skill", ["uri_esco"])
    op.create_unique_constraint(
        "uq_occ_skill_source", "fact_occupation_skills",
        ["occupation_id", "skill_id", "source"]
    )

    # Add unique constraint on institution name
    op.execute("""
        DELETE FROM dim_institution a USING dim_institution b
        WHERE a.institution_id > b.institution_id AND a.name_en = b.name_en
    """)
    op.create_unique_constraint("uq_dim_institution_name_en", "dim_institution", ["name_en"])

    # Add preferences column to users table
    op.add_column("users", sa.Column("preferences", sa.Text(), nullable=True))

    # Create dataset_registry table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS dataset_registry (
            dataset_id VARCHAR(64) PRIMARY KEY,
            filename VARCHAR(300) NOT NULL,
            source_type VARCHAR(50),
            status VARCHAR(20) DEFAULT 'pending',
            row_count INTEGER,
            progress FLOAT DEFAULT 0.0,
            sha256 VARCHAR(64),
            minio_path VARCHAR(500),
            error_message TEXT,
            metadata_json TEXT,
            uploaded_by VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP,
            last_refreshed_at TIMESTAMP,
            refresh_interval_hours INTEGER
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dataset_registry")
    op.drop_column("users", "preferences")
    op.drop_constraint("uq_dim_institution_name_en", "dim_institution", type_="unique")
    op.drop_constraint("uq_occ_skill_source", "fact_occupation_skills", type_="unique")
    op.drop_constraint("uq_dim_skill_uri_esco", "dim_skill", type_="unique")
    op.drop_constraint("uq_dim_occupation_code_esco", "dim_occupation", type_="unique")
