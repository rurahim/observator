"""Supply-side education dashboard — enrollment, graduates, programs, institutions."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/supply-dashboard", tags=["supply-dashboard"])


def _where(conds, prefix="WHERE"):
    return f" {prefix} " + " AND ".join(conds) if conds else ""


@router.get("/filter-options")
async def get_supply_filter_options(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Return available filter values for the supply dashboard."""
    cache_key = "supply_filter_options"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    years = [r[0] for r in (await db.execute(text(
        "SELECT DISTINCT year FROM fact_program_enrollment WHERE year IS NOT NULL ORDER BY year"
    ))).fetchall()]
    specializations = [r[0] for r in (await db.execute(text(
        "SELECT specialization FROM fact_program_enrollment WHERE specialization IS NOT NULL "
        "GROUP BY specialization ORDER BY SUM(enrollment_count) DESC NULLS LAST LIMIT 30"
    ))).fetchall()]
    degree_levels = [r[0] for r in (await db.execute(text(
        "SELECT DISTINCT degree_level FROM dim_program WHERE degree_level IS NOT NULL ORDER BY degree_level"
    ))).fetchall()]
    sectors = [r[0] for r in (await db.execute(text(
        "SELECT DISTINCT sector FROM fact_program_enrollment WHERE sector IS NOT NULL ORDER BY sector"
    ))).fetchall()]
    emirates = [{"value": r[0], "label": r[1] or r[0]} for r in (await db.execute(text(
        "SELECT region_code, emirate FROM dim_region ORDER BY emirate"
    ))).fetchall()]
    institutions = [r[0] for r in (await db.execute(text(
        "SELECT name_en FROM dim_institution WHERE name_en IS NOT NULL ORDER BY name_en LIMIT 200"
    ))).fetchall()]
    programs = [r[0] for r in (await db.execute(text(
        "SELECT DISTINCT specialization FROM fact_program_enrollment "
        "WHERE specialization IS NOT NULL ORDER BY specialization LIMIT 200"
    ))).fetchall()]

    result = {
        "years": years,
        "specializations": specializations,
        "degree_levels": degree_levels,
        "sectors": sectors,
        "emirates": emirates,
        "institutions": institutions,
        "programs": programs,
    }
    await cache.set(cache_key, result, ttl=3600)
    return result


@router.get("")
async def get_supply_dashboard(
    emirate: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    sector: str | None = None,
    specialty: str | None = None,
    degree_level: str | None = None,
    institution: str | None = None,  # institution name
    program: str | None = None,  # program name
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    """Comprehensive supply-side dashboard data — all dimensions."""
    cache_key = CacheService.make_key(
        "supply_dashboard",
        {"emirate": emirate, "yf": year_from, "yt": year_to,
         "sector": sector, "spec": specialty, "deg": degree_level,
         "inst": institution, "prog": program},
    )
    cached = await cache.get(cache_key)
    if cached:
        return cached

    ec, gc, p = [], [], {}  # enrollment conditions, graduate conditions, params
    if emirate:
        ec.append("region_code = :emirate"); gc.append("region_code = :emirate"); p["emirate"] = emirate
    if year_from:
        ec.append("year >= :yf"); gc.append("year >= :yf"); p["yf"] = year_from
    if year_to:
        ec.append("year <= :yt"); gc.append("year <= :yt"); p["yt"] = year_to
    if sector:
        ec.append("sector = :sector"); p["sector"] = sector
    if specialty:
        ec.append("specialization = :spec"); gc.append("specialization = :spec"); p["spec"] = specialty
    if degree_level:
        gc.append("degree_level = :deg"); p["deg"] = degree_level
    if institution:
        # Resolve institution_ids first, then use simple IN clause
        inst_ids_result = await db.execute(text(
            "SELECT institution_id FROM dim_institution WHERE name_en ILIKE :inst"
        ), {"inst": f"%{institution}%"})
        inst_ids = [r[0] for r in inst_ids_result.fetchall()]
        if inst_ids and len(inst_ids) == 1:
            # Single institution — simple scalar comparison avoids ambiguity
            ec.append("institution_id = :inst_id_val")
            p["inst_id_val"] = inst_ids[0]
        elif inst_ids:
            ec.append("institution_id = ANY(:inst_ids)")
            p["inst_ids"] = inst_ids
        else:
            ec.append("1=0")
        gc.append("college ILIKE :inst_name")
        p["inst_name"] = f"%{institution}%"
    if program:
        ec.append("specialization ILIKE :prog")
        gc.append("specialization ILIKE :prog")
        p["prog"] = f"%{program}%"

    ew = _where(ec)
    gw = _where(gc)
    ea = _where(ec, "AND") if ec else ""
    ga = _where(gc, "AND") if gc else ""

    # ── KPIs ──
    inst_count = (await db.execute(text("SELECT COUNT(*) FROM dim_institution"))).scalar() or 0
    prog_count = (await db.execute(text("SELECT COUNT(*) FROM dim_program"))).scalar() or 0
    total_enrolled = (await db.execute(text(
        f"SELECT SUM(enrollment_count) FROM fact_program_enrollment WHERE enrollment_count IS NOT NULL {ea}"
    ), p)).scalar() or 0
    total_graduates = (await db.execute(text(
        f"SELECT SUM(graduate_count) FROM fact_graduate_outcomes WHERE graduate_count IS NOT NULL {ga}"
    ), p)).scalar() or 0

    # ── 1. Enrollment Trend (year, actual vs estimated) ──
    enrollment_trend = [
        {"year": r[0], "enrollment": int(r[1]), "is_estimated": bool(r[2]), "sources": r[3] or []}
        for r in (await db.execute(text(f"""
            SELECT year, SUM(enrollment_count), bool_or(is_estimated), array_agg(DISTINCT source)
            FROM fact_program_enrollment WHERE enrollment_count IS NOT NULL {ea}
            GROUP BY year ORDER BY year
        """), p)).fetchall()
    ]

    # ── 2. Enrollment by Sector (Gov vs Private stacked trend) ──
    sector_trend = [
        {"year": r[0], "sector": r[1], "enrollment": int(r[2])}
        for r in (await db.execute(text(f"""
            SELECT year, sector, SUM(enrollment_count)
            FROM fact_program_enrollment WHERE sector IS NOT NULL AND enrollment_count IS NOT NULL {ea}
            GROUP BY year, sector ORDER BY year, sector
        """), p)).fetchall()
    ]

    # ── 3. By Emirate ──
    by_emirate = [
        {"region_code": r[0], "emirate": r[1] or r[0] or "National", "enrollment": int(r[2])}
        for r in (await db.execute(text(f"""
            SELECT e.region_code, r.emirate, SUM(e.enrollment_count)
            FROM fact_program_enrollment e LEFT JOIN dim_region r ON e.region_code = r.region_code
            WHERE e.enrollment_count IS NOT NULL AND e.region_code IS NOT NULL {ea.replace('region_code', 'e.region_code').replace('institution_id', 'e.institution_id') if ea else ''}
            GROUP BY e.region_code, r.emirate ORDER BY SUM(e.enrollment_count) DESC
        """), p)).fetchall()
    ]

    # ── 4. By Specialty ──
    by_specialty = [
        {"specialization": r[0], "enrollment": int(r[1]), "data_type": r[2] or "actual"}
        for r in (await db.execute(text(f"""
            SELECT specialization, SUM(enrollment_count), MAX(data_type)
            FROM fact_program_enrollment WHERE enrollment_count IS NOT NULL AND specialization IS NOT NULL {ea}
            GROUP BY specialization ORDER BY SUM(enrollment_count) DESC LIMIT 15
        """), p)).fetchall()
    ]

    # ── 5. By Gender (enrollment) ──
    by_gender_enroll = {
        r[0]: int(r[1]) for r in (await db.execute(text(f"""
            SELECT gender, SUM(enrollment_count) FROM fact_program_enrollment
            WHERE gender IS NOT NULL AND enrollment_count IS NOT NULL {ea} GROUP BY gender
        """), p)).fetchall()
    }

    # ── 6. By Nationality (enrollment) ──
    by_nationality_enroll = {
        r[0]: int(r[1]) for r in (await db.execute(text(f"""
            SELECT nationality, SUM(enrollment_count) FROM fact_program_enrollment
            WHERE nationality IS NOT NULL AND enrollment_count IS NOT NULL {ea} GROUP BY nationality
        """), p)).fetchall()
    }

    # ── 7. Graduate Trends by Year ──
    grad_trend = [
        {"year": r[0], "graduates": int(r[1]), "is_estimated": bool(r[2])}
        for r in (await db.execute(text(f"""
            SELECT year, SUM(graduate_count), bool_or(is_estimated)
            FROM fact_graduate_outcomes WHERE graduate_count IS NOT NULL {ga}
            GROUP BY year ORDER BY year
        """), p)).fetchall()
    ]

    # ── 8. Graduates by Specialty ──
    grad_by_specialty = [
        {"specialization": r[0], "graduates": int(r[1])}
        for r in (await db.execute(text(f"""
            SELECT specialization, SUM(graduate_count)
            FROM fact_graduate_outcomes WHERE specialization IS NOT NULL AND graduate_count IS NOT NULL {ga}
            GROUP BY specialization ORDER BY SUM(graduate_count) DESC LIMIT 15
        """), p)).fetchall()
    ]

    # ── 9. Graduate Gender ──
    grad_gender = {
        r[0]: int(r[1]) for r in (await db.execute(text(f"""
            SELECT gender, SUM(graduate_count) FROM fact_graduate_outcomes
            WHERE gender IS NOT NULL AND graduate_count IS NOT NULL {ga} GROUP BY gender
        """), p)).fetchall()
    }

    # ── 10. Graduate Nationality ──
    grad_nationality = {
        r[0]: int(r[1]) for r in (await db.execute(text(f"""
            SELECT nationality, SUM(graduate_count) FROM fact_graduate_outcomes
            WHERE nationality IS NOT NULL AND graduate_count IS NOT NULL {ga} GROUP BY nationality
        """), p)).fetchall()
    }

    # ── 11. Graduate by Degree Level ──
    grad_degree = [
        {"degree_level": r[0], "graduates": int(r[1])}
        for r in (await db.execute(text(f"""
            SELECT degree_level, SUM(graduate_count) FROM fact_graduate_outcomes
            WHERE degree_level IS NOT NULL AND graduate_count IS NOT NULL {ga}
            GROUP BY degree_level ORDER BY SUM(graduate_count) DESC
        """), p)).fetchall()
    ]

    # ── 12. STEM Split ──
    stem_data = [
        {"indicator": r[0], "count": int(r[1])}
        for r in (await db.execute(text(f"""
            SELECT CASE WHEN stem_indicator IN ('S','T','E','M','S,M') THEN 'STEM' ELSE 'Non-STEM' END AS cat,
                   COUNT(*) FROM fact_graduate_outcomes WHERE stem_indicator IS NOT NULL {ga}
            GROUP BY cat ORDER BY COUNT(*) DESC
        """), p)).fetchall()
    ]

    # ── 13. UAEU Colleges (detailed) ──
    uaeu_colleges = [
        {"college": r[0], "graduates": int(r[1])}
        for r in (await db.execute(text("""
            SELECT college, SUM(graduate_count) FROM fact_graduate_outcomes
            WHERE college IS NOT NULL AND graduate_count IS NOT NULL
            GROUP BY college ORDER BY SUM(graduate_count) DESC
        """))).fetchall()
    ]

    # ── 14. Programs by Field (CAA) ──
    programs_by_field = [
        {"field": r[0] or "Other", "count": r[1]}
        for r in (await db.execute(text("""
            SELECT specialization, COUNT(*) FROM dim_program
            WHERE source = 'caa_accredited' AND specialization IS NOT NULL
            GROUP BY specialization ORDER BY COUNT(*) DESC
        """))).fetchall()
    ]

    # ── 15. Programs by Emirate ──
    programs_by_emirate = [
        {"emirate": r[0] or "Multiple/Unknown", "count": r[1]}
        for r in (await db.execute(text("""
            SELECT i.emirate, COUNT(p.program_id) FROM dim_program p
            JOIN dim_institution i ON p.institution_id = i.institution_id
            GROUP BY i.emirate ORDER BY COUNT(*) DESC LIMIT 10
        """))).fetchall()
    ]

    # ── 16. Program Distribution (degree level) ──
    program_dist = [
        {"degree_level": r[0], "count": r[1]}
        for r in (await db.execute(text("""
            SELECT degree_level, COUNT(*) FROM dim_program WHERE degree_level IS NOT NULL
            GROUP BY degree_level ORDER BY COUNT(*) DESC
        """))).fetchall()
    ]

    # ── 17. Institution Ranking ──
    inst_ranking = [
        {"institution_id": r[0], "institution": r[1], "emirate": r[2], "sector": r[3],
         "programs": r[4], "graduates": int(r[5]), "lat": r[6], "lng": r[7]}
        for r in (await db.execute(text("""
            SELECT i.institution_id, i.name_en, i.emirate, i.institution_type,
                   COUNT(DISTINCT p.program_id),
                   COALESCE(SUM(g.graduate_count), 0),
                   i.latitude, i.longitude
            FROM dim_institution i
            LEFT JOIN dim_program p ON p.institution_id = i.institution_id
            LEFT JOIN fact_graduate_outcomes g ON g.institution_id = i.institution_id AND g.graduate_count IS NOT NULL
            GROUP BY i.institution_id, i.name_en, i.emirate, i.institution_type, i.latitude, i.longitude
            HAVING COUNT(DISTINCT p.program_id) > 0
            ORDER BY COUNT(DISTINCT p.program_id) DESC, SUM(g.graduate_count) DESC NULLS LAST
            LIMIT 30
        """))).fetchall()
    ]

    # ── 19. Skills: Top In-Demand ──
    top_skills = [
        {"skill": r[0], "type": r[1] or "skill", "occupations": r[2]}
        for r in (await db.execute(text("""
            SELECT s.label_en, s.skill_type, COUNT(DISTINCT os.occupation_id)
            FROM fact_occupation_skills os JOIN dim_skill s ON os.skill_id = s.skill_id
            WHERE os.relation_type = 'essential' AND s.taxonomy = 'ESCO'
            GROUP BY s.skill_id, s.label_en, s.skill_type
            ORDER BY COUNT(DISTINCT os.occupation_id) DESC LIMIT 20
        """))).fetchall()
    ]

    # ── 20. Skills by Type ──
    skills_by_type = [
        {"type": r[0] or "other", "count": r[1]}
        for r in (await db.execute(text("""
            SELECT s.skill_type, COUNT(*) FROM dim_skill s
            WHERE s.taxonomy = 'ESCO' GROUP BY s.skill_type ORDER BY COUNT(*) DESC
        """))).fetchall()
    ]

    # ── 21. Total skills & occupations stats ──
    total_skills = (await db.execute(text("SELECT COUNT(*) FROM dim_skill"))).scalar() or 0
    total_occ_skills = (await db.execute(text("SELECT COUNT(*) FROM fact_occupation_skills"))).scalar() or 0
    essential_mappings = (await db.execute(text(
        "SELECT COUNT(*) FROM fact_occupation_skills WHERE relation_type = 'essential'"
    ))).scalar() or 0

    # ── 22. Digital / Tech Skills ──
    digital_skills = [
        {"skill": r[0], "occupations": r[1]}
        for r in (await db.execute(text("""
            SELECT s.label_en, COUNT(DISTINCT os.occupation_id)
            FROM fact_occupation_skills os JOIN dim_skill s ON os.skill_id = s.skill_id
            WHERE os.relation_type = 'essential'
              AND s.taxonomy = 'ESCO'
              AND (s.label_en ILIKE '%comput%' OR s.label_en ILIKE '%software%'
                   OR s.label_en ILIKE '%data%' OR s.label_en ILIKE '%digital%'
                   OR s.label_en ILIKE '%program%' OR s.label_en ILIKE '%cyber%'
                   OR s.label_en ILIKE '%cloud%' OR s.label_en ILIKE '%artificial%'
                   OR s.label_en ILIKE '%machine learn%' OR s.label_en ILIKE '%database%'
                   OR s.label_en ILIKE '%network%' OR s.label_en ILIKE '%web%')
            GROUP BY s.skill_id, s.label_en
            ORDER BY COUNT(DISTINCT os.occupation_id) DESC LIMIT 15
        """))).fetchall()
    ]

    # ── 23. Top Knowledge Areas ──
    knowledge_areas = [
        {"area": r[0], "occupations": r[1]}
        for r in (await db.execute(text("""
            SELECT s.label_en, COUNT(DISTINCT os.occupation_id)
            FROM fact_occupation_skills os JOIN dim_skill s ON os.skill_id = s.skill_id
            WHERE os.relation_type = 'essential' AND s.skill_type = 'knowledge' AND s.taxonomy = 'ESCO'
            GROUP BY s.skill_id, s.label_en
            ORDER BY COUNT(DISTINCT os.occupation_id) DESC LIMIT 15
        """))).fetchall()
    ]

    # ── 18. Data Sources ──
    sources = [
        {"source": r[0] or "unknown", "rows": r[1], "category": r[2]}
        for r in (await db.execute(text("""
            SELECT source, COUNT(*) AS cnt, 'enrollment' AS cat FROM fact_program_enrollment GROUP BY source
            UNION ALL SELECT source, COUNT(*), 'graduates' FROM fact_graduate_outcomes GROUP BY source
            UNION ALL SELECT source, COUNT(*), 'programs' FROM dim_program GROUP BY source
            ORDER BY 2 DESC
        """))).fetchall()
    ]

    # ── 24. Institutions by Programs (top 20) ──
    enrollment_by_institution = [
        {"institution": r[0], "emirate": r[1] or "UAE", "sector": r[2] or "—",
         "programs": int(r[3]), "courses": int(r[4])}
        for r in (await db.execute(text("""
            SELECT i.name_en, i.emirate, i.institution_type,
                   COUNT(DISTINCT p.program_id) AS prog_count,
                   (SELECT COUNT(*) FROM dim_course c
                    WHERE c.institution_id = i.institution_id) AS course_count
            FROM dim_institution i
            JOIN dim_program p ON p.institution_id = i.institution_id
            GROUP BY i.institution_id, i.name_en, i.emirate, i.institution_type
            ORDER BY prog_count DESC
            LIMIT 20
        """))).fetchall()
    ]

    # ── 25. Graduate Employment Rates ──
    graduate_employment = [
        {"year": r[0], "avg_rate": round(float(r[1]), 1), "graduates_with_rate": int(r[2])}
        for r in (await db.execute(text(f"""
            SELECT year, AVG(employment_rate), COUNT(*)
            FROM fact_graduate_outcomes
            WHERE employment_rate IS NOT NULL AND employment_rate > 0 {ga}
            GROUP BY year ORDER BY year
        """), p)).fetchall()
    ]

    # ── 26. Graduate Credentials (degree level with counts + avg employment) ──
    graduate_credentials = [
        {"degree_level": r[0], "graduates": int(r[1]),
         "avg_employment_rate": round(float(r[2]), 1) if r[2] else None}
        for r in (await db.execute(text(f"""
            SELECT degree_level, SUM(graduate_count), AVG(employment_rate)
            FROM fact_graduate_outcomes
            WHERE degree_level IS NOT NULL AND graduate_count IS NOT NULL {ga}
            GROUP BY degree_level ORDER BY SUM(graduate_count) DESC
        """), p)).fetchall()
    ]

    # ── 27. Wage Distribution ──
    wage_distribution = []
    try:
        wage_distribution = [
            {"wage_band": r[0], "workers": int(r[1])}
            for r in (await db.execute(text("""
                SELECT wage_band, SUM(supply_count)
                FROM fact_supply_talent_agg
                WHERE wage_band IS NOT NULL
                GROUP BY wage_band ORDER BY SUM(supply_count) DESC
            """))).fetchall()
        ]
    except Exception:
        pass

    # ── 28. Private Sector Workforce Trend ──
    private_sector_trend = []
    try:
        private_sector_trend = [
            {"year": r[0], "isco_group": r[1], "workers": int(r[2])}
            for r in (await db.execute(text("""
                SELECT year, isco_major_group, SUM(supply_count)
                FROM vw_supply_talent
                WHERE sector ILIKE '%private%' AND isco_major_group IS NOT NULL
                GROUP BY year, isco_major_group
                ORDER BY year, SUM(supply_count) DESC
            """))).fetchall()
        ]
    except Exception:
        pass

    # ── 29. Enrollment Nationality by Institution (top 10 inst) ──
    enrollment_nationality_detail = [
        {"institution": r[0], "nationality": r[1], "enrollment": int(r[2])}
        for r in (await db.execute(text(f"""
            SELECT i.name_en, e.nationality, SUM(e.enrollment_count)
            FROM fact_program_enrollment e
            JOIN dim_institution i ON e.institution_id = i.institution_id
            WHERE e.enrollment_count IS NOT NULL AND e.nationality IS NOT NULL
              {ea.replace('region_code', 'e.region_code').replace('institution_id', 'e.institution_id') if ea else ''}
            GROUP BY i.name_en, e.nationality
            HAVING SUM(e.enrollment_count) > 0
            ORDER BY SUM(e.enrollment_count) DESC LIMIT 30
        """), p)).fetchall()
    ]

    result = {
        "kpis": {
            "total_institutions": inst_count,
            "total_programs": prog_count,
            "total_enrolled": total_enrolled,
            "total_graduates": total_graduates,
        },
        # Enrollment
        "enrollment_trend": enrollment_trend,
        "sector_trend": sector_trend,
        "by_emirate": by_emirate,
        "by_specialty": by_specialty,
        "by_gender": by_gender_enroll,
        "by_nationality": by_nationality_enroll,
        # Graduates
        "graduate_trend": grad_trend,
        "grad_by_specialty": grad_by_specialty,
        "grad_gender": grad_gender,
        "grad_nationality": grad_nationality,
        "grad_degree": grad_degree,
        "stem_split": stem_data,
        "uaeu_colleges": uaeu_colleges,
        # Programs
        "programs_by_field": programs_by_field,
        "programs_by_emirate": programs_by_emirate,
        "program_distribution": program_dist,
        # Institutions
        "institution_ranking": inst_ranking,
        # Skills
        "top_skills": top_skills,
        "skills_by_type": skills_by_type,
        "digital_skills": digital_skills,
        "knowledge_areas": knowledge_areas,
        "skills_kpis": {
            "total_skills": total_skills,
            "total_mappings": total_occ_skills,
            "essential_mappings": essential_mappings,
        },
        # New sections
        "enrollment_by_institution": enrollment_by_institution,
        "graduate_employment": graduate_employment,
        "graduate_credentials": graduate_credentials,
        "wage_distribution": wage_distribution,
        "private_sector_trend": private_sector_trend,
        "enrollment_nationality_detail": enrollment_nationality_detail,
        # Meta
        "sources": sources,
    }

    await cache.set(cache_key, result, ttl=3600)
    return result


@router.get("/data-explorer")
async def get_supply_data_explorer(
    table: str = Query("enrollment", description="enrollment, graduates, programs, institutions"),
    source: str | None = None,
    limit: int = 200,
    offset: int = 0,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Raw data explorer for supply-side tables with source filtering."""
    table_map = {
        "enrollment": "fact_program_enrollment",
        "graduates": "fact_graduate_outcomes",
        "programs": "dim_program",
        "institutions": "dim_institution",
    }
    if table not in table_map:
        return {"error": f"Invalid table. Choose from: {list(table_map.keys())}"}

    db_table = table_map[table]
    conds, params = [], {"lim": limit, "off": offset}
    if source:
        conds.append("source = :source"); params["source"] = source

    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    total = (await db.execute(text(f"SELECT COUNT(*) FROM {db_table}{where}"), params)).scalar() or 0
    rows = (await db.execute(text(f"SELECT * FROM {db_table}{where} LIMIT :lim OFFSET :off"), params)).fetchall()
    cols = [c[0] for c in (await db.execute(text(
        f"SELECT column_name FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position"
    ), {"t": db_table})).fetchall()]

    try:
        src_rows = (await db.execute(text(f"SELECT DISTINCT source FROM {db_table} WHERE source IS NOT NULL ORDER BY source"))).fetchall()
        available_sources = [r[0] for r in src_rows]
    except Exception:
        available_sources = []

    return {
        "table": table, "db_table": db_table, "columns": cols,
        "rows": [dict(zip(cols, r)) for r in rows],
        "total": total, "limit": limit, "offset": offset,
        "available_sources": available_sources,
    }
