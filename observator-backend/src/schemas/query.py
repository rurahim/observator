"""Query execution schemas."""
from pydantic import BaseModel, Field


class QueryFilter(BaseModel):
    emirate: str | None = None
    sector: str | None = None
    occupation: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    gender: str | None = None
    nationality: str | None = None


class QueryPlan(BaseModel):
    """Deterministic query plan compiled from LLM output."""
    view: str = Field(..., description="Materialized view name (must be vw_*)")
    columns: list[str] = Field(default_factory=list, description="Columns to select")
    filters: dict = Field(default_factory=dict, description="WHERE conditions")
    group_by: list[str] = Field(default_factory=list)
    order_by: list[str] = Field(default_factory=list)
    limit: int = Field(default=100, le=1000)


class QueryRequest(BaseModel):
    query_plan: QueryPlan
    dashboard_filters: QueryFilter | None = None


class QueryColumn(BaseModel):
    name: str
    type: str


class QueryResponse(BaseModel):
    data: list[dict]
    columns: list[QueryColumn]
    row_count: int
    meta: dict | None = None
