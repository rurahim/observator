ANALYZE;
SELECT 'dim_occupation' as tbl, count(*) as cnt FROM dim_occupation UNION ALL
SELECT 'dim_skill', count(*) FROM dim_skill UNION ALL
SELECT 'dim_sector', count(*) FROM dim_sector UNION ALL
SELECT 'dim_region', count(*) FROM dim_region UNION ALL
SELECT 'dim_time', count(*) FROM dim_time UNION ALL
SELECT 'dim_institution', count(*) FROM dim_institution UNION ALL
SELECT 'crosswalk_soc_isco', count(*) FROM crosswalk_soc_isco UNION ALL
SELECT 'fact_demand', count(*) FROM fact_demand_vacancies_agg UNION ALL
SELECT 'fact_supply', count(*) FROM fact_supply_talent_agg UNION ALL
SELECT 'fact_ai_exposure', count(*) FROM fact_ai_exposure_occupation UNION ALL
SELECT 'fact_occ_skills', count(*) FROM fact_occupation_skills UNION ALL
SELECT 'fact_salary', count(*) FROM fact_salary_benchmark UNION ALL
SELECT 'fact_graduates', count(*) FROM fact_supply_graduates UNION ALL
SELECT 'fact_forecast', count(*) FROM fact_forecast UNION ALL
SELECT 'vw_demand_jobs', count(*) FROM vw_demand_jobs UNION ALL
SELECT 'vw_supply_talent', count(*) FROM vw_supply_talent UNION ALL
SELECT 'vw_gap_cube', count(*) FROM vw_gap_cube UNION ALL
SELECT 'vw_ai_impact', count(*) FROM vw_ai_impact UNION ALL
SELECT 'vw_forecast', count(*) FROM vw_forecast_demand UNION ALL
SELECT 'users', count(*) FROM users
ORDER BY 2 DESC;
