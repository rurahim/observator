"""Dashboard API schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from src.schemas.common import DataMeta


class DashboardCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str | None = None
    layout: dict | None = None


class DashboardUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    layout: dict | None = None


class DashboardOut(BaseModel):
    dashboard_id: UUID
    title: str
    description: str | None = None
    layout: dict | None = None
    current_version: int
    is_default: bool
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class DashboardVersionOut(BaseModel):
    id: int
    dashboard_id: UUID
    version: int
    state: dict
    created_by: str | None = None
    trace_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Aggregated dashboard data responses ---

class SupplyDemandPoint(BaseModel):
    month: str
    supply: int
    demand: int


class SectorDistribution(BaseModel):
    sector: str
    sector_ar: str | None = None
    count: int
    percentage: float | None = None


class EmirateMetric(BaseModel):
    region_code: str
    emirate: str
    emirate_ar: str | None = None
    supply: int
    demand: int
    gap: int
    sgi: float | None = None  # Supply-Gap Index


class TopOccupation(BaseModel):
    occupation_id: int
    title_en: str
    title_ar: str | None = None
    supply: int
    demand: int
    gap: int
    sgi: float | None = None
    status: str | None = None
    ai_exposure_score: float | None = None


class DashboardSummary(BaseModel):
    total_supply: int
    total_demand: int
    total_gap: int
    sgi: float | None = None
    supply_demand_trend: list[SupplyDemandPoint]
    sector_distribution: list[SectorDistribution]
    sector_data_side: str | None = None  # "demand" | "supply" | "both" | "none"
    emirate_metrics: list[EmirateMetric]
    top_occupations: list[TopOccupation]
    dataset_versions: dict | None = None
    refreshed_at: str | None = None
    meta: DataMeta | None = None
