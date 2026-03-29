"""Skill Matching API — supply-demand skill gap intelligence."""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.dependencies import get_db
from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/skill-matching", tags=["skill-matching"])


@router.get("/summary")
async def skill_matching_summary(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Overall skill supply-demand summary."""
    total_demanded = (await db.execute(text("SELECT count(DISTINCT skill_id) FROM fact_job_skills"))).scalar() or 0
    total_supplied = (await db.execute(text("SELECT count(DISTINCT skill_id) FROM fact_course_skills"))).scalar() or 0
    total_jobs = (await db.execute(text("SELECT count(DISTINCT demand_id) FROM fact_job_skills"))).scalar() or 0
    total_courses = (await db.execute(text("SELECT count(DISTINCT course_id) FROM fact_course_skills"))).scalar() or 0

    # Overlap
    overlap = (await db.execute(text("""
        SELECT count(DISTINCT js.skill_id)
        FROM fact_job_skills js
        JOIN fact_course_skills cs ON js.skill_id = cs.skill_id
    """))).scalar() or 0

    # Top gaps
    gaps = (await db.execute(text("""
        SELECT skill, demand, supply_courses, gap
        FROM vw_skill_gap
        WHERE demand >= 100
        ORDER BY gap DESC LIMIT 20
    """))).fetchall()

    # Top surplus (skills taught but not demanded much)
    surplus = (await db.execute(text("""
        SELECT skill, demand, supply_courses, gap
        FROM vw_skill_gap
        WHERE supply_courses > 0 AND demand < supply_courses
        ORDER BY gap ASC LIMIT 10
    """))).fetchall()

    return {
        "total_skills_demanded": total_demanded,
        "total_skills_supplied": total_supplied,
        "skill_overlap": overlap,
        "overlap_pct": round(overlap / max(total_demanded, 1) * 100, 1),
        "total_jobs_with_skills": total_jobs,
        "total_courses_mapped": total_courses,
        "top_gaps": [{"skill": r[0], "demand": r[1], "supply": r[2], "gap": r[3]} for r in gaps],
        "top_surplus": [{"skill": r[0], "demand": r[1], "supply": r[2], "gap": r[3]} for r in surplus],
    }


@router.get("/gaps")
async def skill_gaps(
    limit: int = 30,
    min_demand: int = 50,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Skill-level gaps ranked by severity."""
    rows = (await db.execute(text("""
        SELECT skill_id, skill, skill_type, demand, supply_courses, gap
        FROM vw_skill_gap
        WHERE demand >= :min_demand
        ORDER BY gap DESC
        LIMIT :lim
    """), {"min_demand": min_demand, "lim": limit})).fetchall()

    return {
        "gaps": [
            {
                "skill_id": r[0], "skill": r[1], "type": r[2],
                "demand": r[3], "supply": r[4], "gap": r[5],
                "severity": "critical" if r[5] > 5000 else "high" if r[5] > 1000 else "moderate" if r[5] > 100 else "low",
            }
            for r in rows
        ]
    }


@router.get("/demanded-skills")
async def demanded_skills(limit: int = 30, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Most in-demand skills from job postings."""
    rows = (await db.execute(text("""
        SELECT s.skill_id, s.label_en, s.skill_type,
            COUNT(DISTINCT js.demand_id) as job_count,
            COUNT(DISTINCT js.demand_id) FILTER (WHERE js.relation_type = 'essential') as essential_count
        FROM fact_job_skills js
        JOIN dim_skill s ON js.skill_id = s.skill_id
        GROUP BY s.skill_id, s.label_en, s.skill_type
        ORDER BY job_count DESC
        LIMIT :lim
    """), {"lim": limit})).fetchall()

    return {
        "skills": [
            {"skill_id": r[0], "skill": r[1], "type": r[2], "job_count": r[3], "essential_count": r[4]}
            for r in rows
        ]
    }


@router.get("/supplied-skills")
async def supplied_skills(limit: int = 30, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Skills taught in university courses."""
    rows = (await db.execute(text("""
        SELECT s.skill_id, s.label_en, s.skill_type,
            COUNT(DISTINCT cs.course_id) as course_count,
            AVG(cs.weight) as avg_match_quality
        FROM fact_course_skills cs
        JOIN dim_skill s ON cs.skill_id = s.skill_id
        GROUP BY s.skill_id, s.label_en, s.skill_type
        ORDER BY course_count DESC
        LIMIT :lim
    """), {"lim": limit})).fetchall()

    return {
        "skills": [
            {"skill_id": r[0], "skill": r[1], "type": r[2], "course_count": r[3], "match_quality": round(float(r[4] or 0), 2)}
            for r in rows
        ]
    }


@router.get("/comparison")
async def skill_comparison(limit: int = 20, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Smart comparison: skills with BOTH demand and supply data, side by side.
    
    Returns overlapping skills sorted by gap severity, plus top demanded-only and supplied-only.
    Uses ESSENTIAL skills only for demand (not all inherited) for more meaningful numbers.
    """
    # Skills demanded as ESSENTIAL (not optional — reduces noise)
    demanded = (await db.execute(text("""
        SELECT s.skill_id, s.label_en as skill, s.skill_type as type,
            COUNT(DISTINCT js.demand_id) as demand
        FROM fact_job_skills js
        JOIN dim_skill s ON js.skill_id = s.skill_id
        WHERE js.relation_type = 'essential'
        GROUP BY s.skill_id, s.label_en, s.skill_type
        HAVING COUNT(DISTINCT js.demand_id) >= 50
        ORDER BY demand DESC
    """))).fetchall()
    demand_map = {r[0]: {"skill": r[1], "type": r[2], "demand": r[3]} for r in demanded}

    # Skills supplied (courses teaching them)
    supplied = (await db.execute(text("""
        SELECT s.skill_id, s.label_en, s.skill_type,
            COUNT(DISTINCT cs.course_id) as supply
        FROM fact_course_skills cs
        JOIN dim_skill s ON cs.skill_id = s.skill_id
        GROUP BY s.skill_id, s.label_en, s.skill_type
        HAVING COUNT(DISTINCT cs.course_id) >= 3
        ORDER BY supply DESC
    """))).fetchall()
    supply_map = {r[0]: {"skill": r[1], "type": r[2], "supply": r[3]} for r in supplied}

    # OVERLAP: skills in both demand and supply
    overlap_ids = set(demand_map.keys()) & set(supply_map.keys())
    overlap = []
    for sid in overlap_ids:
        d = demand_map[sid]
        s = supply_map[sid]
        overlap.append({
            "skill_id": sid, "skill": d["skill"], "type": d["type"],
            "demand": d["demand"], "supply": s["supply"],
            "gap": d["demand"] - s["supply"],
            "match_pct": round(min(s["supply"] / max(d["demand"], 1) * 100, 100), 1),
        })
    overlap.sort(key=lambda x: x["gap"], reverse=True)

    # DEMAND-ONLY: high-demand skills not taught at all
    demand_only_ids = set(demand_map.keys()) - set(supply_map.keys())
    demand_only = sorted(
        [{"skill_id": sid, "skill": demand_map[sid]["skill"], "type": demand_map[sid]["type"], "demand": demand_map[sid]["demand"]}
         for sid in demand_only_ids],
        key=lambda x: x["demand"], reverse=True
    )

    # SUPPLY-ONLY: taught but not demanded (potential oversupply)
    supply_only_ids = set(supply_map.keys()) - set(demand_map.keys())
    supply_only = sorted(
        [{"skill_id": sid, "skill": supply_map[sid]["skill"], "type": supply_map[sid]["type"], "supply": supply_map[sid]["supply"]}
         for sid in supply_only_ids],
        key=lambda x: x["supply"], reverse=True
    )

    # Category breakdown for heatmap
    categories = {}
    for item in overlap[:50]:
        t = item["type"] or "other"
        if t not in categories:
            categories[t] = []
        categories[t].append({"skill": item["skill"], "demand": item["demand"], "supply": item["supply"], "match_pct": item["match_pct"]})

    return {
        "overlap": overlap[:limit],
        "demand_only": demand_only[:limit],
        "supply_only": supply_only[:limit],
        "categories": categories,
        "stats": {
            "total_demanded": len(demand_map),
            "total_supplied": len(supply_map),
            "overlap_count": len(overlap_ids),
            "demand_only_count": len(demand_only_ids),
            "supply_only_count": len(supply_only_ids),
        }
    }
