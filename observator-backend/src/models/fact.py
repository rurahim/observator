from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class FactSupplyTalentAgg(Base, TimestampMixin):
    __tablename__ = "fact_supply_talent_agg"
    __table_args__ = (
        Index("ix_supply_talent_time_region", "time_id", "region_code"),
        Index("ix_supply_talent_occupation", "occupation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time_id: Mapped[int] = mapped_column(ForeignKey("dim_time.time_id"))
    region_code: Mapped[str] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    sector_id: Mapped[int | None] = mapped_column(ForeignKey("dim_sector.sector_id"))
    gender: Mapped[str | None] = mapped_column(String(10))
    education_level: Mapped[str | None] = mapped_column(String(50))
    nationality: Mapped[str | None] = mapped_column(String(20))  # citizen, expat
    age_group: Mapped[str | None] = mapped_column(String(20))
    experience_band: Mapped[str | None] = mapped_column(String(20))
    supply_count: Mapped[int] = mapped_column(Integer, default=0)
    wage_band: Mapped[str | None] = mapped_column(String(20))
    source: Mapped[str | None] = mapped_column(String(50))  # FCSC, MOHRE, etc.
    dataset_id: Mapped[str | None] = mapped_column(String(64))


class FactDemandVacanciesAgg(Base, TimestampMixin):
    __tablename__ = "fact_demand_vacancies_agg"
    __table_args__ = (
        Index("ix_demand_vac_time_region", "time_id", "region_code"),
        Index("ix_demand_vac_occupation", "occupation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time_id: Mapped[int] = mapped_column(ForeignKey("dim_time.time_id"))
    region_code: Mapped[str] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    sector_id: Mapped[int | None] = mapped_column(ForeignKey("dim_sector.sector_id"))
    experience_band: Mapped[str | None] = mapped_column(String(20))
    demand_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str | None] = mapped_column(String(50))
    dataset_id: Mapped[str | None] = mapped_column(String(64))


class FactSupplyGraduates(Base, TimestampMixin):
    __tablename__ = "fact_supply_graduates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int]
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("dim_institution.institution_id"))
    discipline_id: Mapped[int | None] = mapped_column(ForeignKey("dim_discipline.discipline_id"))
    region_code: Mapped[str | None] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    gender: Mapped[str | None] = mapped_column(String(10))
    nationality: Mapped[str | None] = mapped_column(String(20))
    expected_graduates_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str | None] = mapped_column(String(50))
    dataset_id: Mapped[str | None] = mapped_column(String(64))


class FactAIExposureOccupation(Base):
    __tablename__ = "fact_ai_exposure_occupation"
    __table_args__ = (
        Index("ix_ai_exposure_occ", "occupation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    occupation_id: Mapped[int] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    exposure_z: Mapped[float | None] = mapped_column(Float)
    exposure_0_100: Mapped[float | None] = mapped_column(Float)
    automation_probability: Mapped[float | None] = mapped_column(Float)
    llm_exposure: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(50))  # AIOE, FreyOsborne, GPTs_are_GPTs
    version: Mapped[str | None] = mapped_column(String(20))


class FactOccupationSkills(Base):
    __tablename__ = "fact_occupation_skills"
    __table_args__ = (
        UniqueConstraint("occupation_id", "skill_id", "source", name="uq_occ_skill_source"),
        Index("ix_occ_skills_occ", "occupation_id"),
        Index("ix_occ_skills_skill", "skill_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    occupation_id: Mapped[int] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("dim_skill.skill_id"))
    relation_type: Mapped[str | None] = mapped_column(String(20))  # essential, optional
    source: Mapped[str] = mapped_column(String(50), default="ESCO")


class FactCourseSkills(Base):
    __tablename__ = "fact_course_skills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    course_id: Mapped[str] = mapped_column(String(100))
    skill_id: Mapped[int] = mapped_column(ForeignKey("dim_skill.skill_id"))
    weight: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)
    catalog_year: Mapped[int | None]


class FactForecast(Base, TimestampMixin):
    __tablename__ = "fact_forecast"
    __table_args__ = (
        Index("ix_forecast_occ_region", "occupation_id", "region_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    region_code: Mapped[str | None] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    sector_id: Mapped[int | None] = mapped_column(ForeignKey("dim_sector.sector_id"))
    forecast_date: Mapped[str] = mapped_column(String(7))  # '2026-06'
    horizon_months: Mapped[int] = mapped_column(Integer, default=12)
    predicted_demand: Mapped[float | None] = mapped_column(Float)
    predicted_supply: Mapped[float | None] = mapped_column(Float)
    predicted_gap: Mapped[float | None] = mapped_column(Float)
    confidence_lower: Mapped[float | None] = mapped_column(Float)
    confidence_upper: Mapped[float | None] = mapped_column(Float)
    model_name: Mapped[str | None] = mapped_column(String(50))
    model_version: Mapped[str | None] = mapped_column(String(20))
