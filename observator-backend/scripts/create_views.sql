-- Materialized views for the Observator analytics layer
-- These are the ONLY views accessible from the chat/dashboard layer

-- vw_supply_talent: aggregated talent supply by time, region, occupation
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_supply_talent AS
SELECT
    t.year,
    t.quarter,
    t.month_label,
    r.emirate,
    r.region_code,
    o.title_en AS occupation,
    o.code_isco,
    o.isco_major_group,
    s.label_en AS sector,
    f.gender,
    f.education_level,
    f.nationality,
    f.age_group,
    f.wage_band,
    f.source AS data_source,
    SUM(f.supply_count) AS supply_count
FROM fact_supply_talent_agg f
JOIN dim_time t ON f.time_id = t.time_id
JOIN dim_region r ON f.region_code = r.region_code
LEFT JOIN dim_occupation o ON f.occupation_id = o.occupation_id
LEFT JOIN dim_sector s ON f.sector_id = s.sector_id
GROUP BY t.year, t.quarter, t.month_label, r.emirate, r.region_code,
         o.title_en, o.code_isco, o.isco_major_group, s.label_en,
         f.gender, f.education_level, f.nationality, f.age_group, f.wage_band, f.source;

CREATE INDEX IF NOT EXISTS ix_vw_supply_talent_year ON vw_supply_talent (year);
CREATE INDEX IF NOT EXISTS ix_vw_supply_talent_region ON vw_supply_talent (region_code);
CREATE INDEX IF NOT EXISTS ix_vw_supply_talent_isco ON vw_supply_talent (code_isco);

-- vw_demand_jobs: aggregated job demand by time, region, occupation, sector
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_demand_jobs AS
SELECT
    t.year,
    t.quarter,
    t.month_label,
    r.emirate,
    r.region_code,
    o.title_en AS occupation,
    o.code_isco,
    s.label_en AS sector,
    f.experience_band,
    SUM(f.demand_count) AS demand_count
FROM fact_demand_vacancies_agg f
JOIN dim_time t ON f.time_id = t.time_id
JOIN dim_region r ON f.region_code = r.region_code
LEFT JOIN dim_occupation o ON f.occupation_id = o.occupation_id
LEFT JOIN dim_sector s ON f.sector_id = s.sector_id
GROUP BY t.year, t.quarter, t.month_label, r.emirate, r.region_code,
         o.title_en, o.code_isco, s.label_en, f.experience_band;

CREATE INDEX IF NOT EXISTS ix_vw_demand_jobs_year ON vw_demand_jobs (year);
CREATE INDEX IF NOT EXISTS ix_vw_demand_jobs_region ON vw_demand_jobs (region_code);
CREATE INDEX IF NOT EXISTS ix_vw_demand_jobs_isco ON vw_demand_jobs (code_isco);

-- vw_supply_education: graduate supply pipeline
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_supply_education AS
SELECT
    f.year,
    r.emirate,
    r.region_code,
    i.name_en AS institution,
    i.institution_type,
    d.label_en AS discipline,
    d.code_isced,
    f.gender,
    f.nationality,
    f.source AS data_source,
    SUM(f.expected_graduates_count) AS graduates_count
FROM fact_supply_graduates f
LEFT JOIN dim_region r ON f.region_code = r.region_code
LEFT JOIN dim_institution i ON f.institution_id = i.institution_id
LEFT JOIN dim_discipline d ON f.discipline_id = d.discipline_id
GROUP BY f.year, r.emirate, r.region_code, i.name_en, i.institution_type,
         d.label_en, d.code_isced, f.gender, f.nationality, f.source;

CREATE INDEX IF NOT EXISTS ix_vw_supply_education_year ON vw_supply_education (year);

-- vw_ai_impact: AI exposure scores joined with occupation details
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_ai_impact AS
SELECT
    o.occupation_id,
    o.title_en AS occupation,
    o.code_isco,
    o.isco_major_group,
    ai.exposure_z,
    ai.exposure_0_100,
    ai.automation_probability,
    ai.llm_exposure,
    ai.source,
    ai.version
FROM fact_ai_exposure_occupation ai
JOIN dim_occupation o ON ai.occupation_id = o.occupation_id;

CREATE INDEX IF NOT EXISTS ix_vw_ai_impact_isco ON vw_ai_impact (code_isco);
CREATE INDEX IF NOT EXISTS ix_vw_ai_impact_exposure ON vw_ai_impact (exposure_0_100);

-- vw_gap_cube: UNIFIED supply vs demand gap analysis
-- FIX: Uses LATEST YEAR ONLY for supply (not sum across all years)
-- and ONE row per (region_code, code_isco) to prevent cartesian product.
-- Includes ESCO skills count + AI risk — all sources in one view
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_gap_cube AS
WITH latest_supply AS (
    -- ONE row per (region_code, code_isco): latest year's supply only
    -- DISTINCT ON picks the row with the most recent year, then highest count
    SELECT DISTINCT ON (region_code, code_isco)
        region_code,
        code_isco,
        emirate,
        occupation,
        isco_major_group,
        sector,
        gender,
        year AS supply_year,
        data_source AS supply_source,
        supply_count
    FROM (
        SELECT
            region_code, code_isco,
            MAX(emirate) AS emirate,
            MAX(occupation) AS occupation,
            MAX(isco_major_group) AS isco_major_group,
            MODE() WITHIN GROUP (ORDER BY sector) AS sector,
            MODE() WITHIN GROUP (ORDER BY gender) AS gender,
            year,
            data_source,
            SUM(supply_count) AS supply_count
        FROM vw_supply_talent
        WHERE code_isco IS NOT NULL
        GROUP BY region_code, code_isco, year, data_source
    ) sub
    ORDER BY region_code, code_isco, year DESC, supply_count DESC
),
demand_agg AS (
    -- ONE row per (region_code, code_isco): total demand across all sources
    SELECT
        region_code,
        code_isco,
        MAX(emirate) AS emirate,
        MAX(occupation) AS occupation,
        MODE() WITHIN GROUP (ORDER BY sector) AS sector,
        SUM(demand_count) AS demand_count
    FROM vw_demand_jobs
    WHERE code_isco IS NOT NULL
    GROUP BY region_code, code_isco
),
skills_count AS (
    -- ESCO + O*NET skills per ISCO code
    SELECT o.code_isco,
           COUNT(*) AS total_skills,
           COUNT(*) FILTER (WHERE os.relation_type = 'essential') AS essential_skills
    FROM fact_occupation_skills os
    JOIN dim_occupation o ON os.occupation_id = o.occupation_id
    GROUP BY o.code_isco
),
ai_scores AS (
    SELECT code_isco,
           AVG(exposure_0_100) AS exposure_0_100,
           AVG(automation_probability) AS automation_probability
    FROM vw_ai_impact
    WHERE exposure_0_100 IS NOT NULL
    GROUP BY code_isco
)
SELECT
    COALESCE(s.region_code, d.region_code) AS region_code,
    COALESCE(s.emirate, d.emirate) AS emirate,
    COALESCE(s.occupation, d.occupation) AS occupation,
    COALESCE(s.code_isco, d.code_isco) AS code_isco,
    s.isco_major_group,
    COALESCE(s.sector, d.sector) AS sector,
    s.gender,
    s.supply_year,
    s.supply_source,
    COALESCE(s.supply_count, 0) AS supply_count,
    COALESCE(d.demand_count, 0) AS demand_count,
    (COALESCE(s.supply_count, 0) - COALESCE(d.demand_count, 0)) AS gap_abs,
    CASE
        WHEN COALESCE(d.demand_count, 0) = 0 THEN NULL
        ELSE ROUND((COALESCE(s.supply_count, 0)::numeric - d.demand_count) / d.demand_count * 100, 2)
    END AS gap_ratio,
    sk.total_skills,
    sk.essential_skills,
    ai.exposure_0_100 AS ai_exposure_score,
    ai.automation_probability
FROM latest_supply s
FULL OUTER JOIN demand_agg d
    ON s.region_code = d.region_code AND s.code_isco = d.code_isco
LEFT JOIN skills_count sk
    ON COALESCE(s.code_isco, d.code_isco) = sk.code_isco
LEFT JOIN ai_scores ai
    ON COALESCE(s.code_isco, d.code_isco) = ai.code_isco;

CREATE INDEX IF NOT EXISTS ix_vw_gap_cube_region ON vw_gap_cube (region_code);
CREATE INDEX IF NOT EXISTS ix_vw_gap_cube_isco ON vw_gap_cube (code_isco);
CREATE INDEX IF NOT EXISTS ix_vw_gap_cube_supply ON vw_gap_cube (supply_count);
CREATE INDEX IF NOT EXISTS ix_vw_gap_cube_demand ON vw_gap_cube (demand_count);

-- vw_forecast_demand: forecast predictions joined with dimensions
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_forecast_demand AS
SELECT
    f.forecast_date,
    f.horizon_months,
    r.emirate,
    r.region_code,
    o.title_en AS occupation,
    o.code_isco,
    s.label_en AS sector,
    f.predicted_demand,
    f.predicted_supply,
    f.predicted_gap,
    f.confidence_lower,
    f.confidence_upper,
    f.model_name,
    f.model_version
FROM fact_forecast f
LEFT JOIN dim_region r ON f.region_code = r.region_code
LEFT JOIN dim_occupation o ON f.occupation_id = o.occupation_id
LEFT JOIN dim_sector s ON f.sector_id = s.sector_id;

CREATE INDEX IF NOT EXISTS ix_vw_forecast_date ON vw_forecast_demand (forecast_date);
