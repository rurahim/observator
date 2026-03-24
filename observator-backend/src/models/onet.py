"""O*NET v30.2 database models — 8 tables for occupations, skills, technology, tasks, transitions."""
from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class OnetOccupation(Base):
    """O*NET occupation (1,016 SOC-coded occupations)."""
    __tablename__ = "dim_onet_occupation"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    # Link to main dim_occupation via crosswalk
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetSkill(Base):
    """O*NET skill importance/level ratings per occupation (62K rows)."""
    __tablename__ = "fact_onet_skills"
    __table_args__ = (
        Index("ix_onet_skills_soc", "soc_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    element_id: Mapped[str | None] = mapped_column(String(20))
    element_name: Mapped[str] = mapped_column(String(100))
    scale_id: Mapped[str | None] = mapped_column(String(5))  # IM=Importance, LV=Level
    scale_name: Mapped[str | None] = mapped_column(String(50))
    data_value: Mapped[float | None] = mapped_column(Float)
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetKnowledge(Base):
    """O*NET knowledge domain requirements per occupation (59K rows)."""
    __tablename__ = "fact_onet_knowledge"
    __table_args__ = (
        Index("ix_onet_knowledge_soc", "soc_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    element_id: Mapped[str | None] = mapped_column(String(20))
    element_name: Mapped[str] = mapped_column(String(100))
    scale_id: Mapped[str | None] = mapped_column(String(5))
    scale_name: Mapped[str | None] = mapped_column(String(50))
    data_value: Mapped[float | None] = mapped_column(Float)
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetTechnologySkill(Base):
    """O*NET technology adoptions per occupation (32K rows, 11K hot tech)."""
    __tablename__ = "fact_onet_technology_skills"
    __table_args__ = (
        Index("ix_onet_tech_soc", "soc_code"),
        Index("ix_onet_tech_hot", "is_hot_technology"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    example: Mapped[str | None] = mapped_column(String(200))  # tool/technology name
    commodity_code: Mapped[str | None] = mapped_column(String(20))
    commodity_title: Mapped[str | None] = mapped_column(String(200))
    is_hot_technology: Mapped[bool] = mapped_column(Boolean, default=False)
    in_demand: Mapped[bool] = mapped_column(Boolean, default=False)
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetAlternateTitle(Base):
    """O*NET alternate job titles — 57K synonyms, critical for NLP classification."""
    __tablename__ = "fact_onet_alternate_titles"
    __table_args__ = (
        Index("ix_onet_alt_soc", "soc_code"),
        Index("ix_onet_alt_title", "alternate_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    title: Mapped[str | None] = mapped_column(String(200))  # canonical title
    alternate_title: Mapped[str] = mapped_column(String(300))
    short_title: Mapped[str | None] = mapped_column(String(100))
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetTaskStatement(Base):
    """O*NET core task statements per occupation (18K rows)."""
    __tablename__ = "fact_onet_task_statements"
    __table_args__ = (
        Index("ix_onet_tasks_soc", "soc_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    task_id: Mapped[str | None] = mapped_column(String(20))
    task: Mapped[str] = mapped_column(Text)
    task_type: Mapped[str | None] = mapped_column(String(20))  # Core, Supplemental
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetEmergingTask(Base):
    """O*NET emerging/new tasks — 328 future skill signals."""
    __tablename__ = "fact_onet_emerging_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    task: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(20))  # New, Revised
    date: Mapped[str | None] = mapped_column(String(10))
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))


class OnetRelatedOccupation(Base):
    """O*NET career transition pathways — 18K occupation-to-occupation links."""
    __tablename__ = "fact_onet_related_occupations"
    __table_args__ = (
        Index("ix_onet_related_soc", "soc_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(12))
    related_soc_code: Mapped[str] = mapped_column(String(12))
    related_title: Mapped[str | None] = mapped_column(String(200))
    relatedness_tier: Mapped[str | None] = mapped_column(String(30))  # Primary-Short, Primary-Long, etc.
    relatedness_index: Mapped[int | None] = mapped_column(Integer)
    occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
    related_occupation_id: Mapped[int | None] = mapped_column(ForeignKey("dim_occupation.occupation_id"))
