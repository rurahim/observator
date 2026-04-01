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


@router.get("/real-comparison")
async def real_skill_comparison(
    limit: int = 20,
    search: str | None = None,
    skill_type: str | None = None,
    page: int = 1,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REAL supply-demand comparison at skill level.
    
    Supply = employed workers in occupations requiring this skill (from Bayanat census).
    Demand = job postings requiring this skill (from LinkedIn, essential only).
    NOT courses — actual workforce vs actual job openings.
    """
    conds = []
    params: dict = {"lim": limit, "offset": (page - 1) * limit}

    if search:
        conds.append("s.label_en ILIKE :q")
        params["q"] = f"%{search}%"
    if skill_type:
        conds.append("s.skill_type = :st")
        params["st"] = skill_type

    where = (" AND " + " AND ".join(conds)) if conds else ""

    rows = (await db.execute(text(f"""
        WITH demand_skills AS (
            SELECT js.skill_id, COUNT(DISTINCT js.demand_id) as job_count
            FROM fact_job_skills js
            WHERE js.relation_type = 'essential'
            GROUP BY js.skill_id
            HAVING COUNT(DISTINCT js.demand_id) >= 10
        ),
        supply_skills AS (
            SELECT os.skill_id,
                COUNT(DISTINCT os.occupation_id) as occ_count,
                COALESCE(SUM(st.workers), 0) as worker_count
            FROM fact_occupation_skills os
            LEFT JOIN (
                SELECT occupation_id, SUM(supply_count) as workers
                FROM fact_supply_talent_agg
                GROUP BY occupation_id
            ) st ON os.occupation_id = st.occupation_id
            GROUP BY os.skill_id
        )
        SELECT s.skill_id, s.label_en as skill, s.skill_type as type,
            COALESCE(d.job_count, 0) as demand_jobs,
            COALESCE(sup.worker_count, 0) as supply_workers,
            COALESCE(sup.occ_count, 0) as supply_occupations,
            CASE WHEN COALESCE(sup.worker_count, 0) > 0 AND COALESCE(d.job_count, 0) > 0
                THEN ROUND((d.job_count::numeric / sup.worker_count * 100)::numeric, 2)
                ELSE NULL END as demand_pct
        FROM dim_skill s
        LEFT JOIN demand_skills d ON s.skill_id = d.skill_id
        LEFT JOIN supply_skills sup ON s.skill_id = sup.skill_id
        WHERE (COALESCE(d.job_count, 0) > 0 OR COALESCE(sup.worker_count, 0) > 0)
        {where}
        ORDER BY demand_jobs DESC
        LIMIT :lim OFFSET :offset
    """), params)).fetchall()

    # Total count for pagination
    total = (await db.execute(text(f"""
        SELECT count(DISTINCT s.skill_id)
        FROM dim_skill s
        LEFT JOIN (SELECT skill_id FROM fact_job_skills WHERE relation_type='essential' GROUP BY skill_id HAVING count(DISTINCT demand_id) >= 10) d ON s.skill_id = d.skill_id
        LEFT JOIN fact_occupation_skills os ON s.skill_id = os.skill_id
        WHERE (d.skill_id IS NOT NULL OR os.skill_id IS NOT NULL)
        {where}
    """), {k:v for k,v in params.items() if k not in ('lim','offset')})).scalar() or 0

    return {
        "skills": [
            {
                "skill_id": r[0], "skill": r[1], "type": r[2],
                "demand_jobs": r[3], "supply_workers": r[4],
                "supply_occupations": r[5], "demand_pct": float(r[6]) if r[6] else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
        "explanation": {
            "demand_jobs": "Number of LinkedIn job postings requiring this skill (essential only)",
            "supply_workers": "Number of employed workers in occupations that require this skill (Bayanat census 2015-2019)",
            "demand_pct": "Jobs as % of workers — higher means more competitive hiring for this skill",
        }
    }


@router.get("/real-occupation-comparison")
async def real_occupation_comparison(
    limit: int = 20,
    search: str | None = None,
    region: str | None = None,
    page: int = 1,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REAL supply-demand comparison at occupation level.
    
    Supply = employed workers per occupation (Bayanat census).
    Demand = job postings per occupation (LinkedIn).
    """
    conds = []
    params: dict = {"lim": limit, "offset": (page - 1) * limit}

    if search:
        conds.append("o.title_en ILIKE :q")
        params["q"] = f"%{search}%"
    if region:
        conds.append("(s.region_code = :reg OR d.region_code = :reg)")
        params["reg"] = region

    where = (" AND " + " AND ".join(conds)) if conds else ""

    rows = (await db.execute(text(f"""
        WITH supply AS (
            SELECT occupation_id, SUM(supply_count) as workers
            FROM fact_supply_talent_agg
            {'WHERE region_code = :reg' if region else ''}
            GROUP BY occupation_id
        ),
        demand AS (
            SELECT occupation_id, COUNT(*) as jobs
            FROM fact_demand_vacancies_agg
            {'WHERE region_code = :reg' if region else ''}
            GROUP BY occupation_id
        )
        SELECT o.occupation_id, o.title_en as occupation, o.code_isco,
            COALESCE(s.workers, 0) as supply_workers,
            COALESCE(d.jobs, 0) as demand_jobs,
            COALESCE(d.jobs, 0) - COALESCE(s.workers, 0) as gap,
            (SELECT COUNT(*) FROM fact_occupation_skills os WHERE os.occupation_id = o.occupation_id) as skill_count
        FROM dim_occupation o
        LEFT JOIN supply s ON o.occupation_id = s.occupation_id
        LEFT JOIN demand d ON o.occupation_id = d.occupation_id
        WHERE (COALESCE(s.workers, 0) > 0 OR COALESCE(d.jobs, 0) > 0)
        {where}
        ORDER BY demand_jobs DESC
        LIMIT :lim OFFSET :offset
    """), params)).fetchall()

    total = (await db.execute(text(f"""
        SELECT count(DISTINCT o.occupation_id)
        FROM dim_occupation o
        LEFT JOIN fact_supply_talent_agg s ON o.occupation_id = s.occupation_id
        LEFT JOIN fact_demand_vacancies_agg d ON o.occupation_id = d.occupation_id
        WHERE (s.occupation_id IS NOT NULL OR d.occupation_id IS NOT NULL) {where}
    """), {k:v for k,v in params.items() if k not in ('lim','offset')})).scalar() or 0

    return {
        "occupations": [
            {
                "occupation_id": r[0], "occupation": r[1], "isco": r[2],
                "supply_workers": int(r[3]), "demand_jobs": int(r[4]),
                "gap": int(r[5]), "skills": int(r[6]),
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
        "explanation": {
            "supply_workers": "Total employed workers in this occupation (Bayanat/MOHRE census 2015-2019)",
            "demand_jobs": "Number of LinkedIn job postings for this occupation (2024-2025)",
            "gap": "demand_jobs - supply_workers (negative = more workers than openings)",
            "note": "Supply is 2015-2019 census data. Demand is 2024-2025 postings. Different time periods."
        }
    }
