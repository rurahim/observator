"""Filter options endpoint — populates dropdowns with data-presence-aware options."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.schemas.filters import FilterOption, FilterOptions, SourceOption
from src.services.analytics_engine import AnalyticsEngine

router = APIRouter(prefix="/api/filters", tags=["filters"])


@router.get("", response_model=FilterOptions)
async def get_filter_options(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get available filter options — only returns values that have actual data."""

    # Emirates: only those with rows in demand OR supply views
    emirate_rows = (await db.execute(text("""
        SELECT DISTINCT r.region_code, r.emirate, r.emirate_ar
        FROM dim_region r
        WHERE EXISTS (SELECT 1 FROM fact_demand_vacancies_agg d WHERE d.region_code = r.region_code)
           OR EXISTS (SELECT 1 FROM fact_supply_talent_agg s WHERE s.region_code = r.region_code)
        ORDER BY r.emirate
    """))).fetchall()
    emirates = [
        FilterOption(value=r[0], label=r[1], label_ar=r[2])
        for r in emirate_rows
    ]

    # Sectors: only those appearing in demand or supply data
    sector_rows = (await db.execute(text("""
        SELECT DISTINCT s.sector_id::text, s.label_en, s.label_ar
        FROM dim_sector s
        WHERE EXISTS (SELECT 1 FROM fact_demand_vacancies_agg d WHERE d.sector_id = s.sector_id)
           OR EXISTS (SELECT 1 FROM fact_supply_talent_agg f WHERE f.sector_id = s.sector_id)
        ORDER BY s.label_en
    """))).fetchall()
    sectors = [
        FilterOption(value=r[0], label=r[1], label_ar=r[2])
        for r in sector_rows
    ]

    # Top occupations (those with demand or supply data)
    occ_rows = (await db.execute(text("""
        SELECT DISTINCT o.occupation_id::text, o.title_en, o.title_ar
        FROM dim_occupation o
        WHERE EXISTS (SELECT 1 FROM fact_demand_vacancies_agg d WHERE d.occupation_id = o.occupation_id)
           OR EXISTS (SELECT 1 FROM fact_supply_talent_agg s WHERE s.occupation_id = o.occupation_id)
        ORDER BY o.title_en
        LIMIT 200
    """))).fetchall()
    occupations = [
        FilterOption(value=r[0], label=r[1], label_ar=r[2])
        for r in occ_rows
    ]

    # Date range from actual data (not full dim_time span)
    date_range_row = (await db.execute(text("""
        SELECT MIN(ml), MAX(ml) FROM (
            SELECT t.month_label as ml FROM fact_demand_vacancies_agg f JOIN dim_time t ON f.time_id = t.time_id
            UNION ALL
            SELECT t.month_label as ml FROM fact_supply_talent_agg f JOIN dim_time t ON f.time_id = t.time_id
        ) combined
    """))).first()
    date_range = {
        "min": date_range_row[0] if date_range_row and date_range_row[0] else "",
        "max": date_range_row[1] if date_range_row and date_range_row[1] else "",
    }

    # Dynamic dimensions: gender, nationality, experience — only if data has them
    dynamic: dict[str, list[FilterOption]] = {}

    # Gender (supply side only — demand doesn't track gender)
    gender_rows = (await db.execute(text("""
        SELECT DISTINCT gender FROM fact_supply_talent_agg
        WHERE gender IS NOT NULL ORDER BY gender
    """))).fetchall()
    if gender_rows:
        dynamic["gender"] = [
            FilterOption(
                value=r[0],
                label="Male" if r[0] == "M" else "Female" if r[0] == "F" else r[0],
                label_ar="ذكر" if r[0] == "M" else "أنثى" if r[0] == "F" else None,
            )
            for r in gender_rows if r[0]
        ]

    # Nationality
    nat_rows = (await db.execute(text("""
        SELECT DISTINCT nationality FROM fact_supply_talent_agg
        WHERE nationality IS NOT NULL ORDER BY nationality
    """))).fetchall()
    if nat_rows:
        dynamic["nationality"] = [
            FilterOption(
                value=r[0],
                label="Citizen" if r[0] == "citizen" else "Expat" if r[0] == "expat" else r[0],
                label_ar="مواطن" if r[0] == "citizen" else "وافد" if r[0] == "expat" else None,
            )
            for r in nat_rows if r[0]
        ]

    # Experience bands (from demand side)
    exp_rows = (await db.execute(text("""
        SELECT DISTINCT experience_band FROM fact_demand_vacancies_agg
        WHERE experience_band IS NOT NULL ORDER BY experience_band
    """))).fetchall()
    if exp_rows:
        dynamic["experience"] = [
            FilterOption(value=r[0], label=r[0])
            for r in exp_rows if r[0]
        ]

    # Available data sources with row counts
    engine = AnalyticsEngine(db)
    source_raw = await engine.get_available_sources()
    sources = [SourceOption(**s) for s in source_raw]

    return FilterOptions(
        emirates=emirates,
        sectors=sectors,
        occupations=occupations,
        date_range=date_range,
        dynamic=dynamic if dynamic else None,
        sources=sources,
    )
