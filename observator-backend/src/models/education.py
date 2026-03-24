"""Education and population models for Bayanat data."""
from sqlalchemy import Float, Index, Integer, String
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
