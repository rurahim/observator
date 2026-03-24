"""Skill gap analysis schemas."""
from pydantic import BaseModel

from src.schemas.common import DataMeta


class OccupationGap(BaseModel):
    occupation_id: int
    title_en: str
    title_ar: str | None = None
    code_isco: str | None = None
    supply: int
    demand: int
    gap: int
    sgi: float | None = None  # SGI = (demand-supply)/demand * 100
    status: str | None = None
    ai_exposure_score: float | None = None  # 0-100 from vw_gap_cube


class SGITrend(BaseModel):
    month: str
    sgi: float


class SkillGapResponse(BaseModel):
    occupations: list[OccupationGap]
    sgi_trend: list[SGITrend]
    total_supply: int
    total_demand: int
    total_gap: int
    methodology: str | None = None
    meta: DataMeta | None = None
