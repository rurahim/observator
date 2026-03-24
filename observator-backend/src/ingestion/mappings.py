"""All 14 source mapping configurations for _master_tables data.

Each mapping defines: source CSV columns → DB columns + transforms.
"""
from src.ingestion.mapping_registry import ColumnMapping, SourceMapping, registry


# ---------- Row-level transforms for FCSC pivoted data ----------

def _fcsc_dimension_router(row: dict) -> dict | None:
    """Route FCSC dimension_type/dimension_value to the correct DB column.

    dimension_type can be: age_group, education_level, sector, occupation, total
    The value goes into the corresponding fact_supply_talent_agg column.
    Skip 'Total' rows to avoid double-counting.
    """
    dim_type = (row.get("_dim_type") or "").strip().lower()
    dim_value = (row.get("_dim_value") or "").strip()

    # Skip total/aggregate rows
    if dim_value.lower() in ("total", "all", ""):
        return None

    if dim_type == "age_group":
        row["age_group"] = dim_value
    elif dim_type in ("education_level", "education"):
        row["education_level"] = dim_value
    elif dim_type == "sector":
        row["sector_id"] = None  # Would need sector lookup — skip for now
    elif dim_type in ("wage_band", "wage"):
        row["wage_band"] = dim_value

    return row

# ============================================================
# 1. ESCO Occupations → dim_occupation
# ============================================================
ESCO_OCCUPATIONS = SourceMapping(
    source_id="esco_occupations",
    file_pattern="4_taxonomy_esco/esco_occupations.csv",
    target_table="dim_occupation",
    source_label="ESCO",
    dedup_strategy="skip",
    unique_keys=["code_esco"],
    columns=[
        ColumnMapping("esco_uri", "code_esco", "passthrough", required=True),
        ColumnMapping("isco_code", "code_isco", "passthrough"),
        ColumnMapping("isco_code", "isco_major_group", "first_char"),
        ColumnMapping("occupation_en", "title_en", "passthrough", required=True),
        ColumnMapping("occupation_ar", "title_ar", "passthrough"),
    ],
)

# ============================================================
# 2. ESCO Skills → dim_skill
# ============================================================
ESCO_SKILLS = SourceMapping(
    source_id="esco_skills",
    file_pattern="4_taxonomy_esco/esco_skills.csv",
    target_table="dim_skill",
    source_label="ESCO",
    dedup_strategy="skip",
    unique_keys=["uri_esco"],
    columns=[
        ColumnMapping("esco_uri", "uri_esco", "passthrough", required=True),
        ColumnMapping("skill_en", "label_en", "passthrough", required=True),
        ColumnMapping("skill_ar", "label_ar", "passthrough"),
        ColumnMapping("skill_type", "skill_type", "passthrough"),
    ],
    static_columns={"taxonomy": "ESCO"},
)

# ============================================================
# 3. ESCO Occupation-Skill Map → fact_occupation_skills
# ============================================================
ESCO_OCC_SKILL_MAP = SourceMapping(
    source_id="esco_occ_skill_map",
    file_pattern="4_taxonomy_esco/esco_occupation_skill_map.csv",
    target_table="fact_occupation_skills",
    source_label="ESCO",
    dedup_strategy="skip",
    unique_keys=["occupation_id", "skill_id", "source"],
    columns=[
        ColumnMapping("occupation_uri", "occupation_id", "esco_uri_to_occupation_id", required=True),
        ColumnMapping("skill_uri", "skill_id", "esco_uri_to_skill_id", required=True),
        ColumnMapping("relation_type", "relation_type", "passthrough"),
    ],
    static_columns={"source": "ESCO"},
)

# ============================================================
# 4. LinkedIn Jobs → fact_demand_vacancies_agg
# ============================================================
LINKEDIN_JOBS = SourceMapping(
    source_id="linkedin_jobs",
    file_pattern="3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv",
    target_table="fact_demand_vacancies_agg",
    source_label="linkedin",
    batch_size=500,
    columns=[
        ColumnMapping("date", "time_id", "date_to_time_id", required=True),
        ColumnMapping("location", "region_code", "location_to_region", required=True),
        ColumnMapping("occupation", "occupation_id", "isco_major_group_to_occupation_id"),
        ColumnMapping("industry", "sector_id", "industry_to_sector_id"),
        ColumnMapping("experience", "experience_band", "passthrough"),
    ],
    static_columns={"demand_count": 1, "source": "linkedin"},
)

# ============================================================
# 5. FCSC Employment → fact_supply_talent_agg
# ============================================================
FCSC_EMPLOYMENT = SourceMapping(
    source_id="fcsc_employment",
    file_pattern="1_supply_workforce/fcsc_employment_master.csv",
    target_table="fact_supply_talent_agg",
    source_label="FCSC",
    columns=[
        ColumnMapping("year", "time_id", "year_to_time_id", required=True),
        ColumnMapping("nationality", "nationality", "nationality_normalize"),
        ColumnMapping("gender", "gender", "gender_normalize"),
        ColumnMapping("dimension_type", "_dim_type", "passthrough"),
        ColumnMapping("dimension_value", "_dim_value", "passthrough"),
        ColumnMapping("pct", "supply_count", "to_int"),
    ],
    static_columns={"region_code": "AUH", "source": "FCSC"},
    row_transform=_fcsc_dimension_router,
)

# ============================================================
# 6. FCSC Labour Force → fact_supply_talent_agg
# ============================================================
FCSC_LABOUR_FORCE = SourceMapping(
    source_id="fcsc_labour_force",
    file_pattern="1_supply_workforce/fcsc_labour_force_master.csv",
    target_table="fact_supply_talent_agg",
    source_label="FCSC",
    columns=[
        ColumnMapping("year", "time_id", "year_to_time_id", required=True),
        ColumnMapping("nationality", "nationality", "nationality_normalize"),
        ColumnMapping("gender", "gender", "gender_normalize"),
        ColumnMapping("dimension_type", "_dim_type", "passthrough"),
        ColumnMapping("dimension_value", "_dim_value", "passthrough"),
        ColumnMapping("count_pct", "supply_count", "to_int"),
    ],
    static_columns={"region_code": "AUH", "source": "FCSC"},
    row_transform=_fcsc_dimension_router,
)

# ============================================================
# 7. FCSC Unemployment → fact_supply_talent_agg
# ============================================================
FCSC_UNEMPLOYMENT = SourceMapping(
    source_id="fcsc_unemployment",
    file_pattern="1_supply_workforce/fcsc_unemployment_master.csv",
    target_table="fact_supply_talent_agg",
    source_label="FCSC",
    columns=[
        ColumnMapping("year", "time_id", "year_to_time_id", required=True),
        ColumnMapping("gender", "gender", "gender_normalize"),
        ColumnMapping("dimension_type", "_dim_type", "passthrough"),
        ColumnMapping("dimension_value", "_dim_value", "passthrough"),
        ColumnMapping("count_pct", "supply_count", "to_int"),
    ],
    static_columns={"region_code": "AUH", "source": "FCSC"},
    row_transform=_fcsc_dimension_router,
)

# ============================================================
# 8. AI Impact Occupations → fact_ai_exposure_occupation
# ============================================================
AI_IMPACT = SourceMapping(
    source_id="ai_impact",
    file_pattern="6_ai_impact/ai_impact_occupations.csv",
    target_table="fact_ai_exposure_occupation",
    source_label="AIOE",
    columns=[
        ColumnMapping("soc_code", "occupation_id", "soc_to_occupation_id"),
        ColumnMapping("aioe_score", "exposure_0_100", "to_float"),
        ColumnMapping("risk_level", "_risk_level", "passthrough"),
    ],
    static_columns={"source": "AIOE", "version": "v1"},
)

# ============================================================
# 9. AIOE Scores → fact_ai_exposure_occupation
# ============================================================
AIOE_SCORES = SourceMapping(
    source_id="aioe_scores",
    file_pattern="6_ai_impact/aioe_occupation_scores.csv",
    target_table="fact_ai_exposure_occupation",
    source_label="AIOE",
    columns=[
        ColumnMapping("SOC Code", "occupation_id", "soc_to_occupation_id"),
        ColumnMapping("AIOE", "exposure_z", "to_float"),
    ],
    static_columns={"source": "AIOE_raw", "version": "v1"},
)

# ============================================================
# 10. Crosswalk SOC → ISCO
# ============================================================
CROSSWALK = SourceMapping(
    source_id="crosswalk",
    file_pattern="7_crosswalks/bls_isco08_to_soc2010_crosswalk.csv",
    target_table="crosswalk_soc_isco",
    source_label="BLS",
    dedup_strategy="skip",
    unique_keys=["soc_code", "isco_code"],
    columns=[
        ColumnMapping("soc2010_code", "soc_code", "passthrough", required=True),
        ColumnMapping("soc2010_title", "soc_title", "passthrough"),
        ColumnMapping("isco08_code", "isco_code", "passthrough", required=True),
        ColumnMapping("isco08_title", "isco_title", "passthrough"),
        ColumnMapping("part_flag", "match_type", "passthrough", default="exact"),
    ],
)

# ============================================================
# 11. Bayanat Private Sector by Occupation → fact_supply_talent_agg
#     (employment_by_occupation_in_private_sector_data_set.csv)
# ============================================================
BAYANAT_PRIVATE_OCCUPATION = SourceMapping(
    source_id="bayanat_private_occupation",
    file_pattern="8_bayanat_employment/employment_by_occupation_in_private_sector_data_set.csv",
    target_table="fact_supply_talent_agg",
    source_label="bayanat",
    batch_size=500,
    columns=[
        ColumnMapping("Year", "time_id", "yyyymm_to_time_id", required=True),
        ColumnMapping("Gender_EN", "gender", "gender_normalize"),
        ColumnMapping("Age_Class_En", "age_group", "passthrough"),
        ColumnMapping("Emirate_EN", "region_code", "emirate_to_region_code", required=True),
        # NOTE: occupation_id deliberately omitted — Bayanat ISCO major groups are too
        # coarse for per-occupation SGI. Data contributes to aggregate supply by region/time.
        ColumnMapping("E_MOHRE_Count", "supply_count", "to_int"),
    ],
    static_columns={"source": "bayanat", "nationality": "expat"},
)

# ============================================================
# 12. Bayanat Economic Activity files → fact_supply_talent_agg
#     (distribution_of_employed_population_by_economic_activity_*)
# ============================================================
BAYANAT_PRIVATE_ECONOMIC = SourceMapping(
    source_id="bayanat_private_economic",
    file_pattern="8_bayanat_employment/distribution_of_employed_population_by_economic_activity_and_gender_in_abu_dhabi.csv",
    target_table="fact_supply_talent_agg",
    source_label="bayanat",
    columns=[
        ColumnMapping("Year", "time_id", "year_to_time_id", required=True),
        ColumnMapping("Emirate", "region_code", "emirate_to_region_code"),
        ColumnMapping("Economic Activity", "sector_id", "activity_to_sector_id"),
        ColumnMapping("Gender", "gender", "gender_normalize"),
        ColumnMapping("Percentage_of_Employed_Population (percent)", "supply_count", "to_int"),
    ],
    static_columns={"source": "bayanat"},
)

# ============================================================
# 13. HE Institutions → dim_institution
# ============================================================
HE_INSTITUTIONS = SourceMapping(
    source_id="he_institutions",
    file_pattern="2_supply_education/uae_he_institutions_master.csv",
    target_table="dim_institution",
    source_label="MOHESR",
    dedup_strategy="skip",
    unique_keys=["name_en"],
    columns=[
        ColumnMapping("institution_en", "name_en", "passthrough", required=True),
        ColumnMapping("institution_ar", "name_ar", "passthrough"),
        ColumnMapping("emirate_en", "emirate", "passthrough"),
        ColumnMapping("sector_en", "institution_type", "passthrough"),
    ],
)

# ============================================================
# 14. MOHRE KPI Tracker — METADATA ONLY, not loaded into fact tables.
#     Values are KPIs (growth rates, subscriber counts), not workforce supply.
#     Kept in registry for auto-detect but seed script skips it.
# ============================================================
MOHRE_KPI = SourceMapping(
    source_id="mohre_kpi",
    file_pattern="1_supply_workforce/mohre_kpi_tracker.csv",
    target_table="_metadata_only",  # sentinel — seed script checks this
    source_label="MOHRE",
    columns=[
        ColumnMapping("year", "time_id", "year_to_time_id", required=True),
        ColumnMapping("value", "supply_count", "to_int"),
    ],
    static_columns={"region_code": "AUH", "source": "MOHRE"},
)


# ============================================================
# Register all mappings
# ============================================================
ALL_MAPPINGS = [
    ESCO_OCCUPATIONS,
    ESCO_SKILLS,
    ESCO_OCC_SKILL_MAP,
    LINKEDIN_JOBS,
    FCSC_EMPLOYMENT,
    FCSC_LABOUR_FORCE,
    FCSC_UNEMPLOYMENT,
    AI_IMPACT,
    AIOE_SCORES,
    CROSSWALK,
    BAYANAT_PRIVATE_OCCUPATION,
    BAYANAT_PRIVATE_ECONOMIC,
    HE_INSTITUTIONS,
    MOHRE_KPI,
]

for _m in ALL_MAPPINGS:
    registry.register(_m)
