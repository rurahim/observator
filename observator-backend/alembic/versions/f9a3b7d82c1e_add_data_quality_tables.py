"""add data quality scoring and schema registry tables

Revision ID: f9a3b7d82c1e
Revises: e8b4c2d71f5a
Create Date: 2026-03-16 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "f9a3b7d82c1e"
down_revision = "e8b4c2d71f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Data quality scores per dataset per ingestion run
    op.create_table(
        "data_quality_scores",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("dataset_id", sa.String(64), nullable=False, index=True),
        sa.Column("run_id", sa.String(64), nullable=True),
        sa.Column("layer", sa.String(20), nullable=False, server_default="silver"),  # bronze, silver, gold
        sa.Column("completeness", sa.Float, nullable=True),   # 0-100
        sa.Column("validity", sa.Float, nullable=True),        # 0-100
        sa.Column("consistency", sa.Float, nullable=True),     # 0-100
        sa.Column("timeliness", sa.Float, nullable=True),      # 0-100
        sa.Column("uniqueness", sa.Float, nullable=True),      # 0-100
        sa.Column("accuracy", sa.Float, nullable=True),        # 0-100
        sa.Column("composite_score", sa.Float, nullable=True), # weighted 0-100
        sa.Column("details_json", sa.Text, nullable=True),     # per-column breakdown
        sa.Column("scored_at", sa.DateTime, server_default=sa.func.now()),
    )

    # Schema registry for tracking expected vs actual schemas
    op.create_table(
        "dataset_schema_registry",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("source_name", sa.String(100), nullable=False, index=True),  # e.g. "fcsc_sdmx", "rdata_jobs"
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("column_name", sa.String(200), nullable=False),
        sa.Column("column_type", sa.String(50), nullable=True),   # str, int, float, date
        sa.Column("is_required", sa.Boolean, server_default="false"),
        sa.Column("added_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("removed_at", sa.DateTime, nullable=True),
    )

    # Ingestion anomalies (quarantined codes, unmapped values)
    op.create_table(
        "ingestion_anomalies",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("dataset_id", sa.String(64), nullable=True, index=True),
        sa.Column("run_id", sa.String(64), nullable=True),
        sa.Column("anomaly_type", sa.String(50), nullable=False),  # unknown_code, schema_drift, encoding_issue
        sa.Column("severity", sa.String(20), nullable=False, server_default="warning"),  # info, warning, error
        sa.Column("column_name", sa.String(200), nullable=True),
        sa.Column("value", sa.Text, nullable=True),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # Add approval_status to dataset_registry for user uploads
    op.add_column(
        "dataset_registry",
        sa.Column("approval_status", sa.String(20), nullable=True,
                  comment="pending/approved/rejected — for user uploads"),
    )
    op.add_column(
        "dataset_registry",
        sa.Column("approved_by", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dataset_registry", "approved_by")
    op.drop_column("dataset_registry", "approval_status")
    op.drop_table("ingestion_anomalies")
    op.drop_table("dataset_schema_registry")
    op.drop_table("data_quality_scores")
