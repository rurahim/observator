"""add partial indexes on dataset_id for cascade delete performance

Revision ID: d7f3a9b12c4e
Revises: c5a2d8f91e3b
Create Date: 2026-03-16
"""
from alembic import op
from sqlalchemy import text

revision = "d7f3a9b12c4e"
down_revision = "c5a2d8f91e3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Partial indexes — only index rows where dataset_id is set (user uploads)
    for stmt in [
        "CREATE INDEX IF NOT EXISTS ix_demand_vac_dataset_id ON fact_demand_vacancies_agg (dataset_id) WHERE dataset_id IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_supply_talent_dataset_id ON fact_supply_talent_agg (dataset_id) WHERE dataset_id IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_supply_grad_dataset_id ON fact_supply_graduates (dataset_id) WHERE dataset_id IS NOT NULL",
    ]:
        conn.execute(text(stmt))


def downgrade() -> None:
    op.drop_index("ix_demand_vac_dataset_id", table_name="fact_demand_vacancies_agg")
    op.drop_index("ix_supply_talent_dataset_id", table_name="fact_supply_talent_agg")
    op.drop_index("ix_supply_grad_dataset_id", table_name="fact_supply_graduates")
