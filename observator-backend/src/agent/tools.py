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


# ── Tool list builder ─────────────────────────────────────────────────────────

# Base tools (always available)
BASE_TOOLS = [query_warehouse, list_available_views, get_view_schema, get_recent_uploads]

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
