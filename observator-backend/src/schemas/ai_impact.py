"""AI impact analysis schemas."""
from pydantic import BaseModel

from src.schemas.common import DataMeta


class OccupationAIExposure(BaseModel):
    occupation_id: int
    title_en: str
    title_ar: str | None = None
    code_isco: str | None = None
    exposure_score: float | None = None  # 0-100
    automation_probability: float | None = None
    llm_exposure: float | None = None
    risk_level: str  # low, medium, high, critical


class SectorAIExposure(BaseModel):
    sector: str
    sector_ar: str | None = None
    avg_exposure: float
    occupation_count: int
    high_risk_count: int


class SkillCluster(BaseModel):
    skill: str
    exposure: float
    occupation_count: int


class AIImpactResponse(BaseModel):
    occupations: list[OccupationAIExposure]
    sectors: list[SectorAIExposure]
    skill_clusters: list[SkillCluster]
    summary: dict  # {total_occupations, high_risk_pct, avg_exposure}
    meta: DataMeta | None = None
