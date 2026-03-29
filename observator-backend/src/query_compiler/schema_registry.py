"""Registry of materialized view schemas — single source of truth for the compiler and LLM tools."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ViewColumn:
    name: str
    dtype: str  # int, float, str, date
    filterable: bool = True
    aggregatable: bool = False
    description: str = ""


@dataclass(frozen=True)
class ViewSchema:
    name: str
    description: str
    columns: tuple[ViewColumn, ...]
    default_order: str = ""
    supports_group_by: bool = True

    @property
    def column_names(self) -> set[str]:
        return {c.name for c in self.columns}

    @property
    def filterable_columns(self) -> set[str]:
        return {c.name for c in self.columns if c.filterable}

    @property
    def aggregatable_columns(self) -> set[str]:
        return {c.name for c in self.columns if c.aggregatable}

    def to_tool_description(self) -> str:
        """Generate LLM-readable description for tool calling."""
        cols = "\n".join(
            f"  - {c.name} ({c.dtype}): {c.description}"
            for c in self.columns
        )
        return f"View: {self.name}\n{self.description}\nColumns:\n{cols}"


# --- View definitions ---

VW_SUPPLY_TALENT = ViewSchema(
    name="vw_supply_talent",
    description="Aggregated talent supply (workforce) by time, region, occupation, sector, demographics",
    columns=(
        ViewColumn("year", "int", description="Calendar year"),
        ViewColumn("quarter", "int", description="Quarter (1-4)"),
        ViewColumn("month_label", "str", description="Month label (YYYY-MM)"),
        ViewColumn("emirate", "str", description="Emirate name"),
        ViewColumn("region_code", "str", description="Region code (DXB, AUH, SHJ, etc.)"),
        ViewColumn("occupation", "str", description="Occupation title (English)"),
        ViewColumn("code_isco", "str", description="ISCO-08 occupation code"),
        ViewColumn("isco_major_group", "str", description="ISCO major group (1-digit)"),
        ViewColumn("sector", "str", description="Economic sector"),
        ViewColumn("gender", "str", description="Gender (Male/Female)"),
        ViewColumn("education_level", "str", description="Education level"),
        ViewColumn("nationality", "str", description="Nationality category (citizen/expat)"),
        ViewColumn("age_group", "str", description="Age group band"),
        ViewColumn("wage_band", "str", description="Wage band"),
        ViewColumn("supply_count", "int", aggregatable=True, filterable=False, description="Number of workers"),
    ),
    default_order="supply_count DESC",
)

VW_DEMAND_JOBS = ViewSchema(
    name="vw_demand_jobs",
    description="Aggregated job demand (vacancies) by time, region, occupation, sector",
    columns=(
        ViewColumn("year", "int", description="Calendar year"),
        ViewColumn("quarter", "int", description="Quarter (1-4)"),
        ViewColumn("month_label", "str", description="Month label (YYYY-MM)"),
        ViewColumn("emirate", "str", description="Emirate name"),
        ViewColumn("region_code", "str", description="Region code"),
        ViewColumn("occupation", "str", description="Occupation title (English)"),
        ViewColumn("code_isco", "str", description="ISCO-08 occupation code"),
        ViewColumn("sector", "str", description="Economic sector"),
        ViewColumn("experience_band", "str", description="Experience level band"),
        ViewColumn("demand_count", "int", aggregatable=True, filterable=False, description="Number of vacancies"),
    ),
    default_order="demand_count DESC",
)

VW_SUPPLY_EDUCATION = ViewSchema(
    name="vw_supply_education",
    description="Graduate supply pipeline by institution, discipline, demographics",
    columns=(
        ViewColumn("year", "int", description="Graduation year"),
        ViewColumn("emirate", "str", description="Emirate name"),
        ViewColumn("region_code", "str", description="Region code"),
        ViewColumn("institution", "str", description="Institution name"),
        ViewColumn("institution_type", "str", description="Type of institution"),
        ViewColumn("discipline", "str", description="Academic discipline"),
        ViewColumn("code_isced", "str", description="ISCED classification code"),
        ViewColumn("gender", "str", description="Gender"),
        ViewColumn("nationality", "str", description="Nationality"),
        ViewColumn("graduates_count", "int", aggregatable=True, filterable=False, description="Expected graduate count"),
    ),
    default_order="graduates_count DESC",
)

VW_AI_IMPACT = ViewSchema(
    name="vw_ai_impact",
    description="AI exposure and automation risk scores per occupation",
    columns=(
        ViewColumn("occupation_id", "int", description="Occupation ID"),
        ViewColumn("occupation", "str", description="Occupation title (English)"),
        ViewColumn("code_isco", "str", description="ISCO-08 occupation code"),
        ViewColumn("isco_major_group", "str", description="ISCO major group"),
        ViewColumn("exposure_z", "float", filterable=False, description="AI exposure z-score"),
        ViewColumn("exposure_0_100", "float", aggregatable=True, description="AI exposure score (0-100)"),
        ViewColumn("automation_probability", "float", aggregatable=True, description="Automation probability (0-1)"),
        ViewColumn("llm_exposure", "float", aggregatable=True, description="LLM exposure score"),
        ViewColumn("source", "str", description="Data source (AIOE, FreyOsborne, GPTs_are_GPTs)"),
        ViewColumn("version", "str", description="Dataset version"),
    ),
    default_order="exposure_0_100 DESC",
)

VW_GAP_CUBE = ViewSchema(
    name="vw_gap_cube",
    description="Supply vs demand gap analysis with AI exposure, per occupation/region/time",
    columns=(
        ViewColumn("year", "int", description="Calendar year"),
        ViewColumn("quarter", "int", description="Quarter"),
        ViewColumn("month_label", "str", description="Month label"),
        ViewColumn("region_code", "str", description="Region code"),
        ViewColumn("emirate", "str", description="Emirate name"),
        ViewColumn("occupation", "str", description="Occupation title"),
        ViewColumn("code_isco", "str", description="ISCO-08 code"),
        ViewColumn("sector", "str", description="Economic sector"),
        ViewColumn("gender", "str", description="Gender"),
        ViewColumn("supply_count", "int", aggregatable=True, filterable=False, description="Supply count"),
        ViewColumn("demand_count", "int", aggregatable=True, filterable=False, description="Demand count"),
        ViewColumn("gap_abs", "int", aggregatable=True, filterable=False, description="Absolute gap (supply - demand)"),
        ViewColumn("gap_ratio", "float", filterable=False, description="Gap ratio (%)"),
        ViewColumn("ai_exposure_score", "float", filterable=False, description="Average AI exposure (0-100)"),
    ),
    default_order="gap_abs DESC",
)

VW_FORECAST_DEMAND = ViewSchema(
    name="vw_forecast_demand",
    description="Demand/supply forecasts with confidence intervals",
    columns=(
        ViewColumn("forecast_date", "str", description="Forecast target date (YYYY-MM)"),
        ViewColumn("horizon_months", "int", description="Forecast horizon in months"),
        ViewColumn("emirate", "str", description="Emirate"),
        ViewColumn("region_code", "str", description="Region code"),
        ViewColumn("occupation", "str", description="Occupation title"),
        ViewColumn("code_isco", "str", description="ISCO-08 code"),
        ViewColumn("sector", "str", description="Economic sector"),
        ViewColumn("predicted_demand", "float", aggregatable=True, filterable=False, description="Predicted demand"),
        ViewColumn("predicted_supply", "float", aggregatable=True, filterable=False, description="Predicted supply"),
        ViewColumn("predicted_gap", "float", aggregatable=True, filterable=False, description="Predicted gap"),
        ViewColumn("confidence_lower", "float", filterable=False, description="Lower confidence bound"),
        ViewColumn("confidence_upper", "float", filterable=False, description="Upper confidence bound"),
        ViewColumn("model_name", "str", description="Forecast model name"),
        ViewColumn("model_version", "str", description="Model version"),
    ),
    default_order="forecast_date ASC",
)


# ── Supply Dashboard Tables (exposed as queryable "views") ──

TBL_PROGRAM_ENROLLMENT = ViewSchema(
    name="fact_program_enrollment",
    description="Higher education enrollment data by year, emirate, sector (gov/private), gender, nationality, specialization. Contains actual counts and estimated data with source tracking.",
    columns=(
        ViewColumn("year", "int", description="Academic year"),
        ViewColumn("region_code", "str", description="Emirate code (AUH, DXB, SHJ, AJM, RAK, FUJ, UAQ)"),
        ViewColumn("sector", "str", description="Government or private"),
        ViewColumn("gender", "str", description="M or F"),
        ViewColumn("nationality", "str", description="citizen or expat"),
        ViewColumn("specialization", "str", description="Field of study (Engineering, Business & Economics, IT, Health, Education, etc.)"),
        ViewColumn("enrollment_count", "int", aggregatable=True, filterable=False, description="Number of enrolled students"),
        ViewColumn("is_estimated", "str", description="true if data is estimated, false if actual"),
        ViewColumn("data_type", "str", description="actual, estimated, actual_partial, or percentage"),
        ViewColumn("source", "str", description="Data source (bayanat_emirate_sector, bayanat_gov_specialty, CEIC, etc.)"),
    ),
    default_order="enrollment_count DESC",
)

TBL_GRADUATE_OUTCOMES = ViewSchema(
    name="fact_graduate_outcomes",
    description="Graduate data by year, institution, college, degree level, specialization, gender, nationality, STEM indicator. Has actual counts for UAEU and by specialty, percentages for other institutions.",
    columns=(
        ViewColumn("year", "int", description="Graduation year"),
        ViewColumn("region_code", "str", description="Emirate code"),
        ViewColumn("college", "str", description="College name (for UAEU: Business & Economics, Engineering, etc.)"),
        ViewColumn("degree_level", "str", description="Undergraduate, Master, Doctorate"),
        ViewColumn("specialization", "str", description="Field of study"),
        ViewColumn("stem_indicator", "str", description="STEM category: S, T, E, M, NS (non-STEM), or S,M"),
        ViewColumn("gender", "str", description="M or F"),
        ViewColumn("nationality", "str", description="citizen or expat"),
        ViewColumn("graduate_count", "int", aggregatable=True, filterable=False, description="Number of graduates (actual count)"),
        ViewColumn("graduate_pct", "float", aggregatable=True, filterable=False, description="Graduate percentage (when count unavailable)"),
        ViewColumn("source", "str", description="Data source"),
    ),
    default_order="graduate_count DESC",
)

TBL_PROGRAMS = ViewSchema(
    name="dim_program",
    description="Academic programs offered by UAE institutions — 3,433 programs from CAA + scraped university websites. Columns: program_name, degree_level, specialization (field), college, institution_id, source.",
    columns=(
        ViewColumn("program_name", "str", description="Full program name"),
        ViewColumn("degree_level", "str", description="Bachelor, Master, PhD, Diploma, Certificate, PG Diploma, Foundation"),
        ViewColumn("specialization", "str", description="Field of study (Business/Management, Engineering, Health Sciences, Comp.Sci/IT, etc.)"),
        ViewColumn("college", "str", description="College/department within institution"),
        ViewColumn("institution_id", "int", description="FK to dim_institution"),
        ViewColumn("source", "str", description="caa_accredited or web_scrape"),
    ),
    default_order="program_name",
)

TBL_INSTITUTIONS = ViewSchema(
    name="dim_institution",
    description="UAE higher education institutions — 168 total with names (EN/AR), emirate, type, website, GPS coordinates.",
    columns=(
        ViewColumn("name_en", "str", description="Institution name in English"),
        ViewColumn("name_ar", "str", description="Institution name in Arabic"),
        ViewColumn("emirate", "str", description="Emirate name"),
        ViewColumn("institution_type", "str", description="Institution type"),
        ViewColumn("website", "str", description="Institution website URL"),
        ViewColumn("license_status", "str", description="CAA license status (Active)"),
    ),
    default_order="name_en",
)


VIEW_SCHEMAS: dict[str, ViewSchema] = {
    vs.name: vs for vs in [
        VW_SUPPLY_TALENT, VW_DEMAND_JOBS, VW_SUPPLY_EDUCATION,
        VW_AI_IMPACT, VW_GAP_CUBE, VW_FORECAST_DEMAND,
        TBL_PROGRAM_ENROLLMENT, TBL_GRADUATE_OUTCOMES, TBL_PROGRAMS, TBL_INSTITUTIONS,
    ]
}
