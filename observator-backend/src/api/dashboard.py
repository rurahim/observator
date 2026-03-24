"""Dashboard CRUD and aggregated data endpoints."""
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.middleware.rbac import require_permission
from src.models.auth import User
from src.models.dashboard import Dashboard, DashboardVersion
from src.schemas.common import DataMeta, SourceInfo
from src.schemas.dashboard import (
    DashboardCreate,
    DashboardOut,
    DashboardSummary,
    DashboardUpdate,
    DashboardVersionOut,
    EmirateMetric,
    SectorDistribution,
    SupplyDemandPoint,
    TopOccupation,
)
from src.services.analytics_engine import AnalyticsEngine
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])

ALLOWED_VIEWS = {
    "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
    "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    "vw_skills_taxonomy", "vw_education_pipeline",
    "vw_population_demographics", "vw_occupation_transitions",
}


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    emirate: str | None = None,
    sector: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    data_source: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Get aggregated dashboard metrics from materialized views.

    data_source: 'user_upload' | 'system' | None (all data)
    """
    # --- Cache check ---
    cache_params = {"emirate": emirate, "sector": sector, "data_source": data_source}
    cache_key = CacheService.make_key("dashboard_summary", cache_params)
    cached = await cache.get(cache_key)
    if cached:
        return DashboardSummary(**cached)

    engine = AnalyticsEngine(db)

    # Total supply & demand
    total_supply, total_demand = await engine.get_supply_demand_totals(emirate, sector, data_source)
    total_gap = total_demand - total_supply
    sgi = AnalyticsEngine.compute_sgi(total_supply, total_demand)

    # Supply vs Demand trend by month (filtered)
    trend_raw = await engine.get_supply_demand_trend(emirate, sector, data_source)
    trend = [SupplyDemandPoint(month=t["month"], supply=t["supply"], demand=t["demand"]) for t in trend_raw]

    # Sector distribution (auto-detects demand vs supply side, filtered by emirate)
    sector_result = await engine.get_sector_distribution(emirate, data_source)
    sectors = [SectorDistribution(**s) for s in sector_result.get("sectors", [])]
    sector_data_side = sector_result.get("data_side", "none")

    # Emirate metrics (filtered by sector)
    emirate_raw = await engine.get_emirate_metrics(sector, data_source)
    emirate_metrics = [
        EmirateMetric(
            region_code=e["region_code"], emirate=e["emirate"], emirate_ar=e["emirate_ar"],
            supply=e["supply"], demand=e["demand"], gap=e["gap"], sgi=e["sgi"],
        )
        for e in emirate_raw
    ]

    # Top occupations by gap
    occ_raw = await engine.get_occupation_gaps(emirate, sector, limit=20, data_source=data_source)
    top_occupations = [
        TopOccupation(
            occupation_id=0, title_en=o["title_en"], title_ar=o["title_ar"],
            supply=o["supply"], demand=o["demand"], gap=o["gap"],
            sgi=o["sgi"], status=o["status"],
            ai_exposure_score=o.get("ai_exposure_score"),
        )
        for o in occ_raw
    ]

    # Refreshed at
    refreshed_at = await engine.get_refreshed_at()

    # Source metadata for transparency
    meta_raw = await engine.get_source_metadata(
        views=["vw_demand_jobs", "vw_supply_talent"],
        emirate=emirate, sector=sector, data_source=data_source,
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

    result = DashboardSummary(
        total_supply=total_supply,
        total_demand=total_demand,
        total_gap=total_gap,
        sgi=sgi,
        supply_demand_trend=trend,
        sector_distribution=sectors,
        sector_data_side=sector_data_side,
        emirate_metrics=emirate_metrics,
        top_occupations=top_occupations,
        refreshed_at=refreshed_at,
        meta=meta,
    )

    # --- Cache result ---
    await cache.set(cache_key, result.model_dump(), ttl=3600)

    return result


@router.get("/salaries")
async def get_salary_benchmarks(
    emirate: str | None = None,
    limit: int = 30,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Salary benchmarks from fact_salary_benchmark."""
    from sqlalchemy import text
    conds = []
    params: dict = {"lim": limit}
    if emirate and emirate != "all":
        conds.append("sb.region_code = :emirate")
        params["emirate"] = emirate
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    try:
        rows = (await db.execute(text(f"""
            SELECT sb.job_title_queried, sb.region_code, r.emirate,
                   sb.min_salary, sb.median_salary, sb.max_salary,
                   sb.salary_currency, sb.sample_count, sb.confidence,
                   o.title_en as esco_occupation, o.code_isco
            FROM fact_salary_benchmark sb
            LEFT JOIN dim_region r ON sb.region_code = r.region_code
            LEFT JOIN dim_occupation o ON sb.occupation_id = o.occupation_id
            {where}
            ORDER BY sb.median_salary DESC
            LIMIT :lim
        """), params)).fetchall()
        return [
            {"job_title": r[0], "region_code": r[1], "emirate": r[2] or r[1],
             "min_salary": r[3], "median_salary": r[4], "max_salary": r[5],
             "currency": r[6] or "AED", "sample_count": r[7], "confidence": r[8],
             "esco_occupation": r[9], "code_isco": r[10]}
            for r in rows
        ]
    except Exception:
        return []


@router.get("/data-sources-status")
async def get_data_sources_status(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Status of all data sources — row counts and last updated."""
    from sqlalchemy import text
    sources = []
    queries = [
        ("LinkedIn Jobs", "fact_demand_vacancies_agg", "source = 'LinkedIn'"),
        ("MOHRE Permits", "fact_demand_vacancies_agg", "source = 'MOHRE_permits'"),
        ("JSearch API", "fact_demand_vacancies_agg", "source = 'JSearch'"),
        ("Bayanat MOHRE", "fact_supply_talent_agg", "source = 'Bayanat_MOHRE'"),
        ("Bayanat Activity", "fact_supply_talent_agg", "source = 'Bayanat_Activity'"),
        ("GLMM/MOHRE", "fact_supply_talent_agg", "source LIKE 'GLMM%'"),
        ("ESCO Taxonomy", "dim_occupation", "1=1"),
        ("AI Exposure", "fact_ai_exposure_occupation", "1=1"),
        ("Salary Benchmarks", "fact_salary_benchmark", "1=1"),
        ("Graduates", "fact_supply_graduates", "1=1"),
    ]
    for name, table, condition in queries:
        try:
            row = (await db.execute(text(
                f"SELECT count(*), MAX(created_at) FROM {table} WHERE {condition}"
            ))).fetchone()
            sources.append({
                "source": name,
                "record_count": row[0] or 0,
                "last_updated": row[1].isoformat() if row[1] else None,
            })
        except Exception:
            sources.append({"source": name, "record_count": 0, "last_updated": None})
    return sources


# --- Dashboard CRUD ---

@router.get("", response_model=list[DashboardOut])
async def list_dashboards(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's dashboards."""
    result = await db.execute(
        select(Dashboard).where(Dashboard.user_id == user.user_id).order_by(Dashboard.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=DashboardOut)
async def create_dashboard(
    body: DashboardCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new dashboard."""
    dashboard = Dashboard(
        dashboard_id=uuid4(),
        user_id=user.user_id,
        title=body.title,
        description=body.description,
        layout=body.layout,
    )
    db.add(dashboard)
    await db.flush()
    return dashboard


@router.get("/{dashboard_id}", response_model=DashboardOut)
async def get_dashboard(
    dashboard_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific dashboard."""
    result = await db.execute(
        select(Dashboard).where(Dashboard.dashboard_id == dashboard_id)
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.put("/{dashboard_id}", response_model=DashboardOut)
async def update_dashboard(
    dashboard_id: str,
    body: DashboardUpdate,
    user=require_permission("build_dashboard"),
    db: AsyncSession = Depends(get_db),
):
    """Update a dashboard (creates a new version)."""
    result = await db.execute(
        select(Dashboard).where(Dashboard.dashboard_id == dashboard_id)
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if body.title is not None:
        dashboard.title = body.title
    if body.description is not None:
        dashboard.description = body.description
    if body.layout is not None:
        dashboard.layout = body.layout
        # Save version snapshot
        dashboard.current_version += 1
        version = DashboardVersion(
            dashboard_id=dashboard.dashboard_id,
            version=dashboard.current_version,
            state=body.layout,
            created_by="user",
        )
        db.add(version)

    await db.flush()
    return dashboard


@router.get("/{dashboard_id}/versions", response_model=list[DashboardVersionOut])
async def list_versions(
    dashboard_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List version history for a dashboard."""
    result = await db.execute(
        select(DashboardVersion)
        .where(DashboardVersion.dashboard_id == dashboard_id)
        .order_by(DashboardVersion.version.desc())
    )
    return result.scalars().all()
