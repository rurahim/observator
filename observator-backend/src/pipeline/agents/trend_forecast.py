"""TrendForecastAgent — generates demand/supply forecasts for the top
occupations in affected regions after new data has been loaded.

Only runs when demand or supply data was loaded (target table is one of
the supply/demand fact tables).
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.forecasting.runner import run_batch_forecasts
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# Tables whose load triggers a forecast refresh
FORECAST_TRIGGER_TABLES = {
    "fact_supply_talent_agg",
    "fact_demand_vacancies_agg",
}


class TrendForecastAgent(BaseAgent):
    name = "trend_forecast"
    description = "Generate demand/supply forecasts for top occupations"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        load_result = state.get("load_result", {})
        target_table = load_result.get("target_table")
        rows_loaded = load_result.get("rows_loaded", 0)
        # Only run when supply or demand data was loaded
        return bool(target_table in FORECAST_TRIGGER_TABLES and rows_loaded > 0)

    async def process(self, state: PipelineState, db) -> dict:
        load_result = state.get("load_result", {})
        target_table = load_result.get("target_table", "")

        logger.info(
            "TrendForecast: running batch forecasts after loading into %s",
            target_table,
        )

        try:
            batch_result = await run_batch_forecasts(
                db,
                horizon=12,
                model_name="auto",
                top_n=20,
            )
            forecasts_generated = batch_result.get("generated", 0)
            errors_count = batch_result.get("errors", 0)

            logger.info(
                "TrendForecast: generated=%d errors=%d occupations=%d",
                forecasts_generated,
                errors_count,
                batch_result.get("occupations", 0),
            )

            result: dict = {"forecasts_generated": forecasts_generated}
            if errors_count > 0:
                result.setdefault("errors", []).append(
                    f"Forecast batch had {errors_count} occupation-level errors"
                )
            return result

        except Exception as exc:
            logger.error("TrendForecast: batch forecast failed: %s", exc)
            return {
                "forecasts_generated": 0,
                "errors": [f"TrendForecast failed: {exc}"],
            }
