"""Comprehensive analysis of the clean dataset — generates ground truth for frontend validation."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings
import json

e = create_engine(settings.DATABASE_URL_SYNC)

print("=" * 80)
print("COMPREHENSIVE DATA ANALYSIS — CLEAN DATASET")
print("=" * 80)

results = {}

with e.connect() as c:

    # 1. DEMAND
    print("\n" + "=" * 80)
    print("1. DEMAND ANALYSIS")
    print("=" * 80)

    total = c.execute(text("SELECT count(*) FROM fact_demand_vacancies_agg")).scalar()
    classified = c.execute(text("SELECT count(*) FROM fact_demand_vacancies_agg WHERE occupation_id IS NOT NULL")).scalar()
    total_demand_sum = c.execute(text("SELECT SUM(demand_count) FROM fact_demand_vacancies_agg")).scalar()
    print(f"\nTotal demand rows: {total:,}")
    print(f"Total demand_count SUM: {total_demand_sum:,}")
    print(f"Classified: {classified:,}/{total:,} ({classified/total*100:.1f}%)")

    print("\nBy Source:")
    rows = c.execute(text("SELECT COALESCE(source, 'unknown'), count(*), SUM(demand_count) FROM fact_demand_vacancies_agg GROUP BY 1 ORDER BY 3 DESC")).fetchall()
    for r in rows:
        print(f"  {r[0]:25s} {r[1]:>8,} rows  {r[2]:>12,} total_demand")

    print("\nDemand by Emirate (from view):")
    rows = c.execute(text("SELECT emirate, SUM(demand_count) as total FROM vw_demand_jobs GROUP BY emirate ORDER BY total DESC")).fetchall()
    for r in rows:
        print(f"  {r[0]:20s} {r[1]:>12,}")

    print("\nDemand by Year:")
    rows = c.execute(text("""
        SELECT t.year, count(*), SUM(f.demand_count)
        FROM fact_demand_vacancies_agg f JOIN dim_time t ON f.time_id = t.time_id
        GROUP BY t.year ORDER BY t.year
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]}  {r[1]:>8,} rows  {r[2]:>12,} demand")

    print("\nTop 15 Occupations by Demand:")
    rows = c.execute(text("""
        SELECT occupation, SUM(demand_count) as total
        FROM vw_demand_jobs WHERE occupation IS NOT NULL
        GROUP BY occupation ORDER BY total DESC LIMIT 15
    """)).fetchall()
    for r in rows:
        print(f"  {str(r[0])[:45]:45s} {r[1]:>12,}")

    print("\nDemand by Sector (from view):")
    rows = c.execute(text("""
        SELECT sector, SUM(demand_count) as total
        FROM vw_demand_jobs WHERE sector IS NOT NULL
        GROUP BY sector ORDER BY total DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        print(f"  {str(r[0])[:40]:40s} {r[1]:>12,}")

    # 2. SUPPLY
    print("\n" + "=" * 80)
    print("2. SUPPLY ANALYSIS")
    print("=" * 80)

    total_s = c.execute(text("SELECT count(*) FROM fact_supply_talent_agg")).scalar()
    total_supply_sum = c.execute(text("SELECT SUM(supply_count) FROM fact_supply_talent_agg")).scalar()
    print(f"\nTotal supply rows: {total_s:,}")
    print(f"Total supply_count SUM: {total_supply_sum:,}")

    print("\nBy Source (top 10):")
    rows = c.execute(text("SELECT COALESCE(source, 'unknown'), count(*), SUM(supply_count) FROM fact_supply_talent_agg GROUP BY 1 ORDER BY 3 DESC LIMIT 10")).fetchall()
    for r in rows:
        print(f"  {r[0]:45s} {r[1]:>8,} rows  {r[2]:>14,} supply")

    print("\nSupply by Emirate (from view):")
    rows = c.execute(text("SELECT emirate, SUM(supply_count) FROM vw_supply_talent GROUP BY emirate ORDER BY 2 DESC")).fetchall()
    for r in rows:
        print(f"  {str(r[0]):20s} {r[1]:>14,}")

    print("\nSupply by Nationality (top 5):")
    rows = c.execute(text("""
        SELECT COALESCE(nationality, 'unknown'), SUM(supply_count)
        FROM fact_supply_talent_agg
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
    """)).fetchall()
    for r in rows:
        print(f"  {r[0]:20s} {r[1]:>14,}")

    # 3. GAP
    print("\n" + "=" * 80)
    print("3. GAP ANALYSIS")
    print("=" * 80)

    agg = c.execute(text("SELECT SUM(supply_count), SUM(demand_count) FROM vw_gap_cube")).fetchone()
    print(f"\nAggregate from vw_gap_cube:")
    print(f"  Total Supply (summed): {agg[0]:,}")
    print(f"  Total Demand (summed): {agg[1]:,}")
    gap = agg[1] - agg[0]
    sgi = (agg[1] - agg[0]) / agg[1] * 100 if agg[1] > 0 else 0
    print(f"  Gap: {gap:,}")
    print(f"  National SGI: {sgi:.1f}%")

    print("\nGap by Emirate:")
    rows = c.execute(text("""
        SELECT emirate, SUM(supply_count) as s, SUM(demand_count) as d,
               SUM(demand_count) - SUM(supply_count) as gap
        FROM vw_gap_cube WHERE emirate IS NOT NULL
        GROUP BY emirate ORDER BY gap DESC
    """)).fetchall()
    for r in rows:
        sg = (r[2] - r[1]) / r[2] * 100 if r[2] > 0 else 0
        print(f"  {str(r[0]):20s} S={r[1]:>14,}  D={r[2]:>12,}  Gap={r[3]:>12,}  SGI={sg:.1f}%")

    print("\nTop 10 Shortages by Gap:")
    rows = c.execute(text("""
        SELECT occupation, SUM(demand_count) as d, SUM(supply_count) as s,
               SUM(demand_count) - SUM(supply_count) as gap
        FROM vw_gap_cube WHERE occupation IS NOT NULL
        GROUP BY occupation HAVING SUM(demand_count) > SUM(supply_count)
        ORDER BY gap DESC LIMIT 10
    """)).fetchall()
    for r in rows:
        sg = (r[1] - r[2]) / r[1] * 100 if r[1] > 0 else 0
        print(f"  {str(r[0])[:35]:35s} D={r[1]:>12,} S={r[2]:>12,} Gap={r[3]:>12,} SGI={sg:.1f}%")

    # Count critical shortages (SGI > 20%)
    crit = c.execute(text("""
        SELECT count(*) FROM (
            SELECT occupation, SUM(demand_count) as d, SUM(supply_count) as s
            FROM vw_gap_cube WHERE occupation IS NOT NULL
            GROUP BY occupation
            HAVING SUM(demand_count) > 0 AND
                   (SUM(demand_count) - SUM(supply_count))::float / SUM(demand_count) * 100 > 20
        ) sub
    """)).scalar()
    print(f"\nCritical Shortages (SGI > 20%): {crit}")

    # 4. AI IMPACT
    print("\n" + "=" * 80)
    print("4. AI EXPOSURE ANALYSIS")
    print("=" * 80)

    total_ai = c.execute(text("SELECT count(*) FROM fact_ai_exposure_occupation")).scalar()
    scored = c.execute(text("SELECT count(*) FROM fact_ai_exposure_occupation WHERE exposure_0_100 IS NOT NULL")).scalar()
    avg_exp = c.execute(text("SELECT ROUND(AVG(exposure_0_100)::numeric, 1) FROM fact_ai_exposure_occupation WHERE exposure_0_100 IS NOT NULL")).scalar()
    print(f"\nTotal records: {total_ai:,}")
    print(f"With scores: {scored:,}")
    print(f"Average exposure: {avg_exp}/100")

    rows = c.execute(text("SELECT source, count(*), ROUND(AVG(exposure_0_100)::numeric, 1) FROM fact_ai_exposure_occupation WHERE exposure_0_100 IS NOT NULL GROUP BY source ORDER BY 2 DESC")).fetchall()
    print("\nBy Source:")
    for r in rows:
        print(f"  {str(r[0]):30s} {r[1]:>6,} records  avg={r[2]}")

    rows = c.execute(text("""
        SELECT CASE WHEN exposure_0_100 >= 60 THEN 'High (60-100)'
                    WHEN exposure_0_100 >= 30 THEN 'Moderate (30-59)'
                    ELSE 'Low (0-29)' END,
               count(*)
        FROM fact_ai_exposure_occupation WHERE exposure_0_100 IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC
    """)).fetchall()
    print("\nRisk Distribution:")
    for r in rows:
        pct = r[1] / scored * 100
        print(f"  {r[0]:20s} {r[1]:>6,} ({pct:.1f}%)")

    print("\nTop 5 AI Exposed:")
    rows = c.execute(text("""
        SELECT o.title_en, f.exposure_0_100
        FROM fact_ai_exposure_occupation f
        JOIN dim_occupation o ON f.occupation_id = o.occupation_id
        WHERE f.exposure_0_100 IS NOT NULL
        ORDER BY f.exposure_0_100 DESC LIMIT 5
    """)).fetchall()
    for r in rows:
        print(f"  {str(r[0])[:45]:45s} {r[1]}/100")

    # AI by sector (via ISCO major group)
    print("\nAI Exposure by ISCO Major Group:")
    rows = c.execute(text("""
        SELECT isco_major_group, count(*), ROUND(AVG(exposure_0_100)::numeric, 1),
               count(*) FILTER (WHERE exposure_0_100 >= 60) as high_risk
        FROM vw_ai_impact WHERE exposure_0_100 IS NOT NULL AND isco_major_group IS NOT NULL
        GROUP BY isco_major_group ORDER BY 3 DESC
    """)).fetchall()
    for r in rows:
        print(f"  Group {str(r[0]):3s}: {r[1]:>4} occ, avg_exposure={r[2]}, high_risk={r[3]}")

    # 5. EDUCATION
    print("\n" + "=" * 80)
    print("5. EDUCATION")
    print("=" * 80)

    grad = c.execute(text("SELECT count(*), SUM(expected_graduates_count) FROM fact_supply_graduates")).fetchone()
    print(f"\nGraduate records: {grad[0]:,}")
    print(f"Total expected graduates: {grad[1]:,}")

    inst = c.execute(text("SELECT count(*) FROM dim_institution")).scalar()
    disc = c.execute(text("SELECT count(*) FROM dim_discipline")).scalar()
    print(f"Institutions: {inst}")
    print(f"Disciplines: {disc}")

    # 6. SALARY
    print("\n" + "=" * 80)
    print("6. SALARY BENCHMARKS")
    print("=" * 80)

    sal = c.execute(text("SELECT count(*), ROUND(AVG(median_salary)::numeric, 0), ROUND(MIN(min_salary)::numeric, 0), ROUND(MAX(max_salary)::numeric, 0) FROM fact_salary_benchmark")).fetchone()
    print(f"\nRecords: {sal[0]}")
    print(f"Avg median salary: {sal[1]:,} AED/month")
    print(f"Range: {sal[2]:,} — {sal[3]:,} AED/month")

    # 7. SKILLS
    print("\n" + "=" * 80)
    print("7. SKILLS TAXONOMY")
    print("=" * 80)

    occ = c.execute(text("SELECT count(*) FROM dim_occupation")).scalar()
    skills = c.execute(text("SELECT count(*) FROM dim_skill")).scalar()
    mappings = c.execute(text("SELECT count(*) FROM fact_occupation_skills")).scalar()
    print(f"\nOccupations: {occ:,}")
    print(f"Skills: {skills:,}")
    print(f"Mappings: {mappings:,}")

    rows = c.execute(text("SELECT skill_type, count(*) FROM dim_skill GROUP BY 1 ORDER BY 2 DESC")).fetchall()
    print("\nBy type:")
    for r in rows:
        print(f"  {str(r[0]):25s} {r[1]:>6,}")

    # 8. FORECASTS
    print("\n" + "=" * 80)
    print("8. FORECASTS")
    print("=" * 80)

    fc = c.execute(text("SELECT count(*) FROM fact_forecast")).scalar()
    fc_occ = c.execute(text("SELECT count(DISTINCT occupation_id) FROM fact_forecast WHERE occupation_id IS NOT NULL")).scalar()
    print(f"\nForecast points: {fc:,}")
    print(f"Occupations with forecasts: {fc_occ}")

    # SUMMARY FOR FRONTEND VALIDATION
    print("\n" + "=" * 80)
    print("GROUND TRUTH FOR FRONTEND VALIDATION")
    print("=" * 80)
    print(f"""
Dashboard Page:
  National SGI: {sgi:.1f}%
  Critical Shortages: {crit}
  Total Supply (agg): {agg[0]:,}
  Total Demand (agg): {agg[1]:,}
  Emirates with data: 7
  Sectors with data: check vw_demand_jobs sector column

Skill Gap Page:
  Top shortage: {rows[0][0] if rows else 'N/A'} (from gap analysis above)
  Total occupations with gaps: {c.execute(text("SELECT count(DISTINCT occupation) FROM vw_gap_cube WHERE occupation IS NOT NULL")).scalar()}

AI Impact Page:
  Total occupations scored: {scored}
  Average exposure: {avg_exp}/100
  High risk (>=60): {c.execute(text("SELECT count(*) FROM fact_ai_exposure_occupation WHERE exposure_0_100 >= 60")).scalar()}

Forecast Page:
  Forecast points: {fc}
  Occupations: {fc_occ}
""")

e.dispose()
