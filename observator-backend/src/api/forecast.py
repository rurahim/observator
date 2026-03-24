"""Forecast endpoints."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.middleware.rbac import require_permission
from src.schemas.forecast import ForecastPoint, ForecastResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/forecasts", tags=["forecasts"])


@router.get("", response_model=list[ForecastResponse])
async def get_forecasts(
    occupation_id: int | None = None,
    region_code: str | None = None,
    horizon: int = 12,
    model: str | None = None,
    limit: int = 10,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get demand/supply forecasts, optionally filtered by occupation and region."""
    conditions = []
    params: dict = {"horizon": horizon}

    if occupation_id:
        conditions.append("f.code_isco = :occ_code")
        params["occ_code"] = str(occupation_id)
    if region_code:
        conditions.append("f.region_code = :region")
        params["region"] = region_code
    if model:
        conditions.append("f.model_name = :model")
        params["model"] = model

    conditions.append("f.horizon_months = :horizon")
    where = " WHERE " + " AND ".join(conditions)

    # Get distinct forecast groups (vw_forecast_demand has occupation, code_isco — no occupation_id)
    group_q = text(f"""
        SELECT DISTINCT f.code_isco, f.occupation, f.region_code, f.model_name
        FROM vw_forecast_demand f
        {where}
        LIMIT :lim
    """)
    params["lim"] = min(limit, 50)

    groups = (await db.execute(group_q, params)).fetchall()

    results = []
    for g in groups:
        occ_code, title, region, model_name = g[0], g[1], g[2], g[3]

        # Get forecast points for this group
        point_conditions = ["f.horizon_months = :horizon"]
        point_params: dict = {"horizon": horizon}

        if occ_code is not None:
            point_conditions.append("f.code_isco = :occ_code")
            point_params["occ_code"] = occ_code
        if region:
            point_conditions.append("f.region_code = :region")
            point_params["region"] = region
        if model_name:
            point_conditions.append("f.model_name = :model_name")
            point_params["model_name"] = model_name

        pw = " WHERE " + " AND ".join(point_conditions)

        point_q = text(f"""
            SELECT f.forecast_date, f.predicted_demand, f.predicted_supply,
                   f.predicted_gap, f.confidence_lower, f.confidence_upper
            FROM vw_forecast_demand f
            {pw}
            ORDER BY f.forecast_date
        """)
        point_rows = (await db.execute(point_q, point_params)).fetchall()

        points = [
            ForecastPoint(
                date=r[0],
                predicted_demand=float(r[1]) if r[1] is not None else None,
                predicted_supply=float(r[2]) if r[2] is not None else None,
                predicted_gap=float(r[3]) if r[3] is not None else None,
                confidence_lower=float(r[4]) if r[4] is not None else None,
                confidence_upper=float(r[5]) if r[5] is not None else None,
            )
            for r in point_rows
        ]

        results.append(ForecastResponse(
            occupation_id=0,
            title_en=title,
            region_code=region,
            model_name=model_name,
            horizon_months=horizon,
            points=points,
        ))

    return results


# --- Forecast generation ---

class GenerateForecastRequest(BaseModel):
    occupation_id: int | None = None
    region_code: str | None = None
    sector_id: int | None = None
    horizon: int = Field(default=12, ge=3, le=36)
    model_name: str = Field(default="auto", description="auto, linear_trend, or ets")


@router.post("/generate")
async def generate_forecast(
    body: GenerateForecastRequest,
    user=require_permission("build_dashboard"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new forecast for an occupation/region combination."""
    from src.forecasting.runner import run_forecast

    try:
        result = await run_forecast(
            db,
            occupation_id=body.occupation_id,
            region_code=body.region_code,
            sector_id=body.sector_id,
            horizon=body.horizon,
            model_name=body.model_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Forecast generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Forecast generation failed")


@router.post("/batch")
async def batch_forecasts(
    horizon: int = 12,
    model_name: str = "auto",
    top_n: int = 20,
    user=require_permission("build_dashboard"),
    db: AsyncSession = Depends(get_db),
):
    """Run batch forecasts for top occupations."""
    from src.forecasting.runner import run_batch_forecasts

    result = await run_batch_forecasts(
        db, horizon=horizon, model_name=model_name, top_n=top_n,
    )
    return result


# --- Scenarios ---

class ScenarioRequest(BaseModel):
    occupation_id: int | None = None
    region_code: str | None = None
    horizon: int = Field(default=12, ge=3, le=36)
    scenarios: list[str] = Field(default=["baseline", "optimistic", "pessimistic"])


@router.post("/scenarios")
async def compare_scenarios(
    body: ScenarioRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare what-if scenarios against baseline forecast."""
    from src.forecasting.runner import run_forecast
    from src.forecasting.scenarios import compare_scenarios as _compare

    # Get baseline forecast
    try:
        baseline = await run_forecast(
            db,
            occupation_id=body.occupation_id,
            region_code=body.region_code,
            horizon=body.horizon,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    demand_vals = baseline.get("demand", {}).get("predicted", []) if baseline.get("demand") else []
    supply_vals = baseline.get("supply", {}).get("predicted", []) if baseline.get("supply") else []

    if not demand_vals and not supply_vals:
        raise HTTPException(status_code=400, detail="Not enough historical data to generate scenarios")

    results = _compare(demand_vals, supply_vals, body.scenarios)
    return {"scenarios": results}


@router.get("/models")
async def list_models(user=Depends(get_current_user)):
    """List available forecast models."""
    from src.forecasting.models import MODEL_REGISTRY
    return [
        {"name": name, "description": cls.__doc__.strip().split("\n")[0] if cls.__doc__ else name}
        for name, cls in MODEL_REGISTRY.items()
    ]


@router.get("/scenarios/presets")
async def list_scenario_presets(user=Depends(get_current_user)):
    """List predefined what-if scenarios."""
    from src.forecasting.scenarios import SCENARIOS
    return [
        {"name": s.name, "description": s.description, "id": key}
        for key, s in SCENARIOS.items()
    ]
