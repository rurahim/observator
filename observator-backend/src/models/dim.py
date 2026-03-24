from datetime import date as date_type

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base


class DimTime(Base):
    __tablename__ = "dim_time"

    time_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date: Mapped[date_type] = mapped_column(unique=True)
    week: Mapped[int]
    month: Mapped[int]
    quarter: Mapped[int]
    year: Mapped[int]
    month_label: Mapped[str] = mapped_column(String(7))  # '2026-03'


class DimRegion(Base):
    __tablename__ = "dim_region"

    region_code: Mapped[str] = mapped_column(String(10), primary_key=True)
    emirate: Mapped[str] = mapped_column(String(50))
    emirate_ar: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(100))


class DimOccupation(Base):
    __tablename__ = "dim_occupation"

    occupation_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code_isco: Mapped[str | None] = mapped_column(String(10), index=True)
    code_esco: Mapped[str | None] = mapped_column(String(200), unique=True)
    code_soc: Mapped[str | None] = mapped_column(String(10))
    title_en: Mapped[str] = mapped_column(String(300))
    title_ar: Mapped[str | None] = mapped_column(String(300))
    isco_major_group: Mapped[str | None] = mapped_column(String(2))
    synonyms: Mapped[list | None] = mapped_column(ARRAY(Text))


class DimSkill(Base):
    __tablename__ = "dim_skill"

    skill_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    uri_esco: Mapped[str | None] = mapped_column(String(300), unique=True)
    label_en: Mapped[str] = mapped_column(String(300))
    label_ar: Mapped[str | None] = mapped_column(String(300))
    skill_type: Mapped[str | None] = mapped_column(String(20))  # knowledge, skill, competence
    taxonomy: Mapped[str] = mapped_column(String(20), default="ESCO")


class DimSector(Base):
    __tablename__ = "dim_sector"

    sector_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label_en: Mapped[str] = mapped_column(String(200))
    label_ar: Mapped[str | None] = mapped_column(String(200))
    code_isic: Mapped[str | None] = mapped_column(String(10), index=True)
    code_naics: Mapped[str | None] = mapped_column(String(10))


class DimDiscipline(Base):
    __tablename__ = "dim_discipline"

    discipline_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label_en: Mapped[str] = mapped_column(String(200))
    label_ar: Mapped[str | None] = mapped_column(String(200))
    code_isced: Mapped[str | None] = mapped_column(String(10), index=True)


class DimInstitution(Base):
    __tablename__ = "dim_institution"

    institution_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name_en: Mapped[str] = mapped_column(String(300), unique=True)
    name_ar: Mapped[str | None] = mapped_column(String(300))
    emirate: Mapped[str | None] = mapped_column(String(50))
    institution_type: Mapped[str | None] = mapped_column(String(50))


class SdmxCodeLookup(Base):
    __tablename__ = "sdmx_code_lookup"
    __table_args__ = (UniqueConstraint("codelist", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    codelist: Mapped[str] = mapped_column(String(50))
    code: Mapped[str] = mapped_column(String(20))
    label_en: Mapped[str] = mapped_column(String(200))
    label_ar: Mapped[str | None] = mapped_column(String(200))


class CrosswalkSocIsco(Base):
    __tablename__ = "crosswalk_soc_isco"
    __table_args__ = (UniqueConstraint("soc_code", "isco_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(String(10))
    soc_title: Mapped[str | None] = mapped_column(String(300))
    isco_code: Mapped[str] = mapped_column(String(10))
    isco_title: Mapped[str | None] = mapped_column(String(300))
    match_type: Mapped[str] = mapped_column(String(20), default="exact")
