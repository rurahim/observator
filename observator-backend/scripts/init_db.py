"""
init_db.py — Authoritative database initialization script.

Creates ALL tables, constraints, and indexes identically for dev, prod, and CI/CD.
This is the SINGLE SOURCE OF TRUTH for database schema — replaces the unreliable
pattern of create_all() + manual ALTER TABLE + manual CREATE INDEX.

Usage:
    uv run python scripts/init_db.py                    # Local dev
    docker exec -w /app <container> python scripts/init_db.py  # Docker/prod

What it does:
    1. Creates all tables via Base.metadata.create_all()
    2. Adds missing unique constraints (create_all doesn't add to existing tables)
    3. Stamps Alembic to head (skip broken migrations on fresh DBs)
    4. Verifies schema correctness
"""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, inspect, text

from src.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def import_all_models():
    """Import every model so Base.metadata sees all tables."""
    from src.models.base import Base  # noqa: F401
    from src.models.auth import User  # noqa: F401
    from src.models.audit import AuditLog  # noqa: F401
    from src.models.dim import (  # noqa: F401
        DimTime, DimRegion, DimOccupation, DimSkill,
        DimSector, DimDiscipline, DimInstitution,
        SdmxCodeLookup, CrosswalkSocIsco,
    )
    from src.models.fact import (  # noqa: F401
        FactSupplyTalentAgg, FactDemandVacanciesAgg,
        FactSupplyGraduates, FactAIExposureOccupation,
        FactOccupationSkills, FactCourseSkills, FactForecast,
    )
    from src.models.evidence import (  # noqa: F401
        DatasetRegistry, EvidenceStore, ChatSession, ChatMessage,
        Notification, PipelineRun, PipelineStepLog,
    )
    from src.models.dashboard import Dashboard, DashboardVersion  # noqa: F401

    try:
        from src.models.onet import (  # noqa: F401
            OnetOccupation, OnetSkill, OnetKnowledge,
            OnetTechnologySkill, OnetAlternateTitle,
            OnetTaskStatement, OnetEmergingTask,
            OnetRelatedOccupation,
        )
        logger.info("  O*NET models loaded")
    except ImportError:
        logger.info("  O*NET models not available (skipping)")

    try:
        from src.models.education import (  # noqa: F401
            FactEducationStats, FactPopulationStats, FactWageHours,
        )
        logger.info("  Education models loaded")
    except ImportError:
        logger.info("  Education models not available (skipping)")

    return Base


def create_tables(engine):
    """Step 1: Create all tables from models."""
    logger.info("Step 1: Creating tables...")
    Base = import_all_models()
    Base.metadata.create_all(engine)

    # Report what was created
    inspector = inspect(engine)
    tables = sorted(inspector.get_table_names())
    logger.info(f"  {len(tables)} tables in database")
    return tables


def add_unique_constraints(engine):
    """Step 2: Add unique constraints that create_all() misses on existing tables.

    create_all() only creates tables that DON'T exist. If a table was created
    in a previous deployment without a unique constraint, create_all() won't
    alter it. These constraints are required for ON CONFLICT in GenericLoader.
    """
    logger.info("Step 2: Adding unique constraints...")

    constraints = [
        ("dim_occupation", "code_esco", "uq_dim_occupation_code_esco"),
        ("dim_skill", "uri_esco", "uq_dim_skill_uri_esco"),
        ("dim_institution", "name_en", "uq_dim_institution_name_en"),
    ]
    composite_constraints = [
        ("fact_occupation_skills", "(occupation_id, skill_id, source)", "uq_fact_occ_skills"),
        ("crosswalk_soc_isco", "(soc_code, isco_code)", "uq_crosswalk_soc_isco"),
        ("sdmx_code_lookup", "(codelist, code)", "uq_sdmx_code_lookup"),
    ]

    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")

        for table, column, idx_name in constraints:
            try:
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {table}({column})"
                ))
                logger.info(f"  {idx_name} on {table}({column})")
            except Exception as e:
                logger.warning(f"  Skip {idx_name}: {str(e)[:80]}")

        for table, columns, idx_name in composite_constraints:
            try:
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {table}{columns}"
                ))
                logger.info(f"  {idx_name} on {table}{columns}")
            except Exception as e:
                logger.warning(f"  Skip {idx_name}: {str(e)[:80]}")


def fix_column_types(engine):
    """Step 3: Fix column type mismatches from prior deployments.

    These fixes handle cases where a table was created with wrong types
    in a previous deployment and create_all() won't alter it.
    """
    logger.info("Step 3: Fixing column types...")

    fixes = [
        # users.preferences should be TEXT (model says Text), not JSONB
        ("users", "preferences", "TEXT", "ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT"),
    ]

    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        for table, column, expected_type, fix_sql in fixes:
            try:
                result = conn.execute(text(f"""
                    SELECT data_type FROM information_schema.columns
                    WHERE table_name = '{table}' AND column_name = '{column}'
                """)).fetchone()

                if result is None:
                    # Column doesn't exist — add it
                    conn.execute(text(fix_sql))
                    logger.info(f"  Added {table}.{column} ({expected_type})")
                elif result[0].upper() not in (expected_type, expected_type.lower()):
                    conn.execute(text(
                        f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {expected_type}"
                    ))
                    logger.info(f"  Fixed {table}.{column}: {result[0]} → {expected_type}")
                else:
                    logger.info(f"  {table}.{column} OK ({result[0]})")
            except Exception as e:
                logger.warning(f"  Skip {table}.{column}: {str(e)[:80]}")


def stamp_alembic(engine):
    """Step 4: Stamp Alembic to head so migrations don't try to replay."""
    logger.info("Step 4: Stamping Alembic...")
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "stamp", "head"],
        cwd=str(Path(__file__).resolve().parents[1]),
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        logger.info("  Alembic stamped to head")
    else:
        logger.warning(f"  Alembic stamp issue: {result.stderr[:200]}")


def verify_schema(engine):
    """Step 5: Verify critical tables and constraints exist."""
    logger.info("Step 5: Verifying schema...")
    inspector = inspect(engine)

    critical_tables = [
        "users", "dim_time", "dim_region", "dim_occupation", "dim_skill",
        "dim_sector", "dim_institution", "crosswalk_soc_isco",
        "fact_demand_vacancies_agg", "fact_supply_talent_agg",
        "fact_ai_exposure_occupation", "fact_occupation_skills",
        "fact_forecast", "dataset_registry", "evidence_store",
        "notifications", "pipeline_runs", "pipeline_step_logs",
    ]

    missing = []
    for table in critical_tables:
        if inspector.has_table(table):
            cols = len(inspector.get_columns(table))
            logger.info(f"  ✓ {table} ({cols} columns)")
        else:
            missing.append(table)
            logger.error(f"  ✗ {table} MISSING")

    # Check critical unique indexes
    for table, idx_name in [
        ("dim_occupation", "uq_dim_occupation_code_esco"),
        ("dim_skill", "uq_dim_skill_uri_esco"),
        ("fact_occupation_skills", "uq_fact_occ_skills"),
    ]:
        try:
            indexes = inspector.get_indexes(table)
            idx_names = [idx["name"] for idx in indexes]
            if idx_name in idx_names:
                logger.info(f"  ✓ index {idx_name}")
            else:
                logger.warning(f"  ⚠ index {idx_name} not found on {table}")
        except Exception:
            pass

    if missing:
        logger.error(f"\n  FAILED: {len(missing)} missing tables: {missing}")
        return False
    else:
        logger.info(f"\n  All {len(critical_tables)} critical tables verified")
        return True


def main():
    logger.info("=" * 60)
    logger.info("Database Initialization — Observator")
    logger.info("=" * 60)

    engine = create_engine(settings.DATABASE_URL_SYNC)

    create_tables(engine)
    add_unique_constraints(engine)
    fix_column_types(engine)
    stamp_alembic(engine)
    ok = verify_schema(engine)

    engine.dispose()

    logger.info("=" * 60)
    if ok:
        logger.info("Database initialization COMPLETE")
    else:
        logger.error("Database initialization INCOMPLETE — check errors above")
        sys.exit(1)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
