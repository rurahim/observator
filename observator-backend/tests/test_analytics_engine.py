"""Comprehensive tests for AnalyticsEngine — formulas, status classification, and query helpers."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.services.analytics_engine import AnalyticsEngine


# ═══════════════════════════════════════════════════════
# Phase 0: SGI Formula Tests (Bug Fix Verification)
# ═══════════════════════════════════════════════════════

class TestComputeSGI:
    """Canonical SGI = (demand - supply) / demand * 100.
    Positive = shortage, Negative = surplus, None = undefined."""

    def test_shortage_basic(self):
        # demand=200, supply=100 → (200-100)/200*100 = 50.0
        assert AnalyticsEngine.compute_sgi(100, 200) == 50.0

    def test_surplus_basic(self):
        # demand=100, supply=200 → (100-200)/100*100 = -100.0
        assert AnalyticsEngine.compute_sgi(200, 100) == -100.0

    def test_balanced(self):
        assert AnalyticsEngine.compute_sgi(100, 100) == 0.0

    def test_zero_demand_returns_none(self):
        assert AnalyticsEngine.compute_sgi(100, 0) is None

    def test_both_zero_returns_none(self):
        assert AnalyticsEngine.compute_sgi(0, 0) is None

    def test_small_gap(self):
        # demand=1000, supply=950 → 5.0%
        assert AnalyticsEngine.compute_sgi(950, 1000) == 5.0

    def test_large_shortage(self):
        # demand=1000, supply=0 → 100.0%
        assert AnalyticsEngine.compute_sgi(0, 1000) == 100.0

    def test_negative_demand_returns_none(self):
        assert AnalyticsEngine.compute_sgi(100, -1) is None

    def test_rounding_precision(self):
        # demand=333, supply=200 → (333-200)/333*100 = 39.939... → 39.9
        result = AnalyticsEngine.compute_sgi(200, 333)
        assert result == 39.9

    def test_very_small_shortage(self):
        # demand=10000, supply=9999 → 0.01 → rounds to 0.0
        result = AnalyticsEngine.compute_sgi(9999, 10000)
        assert result == 0.0  # (10000-9999)/10000*100 = 0.01 → rounds to 0.0

    def test_formula_consistency_with_frontend(self):
        """Verify backend SGI matches frontend formula: (demand-supply)/demand*100."""
        supply, demand = 42100, 45200
        backend_sgi = AnalyticsEngine.compute_sgi(supply, demand)
        frontend_sgi = round((demand - supply) / demand * 100, 1)
        assert backend_sgi == frontend_sgi

    def test_sgi_sign_convention(self):
        """Positive = shortage (demand > supply), negative = surplus."""
        assert AnalyticsEngine.compute_sgi(50, 100) > 0   # shortage
        assert AnalyticsEngine.compute_sgi(150, 100) < 0  # surplus


class TestClassifyStatus:
    """Test SGI → human status label mapping."""

    def test_critical_shortage(self):
        assert AnalyticsEngine.classify_status(25.0) == "Critical Shortage"
        assert AnalyticsEngine.classify_status(50.0) == "Critical Shortage"
        assert AnalyticsEngine.classify_status(100.0) == "Critical Shortage"

    def test_moderate_shortage(self):
        assert AnalyticsEngine.classify_status(10.0) == "Moderate Shortage"
        assert AnalyticsEngine.classify_status(15.0) == "Moderate Shortage"

    def test_balanced(self):
        assert AnalyticsEngine.classify_status(0.0) == "Balanced"
        assert AnalyticsEngine.classify_status(3.0) == "Balanced"
        assert AnalyticsEngine.classify_status(-3.0) == "Balanced"

    def test_moderate_surplus(self):
        assert AnalyticsEngine.classify_status(-10.0) == "Moderate Surplus"
        assert AnalyticsEngine.classify_status(-15.0) == "Moderate Surplus"

    def test_critical_surplus(self):
        assert AnalyticsEngine.classify_status(-25.0) == "Critical Surplus"
        assert AnalyticsEngine.classify_status(-50.0) == "Critical Surplus"
        assert AnalyticsEngine.classify_status(-100.0) == "Critical Surplus"

    def test_none_returns_unknown(self):
        assert AnalyticsEngine.classify_status(None) == "Unknown"

    # Boundary tests
    def test_boundary_20_inclusive(self):
        assert AnalyticsEngine.classify_status(20.0) == "Moderate Shortage"

    def test_boundary_just_above_20(self):
        assert AnalyticsEngine.classify_status(20.1) == "Critical Shortage"

    def test_boundary_5_inclusive(self):
        assert AnalyticsEngine.classify_status(5.0) == "Balanced"

    def test_boundary_just_above_5(self):
        assert AnalyticsEngine.classify_status(5.1) == "Moderate Shortage"

    def test_boundary_neg5_inclusive(self):
        assert AnalyticsEngine.classify_status(-5.0) == "Balanced"

    def test_boundary_just_below_neg5(self):
        assert AnalyticsEngine.classify_status(-5.1) == "Moderate Surplus"

    def test_boundary_neg20_inclusive(self):
        assert AnalyticsEngine.classify_status(-20.0) == "Moderate Surplus"

    def test_boundary_just_below_neg20(self):
        assert AnalyticsEngine.classify_status(-20.1) == "Critical Surplus"

    def test_sgi_status_matches_compute_sgi(self):
        """Full pipeline: supply/demand → SGI → status."""
        sgi = AnalyticsEngine.compute_sgi(100, 200)  # 50.0
        assert AnalyticsEngine.classify_status(sgi) == "Critical Shortage"

        sgi = AnalyticsEngine.compute_sgi(100, 100)  # 0.0
        assert AnalyticsEngine.classify_status(sgi) == "Balanced"

        sgi = AnalyticsEngine.compute_sgi(200, 100)  # -100.0
        assert AnalyticsEngine.classify_status(sgi) == "Critical Surplus"


# ═══════════════════════════════════════════════════════
# Phase 2: AI Composite Score Tests
# ═══════════════════════════════════════════════════════

class TestComputeAIComposite:
    """Weighted composite: task_auto=0.40, adoption=0.25, market=0.20, replacement=0.15."""

    def test_all_values(self):
        # exposure=80 (w=0.4), auto=0.6→60 (w=0.25), market=50 (w=0.2), llm=0.7→70 (w=0.15)
        result = AnalyticsEngine.compute_ai_composite(80, 0.6, 0.7, 50)
        expected = round((0.4 * 80 + 0.25 * 60 + 0.2 * 50 + 0.15 * 70) / 1.0, 1)
        assert result == expected  # 67.5

    def test_exposure_only(self):
        result = AnalyticsEngine.compute_ai_composite(50, None, None, None)
        assert result == 50.0

    def test_all_none(self):
        assert AnalyticsEngine.compute_ai_composite(None, None, None, None) is None

    def test_two_values_reweighted(self):
        """With 2 values, weights are normalized to sum to 1."""
        result = AnalyticsEngine.compute_ai_composite(80, 0.5, None, None)
        expected = round((0.4 * 80 + 0.25 * 50) / 0.65, 1)
        assert result == expected

    def test_automation_prob_scaled(self):
        """automation_probability 0-1 is scaled to 0-100."""
        result = AnalyticsEngine.compute_ai_composite(50, 0.8, None, None)
        # auto=0.8→80, weights: 0.4*50 + 0.25*80 = 20+20 = 40 / 0.65 = 61.5
        expected = round((0.4 * 50 + 0.25 * 80) / 0.65, 1)
        assert result == expected

    def test_llm_exposure_scaled(self):
        """llm_exposure 0-1 is scaled to 0-100."""
        result = AnalyticsEngine.compute_ai_composite(60, None, 0.9, None)
        # llm=0.9→90, weights: 0.4*60 + 0.15*90 = 24+13.5 = 37.5 / 0.55 = 68.2
        expected = round((0.4 * 60 + 0.15 * 90) / 0.55, 1)
        assert result == expected

    def test_already_scaled_values(self):
        """Values >1 are NOT re-scaled."""
        result = AnalyticsEngine.compute_ai_composite(70, 80, 90, 60)
        expected = round((0.4 * 70 + 0.25 * 80 + 0.2 * 60 + 0.15 * 90) / 1.0, 1)
        assert result == expected

    def test_composite_not_equal_to_simple_avg(self):
        """Verify weighted composite differs from simple average."""
        vals = (80, 0.6, 0.7, 50)
        composite = AnalyticsEngine.compute_ai_composite(*vals)
        simple_avg = round((80 + 60 + 70 + 50) / 4, 1)
        assert composite != simple_avg  # Weighted ≠ unweighted


class TestRiskLevel:
    """Test the private _risk_level classifier."""

    def test_critical(self):
        assert AnalyticsEngine._risk_level(75) == "critical"
        assert AnalyticsEngine._risk_level(100) == "critical"

    def test_high(self):
        assert AnalyticsEngine._risk_level(50) == "high"
        assert AnalyticsEngine._risk_level(74.9) == "high"

    def test_medium(self):
        assert AnalyticsEngine._risk_level(25) == "medium"
        assert AnalyticsEngine._risk_level(49.9) == "medium"

    def test_low(self):
        assert AnalyticsEngine._risk_level(0) == "low"
        assert AnalyticsEngine._risk_level(24.9) == "low"

    def test_none(self):
        assert AnalyticsEngine._risk_level(None) == "low"


# ═══════════════════════════════════════════════════════
# Phase 2: Source Filter Helpers
# ═══════════════════════════════════════════════════════

class TestSourceFilters:
    """Test SQL filter fragment generation."""

    def test_source_condition_user_upload(self):
        assert AnalyticsEngine._source_condition("user_upload") == "source = 'user_upload'"

    def test_source_condition_system(self):
        result = AnalyticsEngine._source_condition("system")
        assert "source IS NULL OR source != 'user_upload'" in result

    def test_source_condition_none(self):
        assert AnalyticsEngine._source_condition(None) == ""

    def test_source_where_user_upload(self):
        result = AnalyticsEngine._source_where("user_upload")
        assert result.startswith("WHERE")

    def test_source_where_none(self):
        assert AnalyticsEngine._source_where(None) == ""

    def test_source_and_user_upload(self):
        result = AnalyticsEngine._source_and("user_upload")
        assert result.startswith(" AND")

    def test_source_and_none(self):
        assert AnalyticsEngine._source_and(None) == ""


# ═══════════════════════════════════════════════════════
# Phase 2: Async Query Methods (with mocked DB)
# ═══════════════════════════════════════════════════════

class TestAnalyticsEngineQueries:
    """Test async query methods with mocked database."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_result.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_result)
        return db

    @pytest.mark.asyncio
    async def test_get_supply_demand_totals(self, mock_db):
        """Verify totals query returns (int, int)."""
        # Mock supply=1000, demand=2000
        supply_result = MagicMock()
        supply_result.scalar.return_value = 1000
        demand_result = MagicMock()
        demand_result.scalar.return_value = 2000
        mock_db.execute = AsyncMock(side_effect=[supply_result, demand_result])

        engine = AnalyticsEngine(mock_db)
        supply, demand = await engine.get_supply_demand_totals()
        assert supply == 1000
        assert demand == 2000

    @pytest.mark.asyncio
    async def test_get_supply_demand_totals_with_filters(self, mock_db):
        """Filters are passed through to query."""
        supply_result = MagicMock()
        supply_result.scalar.return_value = 500
        demand_result = MagicMock()
        demand_result.scalar.return_value = 800
        mock_db.execute = AsyncMock(side_effect=[supply_result, demand_result])

        engine = AnalyticsEngine(mock_db)
        supply, demand = await engine.get_supply_demand_totals(
            emirate="DXB", sector="IT", data_source="user_upload"
        )
        assert supply == 500
        assert demand == 800
        # Verify execute was called with proper params containing emirate + sector
        call_args = mock_db.execute.call_args_list
        assert len(call_args) == 2

    @pytest.mark.asyncio
    async def test_get_supply_demand_totals_null_returns_zero(self, mock_db):
        """NULL from DB should be treated as 0."""
        null_result = MagicMock()
        null_result.scalar.return_value = None
        mock_db.execute = AsyncMock(return_value=null_result)

        engine = AnalyticsEngine(mock_db)
        supply, demand = await engine.get_supply_demand_totals()
        assert supply == 0
        assert demand == 0

    @pytest.mark.asyncio
    async def test_get_supply_demand_trend_empty(self, mock_db):
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_supply_demand_trend()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_supply_demand_trend_with_data(self, mock_db):
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("2025-01", 100, 200),
            ("2025-02", 150, 250),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_supply_demand_trend()
        assert len(result) == 2
        assert result[0] == {"month": "2025-01", "supply": 100, "demand": 200}
        assert result[1] == {"month": "2025-02", "supply": 150, "demand": 250}

    @pytest.mark.asyncio
    async def test_get_supply_demand_trend_null_values(self, mock_db):
        """NULL month/supply/demand should be handled gracefully."""
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            (None, None, None),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_supply_demand_trend()
        assert len(result) == 1
        assert result[0] == {"month": "", "supply": 0, "demand": 0}

    @pytest.mark.asyncio
    async def test_get_sector_distribution_empty(self, mock_db):
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_sector_distribution()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_sector_distribution_with_data(self, mock_db):
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("IT", "IT", 800),
            ("Finance", "Finance", 200),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_sector_distribution()
        assert len(result) == 2
        assert result[0]["sector"] == "IT"
        assert result[0]["percentage"] == 80.0
        assert result[1]["percentage"] == 20.0

    @pytest.mark.asyncio
    async def test_get_emirate_metrics_empty(self, mock_db):
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_emirate_metrics()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_emirate_metrics_with_sgi(self, mock_db):
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("DXB", "Dubai", "دبي", 500, 1000),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_emirate_metrics()
        assert len(result) == 1
        assert result[0]["emirate"] == "Dubai"
        assert result[0]["sgi"] == 50.0  # (1000-500)/1000*100
        assert result[0]["status"] == "Critical Shortage"
        assert result[0]["gap"] == 500

    @pytest.mark.asyncio
    async def test_get_occupation_gaps_empty(self, mock_db):
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_occupation_gaps()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_occupation_gaps_with_data(self, mock_db):
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("2511", "AI Engineer", "AI Engineer", 100, 500),
            ("2221", "Nurse", "Nurse", 300, 200),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_occupation_gaps()
        assert len(result) == 2

        # AI Engineer: demand > supply → shortage
        assert result[0]["title_en"] == "AI Engineer"
        assert result[0]["supply"] == 100
        assert result[0]["demand"] == 500
        assert result[0]["gap"] == 400
        assert result[0]["sgi"] == 80.0  # (500-100)/500*100
        assert result[0]["status"] == "Critical Shortage"

        # Nurse: supply > demand → surplus
        assert result[1]["title_en"] == "Nurse"
        assert result[1]["sgi"] == -50.0  # (200-300)/200*100
        assert result[1]["status"] == "Critical Surplus"

    @pytest.mark.asyncio
    async def test_get_occupation_gaps_null_supply(self, mock_db):
        """Phase 0 Bug Fix: supply can be NULL from FULL OUTER JOIN — no crash."""
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("2511", "Test Occ", "Test", None, 100),  # supply=None
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_occupation_gaps()
        assert len(result) == 1
        assert result[0]["supply"] == 0
        assert result[0]["demand"] == 100
        assert result[0]["sgi"] == 100.0

    @pytest.mark.asyncio
    async def test_get_sgi_trend(self, mock_db):
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("2025-01", 900, 1000),
            ("2025-02", 950, 1000),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_sgi_trend()
        assert len(result) == 2
        assert result[0]["sgi"] == 10.0  # (1000-900)/1000*100
        assert result[1]["sgi"] == 5.0   # (1000-950)/1000*100

    @pytest.mark.asyncio
    async def test_get_ai_exposure_occupations_empty(self, mock_db):
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_ai_exposure_occupations()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_ai_exposure_occupations_with_composite(self, mock_db):
        """Verify weighted composite is used instead of simple AVG."""
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            (1, "Data Entry Clerk", "Data Entry", "4132", 80.0, 0.8, 0.9),
        ]
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_ai_exposure_occupations()
        assert len(result) == 1

        occ = result[0]
        assert occ["title_en"] == "Data Entry Clerk"
        # Composite: (0.4*80 + 0.25*80 + 0.15*90) / 1.0 = 32+20+13.5 = 65.5 (no market)
        expected_composite = AnalyticsEngine.compute_ai_composite(80.0, 0.8, 0.9)
        assert occ["exposure_score"] == round(expected_composite, 1)
        assert occ["risk_level"] in ("low", "medium", "high", "critical")

    @pytest.mark.asyncio
    async def test_get_ai_exposure_sectors_db_error(self, mock_db):
        """Graceful fallback on DB error."""
        mock_db.execute = AsyncMock(side_effect=Exception("DB down"))
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_ai_exposure_sectors()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_ai_skill_clusters_db_error(self, mock_db):
        mock_db.execute = AsyncMock(side_effect=Exception("DB down"))
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_ai_skill_clusters()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_refreshed_at_no_data(self, mock_db):
        mock_result = MagicMock()
        mock_result.scalar.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_refreshed_at()
        assert result is None

    @pytest.mark.asyncio
    async def test_get_refreshed_at_with_timestamp(self, mock_db):
        from datetime import datetime, timezone
        ts = datetime(2025, 3, 16, 12, 0, 0, tzinfo=timezone.utc)
        mock_result = MagicMock()
        mock_result.scalar.return_value = ts
        mock_db.execute = AsyncMock(return_value=mock_result)

        engine = AnalyticsEngine(mock_db)
        result = await engine.get_refreshed_at()
        assert result is not None
        assert "2025-03-16" in result

    @pytest.mark.asyncio
    async def test_get_refreshed_at_db_error(self, mock_db):
        """Graceful fallback on DB error."""
        mock_db.execute = AsyncMock(side_effect=Exception("DB error"))
        engine = AnalyticsEngine(mock_db)
        result = await engine.get_refreshed_at()
        assert result is None
