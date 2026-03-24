"""Data pipeline scheduler using APScheduler.

Provides configurable automatic refresh of data sources and materialized views.
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.config import settings

logger = logging.getLogger(__name__)

scheduler: AsyncIOScheduler | None = None


async def refresh_materialized_views():
    """Refresh all 6 materialized views."""
    logger.info("Scheduler: Refreshing materialized views...")
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            views = [
                "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
                "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
            ]
            for view in views:
                try:
                    await conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
                    logger.info(f"  Refreshed {view}")
                except Exception as e:
                    logger.warning(f"  Failed to refresh {view}: {e}")

            # Update last_refreshed_at in dataset_registry
            now = datetime.now(timezone.utc)
            await conn.execute(
                text("UPDATE dataset_registry SET last_refreshed_at = :now WHERE status = 'ready'"),
                {"now": now},
            )
        logger.info("Scheduler: View refresh complete")

        # Invalidate analytics cache so stale results aren't served
        try:
            from src.services.cache import CacheService
            from redis.asyncio import Redis as AsyncRedis
            redis = AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True)
            cache = CacheService(redis)
            cleared = await cache.invalidate_analytics()
            logger.info("Scheduler: Cleared %d cache keys", cleared)
            await redis.aclose()
        except Exception as ce:
            logger.debug("Scheduler: Cache invalidation skipped: %s", ce)

    except Exception as e:
        logger.error(f"Scheduler: View refresh failed: {e}")
    finally:
        await engine.dispose()


def start_scheduler(interval_hours: int = 6):
    """Start the background scheduler for periodic data refresh."""
    global scheduler
    if scheduler is not None:
        logger.warning("Scheduler already running")
        return

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        refresh_materialized_views,
        trigger=IntervalTrigger(hours=interval_hours),
        id="refresh_views",
        name="Refresh materialized views",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"Data pipeline scheduler started (interval: {interval_hours}h)")


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        scheduler = None
        logger.info("Data pipeline scheduler stopped")
