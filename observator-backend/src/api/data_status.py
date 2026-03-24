"""Data status endpoint — reports whether views contain real or mock data."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user

router = APIRouter(prefix="/api/data-status", tags=["data-status"])


@router.get("")
async def get_data_status(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return per-view data source status: real, mock, or empty."""
    checks = {}

    # 1. Occupations: real ESCO has 2000+, synthetic has ~25
    occ_count = (await db.execute(text("SELECT count(*) FROM dim_occupation"))).scalar() or 0
    checks["occupations"] = {
        "count": occ_count,
        "source": "ESCO v1.2.1" if occ_count > 500 else ("synthetic" if occ_count > 0 else "empty"),
        "is_real": occ_count > 500,
    }

    # 2. Skills
    skill_count = (await db.execute(text("SELECT count(*) FROM dim_skill"))).scalar() or 0
    checks["skills"] = {
        "count": skill_count,
        "source": "ESCO v1.2.1" if skill_count > 1000 else ("synthetic" if skill_count > 0 else "empty"),
        "is_real": skill_count > 1000,
    }

    # 3. Demand (job postings) — check all real sources (linkedin, web_scrape, etc.)
    try:
        demand_total = (await db.execute(text("SELECT count(*) FROM fact_demand_vacancies_agg"))).scalar() or 0
        demand_sources = (await db.execute(text(
            "SELECT COALESCE(source, 'unknown'), count(*) FROM fact_demand_vacancies_agg "
            "GROUP BY COALESCE(source, 'unknown') ORDER BY count(*) DESC"
        ))).fetchall()
    except Exception:
        demand_total = 0
        demand_sources = []

    demand_by_source = {r[0]: r[1] for r in demand_sources}
    # Real if we have any named source OR total > 1000 (bulk real data loaded)
    demand_is_real = demand_total > 1000
    demand_source_label = ", ".join(f"{k} ({v:,})" for k, v in list(demand_by_source.items())[:3]) if demand_by_source else "empty"

    checks["demand"] = {
        "count": demand_total,
        "by_source": demand_by_source,
        "source": demand_source_label if demand_is_real else ("synthetic" if demand_total > 0 else "empty"),
        "is_real": demand_is_real,
    }

    # 4. Supply (labor force) — check all real sources (FCSC, bayanat, etc.)
    try:
        supply_total = (await db.execute(text("SELECT count(*) FROM fact_supply_talent_agg"))).scalar() or 0
        supply_sources = (await db.execute(text(
            "SELECT COALESCE(source, 'unknown'), count(*) FROM fact_supply_talent_agg "
            "GROUP BY COALESCE(source, 'unknown') ORDER BY count(*) DESC LIMIT 5"
        ))).fetchall()
    except Exception:
        supply_total = 0
        supply_sources = []

    supply_by_source = {r[0]: r[1] for r in supply_sources}
    supply_is_real = supply_total > 1000
    supply_source_label = ", ".join(f"{k} ({v:,})" for k, v in list(supply_by_source.items())[:3]) if supply_by_source else "empty"

    checks["supply"] = {
        "count": supply_total,
        "by_source": supply_by_source,
        "source": supply_source_label if supply_is_real else ("synthetic" if supply_total > 0 else "empty"),
        "is_real": supply_is_real,
    }

    # 5. AI Exposure
    try:
        ai_total = (await db.execute(text("SELECT count(*) FROM fact_ai_exposure_occupation"))).scalar() or 0
        ai_sources = (await db.execute(text(
            "SELECT source, count(*) FROM fact_ai_exposure_occupation GROUP BY source"
        ))).fetchall()
    except Exception:
        ai_total = 0
        ai_sources = []
    checks["ai_exposure"] = {
        "count": ai_total,
        "by_source": {r[0]: r[1] for r in ai_sources},
        "source": "AIOE + Frey-Osborne + GPTs" if ai_total > 100 else ("synthetic" if ai_total > 0 else "empty"),
        "is_real": ai_total > 100,
    }

    # 6. Education — check both old (fact_supply_graduates) and new (fact_education_stats) tables
    try:
        grad_total = (await db.execute(text("SELECT count(*) FROM fact_supply_graduates"))).scalar() or 0
    except Exception:
        grad_total = 0
    try:
        edu_total = (await db.execute(text("SELECT count(*) FROM fact_education_stats"))).scalar() or 0
    except Exception:
        edu_total = 0
    try:
        inst_count = (await db.execute(text("SELECT count(*) FROM dim_institution"))).scalar() or 0
    except Exception:
        inst_count = 0

    edu_combined = grad_total + edu_total
    checks["education"] = {
        "count": edu_combined,
        "graduates": grad_total,
        "education_stats": edu_total,
        "institutions": inst_count,
        "source": f"Bayanat ({edu_total:,}) + FCSC HE ({grad_total:,})" if edu_combined > 50 else ("synthetic" if edu_combined > 0 else "empty"),
        "is_real": edu_combined > 50,
    }

    # 7. Materialized views
    view_status = {}
    for view in ["vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
                  "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand"]:
        try:
            count = (await db.execute(text(f"SELECT count(*) FROM {view}"))).scalar() or 0
            view_status[view] = {"rows": count, "status": "populated" if count > 0 else "empty"}
        except Exception:
            view_status[view] = {"rows": 0, "status": "missing"}
    checks["views"] = view_status

    # 8. User uploads
    try:
        upload_rows = (await db.execute(text(
            "SELECT dataset_id, filename, file_type, row_count, status, created_at "
            "FROM dataset_registry WHERE uploaded_by IS NOT NULL "
            "ORDER BY created_at DESC LIMIT 20"
        ))).fetchall()
        user_uploads = [
            {
                "dataset_id": r[0],
                "filename": r[1],
                "file_type": r[2],
                "row_count": r[3] or 0,
                "status": r[4],
                "uploaded_at": r[5].isoformat() if r[5] else None,
            }
            for r in upload_rows
        ]
    except Exception:
        user_uploads = []
    checks["user_uploads"] = {
        "count": len(user_uploads),
        "total_rows": sum(u["row_count"] for u in user_uploads),
        "files": user_uploads,
    }

    # Overall verdict
    real_count = sum(1 for c in checks.values() if isinstance(c, dict) and c.get("is_real"))
    total_checked = sum(1 for c in checks.values() if isinstance(c, dict) and "is_real" in c)

    return {
        "overall": "real" if real_count == total_checked else ("mixed" if real_count > 0 else "mock"),
        "real_sources": real_count,
        "total_sources": total_checked,
        "details": checks,
    }
