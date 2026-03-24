"""Forecast runner — orchestrates forecast generation from warehouse data.

Fetches historical supply/demand time series from materialized views,
runs forecast models, and stores results in fact_forecast.
"""
import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.forecasting.models import ForecastResult, get_model

logger = logging.getLogger(__name__)


async def run_forecast(
    db: AsyncSession,
    *,
    occupation_id: int | None = None,
    region_code: str | None = None,
    sector_id: int | None = None,
    horizon: int = 12,
    model_name: str = "auto",
    confidence: float = 0.95,
) -> dict:
    """Run forecast for a specific occupation/region/sector combination.

    Fetches historical data, runs the model, stores results, returns forecast.

    Returns:
        {
            "demand": ForecastResult dict,
            "supply": ForecastResult dict,
            "gap": [...],
            "stored_count": int,
        }
    """
    # Fetch historical demand
    demand_dates, demand_values = await _fetch_time_series(
        db, "vw_demand_jobs", "demand_count",
        occupation_id=occupation_id, region_code=region_code, sector_id=sector_id,
    )

    # Fetch historical supply
    supply_dates, supply_values = await _fetch_time_series(
        db, "vw_supply_talent", "supply_count",
        occupation_id=occupation_id, region_code=region_code, sector_id=sector_id,
    )

    model = get_model(model_name)
    results = {}

    # Forecast demand
    if len(demand_dates) >= 3:
        demand_forecast = model.fit_predict(demand_dates, demand_values, horizon, confidence)
        results["demand"] = _forecast_to_dict(demand_forecast)
    else:
        demand_forecast = None
        results["demand"] = None
        logger.warning("Not enough demand data points for forecasting")

    # Forecast supply
    if len(supply_dates) >= 3:
        supply_forecast = model.fit_predict(supply_dates, supply_values, horizon, confidence)
        results["supply"] = _forecast_to_dict(supply_forecast)
    else:
        supply_forecast = None
        results["supply"] = None
        logger.warning("Not enough supply data points for forecasting")

    # Compute gap forecast
    if demand_forecast and supply_forecast:
        gap = [
            round(d - s, 2)
            for d, s in zip(demand_forecast.predicted, supply_forecast.predicted)
        ]
        results["gap"] = gap
    else:
        results["gap"] = []

    # Store in fact_forecast
    stored = 0
    if demand_forecast:
        stored += await _store_forecast(
            db, demand_forecast, supply_forecast,
            occupation_id=occupation_id, region_code=region_code, sector_id=sector_id,
            horizon=horizon,
        )

    results["stored_count"] = stored
    return results


async def run_batch_forecasts(
    db: AsyncSession,
    *,
    horizon: int = 12,
    model_name: str = "auto",
    top_n: int = 20,
) -> dict:
    """Run forecasts for top-N occupations by demand volume.

    Returns summary of forecasts generated.
    """
    # Get top occupations
    occ_q = text("""
        SELECT o.occupation_id, o.title_en, f.region_code, SUM(f.demand_count) as total_demand
        FROM vw_demand_jobs f
        JOIN dim_occupation o ON f.occupation = o.title_en
        GROUP BY o.occupation_id, o.title_en, f.region_code
        ORDER BY total_demand DESC
        LIMIT :limit
    """)
    rows = (await db.execute(occ_q, {"limit": top_n})).fetchall()

    generated = 0
    errors = 0

    for row in rows:
        occ_id, title, region = row[0], row[1], row[2]
        try:
            result = await run_forecast(
                db,
                occupation_id=occ_id,
                region_code=region,
                horizon=horizon,
                model_name=model_name,
            )
            generated += result.get("stored_count", 0)
        except Exception as e:
            logger.error(f"Forecast failed for {title} ({region}): {e}")
            errors += 1

    logger.info(f"Batch forecast complete: {generated} forecasts stored, {errors} errors")
    return {"generated": generated, "errors": errors, "occupations": len(rows)}


# --- Internal helpers ---

async def _fetch_time_series(
    db: AsyncSession,
    view: str,
    value_col: str,
    *,
    occupation_id: int | None = None,
    region_code: str | None = None,
    sector_id: int | None = None,
) -> tuple[list[str], list[float]]:
    """Fetch monthly time series from a materialized view."""
    conditions = []
    params: dict = {}

    # Map occupation_id to title via dim_occupation for view join
    if occupation_id:
        # Views use occupation title, not ID
        occ_result = await db.execute(
            text("SELECT title_en FROM dim_occupation WHERE occupation_id = :oid"),
            {"oid": occupation_id},
        )
        occ_title = occ_result.scalar()
        if occ_title:
            conditions.append("occupation = :occ")
            params["occ"] = occ_title

    if region_code:
        conditions.append("region_code = :region")
        params["region"] = region_code

    if sector_id:
        sec_result = await db.execute(
            text("SELECT label_en FROM dim_sector WHERE sector_id = :sid"),
            {"sid": sector_id},
        )
        sec_label = sec_result.scalar()
        if sec_label:
            conditions.append("sector = :sector")
            params["sector"] = sec_label

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    sql = text(f"""
        SELECT month_label, SUM({value_col}) as val
        FROM {view}
        {where}
        GROUP BY month_label
        ORDER BY month_label
    """)

    rows = (await db.execute(sql, params)).fetchall()
    dates = [r[0] for r in rows if r[0]]
    values = [float(r[1]) for r in rows]

    return dates, values


async def _store_forecast(
    db: AsyncSession,
    demand_forecast: ForecastResult,
    supply_forecast: ForecastResult | None,
    *,
    occupation_id: int | None,
    region_code: str | None,
    sector_id: int | None,
    horizon: int,
) -> int:
    """Store forecast results in fact_forecast table."""
    count = 0

    for i, forecast_date in enumerate(demand_forecast.dates):
        pred_demand = demand_forecast.predicted[i]
        pred_supply = supply_forecast.predicted[i] if supply_forecast and i < len(supply_forecast.predicted) else None
        pred_gap = (pred_demand - pred_supply) if pred_supply is not None else None

        await db.execute(
            text("""
                INSERT INTO fact_forecast (
                    occupation_id, region_code, sector_id,
                    forecast_date, horizon_months,
                    predicted_demand, predicted_supply, predicted_gap,
                    confidence_lower, confidence_upper,
                    model_name, model_version, created_at
                ) VALUES (
                    :occ_id, :region, :sector,
                    :fdate, :horizon,
                    :pred_demand, :pred_supply, :pred_gap,
                    :lower, :upper,
                    :model_name, :model_version, NOW()
                )
            """),
            {
                "occ_id": occupation_id, "region": region_code, "sector": sector_id,
                "fdate": forecast_date, "horizon": horizon,
                "pred_demand": round(pred_demand, 2),
                "pred_supply": round(pred_supply, 2) if pred_supply else None,
                "pred_gap": round(pred_gap, 2) if pred_gap else None,
                "lower": round(demand_forecast.lower[i], 2),
                "upper": round(demand_forecast.upper[i], 2),
                "model_name": demand_forecast.model_name,
                "model_version": demand_forecast.model_version,
            },
        )
        count += 1

    await db.commit()
    return count


def _forecast_to_dict(result: ForecastResult) -> dict:
    """Convert ForecastResult to serializable dict."""
    return {
        "dates": result.dates,
        "predicted": result.predicted,
        "lower": result.lower,
        "upper": result.upper,
        "model_name": result.model_name,
        "model_version": result.model_version,
        "metrics": result.metrics,
    }
