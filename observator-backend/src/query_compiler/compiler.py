"""QueryPlan compiler — validates and compiles structured intents into safe QueryPlans.

This is the deterministic layer between LLM output and SQL execution.
The LLM produces a QueryPlan JSON, the compiler validates it, and the executor runs it.
"""
import logging

from src.config import settings
from src.query_compiler.schema_registry import VIEW_SCHEMAS
from src.schemas.query import QueryFilter, QueryPlan

logger = logging.getLogger(__name__)


class CompilationError(Exception):
    """Raised when a QueryPlan cannot be compiled."""
    pass


def compile_query_plan(
    view: str,
    columns: list[str] | None = None,
    filters: dict | None = None,
    group_by: list[str] | None = None,
    order_by: list[str] | None = None,
    limit: int = 100,
    dashboard_filters: QueryFilter | None = None,
) -> QueryPlan:
    """Compile and validate a QueryPlan from structured parameters.

    Args:
        view: Name of the materialized view (must be in VIEW_SCHEMAS)
        columns: Columns to select (None = all)
        filters: WHERE conditions {column: value or [values]}
        group_by: GROUP BY columns
        order_by: ORDER BY columns (prefix with - for DESC)
        limit: Max rows to return
        dashboard_filters: Cross-page filter context

    Returns:
        Validated QueryPlan ready for execution

    Raises:
        CompilationError: If the plan is invalid
    """
    # 1. Validate view exists
    schema = VIEW_SCHEMAS.get(view)
    if not schema:
        raise CompilationError(
            f"Unknown view '{view}'. Available: {', '.join(VIEW_SCHEMAS.keys())}"
        )

    valid_cols = schema.column_names

    # 2. Validate columns
    selected = []
    if columns:
        for col in columns:
            # Allow SUM(), AVG(), COUNT() wrapping
            bare = _strip_aggregate(col)
            if bare not in valid_cols:
                raise CompilationError(f"Column '{bare}' not in view '{view}'. Valid: {sorted(valid_cols)}")
            selected.append(col)

    # 3. Validate filters
    validated_filters = {}
    if filters:
        for col, val in filters.items():
            # Handle operator suffixes: col__gte, col__lte, col__like
            base_col = col.split("__")[0] if "__" in col else col
            if base_col not in schema.filterable_columns:
                logger.warning(f"Column '{base_col}' is not filterable in '{view}', skipping")
                continue
            validated_filters[col] = val

    # 4. Merge dashboard context filters
    if dashboard_filters:
        _merge_dashboard_filters(validated_filters, dashboard_filters, schema)

    # 5. Validate group_by
    validated_group_by = []
    if group_by:
        for col in group_by:
            if col not in valid_cols:
                raise CompilationError(f"Cannot GROUP BY '{col}' — not in view '{view}'")
            validated_group_by.append(col)

    # 6. Validate order_by
    validated_order_by = []
    if order_by:
        for col in order_by:
            bare = col.lstrip("-")
            if bare not in valid_cols:
                raise CompilationError(f"Cannot ORDER BY '{bare}' — not in view '{view}'")
            validated_order_by.append(col)

    # 7. Clamp limit
    clamped_limit = max(1, min(limit, settings.MAX_QUERY_LIMIT))

    plan = QueryPlan(
        view=view,
        columns=selected,
        filters=validated_filters,
        group_by=validated_group_by,
        order_by=validated_order_by,
        limit=clamped_limit,
    )

    logger.info(f"Compiled QueryPlan: view={view}, cols={len(selected)}, filters={len(validated_filters)}")
    return plan


def suggest_view(intent: str) -> str:
    """Suggest the best view for a given query intent.

    Used by the LLM agent to pick the right view before compiling.
    """
    intent_lower = intent.lower()

    # Keywords → view mapping
    mappings = [
        ({"supply", "worker", "talent", "workforce", "labour", "labor", "employee"}, "vw_supply_talent"),
        ({"demand", "vacancy", "job", "hiring", "opening", "recruitment"}, "vw_demand_jobs"),
        ({"graduate", "university", "education", "student", "enrollment", "discipline"}, "vw_supply_education"),
        ({"ai", "automation", "exposure", "risk", "llm", "artificial intelligence"}, "vw_ai_impact"),
        ({"gap", "shortage", "surplus", "mismatch", "imbalance", "sgi"}, "vw_gap_cube"),
        ({"forecast", "predict", "future", "projection", "trend", "scenario"}, "vw_forecast_demand"),
    ]

    scores: dict[str, int] = {}
    for keywords, view_name in mappings:
        score = sum(1 for kw in keywords if kw in intent_lower)
        if score > 0:
            scores[view_name] = scores.get(view_name, 0) + score

    if not scores:
        return "vw_gap_cube"  # default: most comprehensive view

    return max(scores, key=scores.get)


def get_view_tool_descriptions() -> str:
    """Generate tool descriptions for all views — used in LLM system prompt."""
    parts = []
    for schema in VIEW_SCHEMAS.values():
        parts.append(schema.to_tool_description())
    return "\n\n".join(parts)


def _strip_aggregate(col: str) -> str:
    """Strip aggregate function wrapper: SUM(supply_count) → supply_count."""
    for fn in ("SUM", "AVG", "COUNT", "MIN", "MAX", "sum", "avg", "count", "min", "max"):
        if col.upper().startswith(fn + "(") and col.endswith(")"):
            return col[len(fn) + 1:-1]
    return col


def _merge_dashboard_filters(
    filters: dict, df: QueryFilter, schema
) -> None:
    """Merge dashboard-level filters into plan filters."""
    if df.emirate and "region_code" in schema.filterable_columns:
        filters.setdefault("region_code", df.emirate)
    if df.sector and "sector" in schema.filterable_columns:
        filters.setdefault("sector", df.sector)
    if df.gender and "gender" in schema.filterable_columns:
        filters.setdefault("gender", df.gender)
    if df.nationality and "nationality" in schema.filterable_columns:
        filters.setdefault("nationality", df.nationality)
    if df.date_from and "month_label" in schema.filterable_columns:
        filters.setdefault("month_label__gte", df.date_from)
    if df.date_to and "month_label" in schema.filterable_columns:
        filters.setdefault("month_label__lte", df.date_to)
