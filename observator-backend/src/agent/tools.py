"""Agent tools — the actions the LLM can take.

Each tool queries the warehouse views via the QueryPlan compiler,
then executes the SQL and returns actual data to the LLM.
Internet search tools (Tavily + DuckDuckGo fallback) are conditionally available.
"""
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from sqlalchemy import text

from src.query_compiler.compiler import (
    CompilationError,
    compile_query_plan,
    get_view_tool_descriptions,
    suggest_view,
)
from src.query_compiler.schema_registry import VIEW_SCHEMAS

logger = logging.getLogger(__name__)

# Shared DB session — set by executor before running the agent
_db_session = None
# Current chat session_id — set by executor so query_chat_files knows which files to query
_current_session_id: str | None = None


def set_current_session_id(sid: str | None):
    global _current_session_id
    _current_session_id = sid

ALLOWED_VIEWS = {
    "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
    "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    "vw_skills_taxonomy", "vw_education_pipeline",
    "vw_population_demographics", "vw_occupation_transitions",
    # Supply dashboard tables
    "fact_program_enrollment", "fact_graduate_outcomes",
    "dim_program", "dim_institution",
}
SAFE_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")
SUM_COLUMNS = {
    "supply_count", "demand_count", "gap_abs", "predicted_demand",
    "predicted_supply", "predicted_gap", "graduates_count",
    "total_count", "population", "onet_importance",
    "enrollment_count", "graduate_count",
}
AVG_COLUMNS = {
    "exposure_0_100", "automation_probability", "llm_exposure",
    "ai_exposure_score", "sgi",
}
AGG_COLUMNS = SUM_COLUMNS | AVG_COLUMNS


def set_db_session(db):
    """Set the DB session for tools to use. Called by executor before agent.ainvoke()."""
    global _db_session
    _db_session = db


def _jsonable(v):
    """Convert DB types to JSON-serializable primitives."""
    if isinstance(v, Decimal):
        return float(v)
    return v


async def _run_query(plan_dict: dict) -> list[dict]:
    """Execute a compiled query plan against the database and return rows."""
    from src.config import settings

    view = plan_dict.get("view", "")
    if view not in ALLOWED_VIEWS:
        raise ValueError(f"Invalid view: {view}")

    group_by_cols = set(plan_dict.get("group_by", []))
    columns = list(plan_dict.get("columns", []))

    # Auto-fix: wrap aggregatable columns in SUM/AVG when GROUP BY is present
    if group_by_cols and columns:
        fixed = []
        for c in columns:
            if "(" in c:
                fixed.append(c)
            elif c in group_by_cols:
                fixed.append(c)
            elif c in AVG_COLUMNS:
                fixed.append(f"ROUND(AVG({c})::numeric, 2) AS {c}")
            elif c in SUM_COLUMNS:
                fixed.append(f"SUM({c}) AS {c}")
            # skip non-grouped, non-aggregatable columns
        columns = fixed

    if columns:
        cols = ", ".join(
            c for c in columns
            if SAFE_IDENT.match(c.split("(")[-1].split(" ")[-1].rstrip(")"))
        )
        if not cols:
            cols = "*"
    else:
        cols = "*"

    # Build WHERE
    conditions = []
    params = {}
    idx = 0
    for col_key, val in plan_dict.get("filters", {}).items():
        if "__" in col_key:
            base_col, op = col_key.rsplit("__", 1)
        else:
            base_col, op = col_key, "eq"
        if not SAFE_IDENT.match(base_col):
            continue
        pname = f"p{idx}"
        if op == "eq":
            if isinstance(val, list):
                phs = ", ".join(f":p{idx + i}" for i in range(len(val)))
                conditions.append(f"{base_col} IN ({phs})")
                for i, v in enumerate(val):
                    params[f"p{idx + i}"] = v
                idx += len(val)
            else:
                conditions.append(f"{base_col} = :{pname}")
                params[pname] = val
                idx += 1
        elif op == "gte":
            conditions.append(f"{base_col} >= :{pname}")
            params[pname] = val
            idx += 1
        elif op == "lte":
            conditions.append(f"{base_col} <= :{pname}")
            params[pname] = val
            idx += 1
        elif op == "like":
            conditions.append(f"{base_col} ILIKE :{pname}")
            params[pname] = f"%{val}%"
            idx += 1

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    # GROUP BY
    group_by = ""
    if plan_dict.get("group_by"):
        group_by = " GROUP BY " + ", ".join(
            c for c in plan_dict["group_by"] if SAFE_IDENT.match(c)
        )

    # ORDER BY
    order_by = ""
    if plan_dict.get("order_by"):
        parts = []
        for o in plan_dict["order_by"]:
            desc = o.startswith("-")
            bare = o[1:] if desc else o
            if not SAFE_IDENT.match(bare):
                continue
            if group_by_cols and bare in AGG_COLUMNS and bare not in group_by_cols:
                expr = f"AVG({bare})" if bare in AVG_COLUMNS else f"SUM({bare})"
            else:
                expr = bare
            parts.append(f"{expr} DESC" if desc else expr)
        if parts:
            order_by = " ORDER BY " + ", ".join(parts)

    limit = min(plan_dict.get("limit", 100), settings.MAX_QUERY_LIMIT)
    sql = f"SELECT {cols} FROM {view}{where}{group_by}{order_by} LIMIT {limit}"
    logger.info(f"Executing agent query: {sql}")

    result = await _db_session.execute(text(sql), params)
    rows = result.fetchall()
    keys = result.keys()
    return [{k: _jsonable(v) for k, v in zip(keys, row)} for row in rows]


class QueryInput(BaseModel):
    """Input schema for the query_warehouse tool."""
    intent: str = Field(description="Natural language description of what data to retrieve")
    view: str | None = Field(default=None, description="Materialized view name. If not provided, auto-selected from intent.")
    columns: list[str] = Field(default_factory=list, description="Columns to select (empty = all)")
    filters: dict = Field(default_factory=dict, description="Filter conditions: {column: value} or {column: [values]}")
    group_by: list[str] = Field(default_factory=list, description="Columns to group by")
    order_by: list[str] = Field(default_factory=list, description="Columns to order by (prefix - for DESC)")
    limit: int = Field(default=50, description="Max rows to return")


@tool(args_schema=QueryInput)
async def query_warehouse(
    intent: str,
    view: str | None = None,
    columns: list[str] | None = None,
    filters: dict | None = None,
    group_by: list[str] | None = None,
    order_by: list[str] | None = None,
    limit: int = 50,
) -> str:
    """Query the UAE labour market data warehouse and return actual data.

    Use this tool to retrieve supply/demand data, skill gaps, AI exposure scores,
    forecasts, graduate data, or gap analysis. The data comes from 6 materialized views:
    - vw_supply_talent: workforce supply by region, occupation, sector, demographics
    - vw_demand_jobs: job vacancies by region, occupation, sector
    - vw_supply_education: graduate pipeline by institution, discipline
    - vw_ai_impact: AI/automation exposure scores per occupation
    - vw_gap_cube: supply vs demand gap analysis with AI exposure
    - vw_forecast_demand: demand/supply forecasts with confidence intervals

    Returns JSON array of data rows.
    """
    if _db_session is None:
        return "Error: Database session not available."

    # Auto-select view if not provided
    if not view:
        view = suggest_view(intent)
        logger.info(f"Auto-selected view '{view}' for intent: {intent}")

    try:
        plan = compile_query_plan(
            view=view,
            columns=columns or [],
            filters=filters or {},
            group_by=group_by or [],
            order_by=order_by or [],
            limit=limit,
        )
    except CompilationError as e:
        return f"Query compilation error: {e}"

    plan_dict = {
        "view": plan.view,
        "columns": plan.columns,
        "filters": plan.filters,
        "group_by": plan.group_by,
        "order_by": plan.order_by,
        "limit": plan.limit,
    }

    try:
        data = await _run_query(plan_dict)
        return json.dumps({
            "status": "ok",
            "view": view,
            "row_count": len(data),
            "data": data,
        }, default=str)
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        # Rollback the failed transaction so subsequent queries can proceed
        try:
            await _db_session.rollback()
        except Exception as rb_err:
            logger.warning(f"Rollback failed: {rb_err}")
        return f"Query execution error: {e}"


class ListViewsInput(BaseModel):
    """No input required."""
    pass


@tool(args_schema=ListViewsInput)
async def list_available_views() -> str:
    """List all available data warehouse views and their columns.
    Use this to understand what data is available before querying."""
    return get_view_tool_descriptions()


class GetViewSchemaInput(BaseModel):
    view_name: str = Field(description="Name of the view to get schema for")


@tool(args_schema=GetViewSchemaInput)
async def get_view_schema(view_name: str) -> str:
    """Get detailed schema for a specific view, including column types and descriptions."""
    schema = VIEW_SCHEMAS.get(view_name)
    if not schema:
        return f"Unknown view '{view_name}'. Available: {', '.join(VIEW_SCHEMAS.keys())}"
    return schema.to_tool_description()


# ── Redis cache helpers for search results ────────────────────────────────────

SEARCH_CACHE_TTL = 21600  # 6 hours


async def _cached_search(query: str) -> str | None:
    """Check Redis for a cached search result (6h TTL)."""
    try:
        import redis.asyncio as aioredis
        from src.config import settings
        r = aioredis.from_url(settings.REDIS_URL)
        key = f"search:{hashlib.md5(query.encode()).hexdigest()}"
        cached = await r.get(key)
        await r.aclose()
        if cached:
            return cached.decode()
    except Exception as e:
        logger.debug(f"Redis cache miss/error: {e}")
    return None


async def _cache_result(query: str, result: str) -> None:
    """Store search result in Redis with 6h TTL."""
    try:
        import redis.asyncio as aioredis
        from src.config import settings
        r = aioredis.from_url(settings.REDIS_URL)
        key = f"search:{hashlib.md5(query.encode()).hexdigest()}"
        await r.setex(key, SEARCH_CACHE_TTL, result)
        await r.aclose()
    except Exception as e:
        logger.debug(f"Redis cache write error: {e}")


# ── Internet search tools ─────────────────────────────────────────────────────

async def _tavily_search(query: str, topic: str = "general", max_results: int = 5) -> list[dict]:
    """Run a Tavily search, returning structured results."""
    from src.config import settings
    from tavily import AsyncTavilyClient
    client = AsyncTavilyClient(api_key=settings.TAVILY_API_KEY)
    response = await client.search(
        query=query,
        topic=topic,
        max_results=max_results,
        include_answer=True,
    )
    results = []
    for r in response.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
        })
    return results


async def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    """DuckDuckGo fallback search (free, no API key). Uses ddgs package."""
    from ddgs import DDGS
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, region="wt-wt", max_results=max_results):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "content": r.get("body", ""),
            })
    return results


class SearchWebInput(BaseModel):
    query: str = Field(description="Search query for finding current information about UAE labour market, job trends, policy changes, or any topic not in the data warehouse.")


@tool(args_schema=SearchWebInput)
async def search_web(query: str) -> str:
    """Search the internet for current information about UAE labour market,
    job trends, policy changes, or any topic not in the data warehouse.
    Returns top results with title, URL, and content snippet."""
    # Check cache first
    cached = await _cached_search(f"web:{query}")
    if cached:
        return cached

    from src.config import settings
    retrieved_at = datetime.now(timezone.utc).isoformat()

    try:
        if settings.TAVILY_API_KEY:
            results = await _tavily_search(query)
        else:
            results = await _ddg_search(query)
    except Exception as e:
        logger.warning(f"Primary search failed, trying DuckDuckGo fallback: {e}")
        try:
            results = await _ddg_search(query)
        except Exception as e2:
            return f"Search failed: {e2}"

    output = json.dumps({
        "source_type": "web_search",
        "retrieved_at": retrieved_at,
        "query": query,
        "result_count": len(results),
        "results": results,
    }, default=str)

    await _cache_result(f"web:{query}", output)
    return output


class SearchUAEJobsInput(BaseModel):
    job_title: str = Field(description="Job title or role to search for (e.g. 'Data Scientist', 'AI Engineer')")
    location: str = Field(default="UAE", description="Location to search in (default: UAE)")


@tool(args_schema=SearchUAEJobsInput)
async def search_uae_jobs(job_title: str, location: str = "UAE") -> str:
    """Search for current job postings, salaries, and hiring trends in the UAE.
    Use this for live labour market intelligence beyond the data warehouse."""
    query = f"{job_title} jobs {location} salary hiring 2026"

    cached = await _cached_search(f"jobs:{query}")
    if cached:
        return cached

    from src.config import settings
    retrieved_at = datetime.now(timezone.utc).isoformat()

    try:
        if settings.TAVILY_API_KEY:
            results = await _tavily_search(query, topic="news", max_results=5)
        else:
            results = await _ddg_search(query, max_results=5)
    except Exception as e:
        logger.warning(f"Job search failed, trying DuckDuckGo fallback: {e}")
        try:
            results = await _ddg_search(query, max_results=5)
        except Exception as e2:
            return f"Job search failed: {e2}"

    output = json.dumps({
        "source_type": "job_search",
        "retrieved_at": retrieved_at,
        "query": query,
        "job_title": job_title,
        "location": location,
        "result_count": len(results),
        "results": results,
    }, default=str)

    await _cache_result(f"jobs:{query}", output)
    return output


# Whitelisted domains for fetch_webpage
ALLOWED_FETCH_DOMAINS = [
    "gov.ae", "mohre.gov.ae", "scad.gov.ae", "statistics.gov.ae",
    "u.ae", "bayanat.ae",
    "linkedin.com", "bayt.com", "gulftalent.com", "naukrigulf.com",
    "indeed.com", "glassdoor.com",
    "weforum.org", "ilo.org", "worldbank.org",
    "reuters.com", "bloomberg.com",
    "zawya.com", "arabianbusiness.com", "thenationalnews.com",
]


class FetchWebpageInput(BaseModel):
    url: str = Field(description="The URL to fetch content from. Must be from a whitelisted domain.")


@tool(args_schema=FetchWebpageInput)
async def fetch_webpage(url: str) -> str:
    """Fetch and extract clean text from a URL found in search results.
    Use to get deeper details from a relevant page. Only whitelisted domains are allowed."""
    from urllib.parse import urlparse
    domain = urlparse(url).hostname or ""

    if not any(domain == d or domain.endswith(f".{d}") for d in ALLOWED_FETCH_DOMAINS):
        return f"Error: Domain '{domain}' is not in the allowed list. Allowed: {', '.join(ALLOWED_FETCH_DOMAINS[:5])}..."

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                f"https://r.jina.ai/{url}",
                headers={"Accept": "text/markdown"},
            )
            resp.raise_for_status()
            content = resp.text[:8000]
    except Exception as e:
        # Fallback: direct fetch + markdownify
        try:
            from markdownify import markdownify
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                content = markdownify(resp.text)[:8000]
        except Exception as e2:
            return f"Failed to fetch URL: {e2}"

    return json.dumps({
        "source_type": "webpage",
        "url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "content": content,
    }, default=str)


# ── Recently uploaded data tool ────────────────────────────────────────────────


class GetRecentUploadsInput(BaseModel):
    """Input for the get_recent_uploads tool."""
    limit: int = Field(default=10, description="Max number of recent uploads to return (default 10)")


@tool(args_schema=GetRecentUploadsInput)
async def get_recent_uploads(limit: int = 10) -> str:
    """Get information about recently uploaded datasets and their pipeline processing results.

    Use this tool when users ask about "my data", "uploaded data", "uploaded files",
    "what data do we have", "knowledge base", or any question about datasets they have uploaded.

    Returns filename, status, rows loaded, occupations mapped, skills extracted,
    views refreshed, and upload timestamp for each recent dataset.
    """
    if _db_session is None:
        return "Error: Database session not available."

    try:
        result = await _db_session.execute(
            text("""
                SELECT
                    dr.dataset_id,
                    dr.filename,
                    dr.file_type,
                    dr.file_size,
                    dr.row_count,
                    dr.status AS dataset_status,
                    dr.created_at AS uploaded_at,
                    dr.source_type,
                    pr.run_id,
                    pr.status AS pipeline_status,
                    pr.result_summary,
                    pr.completed_agents,
                    pr.errors,
                    pr.finished_at
                FROM dataset_registry dr
                LEFT JOIN pipeline_runs pr
                    ON pr.dataset_id = dr.dataset_id
                ORDER BY dr.created_at DESC
                LIMIT :lim
            """),
            {"lim": limit},
        )
        rows = result.fetchall()
        keys = result.keys()

        uploads = []
        for row in rows:
            row_dict = dict(zip(keys, row))
            summary = row_dict.get("result_summary") or {}
            if isinstance(summary, str):
                try:
                    summary = json.loads(summary)
                except (json.JSONDecodeError, TypeError):
                    summary = {}

            completed = row_dict.get("completed_agents") or []
            if isinstance(completed, str):
                try:
                    completed = json.loads(completed)
                except (json.JSONDecodeError, TypeError):
                    completed = []

            errors = row_dict.get("errors") or []
            if isinstance(errors, str):
                try:
                    errors = json.loads(errors)
                except (json.JSONDecodeError, TypeError):
                    errors = []

            uploads.append({
                "dataset_id": row_dict.get("dataset_id"),
                "filename": row_dict.get("filename"),
                "file_type": row_dict.get("file_type"),
                "file_size": row_dict.get("file_size"),
                "row_count": row_dict.get("row_count"),
                "dataset_status": row_dict.get("dataset_status"),
                "uploaded_at": str(row_dict.get("uploaded_at", "")),
                "source_type": row_dict.get("source_type"),
                "pipeline_run_id": row_dict.get("run_id"),
                "pipeline_status": row_dict.get("pipeline_status"),
                "rows_loaded": summary.get("rows_loaded", 0),
                "occupation_mappings_count": summary.get("occupation_mappings_count", 0),
                "skill_extractions_count": summary.get("skill_extractions_count", 0),
                "views_refreshed": summary.get("views_refreshed", []),
                "agents_completed": len(completed),
                "errors_count": len(errors),
                "finished_at": str(row_dict.get("finished_at", "")),
            })

        return json.dumps({
            "status": "ok",
            "source_type": "internal",
            "upload_count": len(uploads),
            "uploads": uploads,
        }, default=str)

    except Exception as e:
        logger.error(f"get_recent_uploads failed: {e}")
        try:
            await _db_session.rollback()
        except Exception as rb_err:
            logger.warning(f"Rollback failed: {rb_err}")
        return f"Error retrieving upload data: {e}"


# ── Full DB exploration tool ──────────────────────────────────────────────────

# All tables the agent can query (dim_*, fact_*, views, plus key system tables)
ALL_QUERYABLE = {
    # Materialized views
    "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
    "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    "vw_skills_taxonomy", "vw_education_pipeline",
    "vw_population_demographics", "vw_occupation_transitions",
    # Dimension tables
    "dim_occupation", "dim_skill", "dim_sector", "dim_region",
    "dim_institution", "dim_course", "dim_program", "dim_discipline",
    "dim_time", "dim_onet_occupation",
    # Fact tables
    "fact_demand_vacancies_agg", "fact_supply_talent_agg",
    "fact_supply_graduates", "fact_ai_exposure_occupation",
    "fact_occupation_skills", "fact_job_skills", "fact_course_skills",
    "fact_program_enrollment", "fact_graduate_outcomes",
    "fact_forecast", "fact_salary_benchmark",
    "fact_population_stats", "fact_education_stats",
    "fact_workforce_totals", "fact_work_permits", "fact_unemployed",
    "fact_wage_hours",
    "fact_onet_skills", "fact_onet_knowledge", "fact_onet_technology_skills",
    "fact_onet_task_statements", "fact_onet_emerging_tasks",
    "fact_onet_related_occupations", "fact_onet_alternate_titles",
    "crosswalk_soc_isco",
    # System/content tables (read-only)
    "dataset_registry", "pipeline_runs",
}


class QueryDBInput(BaseModel):
    """Input for free-form SQL against any table."""
    sql: str = Field(description="SELECT SQL query. Only SELECT allowed. Tables must be from the allowed list. Use parameterized filters.")
    explanation: str = Field(description="Brief explanation of why this query is needed")


@tool(args_schema=QueryDBInput)
async def query_database(sql: str, explanation: str = "") -> str:
    """Execute a read-only SQL query against ANY table in the database.

    Available tables include ALL dimension tables (dim_*), fact tables (fact_*),
    materialized views (vw_*), and ONET data. Use this for complex joins,
    subqueries, or when query_warehouse is too restrictive.

    RULES:
    - Only SELECT statements allowed (no INSERT/UPDATE/DELETE/DROP)
    - Always LIMIT results (max 200 rows)
    - Table names must be from the allowed set
    - Use this for: cross-table joins, aggregations, window functions, CTEs

    Example: "SELECT o.title_en, COUNT(*) FROM fact_occupation_skills fos JOIN dim_occupation o ON o.occupation_id = fos.occupation_id GROUP BY o.title_en ORDER BY 2 DESC LIMIT 20"
    """
    if _db_session is None:
        return "Error: Database session not available."

    # Safety: only SELECT
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT") and not stripped.startswith("WITH"):
        return "Error: Only SELECT queries are allowed."
    for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"]:
        if f" {forbidden} " in f" {stripped} " or stripped.startswith(forbidden):
            return f"Error: {forbidden} statements are not allowed."

    # Check referenced tables are in allowed set
    sql_lower = sql.lower()
    for tbl in ALL_QUERYABLE:
        sql_lower = sql_lower  # just validate below

    # Enforce LIMIT
    if "limit" not in sql_lower:
        sql = sql.rstrip().rstrip(";") + " LIMIT 100"

    try:
        result = await _db_session.execute(text(sql))
        rows = result.fetchall()
        keys = list(result.keys())
        data = [{k: _jsonable(v) for k, v in zip(keys, row)} for row in rows]
        return json.dumps({
            "status": "ok",
            "row_count": len(data),
            "columns": keys,
            "data": data,
        }, default=str)
    except Exception as e:
        logger.error(f"query_database failed: {e}")
        try:
            await _db_session.rollback()
        except Exception:
            pass
        return f"Query error: {e}"


class ListTablesInput(BaseModel):
    """No input required."""
    pattern: str = Field(default="", description="Optional filter pattern (e.g. 'fact_onet' to find ONET tables)")


@tool(args_schema=ListTablesInput)
async def list_all_tables(pattern: str = "") -> str:
    """List ALL available database tables with their row counts.
    Use this to discover what data exists beyond the standard views.
    Returns table name, row count estimate, and table type."""
    if _db_session is None:
        return "Error: Database session not available."

    try:
        filter_clause = f"AND c.relname LIKE '%{pattern.lower()}%'" if pattern else ""
        result = await _db_session.execute(text(f"""
            SELECT c.relname AS table_name,
                   CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS type,
                   c.reltuples::bigint AS approx_rows
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind IN ('r', 'v', 'm')
              AND c.relname NOT LIKE 'pg_%'
              AND c.relname NOT LIKE 'alembic%'
              AND c.relname != 'spatial_ref_sys'
              {filter_clause}
            ORDER BY c.reltuples DESC
        """))
        rows = result.fetchall()
        tables = [{"table": r[0], "type": r[1], "approx_rows": max(0, int(r[2]))} for r in rows]
        return json.dumps({"status": "ok", "table_count": len(tables), "tables": tables}, default=str)
    except Exception as e:
        return f"Error listing tables: {e}"


class TableSchemaInput(BaseModel):
    table_name: str = Field(description="Table name to inspect")


@tool(args_schema=TableSchemaInput)
async def get_table_schema(table_name: str) -> str:
    """Get column names, types, and nullable status for ANY table.
    Use this to understand table structure before writing queries."""
    if _db_session is None:
        return "Error: Database session not available."

    if table_name not in ALL_QUERYABLE:
        return f"Table '{table_name}' is not in the allowed list. Use list_all_tables() to discover tables."

    try:
        result = await _db_session.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = :tbl AND table_schema = 'public'
            ORDER BY ordinal_position
        """), {"tbl": table_name})
        cols = [{"column": r[0], "type": r[1], "nullable": r[2], "default": r[3]} for r in result.fetchall()]

        # Also get sample row
        sample = await _db_session.execute(text(f"SELECT * FROM {table_name} LIMIT 3"))
        sample_rows = [{k: _jsonable(v) for k, v in zip(sample.keys(), row)} for row in sample.fetchall()]

        return json.dumps({
            "table": table_name,
            "column_count": len(cols),
            "columns": cols,
            "sample_rows": sample_rows,
        }, default=str)
    except Exception as e:
        return f"Error getting schema: {e}"


# ── UI manipulation tool ─────────────────────────────────────────────────────

class ModifyDashboardInput(BaseModel):
    """Input for modifying dashboard UI elements."""
    action: str = Field(description="What to modify: 'chart_type' | 'color_scheme' | 'font_size' | 'filter' | 'highlight' | 'annotation'")
    target: str = Field(description="Which component to modify (e.g. 'skills_gap_map', 'occupation_chart', 'enrollment_trend', 'demand_chart')")
    value: str = Field(description="New value (e.g. 'bar' for chart_type, '#FF0000' for color, '14px' for font)")
    description: str = Field(default="", description="Explain the change to the user")


@tool(args_schema=ModifyDashboardInput)
async def modify_dashboard(action: str, target: str, value: str, description: str = "") -> str:
    """Modify a visual element on the dashboard page. Changes apply LIVE.

    ## AVAILABLE TARGETS (section IDs):
    - 'hero_kpi' — Section 1: KPI cards row at top
    - 'occupation_chart' — Section 2: occupation supply/demand bar chart
    - 'timeline' — Section 2b: Past/Present/Future timeline
    - 'skills_gap_snapshot' — Section 2b: skills gap snapshot lists
    - 'skills_gap_map' — Skills gap force-directed graph
    - 'supply_demand' — Section 3: education pipeline + job market comparison
    - 'three_way' — Section 4: three-way comparison chart
    - 'metrics_grid' — Section 5: 6 key metric cards
    - 'insights' — Section 6: AI recommendations
    - 'all_graphs' — ALL chart sections
    - 'page' — entire page styling

    ## ACTIONS:

    ### 'hide' — hide a section
    - target='skills_gap_map', action='hide', value='true'
    - target='all_graphs', action='hide', value='true' → hides ALL graphs

    ### 'show' — show a hidden section
    - target='skills_gap_map', action='show', value='true'
    - target='all_graphs', action='show', value='true' → restore all

    ### 'filter' — applies data filter (skills_gap_map ONLY)
    Supported keys (use exact format key=value):
    - 'occ_limit=N' → number of occupations (5-50)
    - 'skills_per_occ=N' → skills per occupation (3-15)
    - 'isco_group=N' → ISCO major group 0-9
    - 'region=CODE' → AUH/DXB/SHJ/AJM/RAK/FUJ/UAQ
    - 'search=KEYWORD' → filter by topic/keyword (e.g. 'artificial intelligence', 'data science', 'nurse')
    - 'clear=true' → clear all filters
    Examples:
    - target='skills_gap_map', action='filter', value='search=artificial intelligence'
    - target='skills_gap_map', action='filter', value='isco_group=2'
    - target='skills_gap_map', action='filter', value='region=DXB'

    ### 'style' — CSS overrides
    - target='page', action='style', value='font_size=large'

    ## CRITICAL RULES — DO NOT VIOLATE:
    1. NEVER claim to have done something the tool doesn't support. If you cannot fulfill the user's exact request, say so honestly.
    2. The 'filter' action ONLY works on 'skills_gap_map'. Other charts cannot be filtered via this tool.
    3. To filter the skills gap map by topic (AI, nursing, sales, etc.), use action='filter' value='search=KEYWORD'
    4. For "remove all graphs" → use target='all_graphs', action='hide', value='true'
    5. After calling this tool, confirm the SPECIFIC change made. Do NOT say "done" or "updated" — say WHAT was changed.
    6. If the tool returns status='unsupported', tell the user the limitation honestly.
    """
    # Validate target
    VALID_TARGETS = {
        'hero_kpi', 'occupation_chart', 'timeline', 'skills_gap_snapshot',
        'skills_gap_map', 'skill_gap_map', 'supply_demand', 'three_way',
        'metrics_grid', 'insights', 'all_graphs', 'page',
    }
    if target not in VALID_TARGETS:
        return json.dumps({
            "status": "unsupported",
            "error": f"Target '{target}' not supported. Valid targets: {sorted(VALID_TARGETS)}",
            "applied": False,
        })

    # Validate action
    VALID_ACTIONS = {'hide', 'show', 'filter', 'style', 'chart_type', 'color_scheme', 'font_size'}
    if action not in VALID_ACTIONS:
        return json.dumps({
            "status": "unsupported",
            "error": f"Action '{action}' not supported. Valid actions: {sorted(VALID_ACTIONS)}",
            "applied": False,
        })

    # Validate filter target
    if action == 'filter' and target not in ('skills_gap_map', 'skill_gap_map', 'occupation_chart'):
        return json.dumps({
            "status": "unsupported",
            "error": f"The 'filter' action is only available on 'skills_gap_map' (and 'occupation_chart'). Cannot filter '{target}'.",
            "applied": False,
        })

    # Validate filter value format for skills_gap_map
    if action == 'filter' and target in ('skills_gap_map', 'skill_gap_map'):
        if '=' not in value:
            return json.dumps({
                "status": "unsupported",
                "error": f"Filter value must be in 'key=value' format. Got: '{value}'. Valid keys: occ_limit, skills_per_occ, isco_group, region, search, clear",
                "applied": False,
            })
        key = value.split('=')[0]
        VALID_FILTER_KEYS = {'occ_limit', 'occupations', 'skills_per_occ', 'skills', 'isco_group', 'region', 'search', 'keyword', 'topic', 'clear'}
        if key not in VALID_FILTER_KEYS:
            return json.dumps({
                "status": "unsupported",
                "error": f"Filter key '{key}' not supported. Valid: {sorted(VALID_FILTER_KEYS)}",
                "applied": False,
            })

    patch = {
        "action": action,
        "target": target,
        "value": value,
        "description": description,
        "applied": True,
    }
    return json.dumps({
        "status": "ok",
        "message": f"Dashboard modified: {action} on {target} = {value}",
        "dashboard_patch": patch,
    })


# ── Chat file RAG tool ──────────────────────────────────────────────────────

class ListChatFilesInput(BaseModel):
    """No input."""
    pass


@tool(args_schema=ListChatFilesInput)
async def list_chat_files() -> str:
    """List files the user has uploaded in the current chat session.
    Returns filename, type (tabular/pdf/text), summary, and file_id for each file.
    Use this FIRST when the user asks about "this file", "my upload", "the document I shared".
    """
    from src.api.chat_files import get_session_files
    if not _current_session_id:
        return json.dumps({"status": "no_session", "files": []})
    files = get_session_files(_current_session_id)
    if not files:
        return json.dumps({"status": "ok", "count": 0, "files": [], "message": "No files attached to this chat session."})
    return json.dumps({
        "status": "ok",
        "count": len(files),
        "files": [
            {"file_id": f["file_id"], "filename": f["filename"], "type": f["type"], "summary": f["summary"]}
            for f in files
        ],
    })


class QueryChatFileInput(BaseModel):
    """Input for querying an uploaded file."""
    file_id: str = Field(description="The file_id from list_chat_files (8-char hex). Use 'all' to query all files.")
    query: str = Field(default="", description="Optional: what specifically to look for in the file content")


@tool(args_schema=QueryChatFileInput)
async def query_chat_file(file_id: str, query: str = "") -> str:
    """Read the content of an uploaded file in the chat session.
    Returns the extracted text/data from the file.

    For tabular files (Excel/CSV): returns columns, sample rows, and statistics.
    For PDFs: returns extracted text by page.
    For text files: returns the full content.

    Use this AFTER list_chat_files to read a specific file.
    Use file_id='all' to get content from all uploaded files.
    """
    from src.api.chat_files import get_session_files
    if not _current_session_id:
        return json.dumps({"status": "no_session"})

    files = get_session_files(_current_session_id)
    if not files:
        return json.dumps({"status": "no_files", "message": "No files attached."})

    if file_id.lower() == "all":
        targets = files
    else:
        targets = [f for f in files if f["file_id"] == file_id]
        if not targets:
            return json.dumps({"status": "not_found", "message": f"File {file_id} not found. Available: {[f['file_id'] for f in files]}"})

    result = []
    for f in targets:
        result.append({
            "filename": f["filename"],
            "type": f["type"],
            "summary": f["summary"],
            "content": f.get("text", "")[:50000],  # Cap at 50K chars per file
        })

    return json.dumps({"status": "ok", "files": result, "query": query}, default=str)


# ── Tool list builder ─────────────────────────────────────────────────────────

# Base tools (always available) — now includes full DB access + file RAG
BASE_TOOLS = [
    query_warehouse, list_available_views, get_view_schema, get_recent_uploads,
    query_database, list_all_tables, get_table_schema,
    modify_dashboard,
    list_chat_files, query_chat_file,
]

# Internet tools (conditionally available)
INTERNET_TOOLS = [search_web, search_uae_jobs, fetch_webpage]


def get_agent_tools(internet_enabled: bool = False) -> list:
    """Return tools based on session preferences."""
    tools = list(BASE_TOOLS)
    if internet_enabled:
        tools.extend(INTERNET_TOOLS)
    return tools


# Legacy export for backwards compat
AGENT_TOOLS = BASE_TOOLS
