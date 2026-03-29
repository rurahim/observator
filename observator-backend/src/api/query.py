"""Query execution endpoint — runs deterministic QueryPlans against warehouse views."""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.schemas.query import QueryColumn, QueryPlan, QueryRequest, QueryResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/query", tags=["query"])

ALLOWED_VIEWS = {
    "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
    "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    "vw_skills_taxonomy", "vw_education_pipeline",
    "vw_population_demographics", "vw_occupation_transitions",
    "fact_program_enrollment", "fact_graduate_outcomes",
    "dim_program", "dim_institution",
}

# Only allow safe SQL identifiers
_SAFE_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def _validate_identifier(name: str) -> str:
    """Validate SQL identifier to prevent injection."""
    if not _SAFE_IDENT.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid identifier: {name}")
    return name


@router.post("", response_model=QueryResponse)
async def execute_query(
    body: QueryRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a QueryPlan against whitelisted materialized views."""
    plan = body.query_plan

    # Validate view name
    if plan.view not in ALLOWED_VIEWS:
        raise HTTPException(status_code=400, detail=f"View '{plan.view}' is not allowed. Use: {', '.join(ALLOWED_VIEWS)}")

    # Build SELECT columns — auto-aggregate numeric columns when GROUP BY present
    from src.query_compiler.schema_registry import VIEW_SCHEMAS
    schema = VIEW_SCHEMAS.get(plan.view)
    agg_cols = schema.aggregatable_columns if schema else set()

    if plan.columns:
        col_parts = []
        for c in plan.columns:
            safe_c = _validate_identifier(c)
            if plan.group_by and c in agg_cols and c not in plan.group_by:
                col_parts.append(f"SUM({safe_c}) AS {safe_c}")
            else:
                col_parts.append(safe_c)
        cols = ", ".join(col_parts)
    else:
        cols = "*"

    # Build WHERE clause from plan filters + dashboard filters
    conditions = []
    params: dict = {}
    param_idx = 0

    for col_key, val in plan.filters.items():
        # Support operator suffixes: col__gte, col__lte, col__like
        if "__" in col_key:
            base_col, op = col_key.rsplit("__", 1)
        else:
            base_col, op = col_key, "eq"

        base_col = _validate_identifier(base_col)
        pname = f"p{param_idx}"

        if op == "eq":
            if isinstance(val, list):
                placeholders = ", ".join(f":p{param_idx + i}" for i in range(len(val)))
                conditions.append(f"{base_col} IN ({placeholders})")
                for i, v in enumerate(val):
                    params[f"p{param_idx + i}"] = v
                param_idx += len(val)
            else:
                conditions.append(f"{base_col} = :{pname}")
                params[pname] = val
                param_idx += 1
        elif op == "gte":
            conditions.append(f"{base_col} >= :{pname}")
            params[pname] = val
            param_idx += 1
        elif op == "lte":
            conditions.append(f"{base_col} <= :{pname}")
            params[pname] = val
            param_idx += 1
        elif op == "like":
            conditions.append(f"{base_col} ILIKE :{pname}")
            params[pname] = f"%{val}%"
            param_idx += 1
        else:
            conditions.append(f"{base_col} = :{pname}")
            params[pname] = val
            param_idx += 1

    # Merge dashboard filters
    if body.dashboard_filters:
        df = body.dashboard_filters
        if df.emirate:
            conditions.append(f"region_code = :df_emirate")
            params["df_emirate"] = df.emirate
        if df.sector:
            conditions.append(f"sector_id = :df_sector")
            params["df_sector"] = int(df.sector)
        if df.gender:
            conditions.append(f"gender = :df_gender")
            params["df_gender"] = df.gender
        if df.nationality:
            conditions.append(f"nationality = :df_nationality")
            params["df_nationality"] = df.nationality

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    # GROUP BY
    group_by = ""
    if plan.group_by:
        group_by = " GROUP BY " + ", ".join(_validate_identifier(c) for c in plan.group_by)

    # ORDER BY
    order_by = ""
    if plan.order_by:
        parts = []
        for o in plan.order_by:
            if o.startswith("-"):
                parts.append(f"{_validate_identifier(o[1:])} DESC")
            else:
                parts.append(_validate_identifier(o))
        order_by = " ORDER BY " + ", ".join(parts)

    # LIMIT
    limit = min(plan.limit, settings.MAX_QUERY_LIMIT)

    sql = f"SELECT {cols} FROM {plan.view}{where}{group_by}{order_by} LIMIT {limit}"

    logger.info(f"Executing query: {sql} with params: {params}")

    try:
        result = await db.execute(text(sql), params)
        rows = result.fetchall()
        columns_info = result.keys()
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(status_code=400, detail=f"Query execution error: {str(e)[:200]}")

    # Build response
    column_defs = [QueryColumn(name=str(c), type="string") for c in columns_info]
    data = [dict(zip(columns_info, row)) for row in rows]

    return QueryResponse(
        data=data,
        columns=column_defs,
        row_count=len(data),
        meta={"view": plan.view, "sql": sql},
    )


@router.get("/views")
async def list_views(user=Depends(get_current_user)):
    """List all available views with their column schemas.

    Used by the Data Explorer page to dynamically build queries.
    """
    from src.query_compiler.schema_registry import VIEW_SCHEMAS

    views = []
    for name, schema in VIEW_SCHEMAS.items():
        views.append({
            "name": schema.name,
            "description": schema.description,
            "columns": [
                {
                    "name": c.name,
                    "type": c.dtype,
                    "filterable": c.filterable,
                    "aggregatable": c.aggregatable,
                    "description": c.description,
                }
                for c in schema.columns
            ],
            "default_order": schema.default_order,
            "supports_group_by": schema.supports_group_by,
        })
    return {"views": views}


@router.get("/explore")
async def explore_view(
    view: str = "vw_demand_jobs",
    columns: str | None = None,
    sort: str | None = None,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    emirate: str | None = None,
    sector: str | None = None,
    source: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GET-based data explorer — browse any view with pagination, sorting, filtering.

    Simple alternative to POST /api/query for the Data Explorer UI.
    """
    if view not in ALLOWED_VIEWS:
        raise HTTPException(status_code=400, detail=f"View '{view}' not allowed")

    from src.query_compiler.schema_registry import VIEW_SCHEMAS
    schema = VIEW_SCHEMAS.get(view)
    if not schema:
        raise HTTPException(status_code=400, detail=f"No schema for '{view}'")

    # Columns
    if columns:
        col_list = [_validate_identifier(c.strip()) for c in columns.split(",")]
        cols = ", ".join(col_list)
    else:
        cols = "*"

    # WHERE
    conditions = []
    params: dict = {}
    if emirate and emirate != "all":
        conditions.append("region_code = :emirate")
        params["emirate"] = emirate
    if sector and sector != "all":
        conditions.append("sector = :sector")
        params["sector"] = sector
    if source and source != "all":
        if source == "system":
            conditions.append("(source IS NULL OR source != 'user_upload')")
        elif source == "user_upload":
            conditions.append("source = 'user_upload'")
        else:
            conditions.append("source = :source")
            params["source"] = source
    if search:
        # Search across text columns
        search_cols = [c.name for c in schema.columns if c.dtype == "str"][:3]
        if search_cols:
            or_parts = [f"{c} ILIKE :search" for c in search_cols]
            conditions.append(f"({' OR '.join(or_parts)})")
            params["search"] = f"%{search}%"

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    # ORDER BY
    order_by = ""
    if sort:
        if sort.startswith("-"):
            order_by = f" ORDER BY {_validate_identifier(sort[1:])} DESC"
        else:
            order_by = f" ORDER BY {_validate_identifier(sort)}"
    elif schema.default_order:
        order_by = f" ORDER BY {schema.default_order}"

    # LIMIT + OFFSET
    limit = min(limit, settings.MAX_QUERY_LIMIT)
    offset = max(offset, 0)

    # Count total
    count_sql = f"SELECT COUNT(*) FROM {view}{where}"
    try:
        total = (await db.execute(text(count_sql), params)).scalar() or 0
    except Exception:
        total = 0

    # Fetch page
    sql = f"SELECT {cols} FROM {view}{where}{order_by} LIMIT {limit} OFFSET {offset}"

    try:
        result = await db.execute(text(sql), params)
        rows = result.fetchall()
        columns_info = list(result.keys())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query error: {str(e)[:200]}")

    data = [dict(zip(columns_info, row)) for row in rows]
    column_defs = [
        {
            "name": str(c),
            "type": next((col.dtype for col in schema.columns if col.name == str(c)), "string"),
            "filterable": next((col.filterable for col in schema.columns if col.name == str(c)), False),
        }
        for c in columns_info
    ]

    return {
        "data": data,
        "columns": column_defs,
        "total": total,
        "page": offset // limit + 1,
        "page_size": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
        "view": view,
    }
