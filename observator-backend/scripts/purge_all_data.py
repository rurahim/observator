"""Purge ALL seeded data from the database.

TRUNCATE CASCADE in FK dependency order, then drop + recreate materialized views.
Keeps schema (tables) intact. Keeps users + audit_log intact.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings


TABLES_TO_TRUNCATE = [
    # Facts first (depend on dims)
    "fact_forecast",
    "fact_occupation_skills",
    "fact_ai_exposure_occupation",
    "fact_supply_graduates",
    "fact_supply_talent_agg",
    "fact_demand_vacancies_agg",
    "fact_course_skills",
    # Crosswalks
    "crosswalk_soc_isco",
    # Dimensions (after facts)
    "dim_institution",
    "dim_occupation",
    "dim_skill",
    "dim_discipline",
    "dim_sector",
    "dim_time",
    "dim_region",
    # Ingestion metadata
    "sdmx_code_lookup",
    "dataset_registry",
    # Pipeline (optional — clear run history)
    "pipeline_step_log",
    "pipeline_run",
]

VIEWS_TO_DROP = [
    "vw_gap_cube",
    "vw_forecast_demand",
    "vw_supply_education",
    "vw_ai_impact",
    "vw_demand_jobs",
    "vw_supply_talent",
]


def main():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    with engine.begin() as conn:
        # Drop materialized views first (they reference tables)
        for vw in VIEWS_TO_DROP:
            conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {vw} CASCADE"))
            print(f"  Dropped view: {vw}")

        # Truncate all tables
        for table in TABLES_TO_TRUNCATE:
            try:
                conn.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
                print(f"  Truncated: {table}")
            except Exception as e:
                # Table might not exist in some environments
                print(f"  Skip {table}: {e}")

        # Clear notifications table (created via raw SQL, may not exist)
        try:
            conn.execute(text("DELETE FROM notifications"))
            print("  Cleared: notifications")
        except Exception:
            pass

    print("\nAll data purged. Run seed_master_tables.py to reload.")


if __name__ == "__main__":
    import sys
    if "--yes" in sys.argv or "--force" in sys.argv:
        main()
    else:
        confirm = input("This will DELETE ALL DATA. Type 'yes' to confirm: ")
        if confirm.strip().lower() == "yes":
            main()
        else:
            print("Aborted.")
