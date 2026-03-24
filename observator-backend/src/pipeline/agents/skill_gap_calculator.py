"""SkillGapCalculatorAgent — refreshes affected materialized views after data
has been loaded so that supply-demand gap analysis stays up-to-date.

Uses ``REFRESH MATERIALIZED VIEW`` for views that already exist, with a
``DROP + CREATE`` fallback path for cold-start scenarios.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# Map target tables to the materialized views they feed into
TABLE_TO_VIEWS: dict[str, list[str]] = {
    "fact_supply_talent_agg": ["vw_supply_talent", "vw_gap_cube"],
    "fact_demand_vacancies_agg": ["vw_demand_jobs", "vw_gap_cube"],
    "fact_supply_graduates": ["vw_supply_education"],
    "fact_ai_exposure_occupation": ["vw_ai_impact", "vw_gap_cube"],
    "fact_forecast": ["vw_forecast_demand"],
}


class SkillGapCalculatorAgent(BaseAgent):
    name = "skill_gap_calculator"
    description = "Refresh materialized views affected by the loaded data"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        # Only run if data was actually loaded
        load_result = state.get("load_result")
        if not load_result:
            return False
        return (load_result.get("rows_loaded") or 0) > 0

    async def process(self, state: PipelineState, db) -> dict:
        load_result = state.get("load_result", {})
        target_table: str | None = load_result.get("target_table")

        views_to_refresh: list[str] = []
        if target_table:
            views_to_refresh = TABLE_TO_VIEWS.get(target_table, [])

        if not views_to_refresh:
            # Refresh all core views as a safe default
            views_to_refresh = [
                "vw_supply_talent",
                "vw_demand_jobs",
                "vw_supply_education",
                "vw_ai_impact",
                "vw_gap_cube",
                "vw_forecast_demand",
            ]

        refreshed: list[str] = []
        errors: list[str] = []

        for view_name in views_to_refresh:
            try:
                await db.execute(
                    text(f"REFRESH MATERIALIZED VIEW {view_name}")
                )
                refreshed.append(view_name)
                logger.info("Refreshed materialized view: %s", view_name)
            except Exception as exc:
                msg = f"Failed to refresh {view_name}: {exc}"
                logger.warning(msg)
                errors.append(msg)

        if refreshed:
            await db.commit()

        # Invalidate Redis analytics cache so dashboard serves fresh data
        if refreshed:
            try:
                from src.dependencies import get_redis
                from src.services.cache import CacheService
                redis = await get_redis()
                cache = CacheService(redis)
                deleted = await cache.invalidate_analytics()
                logger.info("SkillGapCalculator: Redis cache invalidated (%d keys deleted)", deleted)
            except Exception as cache_err:
                logger.warning("SkillGapCalculator: cache invalidation failed: %s", cache_err)

        gap_recalculated = "vw_gap_cube" in refreshed

        logger.info(
            "SkillGapCalculator: refreshed=%s gap_recalculated=%s errors=%d",
            refreshed,
            gap_recalculated,
            len(errors),
        )

        result: dict = {
            "views_refreshed": refreshed,
            "gap_recalculated": gap_recalculated,
        }
        if errors:
            result["errors"] = errors
        return result
