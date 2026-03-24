"""Filter option schemas."""
from pydantic import BaseModel


class FilterOption(BaseModel):
    value: str
    label: str
    label_ar: str | None = None


class SourceOption(BaseModel):
    value: str                      # e.g., "linkedin", "FCSC"
    label: str                      # display name
    rows: int = 0                   # row count from this source
    side: str | None = None         # "supply" | "demand" | "ai"


class FilterOptions(BaseModel):
    emirates: list[FilterOption]
    sectors: list[FilterOption]
    occupations: list[FilterOption]
    date_range: dict  # {min: "2024-01", max: "2026-03"}
    dynamic: dict[str, list[FilterOption]] | None = None  # gender, nationality, experience
    sources: list[SourceOption] | None = None  # available data sources with row counts
