"""Knowledge Base API — browse all database tables with categories, filters, and pagination."""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])

_SAFE_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")

TABLE_REGISTRY = {
    "Dimensions": {
        "dim_time": {
            "display_name": "Time Periods",
            "description": "Calendar dates 2015-2027 with week, month, quarter, year. Supply data covers 2015-2019, demand 2024-2026, future dates for forecasting.",
            "data_type": "generated", "source": "System generated calendar. Trimmed: removed pre-2015 and post-2027 dates.", "status": "complete — 4,748 days",
            "source_url": None,
        },
        "dim_region": {
            "display_name": "Regions & Emirates",
            "description": "7 UAE emirates with ISO codes.",
            "data_type": "official", "source": "Federal Competitiveness & Statistics Authority (FCSA)", "status": "complete",
            "source_url": "https://opendata.fcsc.gov.ae",
        },
        "dim_occupation": {
            "display_name": "Occupations",
            "description": "3,813 occupations with ISCO-08 codes, EN/AR titles from ESCO + AI-mapped.",
            "data_type": "official", "source": "EU ESCO Classification v1.2", "status": "complete",
            "source_url": "https://esco.ec.europa.eu/en/classification/occupation_main",
        },
        "dim_skill": {
            "display_name": "Skills",
            "description": "21,574 skills (ESCO 13,960 + O*NET 7,614) with types and reusability.",
            "data_type": "official", "source": "ESCO v1.2 Skills + O*NET v29.1", "status": "complete",
            "source_url": "https://esco.ec.europa.eu/en/classification/skills?uri=http://data.europa.eu/esco/skill/S",
        },
        "dim_sector": {
            "display_name": "Economic Sectors",
            "description": "34 ISIC Rev.4 industry sectors.",
            "data_type": "official", "source": "UN Statistics Division — ISIC Rev.4", "status": "complete",
            "source_url": "https://unstats.un.org/unsd/classifications/Econ/isic",
        },
        "dim_discipline": {
            "display_name": "Academic Disciplines",
            "description": "53 fields of study (ISCED-F 2013).",
            "data_type": "official", "source": "UNESCO Institute for Statistics — ISCED-F 2013", "status": "complete",
            "source_url": "https://uis.unesco.org/sites/default/files/documents/international-standard-classification-of-education-fields-of-education-and-training-2013-detailed-field-descriptions-2015-en.pdf",
        },
        "dim_institution": {
            "display_name": "Higher Education Institutions",
            "description": "168 UAE universities/colleges with emirate and accreditation status.",
            "data_type": "official+scraped", "source": "CAA Licensed Institutions + Bayanat HEI List", "status": "complete",
            "source_url": "https://www.caa.ae/Pages/Institutes/All.aspx",
        },
        "dim_course": {
            "display_name": "University Courses",
            "description": "19,196 courses from 100+ UAE universities with course codes, credit hours, descriptions, and program linkage.",
            "data_type": "official+scraped", "source": "UAE University Catalogs (PDF parsed) — 100+ institutions, 70 catalog PDFs", "status": "complete — 19,196 courses loaded",
            "source_url": None,
        },
        "dim_program": {
            "display_name": "Academic Programs",
            "description": "3,902 programs: 2,423 CAA-accredited + 1,010 web-scraped + 469 from university catalog PDFs.",
            "data_type": "official+scraped", "source": "CAA (2,423) + Web Scrape (1,010) + University Catalogs (469)", "status": "complete — 100+ universities covered",
            "source_url": "https://www.caa.ae/Pages/Programs/All.aspx",
        },
    },
    "Facts - Labour Market": {
        "fact_supply_talent_agg": {
            "display_name": "Labour Supply Aggregates",
            "description": "842K rows: EMPLOYED worker headcounts by emirate, gender, age group. This is census employment data — NOT available/unemployed workers. GLMM/MOHRE mega-aggregates moved to fact_workforce_totals.",
            "data_type": "official", "source": "Bayanat — MOHRE Employment + Economic Activity (124 CSVs). Cleaned: removed 315 aggregate rows to fact_workforce_totals.", "status": "complete — granular data only",
            "source_url": "https://bayanat.ae/en/dataset?groups=employment-labour",
        },
        "fact_demand_vacancies_agg": {
            "display_name": "Job Vacancies Aggregates",
            "description": "37K rows: individual job postings (each row = 1 posting, demand_count = 1). LinkedIn scrape 2024-2025 + JSearch API. MOHRE permits moved to fact_work_permits.",
            "data_type": "scraped", "source": "LinkedIn UAE scrape (36.9K postings) + JSearch API (248). Cleaned: removed 252 MOHRE work permits (not vacancies).", "status": "complete — clean job postings only",
            "source_url": "https://www.linkedin.com/jobs/search/?location=United%20Arab%20Emirates",
        },
    },
    "Facts - Unemployment & Labour Force": {
        "fact_unemployed": {
            "display_name": "Unemployment & Labour Force",
            "description": "510 rows: unemployment rates by age, gender, nationality, education, emirate + labour force participation rates.",
            "data_type": "official", "source": "Bayanat — Unemployment rates + Labour force participation (9 CSV files)", "status": "complete — 2001-2016 coverage",
            "source_url": "https://bayanat.ae/en/dataset?groups=employment-labour",
        },
        "fact_work_permits": {
            "display_name": "MOHRE Work Permits",
            "description": "252 rows: work permits issued per emirate/sector. NOT job vacancies — these are permits for incoming workers.",
            "data_type": "official", "source": "MOHRE — Work permits issued (separated from job postings for accuracy)", "status": "complete — clearly separated from job vacancies",
            "source_url": None,
        },
        "fact_workforce_totals": {
            "display_name": "Workforce Totals (Reference)",
            "description": "315 rows: total workforce per emirate from GLMM/MOHRE. Large aggregate numbers (up to 643K per emirate). Reference only — NOT for per-occupation analysis.",
            "data_type": "official", "source": "GLMM + MOHRE 2023-2024 aggregate workforce data", "status": "complete — separated from granular supply data",
            "source_url": None,
        },
    },
    "Facts - Education": {
        "fact_supply_graduates": {
            "display_name": "Graduate Counts",
            "description": "4,230 rows: annual graduates by institution, discipline, gender, nationality (2010-2024).",
            "data_type": "official", "source": "Bayanat — Higher Education Graduates datasets", "status": "complete",
            "source_url": "https://bayanat.ae/en/dataset?groups=education",
        },
        "fact_program_enrollment": {
            "display_name": "Program Enrollment",
            "description": "668 rows: enrollment by specialty/emirate/sector. 654 actual + 8 estimated.",
            "data_type": "official+estimated", "source": "Bayanat Education (654) + SCAD Abu Dhabi (3) + CEIC (3) + Estimated (8)", "status": "partial — 2018-2024 mostly estimated",
            "source_url": "https://bayanat.ae/en/dataset?groups=education",
        },
        "fact_graduate_outcomes": {
            "display_name": "Graduate Outcomes",
            "description": "4,134 rows: graduate counts by institution. Employment rates for ZU/HCT only.",
            "data_type": "official", "source": "Bayanat — Graduate Outcomes by Institution", "status": "partial — employment rates only for 2 institutions",
            "source_url": "https://bayanat.ae/en/dataset?groups=education",
        },
        "fact_education_stats": {
            "display_name": "Education Statistics",
            "description": "Macro education indicators — enrollment ratios, completion rates.",
            "data_type": "not loaded", "source": "395 CSVs available in _master_tables/10_bayanat_education/", "status": "EMPTY — raw CSVs exist but not loaded",
            "source_url": "https://bayanat.ae/en/dataset?groups=education",
        },
        "fact_population_stats": {
            "display_name": "Population Statistics",
            "description": "Population by emirate, nationality, gender, age group.",
            "data_type": "not loaded", "source": "92 CSVs available in _master_tables/11_bayanat_population/", "status": "EMPTY — raw CSVs exist but not loaded",
            "source_url": "https://bayanat.ae/en/dataset?groups=population",
        },
        "fact_wage_hours": {
            "display_name": "Wages & Working Hours",
            "description": "Average wages and working hours by sector/occupation/nationality.",
            "data_type": "not loaded", "source": "Wage data exists in Bayanat employment CSVs", "status": "EMPTY — needs extraction from raw CSVs",
            "source_url": "https://bayanat.ae/en/dataset?groups=employment-labour",
        },
    },
    "Facts - AI & Skills": {
        "fact_ai_exposure_occupation": {
            "display_name": "AI Exposure by Occupation",
            "description": "1,548 scores: AIOE (774 occupations) + Frey-Osborne automation probabilities (774).",
            "data_type": "research", "source": "AIOE: Felten et al. (Science, 2023) + Frey & Osborne (Oxford, 2017)", "status": "complete",
            "source_url": "https://www.science.org/doi/10.1126/science.adf6369",
        },
        "fact_occupation_skills": {
            "display_name": "Occupation–Skill Mappings",
            "description": "321K rows: essential + optional skills per occupation.",
            "data_type": "official", "source": "ESCO v1.2 Occupation-Skill Relations", "status": "complete",
            "source_url": "https://esco.ec.europa.eu/en/use-esco/download",
        },
        "fact_course_skills": {
            "display_name": "Course–Skill Mappings",
            "description": "24.8K rows: 19,196 university courses mapped to ESCO skills via token matching (top 5 per course).",
            "data_type": "official+generated", "source": "19K course names + descriptions token-matched against 21K ESCO skill labels", "status": "complete — from 100+ university catalogs",
            "source_url": "https://www.caa.ae/Pages/Programs/All.aspx",
        },
        "fact_job_skills": {
            "display_name": "Job–Skill Mappings",
            "description": "3M rows: skills required per job posting, inherited from ESCO occupation-skill mappings for each LinkedIn job.",
            "data_type": "official+generated", "source": "ESCO occupation-skill mappings inherited for 35.7K LinkedIn jobs via occupation_id", "status": "complete — 13,084 unique skills across 35,671 jobs",
            "source_url": "https://esco.ec.europa.eu/en/use-esco/download",
        },
        "fact_forecast": {
            "display_name": "Demand Forecasts",
            "description": "Model-generated forecasts using ETS + Linear Trend from historical data.",
            "data_type": "model-generated", "source": "Observator Forecasting Engine (statsmodels ETS)", "status": "minimal — run /api/forecasts/batch",
            "source_url": None,
        },
    },
    "O*NET Database": {
        "dim_onet_occupation": {
            "display_name": "O*NET Occupations",
            "description": "1,016 SOC-coded US occupations with titles and detailed descriptions.",
            "data_type": "official", "source": "O*NET Resource Center — v29.1 Database", "status": "complete",
            "source_url": "https://www.onetcenter.org/database.html#individual-files",
        },
        "fact_onet_skills": {
            "display_name": "O*NET Skills",
            "description": "58K rows: importance + level ratings for 35 skills across 1,016 occupations.",
            "data_type": "official", "source": "O*NET v29.1 — Skills.csv", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/skills.html",
        },
        "fact_onet_knowledge": {
            "display_name": "O*NET Knowledge",
            "description": "51K rows: importance + level ratings for 33 knowledge domains.",
            "data_type": "official", "source": "O*NET v29.1 — Knowledge.csv", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/knowledge.html",
        },
        "fact_onet_technology_skills": {
            "display_name": "O*NET Technology Skills",
            "description": "32K rows: software/tools per occupation, 11K flagged as 'hot technology'.",
            "data_type": "official", "source": "O*NET v29.1 — Technology Skills + Hot Technology", "status": "complete",
            "source_url": "https://www.onetonline.org/find/hot_technology",
        },
        "fact_onet_alternate_titles": {
            "display_name": "O*NET Alternate Titles",
            "description": "55K rows: alternative/colloquial job titles mapped to SOC codes.",
            "data_type": "official", "source": "O*NET v29.1 — Alternate Titles.csv", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/alternate_titles.html",
        },
        "fact_onet_task_statements": {
            "display_name": "O*NET Task Statements",
            "description": "18K rows: detailed task descriptions per occupation.",
            "data_type": "official", "source": "O*NET v29.1 — Task Statements.csv", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/task_statements.html",
        },
        "fact_onet_emerging_tasks": {
            "display_name": "O*NET Emerging Tasks",
            "description": "240 new tasks being adopted by occupations (future skills signals).",
            "data_type": "official", "source": "O*NET New & Emerging (N&E) Tasks Database", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/emerging_tasks.html",
        },
        "fact_onet_related_occupations": {
            "display_name": "O*NET Related Occupations",
            "description": "18K rows: career transition pathways between related occupations.",
            "data_type": "official", "source": "O*NET v29.1 — Related Occupations.csv", "status": "complete",
            "source_url": "https://www.onetcenter.org/dictionary/29.1/excel/related_occupations.html",
        },
    },
    "Crosswalks & Lookups": {
        "crosswalk_soc_isco": {
            "display_name": "SOC–ISCO Crosswalk",
            "description": "1,126 mappings between US SOC codes and international ISCO-08 codes.",
            "data_type": "official", "source": "US BLS / ILO crosswalk table", "status": "complete",
            "source_url": "https://www.bls.gov/soc/soccrosswalks.htm",
        },
        "sdmx_code_lookup": {
            "display_name": "SDMX Code Lookup",
            "description": "Statistical Data and Metadata eXchange code mappings.",
            "data_type": "official", "source": "SDMX standard codes", "status": "complete",
            "source_url": None,
        },
        "fact_salary_benchmark": {
            "display_name": "Salary Benchmarks",
            "description": "71 salary ranges by occupation and emirate (min/median/max AED).",
            "data_type": "scraped", "source": "Glassdoor salary data", "status": "complete",
            "source_url": "https://www.glassdoor.com/Salaries/uae-salary-SRCH_IL.0,3_IN6.htm",
        },
    },
    "Materialized Views": {
        "vw_supply_talent": {
            "display_name": "Supply Talent View",
            "description": "Aggregated labour supply by year, emirate, occupation, gender, age, nationality.",
            "data_type": "generated", "source": "Derived from fact_supply_talent_agg + dim tables", "status": "complete — refreshed every 6 hours",
            "source_url": None,
        },
        "vw_demand_jobs": {
            "display_name": "Demand Jobs View",
            "description": "Aggregated job vacancies by year, emirate, occupation, experience.",
            "data_type": "generated", "source": "Derived from fact_demand_vacancies_agg + dim tables", "status": "complete — refreshed every 6 hours",
            "source_url": None,
        },
        "vw_gap_cube": {
            "display_name": "Supply-Demand Gap Cube",
            "description": "THE CORE VIEW — supply vs demand per occupation with gap, SGI, skill counts, AI exposure.",
            "data_type": "generated", "source": "FULL OUTER JOIN of vw_supply_talent × vw_demand_jobs + skills + AI", "status": "complete — 2,726 occupation-level gaps",
            "source_url": None,
        },
        "vw_skill_gap": {
            "display_name": "Skill Gap View",
            "description": "Skill-level supply vs demand — which skills are demanded but not taught.",
            "data_type": "generated", "source": "Derived from fact_job_skills × fact_course_skills × dim_skill", "status": "complete — 13,084 skill gaps",
            "source_url": None,
        },
        "vw_ai_impact": {
            "display_name": "AI Impact View",
            "description": "AI exposure scores joined with occupation details.",
            "data_type": "generated", "source": "Derived from fact_ai_exposure_occupation × dim_occupation", "status": "complete — 1,200 occupations",
            "source_url": None,
        },
        "vw_supply_education": {
            "display_name": "Supply Education View",
            "description": "Graduate pipeline by year, institution, discipline.",
            "data_type": "generated", "source": "Derived from fact_supply_graduates + dim tables", "status": "complete",
            "source_url": None,
        },
        "vw_forecast_demand": {
            "display_name": "Forecast Demand View",
            "description": "Demand forecasts by occupation with confidence intervals.",
            "data_type": "generated", "source": "Derived from fact_forecast + dim tables", "status": "minimal",
            "source_url": None,
        },
    },
    "System": {
        "dataset_registry": {
            "display_name": "Dataset Registry",
            "description": "Pipeline metadata — which datasets were loaded and when.",
            "data_type": "system", "source": "Observator Data Pipeline", "status": "complete",
            "source_url": None,
        },
        "evidence_store": {
            "display_name": "Evidence Store",
            "description": "Citations used by the AI agent to ground its responses in verified data.",
            "data_type": "system", "source": "Observator AI Agent", "status": "complete",
            "source_url": None,
        },
        "users": {
            "display_name": "Users",
            "description": "Platform user accounts with roles (ADMIN, ANALYST, EXECUTIVE).",
            "data_type": "system", "source": "Observator Auth System", "status": "complete",
            "source_url": None,
        },
        "chat_sessions": {
            "display_name": "Chat Sessions",
            "description": "AI assistant conversation sessions.",
            "data_type": "system", "source": "Observator AI Agent", "status": "complete",
            "source_url": None,
        },
        "chat_messages": {
            "display_name": "Chat Messages",
            "description": "Individual messages within chat sessions with citations.",
            "data_type": "system", "source": "Observator AI Agent", "status": "complete",
            "source_url": None,
        },
        "audit_log": {
            "display_name": "Audit Log",
            "description": "User action audit trail — who did what and when.",
            "data_type": "system", "source": "Observator Platform", "status": "complete",
            "source_url": None,
        },
        "pipeline_runs": {
            "display_name": "Pipeline Runs",
            "description": "Data pipeline execution history and status.",
            "data_type": "system", "source": "Observator Pipeline", "status": "complete",
            "source_url": None,
        },
        "notifications": {
            "display_name": "Notifications",
            "description": "System notifications for users.",
            "data_type": "system", "source": "Observator Platform", "status": "complete",
            "source_url": None,
        },
    },
}

ALLOWED_TABLES: set[str] = set()
for tables in TABLE_REGISTRY.values():
    ALLOWED_TABLES.update(tables.keys())

# FK relationships: { (from_table, from_column) → (to_table, to_column) }
FK_MAP: dict[str, dict[str, tuple[str, str]]] = {
    "fact_supply_talent_agg": {"time_id": ("dim_time", "time_id"), "region_code": ("dim_region", "region_code"), "occupation_id": ("dim_occupation", "occupation_id"), "sector_id": ("dim_sector", "sector_id")},
    "fact_demand_vacancies_agg": {"time_id": ("dim_time", "time_id"), "region_code": ("dim_region", "region_code"), "occupation_id": ("dim_occupation", "occupation_id"), "sector_id": ("dim_sector", "sector_id")},
    "fact_supply_graduates": {"institution_id": ("dim_institution", "institution_id"), "discipline_id": ("dim_discipline", "discipline_id"), "region_code": ("dim_region", "region_code")},
    "fact_program_enrollment": {"institution_id": ("dim_institution", "institution_id"), "program_id": ("dim_program", "program_id"), "region_code": ("dim_region", "region_code")},
    "fact_graduate_outcomes": {"institution_id": ("dim_institution", "institution_id"), "region_code": ("dim_region", "region_code")},
    "fact_ai_exposure_occupation": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_occupation_skills": {"occupation_id": ("dim_occupation", "occupation_id"), "skill_id": ("dim_skill", "skill_id")},
    "fact_course_skills": {"skill_id": ("dim_skill", "skill_id"), "course_id": ("dim_course", "course_id")},
    "dim_course": {"institution_id": ("dim_institution", "institution_id")},
    "fact_job_skills": {"demand_id": ("fact_demand_vacancies_agg", "id"), "skill_id": ("dim_skill", "skill_id")},
    "fact_forecast": {"occupation_id": ("dim_occupation", "occupation_id"), "region_code": ("dim_region", "region_code"), "sector_id": ("dim_sector", "sector_id")},
    "fact_salary_benchmark": {"region_code": ("dim_region", "region_code")},
    "fact_onet_skills": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_knowledge": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_technology_skills": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_alternate_titles": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_task_statements": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_emerging_tasks": {"occupation_id": ("dim_occupation", "occupation_id")},
    "fact_onet_related_occupations": {"occupation_id": ("dim_occupation", "occupation_id"), "related_occupation_id": ("dim_occupation", "occupation_id")},
    "dim_onet_occupation": {"occupation_id": ("dim_occupation", "occupation_id")},
    "dim_program": {"institution_id": ("dim_institution", "institution_id"), "discipline_id": ("dim_discipline", "discipline_id")},
    "chat_sessions": {"user_id": ("users", "user_id")},
    "chat_messages": {"session_id": ("chat_sessions", "session_id")},
    "evidence_store": {"dataset_id": ("dataset_registry", "dataset_id")},
}


def _validate_identifier(name: str) -> str:
    if not _SAFE_IDENT.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid identifier: {name}")
    return name


def _get_table_category(table_name: str) -> str:
    for category, tables in TABLE_REGISTRY.items():
        if table_name in tables:
            return category
    return "Unknown"


@router.get("/tables")
async def list_tables(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all browsable tables grouped by category with row and column counts."""
    categories = {}

    for category, tables in TABLE_REGISTRY.items():
        category_tables = []
        for table_name, meta in tables.items():
            row_count = 0
            column_count = 0
            try:
                count_result = await db.execute(
                    text(f"SELECT COUNT(*) FROM {table_name}")
                )
                row_count = count_result.scalar() or 0
            except Exception:
                pass

            try:
                col_result = await db.execute(
                    text(
                        "SELECT COUNT(*) FROM information_schema.columns "
                        "WHERE table_schema = 'public' AND table_name = :tbl"
                    ),
                    {"tbl": table_name},
                )
                column_count = col_result.scalar() or 0
                # Fallback for materialized views (not in information_schema)
                if column_count == 0:
                    col_result = await db.execute(
                        text(
                            "SELECT COUNT(*) FROM pg_attribute a "
                            "JOIN pg_class c ON a.attrelid = c.oid "
                            "WHERE c.relname = :tbl AND a.attnum > 0 AND NOT a.attisdropped"
                        ),
                        {"tbl": table_name},
                    )
                    column_count = col_result.scalar() or 0
            except Exception:
                pass

            category_tables.append({
                "name": table_name,
                "display_name": meta["display_name"],
                "description": meta["description"],
                "row_count": row_count,
                "column_count": column_count,
                "category": category,
                "data_type": meta.get("data_type", "unknown"),
                "source": meta.get("source", ""),
                "status": meta.get("status", ""),
                "source_url": meta.get("source_url"),
            })

        categories[category] = category_tables

    return {"categories": categories}


@router.get("/browse")
async def browse_table(
    table: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    sort: str | None = None,
    search: str | None = None,
    filters: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse a specific table with pagination, sorting, search, and column filters.

    Query params:
      - table: table name (required, must be in whitelist)
      - limit: rows per page (default 50, max 500)
      - offset: row offset for pagination
      - sort: column name; prefix with - for descending (e.g. -created_at)
      - search: free-text search across text/varchar columns
      - filters: JSON string of {column: value} pairs for exact-match filtering
    """
    if table not in ALLOWED_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Table '{table}' is not browsable. Allowed: {', '.join(sorted(ALLOWED_TABLES))}",
        )

    # Fetch column metadata for this table
    col_meta_result = await db.execute(
        text(
            "SELECT column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :tbl "
            "ORDER BY ordinal_position"
        ),
        {"tbl": table},
    )
    col_rows = col_meta_result.fetchall()
    # Fallback for materialized views
    if not col_rows:
        col_meta_result = await db.execute(
            text(
                "SELECT a.attname, format_type(a.atttypid, a.atttypmod) "
                "FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid "
                "WHERE c.relname = :tbl AND a.attnum > 0 AND NOT a.attisdropped "
                "ORDER BY a.attnum"
            ),
            {"tbl": table},
        )
        col_rows = col_meta_result.fetchall()
    if not col_rows:
        raise HTTPException(status_code=404, detail=f"Table '{table}' not found in database")

    column_info = [{"name": row[0], "type": row[1]} for row in col_rows]
    column_names = {row[0] for row in col_rows}
    text_columns = [
        row[0]
        for row in col_rows
        if row[1] in ("text", "character varying", "varchar", "name", "citext")
    ]

    # Build WHERE clause
    conditions = []
    params: dict = {}
    param_idx = 0

    if search and text_columns:
        or_parts = []
        for col in text_columns[:5]:
            pname = f"s{param_idx}"
            or_parts.append(f"{col} ILIKE :{pname}")
            params[pname] = f"%{search}%"
            param_idx += 1
        conditions.append(f"({' OR '.join(or_parts)})")

    if filters:
        try:
            filter_dict = json.loads(filters)
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid filters JSON")

        for col_key, val in filter_dict.items():
            safe_col = _validate_identifier(col_key)
            if safe_col not in column_names:
                continue
            pname = f"f{param_idx}"
            if isinstance(val, list):
                placeholders = ", ".join(f":f{param_idx + i}" for i in range(len(val)))
                conditions.append(f"{safe_col} IN ({placeholders})")
                for i, v in enumerate(val):
                    params[f"f{param_idx + i}"] = v
                param_idx += len(val)
            else:
                conditions.append(f"{safe_col} = :{pname}")
                params[pname] = val
                param_idx += 1

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    # ORDER BY
    order_by = ""
    if sort:
        if sort.startswith("-"):
            order_by = f" ORDER BY {_validate_identifier(sort[1:])} DESC"
        else:
            order_by = f" ORDER BY {_validate_identifier(sort)}"

    # Total count
    count_sql = f"SELECT COUNT(*) FROM {table}{where}"
    try:
        total = (await db.execute(text(count_sql), params)).scalar() or 0
    except Exception:
        total = 0

    # Fetch page
    data_sql = f"SELECT * FROM {table}{where}{order_by} LIMIT :_limit OFFSET :_offset"
    params["_limit"] = limit
    params["_offset"] = offset

    try:
        result = await db.execute(text(data_sql), params)
        rows = result.fetchall()
        keys = list(result.keys())
    except Exception as e:
        logger.error(f"Knowledge base browse error on {table}: {e}")
        raise HTTPException(status_code=400, detail=f"Query error: {str(e)[:200]}")

    row_dicts = [dict(zip(keys, row)) for row in rows]

    # Serialize non-JSON-safe types
    for row in row_dicts:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
            elif isinstance(v, bytes):
                row[k] = v.hex()

    # Build FK relationship info for this table
    fk_info = {}
    table_fks = FK_MAP.get(table, {})
    for col, (target_table, target_col) in table_fks.items():
        if target_table in ALLOWED_TABLES:
            fk_info[col] = {"table": target_table, "column": target_col}

    return {
        "table": table,
        "columns": column_info,
        "rows": row_dicts,
        "total": total,
        "limit": limit,
        "offset": offset,
        "relationships": fk_info,
    }


@router.get("/stats")
async def knowledge_base_stats(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Overall knowledge base statistics: total tables, total rows, per-category breakdown."""
    total_tables = len(ALLOWED_TABLES)
    total_rows = 0
    categories_breakdown = {}

    for category, tables in TABLE_REGISTRY.items():
        cat_rows = 0
        cat_tables = 0
        for table_name in tables:
            try:
                count_result = await db.execute(
                    text(f"SELECT COUNT(*) FROM {table_name}")
                )
                row_count = count_result.scalar() or 0
            except Exception:
                row_count = 0
            cat_rows += row_count
            cat_tables += 1

        categories_breakdown[category] = {
            "table_count": cat_tables,
            "row_count": cat_rows,
        }
        total_rows += cat_rows

    return {
        "total_tables": total_tables,
        "total_rows": total_rows,
        "categories": categories_breakdown,
    }
