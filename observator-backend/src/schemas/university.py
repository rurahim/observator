"""University alignment schemas."""
from pydantic import BaseModel


class ProgramCoverage(BaseModel):
    discipline: str
    discipline_ar: str | None = None
    graduates: int
    market_demand: int
    coverage_ratio: float  # graduates / demand


class MissingSkill(BaseModel):
    skill: str
    demand_count: int
    graduate_coverage: int
    gap: int


class AlignmentRecommendation(BaseModel):
    institution: str
    discipline: str
    recommendation: str
    priority: str  # high, medium, low


class UniversityResponse(BaseModel):
    program_coverage: list[ProgramCoverage]
    missing_skills: list[MissingSkill]
    recommendations: list[AlignmentRecommendation]
    summary: dict
