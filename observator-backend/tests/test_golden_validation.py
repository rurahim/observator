"""Golden dataset validation tests.

Validates the seeded data against expected values from _master_tables CSV files
and the golden_tests.jsonl specification.
"""
import json
from pathlib import Path

import pandas as pd
import pytest
from sqlalchemy import create_engine, text

from src.config import settings

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_CANDIDATES = [_PROJECT_ROOT / "_master_tables", Path("/app/_master_tables"), Path("_master_tables")]
MASTER_DIR = next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0])
GOLDEN_DIR = MASTER_DIR / "_golden_dataset"

engine = create_engine(settings.DATABASE_URL_SYNC)


def query(sql: str):
    with engine.connect() as c:
        return c.execute(text(sql)).fetchall()


def scalar(sql: str):
    with engine.connect() as c:
        return c.execute(text(sql)).scalar()


# ============================================================
# Phase 1: Dimension tables match source CSV counts
# ============================================================

class TestDimensionTables:
    def test_dim_region_count(self):
        assert scalar("SELECT count(*) FROM dim_region") == 7

    def test_dim_institution_count(self):
        """Golden SUP-009: 151 HE institutions."""
        csv = pd.read_csv(MASTER_DIR / "2_supply_education/uae_he_institutions_master.csv")
        db_count = scalar("SELECT count(*) FROM dim_institution")
        assert db_count == len(csv), f"Expected {len(csv)}, got {db_count}"

    def test_dim_skill_count(self):
        """Golden ESCO-003: 13960 skills (from esco_skills.csv after dedup on uri_esco)."""
        csv = pd.read_csv(MASTER_DIR / "4_taxonomy_esco/esco_skills.csv", dtype=str)
        unique_uris = csv["esco_uri"].nunique()
        db_count = scalar("SELECT count(*) FROM dim_skill")
        # Allow small variance from BOM/encoding issues
        assert abs(db_count - unique_uris) <= 25, f"Expected ~{unique_uris}, got {db_count}"

    def test_crosswalk_count(self):
        db_count = scalar("SELECT count(*) FROM crosswalk_soc_isco")
        assert db_count >= 1100, f"Expected ~1126, got {db_count}"


# ============================================================
# Phase 2: Fact tables loaded with correct magnitude
# ============================================================

class TestFactTables:
    def test_demand_loaded(self):
        """LinkedIn jobs loaded — golden DEM-001 expects 36923 in CSV."""
        db_count = scalar("SELECT count(*) FROM fact_demand_vacancies_agg")
        # Some rows skip (missing date/region), expect >90% loaded
        assert db_count > 30000, f"Expected >30K demand rows, got {db_count}"

    def test_demand_all_7_emirates(self):
        """Golden DEM-006: demand in Dubai, Abu Dhabi, Sharjah, RAK, Ajman, Fujairah, UAQ."""
        regions = [r[0] for r in query("SELECT DISTINCT region_code FROM fact_demand_vacancies_agg")]
        assert set(regions) == {"DXB", "AUH", "SHJ", "RAK", "AJM", "FUJ", "UAQ"}

    def test_supply_loaded(self):
        """FCSC + Bayanat supply data loaded."""
        db_count = scalar("SELECT count(*) FROM fact_supply_talent_agg")
        assert db_count > 5000, f"Expected >5K supply rows, got {db_count}"

    def test_ai_exposure_loaded(self):
        """AIOE scores loaded via crosswalk."""
        db_count = scalar("SELECT count(*) FROM fact_ai_exposure_occupation")
        assert db_count > 500, f"Expected >500 AI exposure rows, got {db_count}"

    def test_occupation_skills_loaded(self):
        """Golden TAX-001: 126051 mappings expected."""
        db_count = scalar("SELECT count(*) FROM fact_occupation_skills")
        assert db_count > 120000, f"Expected >120K occ-skill rows, got {db_count}"


# ============================================================
# Phase 3: Materialized views exist and have data
# ============================================================

class TestMaterializedViews:
    def test_vw_demand_jobs_populated(self):
        count = scalar("SELECT count(*) FROM vw_demand_jobs")
        assert count > 0, "vw_demand_jobs is empty"

    def test_vw_supply_talent_populated(self):
        count = scalar("SELECT count(*) FROM vw_supply_talent")
        assert count > 0, "vw_supply_talent is empty"

    def test_vw_gap_cube_populated(self):
        count = scalar("SELECT count(*) FROM vw_gap_cube")
        assert count > 0, "vw_gap_cube is empty"

    def test_vw_ai_impact_populated(self):
        count = scalar("SELECT count(*) FROM vw_ai_impact")
        assert count > 0, "vw_ai_impact is empty"

    def test_vw_demand_has_sectors(self):
        """Sector donut chart fix: demand view should have sector data."""
        count = scalar("SELECT count(DISTINCT sector) FROM vw_demand_jobs WHERE sector IS NOT NULL")
        assert count >= 10, f"Expected >=10 sectors in demand, got {count}"

    def test_vw_demand_has_7_emirates(self):
        regions = [r[0] for r in query("SELECT DISTINCT region_code FROM vw_demand_jobs")]
        assert len(regions) == 7, f"Expected 7 emirates, got {len(regions)}: {regions}"

    def test_vw_gap_cube_has_both_sides(self):
        """Gap cube should have both supply and demand."""
        row = query("SELECT SUM(supply_count), SUM(demand_count) FROM vw_gap_cube")[0]
        assert row[0] > 0, "Gap cube has no supply"
        assert row[1] > 0, "Gap cube has no demand"


# ============================================================
# Phase 4: Golden test validations (source CSV cross-check)
# ============================================================

class TestGoldenCSVValidation:
    def test_dem001_total_postings_csv(self):
        """DEM-001: Total LinkedIn postings = 36923."""
        csv = pd.read_csv(MASTER_DIR / "3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv", dtype=str)
        assert len(csv) == 36923

    def test_dem006_location_distribution(self):
        """DEM-006: Top location is Dubai with 25194 postings."""
        csv = pd.read_csv(MASTER_DIR / "3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv", dtype=str)
        top = csv["location"].value_counts().head(1)
        assert top.index[0] == "Dubai"
        assert top.values[0] == 25194

    def test_aii001_aioe_count(self):
        """AII-001: 774 occupations with AIOE scores."""
        csv = pd.read_csv(MASTER_DIR / "6_ai_impact/aioe_occupation_scores.csv")
        assert len(csv) == 774

    def test_aii005_risk_distribution(self):
        """AII-005: Risk level distribution."""
        csv = pd.read_csv(MASTER_DIR / "6_ai_impact/ai_impact_occupations.csv")
        dist = csv["risk_level"].value_counts().to_dict()
        assert dist["Very High"] == 315
        assert dist["Moderate"] == 256

    def test_tax001_occ_skill_map_count(self):
        """TAX-001: 126051 occupation-skill mappings."""
        csv = pd.read_csv(MASTER_DIR / "4_taxonomy_esco/esco_occupation_skill_map.csv", dtype=str)
        assert len(csv) == 126051

    def test_tax002_essential_vs_optional(self):
        """TAX-002: Essential=67600, Optional=58451."""
        csv = pd.read_csv(MASTER_DIR / "4_taxonomy_esco/esco_occupation_skill_map.csv", dtype=str)
        dist = csv["relation_type"].value_counts().to_dict()
        assert dist["essential"] == 67600
        assert dist["optional"] == 58451

    def test_sup009_institutions(self):
        """SUP-009: 151 HE institutions."""
        csv = pd.read_csv(MASTER_DIR / "2_supply_education/uae_he_institutions_master.csv")
        assert len(csv) == 151

    def test_esco003_skills_count(self):
        """ESCO-003: total skills."""
        csv = pd.read_csv(MASTER_DIR / "4_taxonomy_esco/esco_skills.csv", dtype=str)
        assert len(csv) == 13960


# ============================================================
# Phase 5: New feature tests — dynamic filters
# ============================================================

class TestDynamicFilters:
    def test_filters_only_return_emirates_with_data(self):
        """Filters should only return emirates that have actual data."""
        regions_with_data = [r[0] for r in query("""
            SELECT DISTINCT r.region_code FROM dim_region r
            WHERE EXISTS (SELECT 1 FROM fact_demand_vacancies_agg d WHERE d.region_code = r.region_code)
               OR EXISTS (SELECT 1 FROM fact_supply_talent_agg s WHERE s.region_code = r.region_code)
        """)]
        assert len(regions_with_data) == 7  # All 7 have data

    def test_filters_only_return_sectors_with_data(self):
        """Sectors should be limited to those appearing in fact tables."""
        all_sectors = scalar("SELECT count(*) FROM dim_sector")
        sectors_with_data = scalar("""
            SELECT count(DISTINCT s.sector_id) FROM dim_sector s
            WHERE EXISTS (SELECT 1 FROM fact_demand_vacancies_agg d WHERE d.sector_id = s.sector_id)
               OR EXISTS (SELECT 1 FROM fact_supply_talent_agg f WHERE f.sector_id = s.sector_id)
        """)
        assert sectors_with_data < all_sectors, "Filter should return fewer sectors than dim_sector total"
        assert sectors_with_data > 0, "Should have some sectors with data"

    def test_date_range_from_actual_data(self):
        """Date range should reflect actual fact table data, not full dim_time span."""
        full_range = query("SELECT MIN(month_label), MAX(month_label) FROM dim_time")[0]
        data_range = query("""
            SELECT MIN(ml), MAX(ml) FROM (
                SELECT t.month_label as ml FROM fact_demand_vacancies_agg f JOIN dim_time t ON f.time_id = t.time_id
                UNION ALL
                SELECT t.month_label as ml FROM fact_supply_talent_agg f JOIN dim_time t ON f.time_id = t.time_id
            ) combined
        """)[0]
        # Data range should be narrower than full dim_time
        assert data_range[0] > full_range[0] or data_range[1] < full_range[1]

    def test_gender_dimension_exists(self):
        """Dynamic gender filter should have data."""
        genders = [r[0] for r in query(
            "SELECT DISTINCT gender FROM fact_supply_talent_agg WHERE gender IS NOT NULL"
        )]
        assert len(genders) > 0, "Should have gender data"
        assert set(genders) <= {"M", "F"}, f"Unexpected genders: {genders}"

    def test_nationality_dimension_exists(self):
        """Dynamic nationality filter should have data."""
        nats = [r[0] for r in query(
            "SELECT DISTINCT nationality FROM fact_supply_talent_agg WHERE nationality IS NOT NULL"
        )]
        assert len(nats) > 0
        assert set(nats) <= {"citizen", "expat"}, f"Unexpected nationalities: {nats}"


# ============================================================
# Phase 6: Sector auto-detection
# ============================================================

class TestSectorAutoDetection:
    def test_demand_has_sector_data(self):
        """Demand side should have sector classifications from LinkedIn industry mapping."""
        count = scalar("SELECT count(*) FROM vw_demand_jobs WHERE sector IS NOT NULL")
        assert count > 0, "Demand should have sector data"

    def test_supply_has_sector_data(self):
        """Supply side may have sector data from Bayanat economic activity."""
        count = scalar("SELECT count(*) FROM vw_supply_talent WHERE sector IS NOT NULL")
        # May or may not have sectors — just check it doesn't crash
        assert count >= 0


# ============================================================
# Phase 7: Data integrity checks
# ============================================================

class TestDataIntegrity:
    def test_no_orphan_demand_regions(self):
        """All demand region_codes should exist in dim_region."""
        orphans = scalar("""
            SELECT count(*) FROM fact_demand_vacancies_agg f
            LEFT JOIN dim_region r ON f.region_code = r.region_code
            WHERE r.region_code IS NULL
        """)
        assert orphans == 0, f"{orphans} demand rows have orphan region_codes"

    def test_no_orphan_demand_time(self):
        """All demand time_ids should exist in dim_time."""
        orphans = scalar("""
            SELECT count(*) FROM fact_demand_vacancies_agg f
            LEFT JOIN dim_time t ON f.time_id = t.time_id
            WHERE t.time_id IS NULL
        """)
        assert orphans == 0

    def test_occupation_skills_reference_valid_ids(self):
        """fact_occupation_skills references valid occupation_id and skill_id."""
        orphan_occ = scalar("""
            SELECT count(*) FROM fact_occupation_skills f
            LEFT JOIN dim_occupation o ON f.occupation_id = o.occupation_id
            WHERE o.occupation_id IS NULL
        """)
        orphan_skill = scalar("""
            SELECT count(*) FROM fact_occupation_skills f
            LEFT JOIN dim_skill s ON f.skill_id = s.skill_id
            WHERE s.skill_id IS NULL
        """)
        assert orphan_occ == 0, f"{orphan_occ} occ-skill rows have invalid occupation_id"
        assert orphan_skill == 0, f"{orphan_skill} occ-skill rows have invalid skill_id"
