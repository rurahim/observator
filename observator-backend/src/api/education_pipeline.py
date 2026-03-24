"""Education pipeline endpoint — enrollment, graduates, institutions."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/education-pipeline", tags=["education-pipeline"])


@router.get("")
async def get_education_pipeline(
    emirate: str | None = None,
    category: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Education pipeline overview — enrollment, graduates, institutions."""
    cache_key = CacheService.make_key("education_pipeline", {"emirate": emirate, "cat": category})
    cached = await cache.get(cache_key)
    if cached:
        return cached

    conds = []
    params = {}
    if emirate:
        conds.append("region_code = :emirate")
        params["emirate"] = emirate
    if category:
        conds.append("discipline = :cat")
        params["cat"] = category
    where = (" WHERE " + " AND ".join(conds)) if conds else ""

    # Enrollment/student trends by year
    yearly = (await db.execute(text(f"""
        SELECT year, discipline, SUM(total_count) AS total
        FROM vw_education_pipeline{where}
        GROUP BY year, discipline
        ORDER BY year
    """), params)).fetchall()

    yearly_data = {}
    for r in yearly:
        yr = str(r[0]) if r[0] else "unknown"
        cat = r[1] or "other"
        if yr not in yearly_data:
            yearly_data[yr] = {}
        yearly_data[yr][cat] = int(r[2])

    # By emirate
    by_emirate = (await db.execute(text(f"""
        SELECT emirate, region_code, SUM(total_count) AS total
        FROM vw_education_pipeline{where}
        GROUP BY emirate, region_code
        ORDER BY total DESC
    """), params)).fetchall()

    # By gender
    by_gender = (await db.execute(text(f"""
        SELECT gender, SUM(total_count) AS total
        FROM vw_education_pipeline
        WHERE gender IS NOT NULL{' AND ' + ' AND '.join(conds) if conds else ''}
        GROUP BY gender
    """), params)).fetchall()

    # By discipline (replaces level)
    try:
        by_level = (await db.execute(text(f"""
            SELECT discipline, SUM(total_count) AS total
            FROM vw_education_pipeline{where}
            WHERE discipline IS NOT NULL
            GROUP BY discipline
            ORDER BY total DESC
        """), params)).fetchall()
    except Exception:
        by_level = []
        try: await db.rollback()
        except Exception: pass

    # By institution (replaces sector)
    try:
        by_sector = (await db.execute(text(f"""
            SELECT institution, SUM(total_count) AS total
            FROM vw_education_pipeline
            WHERE institution IS NOT NULL
            GROUP BY institution
            ORDER BY total DESC LIMIT 10
        """), params)).fetchall()
    except Exception:
        by_sector = []
        try: await db.rollback()
        except Exception: pass

    # Institutions summary
    inst_count = (await db.execute(text("SELECT count(*) FROM dim_institution"))).scalar()
    inst_by_emirate = (await db.execute(text("""
        SELECT emirate, count(*) FROM dim_institution
        WHERE emirate IS NOT NULL
        GROUP BY emirate ORDER BY count(*) DESC
    """))).fetchall()

    # Total stats
    total_stats = (await db.execute(text(f"""
        SELECT discipline, SUM(total_count) FROM vw_education_pipeline{where}
        GROUP BY discipline
    """), params)).fetchall()

    result = {
        "yearly_trends": yearly_data,
        "by_emirate": [{"emirate": r[0], "region_code": r[1], "total": int(r[2])} for r in by_emirate],
        "by_gender": {r[0]: int(r[1]) for r in by_gender if r[0]},
        "by_level": [{"level": r[0], "total": int(r[1])} for r in by_level],
        "by_sector": {r[0]: int(r[1]) for r in by_sector if r[0]},
        "institutions": {
            "total": inst_count,
            "by_emirate": {r[0]: int(r[1]) for r in inst_by_emirate},
        },
        "totals": {r[0]: int(r[1]) for r in total_stats if r[0]},
        "programs": 190,  # from CAA data
        "courses": 6188,
    }

    await cache.set(cache_key, result, ttl=3600)
    return result
