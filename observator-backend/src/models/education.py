"""Education and population models for Bayanat data."""
from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class FactEducationStats(Base, TimestampMixin):
    """Education statistics — students, graduates, teachers, enrollment from Bayanat."""
    __tablename__ = "fact_education_stats"
    __table_args__ = (
        Index("ix_edu_stats_time_region", "time_id", "region_code"),
        Index("ix_edu_stats_category", "category"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time_id: Mapped[int | None] = mapped_column(Integer)
    region_code: Mapped[str | None] = mapped_column(String(10))
    category: Mapped[str | None] = mapped_column(String(30))  # students, graduates, teachers, enrollment
    level: Mapped[str | None] = mapped_column(String(30))  # primary, secondary, higher, all
    gender: Mapped[str | None] = mapped_column(String(10))
    nationality: Mapped[str | None] = mapped_column(String(20))
    sector: Mapped[str | None] = mapped_column(String(30))  # government, private
    discipline: Mapped[str | None] = mapped_column(String(100))
    count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str | None] = mapped_column(String(100))


class FactPopulationStats(Base, TimestampMixin):
    """Population demographics from Bayanat — age, gender, nationality, emirate."""
    __tablename__ = "fact_population_stats"
    __table_args__ = (
        Index("ix_pop_stats_time_region", "time_id", "region_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time_id: Mapped[int | None] = mapped_column(Integer)
    region_code: Mapped[str | None] = mapped_column(String(10))
    citizenship: Mapped[str | None] = mapped_column(String(20))  # citizen, non-citizen, total
    age_group: Mapped[str | None] = mapped_column(String(20))
    gender: Mapped[str | None] = mapped_column(String(10))
    population_count: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str | None] = mapped_column(String(30))  # estimate, birth, death, growth_rate
    source: Mapped[str | None] = mapped_column(String(100))


class FactWageHours(Base, TimestampMixin):
    """Wage and working hours data from Bayanat employment."""
    __tablename__ = "fact_wage_hours"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time_id: Mapped[int | None] = mapped_column(Integer)
    region_code: Mapped[str | None] = mapped_column(String(10))
    dimension_type: Mapped[str | None] = mapped_column(String(30))  # occupation, education, sector, nationality
    dimension_value: Mapped[str | None] = mapped_column(String(100))
    hours_normal: Mapped[float | None] = mapped_column(Float)
    hours_actual: Mapped[float | None] = mapped_column(Float)
    wages_monthly: Mapped[float | None] = mapped_column(Float)
    earnings_monthly: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str | None] = mapped_column(String(100))


# ── NEW: Supply Dashboard Models ─────────────────────────────


class DimProgram(Base):
    """Academic program offered by an institution."""
    __tablename__ = "dim_program"
    __table_args__ = (
        UniqueConstraint("program_name", "institution_id", "degree_level", name="uq_program"),
    )

    program_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    program_name: Mapped[str] = mapped_column(String(500))
    degree_level: Mapped[str | None] = mapped_column(String(50))  # Bachelor, Master, PhD, Diploma, Foundation
    specialization: Mapped[str | None] = mapped_column(String(300))
    college: Mapped[str | None] = mapped_column(String(300))
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("dim_institution.institution_id"))
    discipline_id: Mapped[int | None] = mapped_column(ForeignKey("dim_discipline.discipline_id"))
    total_credits: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(50))  # web_scrape, bayanat, caa


class FactProgramEnrollment(Base, TimestampMixin):
    """Enrollment data per institution/program — actual counts or percentages."""
    __tablename__ = "fact_program_enrollment"
    __table_args__ = (
        Index("ix_prog_enroll_year_region", "year", "region_code"),
        Index("ix_prog_enroll_inst", "institution_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int]
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("dim_institution.institution_id"))
    program_id: Mapped[int | None] = mapped_column(ForeignKey("dim_program.program_id"))
    region_code: Mapped[str | None] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    sector: Mapped[str | None] = mapped_column(String(30))  # government, private
    gender: Mapped[str | None] = mapped_column(String(10))
    nationality: Mapped[str | None] = mapped_column(String(20))
    specialization: Mapped[str | None] = mapped_column(String(200))
    enrollment_count: Mapped[int | None] = mapped_column(Integer)  # absolute count when available
    enrollment_pct: Mapped[float | None] = mapped_column(Float)  # percentage when count unavailable
    is_estimated: Mapped[bool] = mapped_column(Boolean, default=False)
    data_type: Mapped[str | None] = mapped_column(String(30))  # actual, percentage, estimated
    source: Mapped[str | None] = mapped_column(String(100))


class FactGraduateOutcomes(Base, TimestampMixin):
    """Graduate data — actual counts, percentages, and employment outcomes."""
    __tablename__ = "fact_graduate_outcomes"
    __table_args__ = (
        Index("ix_grad_outcomes_year_inst", "year", "institution_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    year: Mapped[int]
    institution_id: Mapped[int | None] = mapped_column(ForeignKey("dim_institution.institution_id"))
    region_code: Mapped[str | None] = mapped_column(String(10), ForeignKey("dim_region.region_code"))
    college: Mapped[str | None] = mapped_column(String(200))
    degree_level: Mapped[str | None] = mapped_column(String(50))
    specialization: Mapped[str | None] = mapped_column(String(200))
    stem_indicator: Mapped[str | None] = mapped_column(String(5))  # S, T, E, M
    gender: Mapped[str | None] = mapped_column(String(10))
    nationality: Mapped[str | None] = mapped_column(String(20))
    graduate_count: Mapped[int | None] = mapped_column(Integer)  # absolute count
    graduate_pct: Mapped[float | None] = mapped_column(Float)  # percentage
    employment_rate: Mapped[float | None] = mapped_column(Float)  # 0-100
    is_estimated: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str | None] = mapped_column(String(100))
