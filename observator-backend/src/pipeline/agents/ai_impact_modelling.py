"""AIImpactModellingAgent — refreshes the AI impact materialized view when
new AI exposure data has been loaded.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

AI_IMPACT_TABLES = {"fact_ai_exposure_occupation"}
AI_IMPACT_VIEWS = ["vw_ai_impact", "vw_gap_cube"]


class AIImpactModellingAgent(BaseAgent):
    name = "ai_impact_modelling"
    description = "Refresh AI impact views when exposure data changes"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        load_result = state.get("load_result") or {}
        target_table = load_result.get("target_table") if isinstance(load_result, dict) else None
        rows_loaded = load_result.get("rows_loaded", 0) if isinstance(load_result, dict) else 0
        # Only run if AI exposure data was loaded — silently skip otherwise
        return bool(target_table in AI_IMPACT_TABLES and rows_loaded > 0)

    async def process(self, state: PipelineState, db) -> dict:
        refreshed: list[str] = []
        errors: list[str] = []

        for view_name in AI_IMPACT_VIEWS:
            try:
                await db.execute(text(f"REFRESH MATERIALIZED VIEW {view_name}"))
                refreshed.append(view_name)
                logger.info("AIImpactModelling: refreshed %s", view_name)
            except Exception as exc:
                msg = f"Failed to refresh {view_name}: {exc}"
                logger.warning(msg)
                errors.append(msg)

        if refreshed:
            await db.commit()

        # Compute a quick summary of how many occupations have high AI exposure
        high_exposure_count = 0
        try:
            row = await db.execute(
                text(
                    "SELECT COUNT(*) FROM vw_ai_impact "
                    "WHERE exposure_0_100 > 70"
                )
            )
            high_exposure_count = row.scalar() or 0
        except Exception:
            pass  # View may not exist yet

        updated = len(refreshed) > 0

        logger.info(
            "AIImpactModelling: updated=%s refreshed=%s high_exposure_occupations=%d",
            updated,
            refreshed,
            high_exposure_count,
        )

        result: dict = {
            "ai_impact_updated": updated,
            "views_refreshed": list(set(state.get("views_refreshed", []) + refreshed)),
        }
        if errors:
            result["errors"] = errors
        return result
