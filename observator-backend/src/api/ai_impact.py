"""AI impact analysis endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.schemas.ai_impact import (
    AIImpactResponse,
    OccupationAIExposure,
    SectorAIExposure,
    SkillCluster,
)
from src.schemas.common import DataMeta, SourceInfo
from src.services.analytics_engine import AnalyticsEngine
from src.services.cache import CacheService

router = APIRouter(prefix="/api/ai-impact", tags=["ai-impact"])


@router.get("", response_model=AIImpactResponse)
async def get_ai_impact(
    sector: str | None = None,
    limit: int = 50,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Get AI exposure and automation risk analysis."""
    # --- Cache check ---
    cache_params = {"sector": sector, "limit": limit}
    cache_key = CacheService.make_key("ai_impact", cache_params)
    cached = await cache.get(cache_key)
    if cached:
        return AIImpactResponse(**cached)

    engine = AnalyticsEngine(db)

    # Occupation-level AI exposure — limited for display
    occ_raw = await engine.get_ai_exposure_occupations(sector, limit)

    occupations = []
    for o in occ_raw:
        occupations.append(OccupationAIExposure(
            occupation_id=o["occupation_id"],
            title_en=o["title_en"],
            title_ar=o["title_ar"],
            code_isco=o["code_isco"],
            exposure_score=o["exposure_score"],
            automation_probability=o["automation_probability"],
            llm_exposure=o["llm_exposure"],
            risk_level=o["risk_level"],
        ))

    # Summary stats from FULL dataset (not limited by the limit param)
    from sqlalchemy import text as sql_text
    summary_row = (await db.execute(sql_text("""
        SELECT count(*) as total,
               ROUND(AVG(exposure_0_100)::numeric, 1) as avg_exp,
               count(*) FILTER (WHERE exposure_0_100 >= 60) as high_risk
        FROM fact_ai_exposure_occupation
        WHERE exposure_0_100 IS NOT NULL
    """))).fetchone()
    total = summary_row[0] or 0
    avg_exp = float(summary_row[1] or 0)
    high_risk = summary_row[2] or 0

    # Sector-level aggregation
    sector_raw = await engine.get_ai_exposure_sectors()
    sectors = [SectorAIExposure(**s) for s in sector_raw]

    # Top skills by AI exposure
    skill_raw = await engine.get_ai_skill_clusters()
    skill_clusters = [SkillCluster(**s) for s in skill_raw]

    # Source metadata
    meta_raw = await engine.get_source_metadata(views=["vw_ai_impact"], sector=sector)
    meta = DataMeta(
        sources=[SourceInfo(**s) for s in meta_raw["sources"]],
        total_rows=meta_raw["total_rows"],
        date_range=meta_raw["date_range"],
        refreshed_at=meta_raw["refreshed_at"],
        freshness_label=meta_raw["freshness_label"],
        quality_score=meta_raw["quality_score"],
        coverage=meta_raw["coverage"],
    )

    result = AIImpactResponse(
        occupations=occupations,
        sectors=sectors,
        skill_clusters=skill_clusters,
        summary={
            "total_occupations": total,
            "high_risk_pct": round(high_risk / total * 100, 1) if total > 0 else 0.0,
            "avg_exposure": avg_exp,
        },
        meta=meta,
    )

    # --- Cache result ---
    await cache.set(cache_key, result.model_dump(), ttl=3600)

    return result


@router.get("/anthropic-index")
async def get_anthropic_index(user=Depends(get_current_user)):
    """Anthropic Economic Index — observed AI exposure from real Claude usage data."""
    import json
    from pathlib import Path
    base = Path(__file__).resolve().parents[3] / "_master_tables" / "6_ai_impact"
    fp = base / "anthropic_combined_analysis.json"
    if not fp.exists():
        fp = Path("/app/_master_tables/6_ai_impact/anthropic_combined_analysis.json")
    if not fp.exists():
        return {"occupations": [], "families": [], "radar": [], "summary": {}}
    with open(fp) as f:
        data = json.load(f)
    # Attach radar data if available
    radar_fp = base / "radar_family_data.json"
    if not radar_fp.exists():
        radar_fp = Path("/app/_master_tables/6_ai_impact/radar_family_data.json")
    if radar_fp.exists():
        with open(radar_fp) as rf:
            data["radar"] = json.load(rf)
    else:
        data["radar"] = []
    return data


@router.get("/taxonomy")
async def get_ai_taxonomy(user=Depends(get_current_user)):
    """Interactive AI taxonomy — families > occupations > skills with AI impact scores."""
    import json
    from pathlib import Path
    fp = Path(__file__).resolve().parents[3] / "_master_tables" / "6_ai_impact" / "ai_taxonomy_hierarchy.json"
    if not fp.exists():
        fp = Path("/app/_master_tables/6_ai_impact/ai_taxonomy_hierarchy.json")
    if not fp.exists():
        return {"taxonomy": [], "summary": {}}
    with open(fp) as f:
        return json.load(f)
