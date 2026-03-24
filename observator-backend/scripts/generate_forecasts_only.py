"""Generate forecasts and refresh forecast view — safe for any schema."""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text, create_engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def main():
    try:
        from src.forecasting.runner import run_forecast
    except ImportError:
        logger.warning("Forecasting module not available")
        return

    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # Get top occupations with enough time series data
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

    logger.info(f"Generated {total} forecast points")

    # Refresh forecast view
    se = create_engine(settings.DATABASE_URL_SYNC, isolation_level="AUTOCOMMIT")
    with se.connect() as c:
        c.execute(text("REFRESH MATERIALIZED VIEW vw_forecast_demand"))
        cnt = c.execute(text("SELECT count(*) FROM vw_forecast_demand")).scalar()
        logger.info(f"vw_forecast_demand refreshed: {cnt} rows")
    se.dispose()

    # Flush cache
    try:
        import redis
        r = redis.Redis.from_url("redis://redis:6379/0")
        r.flushall()
        logger.info("Redis cache flushed")
    except Exception:
        pass

    await engine.dispose()


asyncio.run(main())
