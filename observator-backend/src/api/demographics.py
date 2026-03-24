"""Population demographics endpoint — age pyramids, nationality mix, workforce."""
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/population-demographics", tags=["demographics"])


@router.get("")
async def get_demographics(
    emirate: str | None = None,
    year: int | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Population demographics overview."""
    cache_key = CacheService.make_key("demographics", {"emirate": emirate, "year": year})
    cached = await cache.get(cache_key)
    if cached:
        return cached

    conds = []
    params = {}
    if emirate:
        conds.append("region_code = :emirate")
        params["emirate"] = emirate
    if year:
        conds.append("year = :year")
        params["year"] = year
    where = (" WHERE " + " AND ".join(conds)) if conds else ""

    # Age distribution
    age_data = (await db.execute(text(f"""
        SELECT age_group, gender, SUM(population) AS total
        FROM vw_population_demographics{where}
        GROUP BY age_group, gender
        ORDER BY age_group
    """), params)).fetchall()

    # By citizenship
    citizenship = (await db.execute(text(f"""
        SELECT citizenship, SUM(population) AS total
        FROM vw_population_demographics
        WHERE citizenship IS NOT NULL{' AND ' + ' AND '.join(conds) if conds else ''}
        GROUP BY citizenship
    """), params)).fetchall()

    # By emirate
    by_emirate = (await db.execute(text(f"""
        SELECT emirate, region_code, SUM(population) AS total
        FROM vw_population_demographics{where}
        GROUP BY emirate, region_code
        ORDER BY total DESC
    """), params)).fetchall()

    # Years available
    years = (await db.execute(text(
        "SELECT DISTINCT year FROM vw_population_demographics WHERE year IS NOT NULL ORDER BY year"
    ))).fetchall()

    # Total
    total_pop = (await db.execute(text(f"""
        SELECT SUM(population) FROM vw_population_demographics{where}
    """), params)).scalar() or 0

    result = {
        "total_population": int(total_pop),
        "age_pyramid": [
            {"age_group": r[0], "gender": r[1], "count": int(r[2])}
            for r in age_data if r[0]
        ],
        "citizenship": {r[0]: int(r[1]) for r in citizenship if r[0]},
        "by_emirate": [{"emirate": r[0], "region_code": r[1], "population": int(r[2])} for r in by_emirate],
        "years_available": [int(r[0]) for r in years if r[0]],
    }

    await cache.set(cache_key, result, ttl=3600)
    return result
