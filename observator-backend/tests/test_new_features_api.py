"""API-level tests for new features: dynamic filters, sector auto-detection, data pipeline."""
import pytest
import httpx

API_BASE = "http://localhost:8000/api"


@pytest.fixture(scope="module")
def auth_token():
    """Get JWT token for API calls."""
    resp = httpx.post(f"{API_BASE}/login", json={"email": "admin@observator.ae", "password": "admin123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


class TestHealthEndpoint:
    def test_health(self):
        resp = httpx.get(f"{API_BASE}/health")
        assert resp.status_code == 200


class TestFiltersAPI:
    def test_filters_returns_data(self, headers):
        resp = httpx.get(f"{API_BASE}/filters", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "emirates" in data
        assert "sectors" in data
        assert "date_range" in data

    def test_filters_emirates_have_data(self, headers):
        resp = httpx.get(f"{API_BASE}/filters", headers=headers)
        data = resp.json()
        assert len(data["emirates"]) >= 1, "Should have at least 1 emirate with data"
        # Check they have the expected format
        for e in data["emirates"]:
            assert "value" in e and "label" in e

    def test_filters_sectors_subset_of_dim(self, headers):
        resp = httpx.get(f"{API_BASE}/filters", headers=headers)
        data = resp.json()
        # Should have fewer sectors than dim_sector total (only those with data)
        assert len(data["sectors"]) > 0
        assert len(data["sectors"]) <= 42  # dim_sector has 42

    def test_filters_date_range_realistic(self, headers):
        resp = httpx.get(f"{API_BASE}/filters", headers=headers)
        data = resp.json()
        dr = data["date_range"]
        assert dr["min"] != "", "Date range min should not be empty"
        assert dr["max"] != "", "Date range max should not be empty"
        # Should not span 2015-2035 (that's the full dim_time range)
        assert dr["min"] >= "2008", f"Min date too early: {dr['min']}"

    def test_filters_dynamic_dimensions(self, headers):
        resp = httpx.get(f"{API_BASE}/filters", headers=headers)
        data = resp.json()
        # Dynamic dimensions should be present if data has them
        if data.get("dynamic"):
            if "gender" in data["dynamic"]:
                genders = data["dynamic"]["gender"]
                assert len(genders) > 0
                labels = [g["label"] for g in genders]
                assert "Male" in labels or "Female" in labels
            if "nationality" in data["dynamic"]:
                nats = data["dynamic"]["nationality"]
                assert len(nats) > 0


class TestDashboardSummaryAPI:
    def test_dashboard_summary_returns_data(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_supply" in data
        assert "total_demand" in data
        assert "sector_distribution" in data
        assert "emirate_metrics" in data

    def test_dashboard_has_real_data(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert data["total_demand"] > 0, "Demand should be > 0"
        assert data["total_supply"] > 0, "Supply should be > 0"

    def test_dashboard_sector_data_side(self, headers):
        """New feature: sector_data_side field."""
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert "sector_data_side" in data
        assert data["sector_data_side"] in ("demand", "supply", "both", "none")

    def test_dashboard_sector_distribution_populated(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert len(data["sector_distribution"]) > 0, "Sector distribution should have data"
        for s in data["sector_distribution"]:
            assert "sector" in s
            assert "count" in s
            assert s["count"] > 0

    def test_dashboard_emirate_metrics(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert len(data["emirate_metrics"]) >= 1
        for e in data["emirate_metrics"]:
            assert "region_code" in e
            assert "emirate" in e
            assert "supply" in e
            assert "demand" in e

    def test_dashboard_top_occupations(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert len(data["top_occupations"]) > 0

    def test_dashboard_filter_by_emirate(self, headers):
        """Filtering by Dubai should change numbers."""
        resp_all = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        resp_dxb = httpx.get(f"{API_BASE}/dashboards/summary?emirate=DXB", headers=headers)
        assert resp_all.status_code == 200
        assert resp_dxb.status_code == 200
        all_data = resp_all.json()
        dxb_data = resp_dxb.json()
        # Dubai demand should be less than total
        assert dxb_data["total_demand"] <= all_data["total_demand"]

    def test_dashboard_supply_demand_trend(self, headers):
        resp = httpx.get(f"{API_BASE}/dashboards/summary", headers=headers)
        data = resp.json()
        assert len(data["supply_demand_trend"]) > 0
        for p in data["supply_demand_trend"]:
            assert "month" in p
            assert "supply" in p
            assert "demand" in p


class TestSkillGapAPI:
    def test_skill_gap_returns_data(self, headers):
        resp = httpx.get(f"{API_BASE}/skill-gap", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "occupations" in data


class TestAIImpactAPI:
    def test_ai_impact_returns_data(self, headers):
        resp = httpx.get(f"{API_BASE}/ai-impact", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "occupations" in data
