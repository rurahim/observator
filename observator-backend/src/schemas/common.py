from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    db: str
    minio: str
    qdrant: str
    redis: str


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[Any]
    total: int
    page: int
    page_size: int
    pages: int


# ── Data transparency metadata ─────────────────────────────

class SourceInfo(BaseModel):
    """Metadata about a single data source contributing to a response."""
    name: str                       # e.g., "LinkedIn", "FCSC", "ESCO"
    rows: int                       # row count from this source
    side: str | None = None         # "supply" | "demand" | "ai" | None


class DataMeta(BaseModel):
    """Metadata attached to every data API response for transparency."""
    sources: list[SourceInfo] = []          # which sources contributed
    total_rows: int = 0                     # total rows underlying this response
    date_range: dict | None = None          # {"min": "2020-01", "max": "2025-03"}
    refreshed_at: str | None = None         # last materialized view refresh
    quality_score: int | None = None        # 0-100 composite quality
    freshness_label: str | None = None      # "2 hours ago", "3 days ago"
    coverage: dict | None = None            # {"emirates": 5, "total": 7}
