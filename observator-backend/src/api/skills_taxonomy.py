"""Skills taxonomy endpoint — browse ESCO + O*NET skills, search, hot technologies."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/skills-taxonomy", tags=["skills-taxonomy"])


async def _safe_count(db, sql: str) -> int:
    """Count query that returns 0 if table doesn't exist."""
    try:
        return (await db.execute(text(sql))).scalar() or 0
    except Exception:
        try: await db.rollback()
        except Exception: pass
        return 0


async def _get_onet_stats(db) -> dict:
    """O*NET stats — all optional, returns 0 if tables missing."""
    return {
        "occupations": await _safe_count(db, "SELECT count(*) FROM dim_onet_occupation"),
        "skills": await _safe_count(db, "SELECT count(*) FROM fact_onet_skills"),
        "knowledge": await _safe_count(db, "SELECT count(*) FROM fact_onet_knowledge"),
        "technologies": await _safe_count(db, "SELECT count(*) FROM fact_onet_technology_skills"),
        "hot_technologies": await _safe_count(db, "SELECT count(*) FROM fact_onet_technology_skills WHERE is_hot_technology = true"),
        "emerging_tasks": await _safe_count(db, "SELECT count(*) FROM fact_onet_emerging_tasks"),
        "alternate_titles": await _safe_count(db, "SELECT count(*) FROM fact_onet_alternate_titles"),
        "career_transitions": await _safe_count(db, "SELECT count(*) FROM fact_onet_related_occupations"),
    }


@router.get("")
async def get_skills_taxonomy(
    occupation_id: int | None = None,
    skill_type: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Browse skills with optional filters."""
    cache_key = CacheService.make_key("skills_taxonomy", {
        "occ": occupation_id, "type": skill_type, "q": search, "lim": limit
    })
    cached = await cache.get(cache_key)
    if cached:
        return cached

    conditions = []
    params = {"lim": limit}

    if occupation_id:
        conditions.append("os.occupation_id = :occ_id")
        params["occ_id"] = occupation_id
    if skill_type:
        conditions.append("s.skill_type = :stype")
        params["stype"] = skill_type
    if search:
        conditions.append("LOWER(s.label_en) LIKE :q")
        params["q"] = f"%{search.lower()}%"

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    # Skills with occupation count
    rows = (await db.execute(text(f"""
        SELECT s.skill_id, s.label_en, s.label_ar, s.skill_type, s.taxonomy,
               COUNT(DISTINCT os.occupation_id) AS occ_count,
               os.relation_type
        FROM dim_skill s
        JOIN fact_occupation_skills os ON s.skill_id = os.skill_id
        {where}
        GROUP BY s.skill_id, s.label_en, s.label_ar, s.skill_type, s.taxonomy, os.relation_type
        ORDER BY occ_count DESC
        LIMIT :lim
    """), params)).fetchall()

    skills = [
        {
            "skill_id": r[0], "label_en": r[1], "label_ar": r[2],
            "skill_type": r[3], "taxonomy": r[4],
            "occupation_count": int(r[5]), "relation_type": r[6],
        }
        for r in rows
    ]

    # Summary stats
    total_skills = (await db.execute(text("SELECT count(*) FROM dim_skill"))).scalar()
    total_mappings = (await db.execute(text("SELECT count(*) FROM fact_occupation_skills"))).scalar()

    # O*NET hot technologies (table may not exist in all deployments)
    try:
        hot_tech = (await db.execute(text("""
            SELECT commodity_title, COUNT(*) AS occ_count
            FROM fact_onet_technology_skills
            WHERE is_hot_technology = true AND commodity_title IS NOT NULL
            GROUP BY commodity_title
            ORDER BY occ_count DESC
            LIMIT 20
        """))).fetchall()
    except Exception:
        hot_tech = []
        try: await db.rollback()
        except Exception: pass

    # O*NET emerging tasks (table may not exist)
    try:
        emerging = (await db.execute(text("""
            SELECT task, category, soc_code
            FROM fact_onet_emerging_tasks
            ORDER BY date DESC NULLS LAST
            LIMIT 20
        """))).fetchall()
    except Exception:
        emerging = []
        try: await db.rollback()
        except Exception: pass

    # Top essential skills
    top_essential = (await db.execute(text("""
        SELECT s.label_en, COUNT(DISTINCT os.occupation_id) AS occ_count
        FROM fact_occupation_skills os
        JOIN dim_skill s ON os.skill_id = s.skill_id
        WHERE os.relation_type = 'essential'
        GROUP BY s.label_en
        ORDER BY occ_count DESC
        LIMIT 20
    """))).fetchall()

    result = {
        "skills": skills,
        "total_skills": total_skills,
        "total_mappings": total_mappings,
        "hot_technologies": [{"technology": r[0], "occupation_count": int(r[1])} for r in hot_tech],
        "emerging_tasks": [{"task": r[0], "category": r[1], "soc_code": r[2]} for r in emerging],
        "top_essential_skills": [{"skill": r[0], "occupation_count": int(r[1])} for r in top_essential],
        "onet_stats": await _get_onet_stats(db),
    }

    await cache.set(cache_key, result, ttl=3600)
    return result


@router.get("/occupation/{occupation_id}")
async def get_occupation_skills(
    occupation_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all skills for a specific occupation — ESCO + O*NET combined."""
    # ESCO skills
    esco = (await db.execute(text("""
        SELECT s.label_en, s.label_ar, s.skill_type, os.relation_type
        FROM fact_occupation_skills os
        JOIN dim_skill s ON os.skill_id = s.skill_id
        WHERE os.occupation_id = :occ_id
        ORDER BY os.relation_type, s.label_en
    """), {"occ_id": occupation_id})).fetchall()

    # O*NET skills with importance
    onet = (await db.execute(text("""
        SELECT element_name, scale_id, data_value
        FROM fact_onet_skills
        WHERE occupation_id = :occ_id AND scale_id IN ('IM', 'LV')
        ORDER BY data_value DESC
    """), {"occ_id": occupation_id})).fetchall()

    # O*NET technologies
    tech = (await db.execute(text("""
        SELECT example, commodity_title, is_hot_technology
        FROM fact_onet_technology_skills
        WHERE occupation_id = :occ_id
        ORDER BY is_hot_technology DESC, example
    """), {"occ_id": occupation_id})).fetchall()

    return {
        "occupation_id": occupation_id,
        "esco_skills": [
            {"skill": r[0], "skill_ar": r[1], "type": r[2], "relation": r[3]}
            for r in esco
        ],
        "onet_skills": [
            {"skill": r[0], "scale": r[1], "value": float(r[2]) if r[2] else None}
            for r in onet
        ],
        "technologies": [
            {"tool": r[0], "category": r[1], "hot": bool(r[2])}
            for r in tech
        ],
    }


@router.get("/hot-technologies")
async def get_hot_technologies(
    limit: int = Query(default=50, le=200),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """O*NET Hot Technology list with occupation count."""
    try:
        rows = (await db.execute(text("""
            SELECT commodity_title, example, COUNT(DISTINCT soc_code) AS occ_count
            FROM fact_onet_technology_skills
            WHERE is_hot_technology = true AND commodity_title IS NOT NULL
            GROUP BY commodity_title, example
            ORDER BY occ_count DESC
            LIMIT :lim
        """), {"lim": limit})).fetchall()
    except Exception:
        rows = []
        try: await db.rollback()
        except Exception: pass

    return {
        "technologies": [
            {"category": r[0], "example": r[1], "occupation_count": int(r[2])}
            for r in rows
        ],
        "total_hot": await _safe_count(db, "SELECT count(DISTINCT commodity_title) FROM fact_onet_technology_skills WHERE is_hot_technology = true"),
    }
