"""Gold layer: Refresh materialized views after data loading."""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ALL_VIEWS = [
    "vw_supply_talent",
    "vw_demand_jobs",
    "vw_supply_education",
    "vw_ai_impact",
    "vw_gap_cube",
    "vw_forecast_demand",
]


async def load_to_gold(
    dataset_id: str,
    db: AsyncSession,
) -> dict:
    """
    Finalize dataset processing:
    1. Refresh affected materialized views
    2. Update dataset_registry to 'ready'
    """
    # Get the source type to determine which views to refresh
    result = await db.execute(
        text("SELECT source_type FROM dataset_registry WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    source_type = result.scalar()

    # Determine which views need refresh based on source type
    views_to_refresh = _get_affected_views(source_type)

    # Refresh views
    refreshed = await refresh_views(db, views_to_refresh)

    # Update dataset status
    await db.execute(
        text("UPDATE dataset_registry SET status = 'ready', progress = 100 WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    await db.commit()

    return {
        "dataset_id": dataset_id,
        "views_refreshed": refreshed,
    }


async def refresh_views(db: AsyncSession, views: list[str] | None = None) -> list[str]:
    """Refresh specified materialized views, or all if None."""
    target_views = views or ALL_VIEWS
    refreshed = []

    for view in target_views:
        if view not in ALL_VIEWS:
            logger.warning(f"Unknown view: {view}, skipping")
            continue
        try:
            # Use CONCURRENTLY if the view already has data (allows reads during refresh)
            await db.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
            await db.commit()
            refreshed.append(view)
            logger.info(f"Refreshed {view}")
        except Exception as e:
            logger.error(f"Failed to refresh {view}: {e}")
            await db.rollback()

    return refreshed


def _get_affected_views(source_type: str | None) -> list[str]:
    """Determine which views need refresh based on data source."""
    mapping = {
        "fcsc_sdmx": ["vw_supply_talent", "vw_gap_cube"],
        "mohre_excel": ["vw_supply_talent", "vw_gap_cube"],
        "rdata_jobs": ["vw_demand_jobs", "vw_gap_cube"],
        "onet": ["vw_ai_impact"],
        "gpts": ["vw_ai_impact"],
        "frey_osborne": ["vw_ai_impact"],
        "esco_occupation": [],
        "esco_skill": [],
        "he_data": ["vw_supply_education"],
    }
    return mapping.get(source_type or "", ALL_VIEWS)
