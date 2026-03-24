"""Forecast schemas."""
from pydantic import BaseModel


class ForecastPoint(BaseModel):
    date: str  # "2026-06"
    predicted_demand: float | None = None
    predicted_supply: float | None = None
    predicted_gap: float | None = None
    confidence_lower: float | None = None
    confidence_upper: float | None = None


class ForecastResponse(BaseModel):
    occupation_id: int | None = None
    title_en: str | None = None
    region_code: str | None = None
    model_name: str | None = None
    horizon_months: int
    points: list[ForecastPoint]
