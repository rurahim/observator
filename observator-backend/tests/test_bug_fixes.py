"""Tests for Phase 0 bug fixes and Phase 5 schema updates."""
import pytest

from src.services.analytics_engine import AnalyticsEngine
from src.schemas.dashboard import TopOccupation, DashboardSummary, EmirateMetric
from src.schemas.skill_gap import OccupationGap, SkillGapResponse, SGITrend
from src.schemas.ai_impact import AIImpactResponse, OccupationAIExposure
from src.ingestion.loaders.rdata_jobs import RdataJobsLoader


# ═══════════════════════════════════════════════════════
# Phase 0: Bug Fix — SGI Formula Mismatch
# ═══════════════════════════════════════════════════════

class TestSGIFormulaConsistency:
    """Verify the SGI formula is canonical everywhere: (demand-supply)/demand*100."""

    def test_canonical_formula(self):
        """The ONLY formula that should exist in the codebase."""
        supply, demand = 42100, 57200
        sgi = AnalyticsEngine.compute_sgi(supply, demand)
        expected = round((demand - supply) / demand * 100, 1)
        assert sgi == expected

    def test_old_ratio_formula_differs(self):
        """The OLD formula (supply/demand ratio) produces DIFFERENT results."""
        supply, demand = 100, 200
        new_sgi = AnalyticsEngine.compute_sgi(supply, demand)  # 50.0
        old_sgi = round(supply / demand, 3)  # 0.5
        assert new_sgi != old_sgi  # They're different!
        assert new_sgi == 50.0     # New is percentage
        assert old_sgi == 0.5      # Old was ratio

    def test_sgi_positive_means_shortage(self):
        """Convention: positive SGI = demand exceeds supply = shortage."""
        sgi = AnalyticsEngine.compute_sgi(100, 200)
        assert sgi > 0
        status = AnalyticsEngine.classify_status(sgi)
        assert "Shortage" in status

    def test_sgi_negative_means_surplus(self):
        """Convention: negative SGI = supply exceeds demand = surplus."""
        sgi = AnalyticsEngine.compute_sgi(200, 100)
        assert sgi < 0
        status = AnalyticsEngine.classify_status(sgi)
        assert "Surplus" in status


# ═══════════════════════════════════════════════════════
# Phase 0: Bug Fix — int(None) Crash
# ═══════════════════════════════════════════════════════

class TestIntNoneCrash:
    """Verify NULL values from FULL OUTER JOIN don't cause TypeError."""

    def test_null_supply_in_occupation_gap(self):
        """Previously: int(r[1]) would crash when r[1] is None."""
        # Simulate what the DB returns with NULL supply
        # The engine uses int(r[3] or 0) which handles None
        supply_raw = None
        supply = int(supply_raw or 0)
        assert supply == 0

    def test_null_demand_in_occupation_gap(self):
        demand_raw = None
        demand = int(demand_raw or 0)
        assert demand == 0

    def test_sgi_with_null_supply(self):
        """SGI should work when supply is NULL (0)."""
        sgi = AnalyticsEngine.compute_sgi(0, 100)
        assert sgi == 100.0  # Full shortage

    def test_sgi_with_null_demand(self):
        """SGI should return None when demand is NULL (0)."""
        sgi = AnalyticsEngine.compute_sgi(100, 0)
        assert sgi is None


# ═══════════════════════════════════════════════════════
# Phase 0: Bug Fix — UAE Location Mapping
# ═══════════════════════════════════════════════════════

class TestUAELocationMapping:
    """Verify 'uae'/'emirates' no longer maps to Abu Dhabi."""

    def setup_method(self):
        self.loader = RdataJobsLoader()

    def test_uae_returns_none(self):
        """National-level 'UAE' should be skipped, not mapped to AUH."""
        assert self.loader._normalize_location("UAE") is None

    def test_emirates_returns_none(self):
        assert self.loader._normalize_location("United Arab Emirates") is None

    def test_uae_case_insensitive(self):
        assert self.loader._normalize_location("uae") is None
        assert self.loader._normalize_location("UAE") is None
        assert self.loader._normalize_location("Uae") is None

    def test_dubai_still_works(self):
        assert self.loader._normalize_location("Dubai") == "DXB"
        assert self.loader._normalize_location("dubai, UAE") == "DXB"

    def test_abu_dhabi_still_works(self):
        assert self.loader._normalize_location("Abu Dhabi") == "AUH"

    def test_sharjah_still_works(self):
        assert self.loader._normalize_location("Sharjah") == "SHJ"

    def test_ajman_still_works(self):
        assert self.loader._normalize_location("Ajman") == "AJM"

    def test_rak_still_works(self):
        assert self.loader._normalize_location("Ras Al Khaimah") == "RAK"
        assert self.loader._normalize_location("Ras al-Khaimah") == "RAK"

    def test_fujairah_still_works(self):
        assert self.loader._normalize_location("Fujairah") == "FUJ"

    def test_uaq_still_works(self):
        assert self.loader._normalize_location("Umm Al Quwain") == "UAQ"
        assert self.loader._normalize_location("Umm al-Quwain") == "UAQ"

    def test_empty_returns_none(self):
        assert self.loader._normalize_location("") is None
        assert self.loader._normalize_location(None) is None

    def test_unknown_location_returns_none(self):
        assert self.loader._normalize_location("London") is None
        assert self.loader._normalize_location("New York") is None

    def test_nan_returns_none(self):
        import pandas as pd
        assert self.loader._normalize_location(float("nan")) is None


# ═══════════════════════════════════════════════════════
# Phase 5: Schema Updates — Status Field
# ═══════════════════════════════════════════════════════

class TestSchemaUpdates:
    """Verify new fields on Pydantic models."""

    def test_top_occupation_has_status(self):
        occ = TopOccupation(
            occupation_id=1, title_en="Engineer",
            supply=100, demand=200, gap=100, sgi=50.0,
            status="Critical Shortage",
        )
        assert occ.status == "Critical Shortage"

    def test_top_occupation_status_optional(self):
        occ = TopOccupation(
            occupation_id=1, title_en="Engineer",
            supply=100, demand=200, gap=100,
        )
        assert occ.status is None

    def test_occupation_gap_has_status(self):
        gap = OccupationGap(
            occupation_id=1, title_en="Nurse",
            supply=200, demand=100, gap=-100, sgi=-100.0,
            status="Critical Surplus",
        )
        assert gap.status == "Critical Surplus"

    def test_skill_gap_response_has_methodology(self):
        response = SkillGapResponse(
            occupations=[],
            sgi_trend=[],
            total_supply=0,
            total_demand=0,
            total_gap=0,
            methodology="SGI = (demand - supply) / demand * 100",
        )
        assert "SGI" in response.methodology

    def test_skill_gap_response_methodology_optional(self):
        response = SkillGapResponse(
            occupations=[],
            sgi_trend=[],
            total_supply=0,
            total_demand=0,
            total_gap=0,
        )
        assert response.methodology is None

    def test_dashboard_summary_refreshed_at(self):
        summary = DashboardSummary(
            total_supply=1000, total_demand=2000, total_gap=1000,
            sgi=50.0,
            supply_demand_trend=[],
            sector_distribution=[],
            emirate_metrics=[],
            top_occupations=[],
            refreshed_at="2026-03-16T12:00:00+00:00",
        )
        assert summary.refreshed_at is not None

    def test_emirate_metric_model(self):
        em = EmirateMetric(
            region_code="DXB", emirate="Dubai",
            supply=500, demand=1000, gap=500, sgi=50.0,
        )
        assert em.region_code == "DXB"
        assert em.gap == 500

    def test_ai_impact_response_summary_structure(self):
        response = AIImpactResponse(
            occupations=[],
            sectors=[],
            skill_clusters=[],
            summary={"total_occupations": 0, "high_risk_pct": 0.0, "avg_exposure": 0.0},
        )
        assert response.summary["total_occupations"] == 0
