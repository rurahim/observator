"""Skill gap analysis endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.schemas.common import DataMeta, SourceInfo
from src.schemas.skill_gap import OccupationGap, SGITrend, SkillGapResponse
from src.services.analytics_engine import AnalyticsEngine
from src.services.cache import CacheService

router = APIRouter(prefix="/api/skill-gap", tags=["skill-gap"])

SGI_METHODOLOGY = (
    "SGI (Skill Gap Index) = (demand - supply) / demand * 100. "
    "Positive values indicate shortage, negative values indicate surplus. "
    "Status thresholds: Critical Shortage (>20%), Moderate Shortage (5-20%), "
    "Balanced (-5% to 5%), Moderate Surplus (-20% to -5%), Critical Surplus (<-20%)."
)


@router.get("", response_model=SkillGapResponse)
async def get_skill_gap(
    emirate: str | None = None,
    sector: str | None = None,
    limit: int = 50,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Get skill gap analysis: occupation-level supply vs demand."""
    # --- Cache check ---
    cache_params = {"emirate": emirate, "sector": sector, "limit": limit}
    cache_key = CacheService.make_key("skill_gap", cache_params)
    cached = await cache.get(cache_key)
    if cached:
        return SkillGapResponse(**cached)

    engine = AnalyticsEngine(db)

    # Occupation-level gaps
    occ_raw = await engine.get_occupation_gaps(emirate, sector, limit)
    total_supply = 0
    total_demand = 0
    occupations = []
    for o in occ_raw:
        total_supply += o["supply"]
        total_demand += o["demand"]
        occupations.append(OccupationGap(
            occupation_id=0,
            title_en=o["title_en"],
            title_ar=o["title_ar"],
            code_isco=o["code_isco"],
            supply=o["supply"],
            demand=o["demand"],
            gap=o["gap"],
            sgi=o["sgi"],
            status=o["status"],
        ))

    # SGI trend by month
    trend_raw = await engine.get_sgi_trend()
    sgi_trend = [SGITrend(month=t["month"], sgi=t["sgi"]) for t in trend_raw]

    # Source metadata
    meta_raw = await engine.get_source_metadata(
        views=["vw_demand_jobs", "vw_supply_talent"],
        emirate=emirate, sector=sector,
    )
    meta = DataMeta(
        sources=[SourceInfo(**s) for s in meta_raw["sources"]],
        total_rows=meta_raw["total_rows"],
        date_range=meta_raw["date_range"],
        refreshed_at=meta_raw["refreshed_at"],
        freshness_label=meta_raw["freshness_label"],
        quality_score=meta_raw["quality_score"],
        coverage=meta_raw["coverage"],
    )

    result = SkillGapResponse(
        occupations=occupations,
        sgi_trend=sgi_trend,
        total_supply=total_supply,
        total_demand=total_demand,
        total_gap=total_demand - total_supply,
        methodology=SGI_METHODOLOGY,
        meta=meta,
    )

    # --- Cache result ---
    await cache.set(cache_key, result.model_dump(), ttl=3600)

    return result
