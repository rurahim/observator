"""Career transition pathways — O*NET related occupations + skill gap analysis."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/occupation-transitions", tags=["transitions"])


@router.get("/{occupation_id}")
async def get_transitions(
    occupation_id: int,
    limit: int = Query(default=20, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get related occupations and career transition paths for an occupation."""
    # Get the occupation name
    occ = (await db.execute(text(
        "SELECT title_en, code_isco FROM dim_occupation WHERE occupation_id = :id"
    ), {"id": occupation_id})).first()

    if not occ:
        return {"error": "Occupation not found", "transitions": []}

    # Career transitions via O*NET
    transitions = (await db.execute(text("""
        SELECT to_occupation, to_isco, to_occupation_id,
               relatedness_tier, relatedness_index
        FROM vw_occupation_transitions
        WHERE from_occupation_id = :occ_id
        ORDER BY relatedness_index
        LIMIT :lim
    """), {"occ_id": occupation_id, "lim": limit})).fetchall()

    # Reverse transitions (who can transition TO this occupation)
    incoming = (await db.execute(text("""
        SELECT from_occupation, from_isco, from_occupation_id,
               relatedness_tier, relatedness_index
        FROM vw_occupation_transitions
        WHERE to_occupation_id = :occ_id
        ORDER BY relatedness_index
        LIMIT :lim
    """), {"occ_id": occupation_id, "lim": limit})).fetchall()

    return {
        "occupation": occ[0],
        "code_isco": occ[1],
        "occupation_id": occupation_id,
        "transitions_from": [
            {
                "occupation": r[0], "code_isco": r[1], "occupation_id": r[2],
                "tier": r[3], "index": int(r[4]) if r[4] else None,
            }
            for r in transitions
        ],
        "transitions_to": [
            {
                "occupation": r[0], "code_isco": r[1], "occupation_id": r[2],
                "tier": r[3], "index": int(r[4]) if r[4] else None,
            }
            for r in incoming
        ],
    }


@router.get("/pathway")
async def get_skill_gap_pathway(
    from_occ: int = Query(..., description="Source occupation ID"),
    to_occ: int = Query(..., description="Target occupation ID"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute skill gap between two occupations for career transition planning."""
    # Skills of source occupation
    from_skills = set()
    rows = (await db.execute(text("""
        SELECT s.label_en FROM fact_occupation_skills os
        JOIN dim_skill s ON os.skill_id = s.skill_id
        WHERE os.occupation_id = :occ_id AND os.relation_type = 'essential'
    """), {"occ_id": from_occ})).fetchall()
    from_skills = {r[0] for r in rows}

    # Skills of target occupation
    to_skills = set()
    rows = (await db.execute(text("""
        SELECT s.label_en FROM fact_occupation_skills os
        JOIN dim_skill s ON os.skill_id = s.skill_id
        WHERE os.occupation_id = :occ_id AND os.relation_type = 'essential'
    """), {"occ_id": to_occ})).fetchall()
    to_skills = {r[0] for r in rows}

    shared = from_skills & to_skills
    missing = to_skills - from_skills
    transferable = from_skills - to_skills

    # Get occupation names
    from_name = (await db.execute(text("SELECT title_en FROM dim_occupation WHERE occupation_id = :id"), {"id": from_occ})).scalar()
    to_name = (await db.execute(text("SELECT title_en FROM dim_occupation WHERE occupation_id = :id"), {"id": to_occ})).scalar()

    overlap_pct = round(len(shared) / max(len(to_skills), 1) * 100, 1)

    return {
        "from_occupation": from_name,
        "to_occupation": to_name,
        "skill_overlap_pct": overlap_pct,
        "shared_skills": sorted(list(shared)),
        "skills_to_acquire": sorted(list(missing)),
        "transferable_skills": sorted(list(transferable)),
        "transition_difficulty": "Easy" if overlap_pct > 70 else "Moderate" if overlap_pct > 40 else "Challenging",
    }
