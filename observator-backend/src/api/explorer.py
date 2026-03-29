"""Supply-Demand Explorer — drill-down at any level with filters."""
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.dependencies import get_db
from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/explorer", tags=["explorer"])


@router.get("/filters")
async def get_filter_options(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """All available filter values for the explorer."""
    regions = (await db.execute(text("SELECT region_code, emirate FROM dim_region ORDER BY emirate"))).fetchall()
    institutions = (await db.execute(text(
        "SELECT institution_id, name_en FROM dim_institution WHERE name_en IS NOT NULL ORDER BY name_en LIMIT 200"
    ))).fetchall()
    sectors = (await db.execute(text(
        "SELECT DISTINCT label_en FROM dim_sector WHERE label_en IS NOT NULL ORDER BY label_en LIMIT 100"
    ))).fetchall()

    return {
        "regions": [{"value": r[0], "label": r[1]} for r in regions],
        "institutions": [{"value": r[0], "label": r[1]} for r in institutions],
        "sectors": [r[0] for r in sectors],
        "degree_levels": ["Bachelor", "Master", "PhD", "Diploma", "Certificate", "Associate"],
        "skill_types": ["knowledge", "skill/competence", "skill", "competence", "technology"],
    }


@router.get("/by-institution")
async def explore_by_institution(
    institution_id: int | None = None,
    region: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Skills supplied per institution — what each university produces."""
    conds = []
    params: dict = {}
    if institution_id:
        conds.append("c.institution_id = :inst")
        params["inst"] = institution_id
    if region:
        conds.append("i.emirate ILIKE :region")
        params["region"] = f"%{region}%"

    where = (" AND " + " AND ".join(conds)) if conds else ""

    rows = (await db.execute(text(f"""
        SELECT i.name_en as institution, i.institution_id,
            COUNT(DISTINCT c.course_id) as courses,
            COUNT(DISTINCT cs.skill_id) as skills_taught,
            COUNT(DISTINCT p.program_id) as programs
        FROM dim_institution i
        LEFT JOIN dim_course c ON c.institution_id = i.institution_id
        LEFT JOIN fact_course_skills cs ON cs.course_id = c.course_id::text
        LEFT JOIN dim_program p ON p.institution_id = i.institution_id
        WHERE i.name_en IS NOT NULL {where}
        GROUP BY i.name_en, i.institution_id
        HAVING COUNT(DISTINCT c.course_id) > 0
        ORDER BY skills_taught DESC
        LIMIT 50
    """), params)).fetchall()

    return {
        "institutions": [
            {"institution": r[0], "institution_id": r[1], "courses": r[2], "skills_taught": r[3], "programs": r[4]}
            for r in rows
        ]
    }


@router.get("/by-program")
async def explore_by_program(
    institution_id: int | None = None,
    degree_level: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Skills per program — what each program teaches."""
    conds = []
    params: dict = {}
    if institution_id:
        conds.append("c.institution_id = :inst")
        params["inst"] = institution_id
    if degree_level:
        conds.append("p.degree_level ILIKE :dl")
        params["dl"] = f"%{degree_level}%"

    where = (" AND " + " AND ".join(conds)) if conds else ""

    rows = (await db.execute(text(f"""
        SELECT c.program_name as program, c.institution_name as institution,
            COUNT(DISTINCT c.course_id) as courses,
            COUNT(DISTINCT cs.skill_id) as skills_taught
        FROM dim_course c
        LEFT JOIN fact_course_skills cs ON cs.course_id = c.course_id::text
        LEFT JOIN dim_program p ON LOWER(p.program_name) = LOWER(c.program_name) AND p.institution_id = c.institution_id
        WHERE c.program_name IS NOT NULL AND c.program_name != '' {where}
        GROUP BY c.program_name, c.institution_name
        HAVING COUNT(DISTINCT c.course_id) >= 2
        ORDER BY skills_taught DESC
        LIMIT 50
    """), params)).fetchall()

    return {
        "programs": [
            {"program": r[0], "institution": r[1], "courses": r[2], "skills_taught": r[3]}
            for r in rows
        ]
    }


@router.get("/by-skill")
async def explore_by_skill(
    skill_type: str | None = None,
    search: str | None = None,
    limit: int = 30,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """For each skill — how many jobs demand it vs how many courses teach it."""
    conds_d = []
    conds_s = []
    params: dict = {"lim": limit}

    if skill_type:
        conds_d.append("s.skill_type = :stype")
        conds_s.append("s.skill_type = :stype")
        params["stype"] = skill_type
    if search:
        conds_d.append("s.label_en ILIKE :q")
        conds_s.append("s.label_en ILIKE :q")
        params["q"] = f"%{search}%"

    where_d = (" AND " + " AND ".join(conds_d)) if conds_d else ""
    where_s = (" AND " + " AND ".join(conds_s)) if conds_s else ""

    rows = (await db.execute(text(f"""
        WITH dem AS (
            SELECT s.skill_id, s.label_en as skill, s.skill_type,
                COUNT(DISTINCT js.demand_id) as demand
            FROM fact_job_skills js
            JOIN dim_skill s ON js.skill_id = s.skill_id
            WHERE js.relation_type = 'essential' {where_d}
            GROUP BY s.skill_id, s.label_en, s.skill_type
        ),
        sup AS (
            SELECT s.skill_id,
                COUNT(DISTINCT cs.course_id) as supply
            FROM fact_course_skills cs
            JOIN dim_skill s ON cs.skill_id = s.skill_id
            WHERE 1=1 {where_s}
            GROUP BY s.skill_id
        )
        SELECT COALESCE(d.skill_id, s2.skill_id) as skill_id,
            COALESCE(d.skill, s3.label_en) as skill,
            COALESCE(d.skill_type, s3.skill_type) as type,
            COALESCE(d.demand, 0) as demand,
            COALESCE(s2.supply, 0) as supply,
            COALESCE(d.demand, 0) - COALESCE(s2.supply, 0) as gap
        FROM dem d
        FULL OUTER JOIN sup s2 ON d.skill_id = s2.skill_id
        LEFT JOIN dim_skill s3 ON s2.skill_id = s3.skill_id
        WHERE COALESCE(d.demand, 0) + COALESCE(s2.supply, 0) > 0
        ORDER BY gap DESC
        LIMIT :lim
    """), params)).fetchall()

    return {
        "skills": [
            {"skill_id": r[0], "skill": r[1], "type": r[2], "demand": r[3], "supply": r[4], "gap": r[5]}
            for r in rows
        ]
    }


@router.get("/by-occupation")
async def explore_by_occupation(
    region: str | None = None,
    sector: str | None = None,
    search: str | None = None,
    limit: int = 30,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Supply vs demand per occupation with filters."""
    conds = []
    params: dict = {"lim": limit}
    if region:
        conds.append("(g.region_code = :reg OR :reg IS NULL)")
        params["reg"] = region
    if search:
        conds.append("g.occupation ILIKE :q")
        params["q"] = f"%{search}%"

    where = (" WHERE " + " AND ".join(conds)) if conds else ""

    rows = (await db.execute(text(f"""
        SELECT g.occupation, g.code_isco, g.region_code, g.emirate,
            SUM(g.supply_count) as supply, SUM(g.demand_count) as demand,
            SUM(g.supply_count) - SUM(g.demand_count) as gap,
            MAX(g.total_skills) as skills, MAX(g.ai_exposure_score) as ai_exposure
        FROM vw_gap_cube g
        {where}
        GROUP BY g.occupation, g.code_isco, g.region_code, g.emirate
        ORDER BY gap ASC
        LIMIT :lim
    """), params)).fetchall()

    return {
        "occupations": [
            {"occupation": r[0], "isco": r[1], "region": r[2], "emirate": r[3],
             "supply": int(r[4] or 0), "demand": int(r[5] or 0), "gap": int(r[6] or 0),
             "skills": int(r[7] or 0), "ai_exposure": float(r[8]) if r[8] else None}
            for r in rows
        ]
    }


@router.get("/by-region")
async def explore_by_region(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Supply vs demand aggregated per emirate."""
    rows = (await db.execute(text("""
        SELECT r.region_code, r.emirate as name_en,
            COALESCE(s.supply, 0) as supply,
            COALESCE(d.demand, 0) as demand,
            COALESCE(s.supply, 0) - COALESCE(d.demand, 0) as gap,
            COALESCE(inst.cnt, 0) as institutions,
            COALESCE(courses.cnt, 0) as courses
        FROM dim_region r
        LEFT JOIN (SELECT region_code, SUM(supply_count) as supply FROM fact_supply_talent_agg GROUP BY region_code) s ON r.region_code = s.region_code
        LEFT JOIN (SELECT region_code, SUM(demand_count) as demand FROM fact_demand_vacancies_agg GROUP BY region_code) d ON r.region_code = d.region_code
        LEFT JOIN (SELECT SUBSTRING(name_en, 1, 3) as code, COUNT(*) as cnt FROM dim_institution GROUP BY 1) inst ON r.region_code = inst.code
        LEFT JOIN (SELECT c.institution_id, COUNT(*) as cnt FROM dim_course c GROUP BY c.institution_id) courses ON 1=1
        ORDER BY demand DESC
    """))).fetchall()

    return {
        "regions": [
            {"region": r[0], "emirate": r[1], "supply": int(r[2] or 0), "demand": int(r[3] or 0), "gap": int(r[4] or 0)}
            for r in rows
        ]
    }


@router.get("/skill-detail/{skill_id}")
async def skill_detail(
    skill_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deep drill into a single skill — which jobs need it, which courses teach it."""
    # Skill info
    skill = (await db.execute(text(
        "SELECT skill_id, label_en, skill_type, taxonomy FROM dim_skill WHERE skill_id = :id"
    ), {"id": skill_id})).fetchone()
    if not skill:
        return {"error": "Skill not found"}

    # Jobs demanding this skill
    demanding_jobs = (await db.execute(text("""
        SELECT d.id, o.title_en as occupation, d.region_code, d.experience_band
        FROM fact_job_skills js
        JOIN fact_demand_vacancies_agg d ON js.demand_id = d.id
        LEFT JOIN dim_occupation o ON d.occupation_id = o.occupation_id
        WHERE js.skill_id = :sid
        LIMIT 20
    """), {"sid": skill_id})).fetchall()

    # Courses teaching this skill
    teaching_courses = (await db.execute(text("""
        SELECT c.course_name, c.institution_name, c.program_name, cs.weight
        FROM fact_course_skills cs
        JOIN dim_course c ON cs.course_id = c.course_id::text
        WHERE cs.skill_id = :sid
        ORDER BY cs.weight DESC
        LIMIT 20
    """), {"sid": skill_id})).fetchall()

    return {
        "skill": {"id": skill[0], "name": skill[1], "type": skill[2], "taxonomy": skill[3]},
        "demand": {
            "total_jobs": len(demanding_jobs),
            "jobs": [{"occupation": r[1], "region": r[2], "experience": r[3]} for r in demanding_jobs],
        },
        "supply": {
            "total_courses": len(teaching_courses),
            "courses": [{"course": r[0], "institution": r[1], "program": r[2], "match": round(float(r[3] or 0), 2)} for r in teaching_courses],
        },
    }
