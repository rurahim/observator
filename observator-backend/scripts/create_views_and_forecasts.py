"""Create new materialized views, generate forecasts, normalize AI scores, refresh all views."""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def create_new_views():
    """Create the 4 new materialized views."""
    logger.info("Creating new materialized views...")
    e = create_engine(settings.DATABASE_URL_SYNC, isolation_level="AUTOCOMMIT")
    with e.connect() as c:
        views = [
            """CREATE MATERIALIZED VIEW IF NOT EXISTS vw_skills_taxonomy AS
            SELECT o.occupation_id, o.title_en, o.code_isco, o.isco_major_group,
                   s.label_en AS skill_name, s.skill_type,
                   os.relation_type, os.source AS skill_source
            FROM dim_occupation o
            LEFT JOIN fact_occupation_skills os ON o.occupation_id = os.occupation_id
            LEFT JOIN dim_skill s ON os.skill_id = s.skill_id
            WHERE s.label_en IS NOT NULL""",

            """CREATE MATERIALIZED VIEW IF NOT EXISTS vw_education_pipeline AS
            SELECT t.year, t.month_label, r.emirate, r.region_code,
                   e.category, e.level, e.gender, e.nationality, e.sector, e.discipline,
                   SUM(e.count) AS total_count
            FROM fact_education_stats e
            LEFT JOIN dim_time t ON e.time_id = t.time_id
            LEFT JOIN dim_region r ON e.region_code = r.region_code
            GROUP BY t.year, t.month_label, r.emirate, r.region_code,
                     e.category, e.level, e.gender, e.nationality, e.sector, e.discipline""",

            """CREATE MATERIALIZED VIEW IF NOT EXISTS vw_population_demographics AS
            SELECT t.year, r.emirate, r.region_code, p.citizenship, p.age_group, p.gender, p.category,
                   SUM(p.population_count) AS population
            FROM fact_population_stats p
            LEFT JOIN dim_time t ON p.time_id = t.time_id
            LEFT JOIN dim_region r ON p.region_code = r.region_code
            GROUP BY t.year, r.emirate, r.region_code, p.citizenship, p.age_group, p.gender, p.category""",
        ]
        for sql in views:
            try:
                c.execute(text(sql))
                name = sql.split("vw_")[1].split(" ")[0] if "vw_" in sql else "unknown"
                logger.info(f"  Created vw_{name}")
            except Exception as ex:
                logger.warning(f"  View error: {str(ex)[:100]}")
    e.dispose()


def normalize_ai_scores():
    """Normalize AI exposure z-scores to 0-100 scale."""
    logger.info("Normalizing AI scores...")
    e = create_engine(settings.DATABASE_URL_SYNC)
    with e.begin() as c:
        r = c.execute(text("""UPDATE fact_ai_exposure_occupation
            SET exposure_0_100 = ROUND(
                ((exposure_z - (SELECT MIN(exposure_z) FROM fact_ai_exposure_occupation WHERE exposure_z IS NOT NULL))
                / NULLIF((SELECT MAX(exposure_z) - MIN(exposure_z) FROM fact_ai_exposure_occupation WHERE exposure_z IS NOT NULL), 0)
                * 100)::numeric, 1)
            WHERE exposure_z IS NOT NULL AND exposure_0_100 IS NULL"""))
        logger.info(f"  Normalized {r.rowcount} AI scores")

        r = c.execute(text("DELETE FROM fact_education_stats WHERE time_id IS NULL"))
        logger.info(f"  Removed {r.rowcount} education orphans")
        r = c.execute(text("DELETE FROM fact_population_stats WHERE time_id IS NULL"))
        logger.info(f"  Removed {r.rowcount} population orphans")
    e.dispose()


def refresh_all_views():
    """Refresh all materialized views."""
    logger.info("Refreshing all materialized views...")
    e = create_engine(settings.DATABASE_URL_SYNC, isolation_level="AUTOCOMMIT")
    with e.connect() as c:
        for vw in ["vw_supply_talent", "vw_demand_jobs", "vw_ai_impact", "vw_gap_cube",
                    "vw_forecast_demand", "vw_supply_education",
                    "vw_skills_taxonomy", "vw_education_pipeline", "vw_population_demographics"]:
            try:
                c.execute(text(f"REFRESH MATERIALIZED VIEW {vw}"))
                cnt = c.execute(text(f"SELECT COUNT(*) FROM {vw}")).scalar()
                logger.info(f"  {vw}: {cnt:,} rows")
            except Exception as ex:
                logger.warning(f"  Skip {vw}: {str(ex)[:80]}")
    e.dispose()


async def generate_forecasts():
    """Generate forecasts for top occupations."""
    logger.info("Generating forecasts...")
    try:
        from src.forecasting.runner import run_forecast
    except ImportError:
        logger.warning("Forecasting module not available")
        return

    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        rows = (await db.execute(text("""
            SELECT o.occupation_id, o.title_en FROM fact_demand_vacancies_agg f
            JOIN dim_occupation o ON f.occupation_id = o.occupation_id
            JOIN dim_time t ON f.time_id = t.time_id
            WHERE f.occupation_id IS NOT NULL
            GROUP BY o.occupation_id, o.title_en
            HAVING COUNT(DISTINCT t.month_label) >= 3
            ORDER BY SUM(f.demand_count) DESC LIMIT 20
        """))).fetchall()

    total = 0
    for occ_id, title in rows:
        for region in ["DXB", "AUH", None]:
            try:
                async with factory() as db:
                    r = await run_forecast(db=db, occupation_id=occ_id, region_code=region, horizon=12)
                    total += r.get("stored_count", 0)
            except Exception:
                pass

    for region in ["DXB", "AUH", "SHJ", None]:
        try:
            async with factory() as db:
                r = await run_forecast(db=db, occupation_id=None, region_code=region, horizon=12)
                total += r.get("stored_count", 0)
        except Exception:
            pass

    logger.info(f"  Generated {total} forecast points")
    await engine.dispose()


def flush_cache():
    """Clear Redis cache."""
    try:
        import redis
        r = redis.Redis.from_url("redis://redis:6379/0")
        r.flushall()
        logger.info("Redis cache cleared")
    except Exception:
        logger.info("Redis cache clear skipped")


if __name__ == "__main__":
    create_new_views()
    normalize_ai_scores()
    asyncio.run(generate_forecasts())
    refresh_all_views()
    flush_cache()
    logger.info("All done!")
