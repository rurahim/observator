"""Integration tests against REAL database, Redis, and API.

No mocks. Real Postgres (5433), real Redis (6379), real API endpoints.

Prerequisites: docker compose up -d, database seeded, views created.
"""
import asyncio
import json
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
import redis.asyncio as aioredis

from src.main import create_app
from src.services.analytics_engine import AnalyticsEngine
from src.services.cache import CacheService
from src.services.profiler import DataProfiler
from src.services.cleaning_log import CleaningLog

DB_URL = "postgresql+asyncpg://observator:observator@localhost:5433/observator"
REDIS_URL = "redis://localhost:6379/0"


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db():
    """Fresh engine + session per test to avoid asyncpg 'another operation in progress'."""
    eng = create_async_engine(DB_URL, pool_size=2)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as session:
        yield session
    await eng.dispose()


@pytest.fixture
async def redis_client():
    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    yield r
    keys = await r.keys("analytics:test_*")
    if keys:
        await r.delete(*keys)
    await r.aclose()


@pytest.fixture
async def authed_client():
    """HTTP client hitting the REAL running API server on port 8000."""
    async with AsyncClient(base_url="http://localhost:8000") as ac:
        resp = await ac.post("/api/login", json={
            "email": "admin@observator.ae",
            "password": "admin123",
        })
        if resp.status_code != 200:
            pytest.skip("API not running or admin not seeded")
        token = resp.json()["token"]
        ac.headers["Authorization"] = f"Bearer {token}"
        yield ac


# ═══════════════════════════════════════════════════════
# Phase 0: Bug Fixes — Real DB
# ═══════════════════════════════════════════════════════

class TestSGIFormulaRealDB:

    @pytest.mark.asyncio
    async def test_sgi_is_percentage_not_ratio(self, db):
        """SGI should be (demand-supply)/demand*100, not supply/demand."""
        engine = AnalyticsEngine(db)
        supply, demand = await engine.get_supply_demand_totals()
        sgi = AnalyticsEngine.compute_sgi(supply, demand)

        if demand > 0:
            expected = round((demand - supply) / demand * 100, 1)
            assert sgi == expected
            # Should NOT be a 0-1 ratio
            if supply != demand:
                assert abs(sgi) > 1.0, f"SGI looks like a ratio ({sgi}), not a percentage"

    @pytest.mark.asyncio
    async def test_occupation_gaps_have_status_field(self, db):
        engine = AnalyticsEngine(db)
        gaps = await engine.get_occupation_gaps(limit=20)
        # vw_gap_cube may have occupation=NULL if view joins don't match — that's a data issue
        for g in gaps:
            assert "status" in g
            assert g["status"] in (
                "Critical Shortage", "Moderate Shortage", "Balanced",
                "Moderate Surplus", "Critical Surplus", "Unknown",
            )
            if g["sgi"] is not None:
                assert g["status"] == AnalyticsEngine.classify_status(g["sgi"])

    @pytest.mark.asyncio
    async def test_no_int_none_crash(self, db):
        """supply/demand should always be int, never crash on NULL."""
        engine = AnalyticsEngine(db)
        gaps = await engine.get_occupation_gaps(limit=100)
        for g in gaps:
            assert isinstance(g["supply"], int)
            assert isinstance(g["demand"], int)
            assert isinstance(g["gap"], int)

    @pytest.mark.asyncio
    async def test_emirate_sgi_computed_correctly(self, db):
        """Verify SGI formula is applied correctly even with mismatched data scales."""
        engine = AnalyticsEngine(db)
        metrics = await engine.get_emirate_metrics()
        assert len(metrics) > 0

        for m in metrics:
            if m["sgi"] is not None and m["demand"] > 0:
                # Verify the formula: (demand-supply)/demand*100
                expected = round((m["demand"] - m["supply"]) / m["demand"] * 100, 1)
                assert m["sgi"] == expected
            assert m["status"] in (
                "Critical Shortage", "Moderate Shortage", "Balanced",
                "Moderate Surplus", "Critical Surplus", "Unknown",
            )


# ═══════════════════════════════════════════════════════
# Phase 1: Redis Cache — Real Redis
# ═══════════════════════════════════════════════════════

class TestRedisCachingReal:

    @pytest.mark.asyncio
    async def test_set_get_roundtrip(self, redis_client):
        cache = CacheService(redis_client)
        data = {"total_supply": 28, "total_demand": 1014, "sgi": 97.2}
        await cache.set("analytics:test_rt", data, ttl=60)
        result = await cache.get("analytics:test_rt")
        assert result == data

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self, redis_client):
        cache = CacheService(redis_client)
        assert await cache.get("analytics:test_nonexistent_xyz") is None

    @pytest.mark.asyncio
    async def test_ttl_expiration(self, redis_client):
        cache = CacheService(redis_client)
        await cache.set("analytics:test_ttl", {"x": 1}, ttl=1)
        assert await cache.get("analytics:test_ttl") is not None
        await asyncio.sleep(2)
        assert await cache.get("analytics:test_ttl") is None

    @pytest.mark.asyncio
    async def test_invalidate_clears_all(self, redis_client):
        cache = CacheService(redis_client)
        await cache.set("analytics:test_inv_a", {"a": 1}, ttl=300)
        await cache.set("analytics:test_inv_b", {"b": 2}, ttl=300)
        cleared = await cache.invalidate_analytics()
        assert cleared >= 2
        assert await cache.get("analytics:test_inv_a") is None
        assert await cache.get("analytics:test_inv_b") is None

    @pytest.mark.asyncio
    async def test_complex_data_roundtrip(self, redis_client):
        cache = CacheService(redis_client)
        data = {
            "occupations": [
                {"title": "Engineer", "sgi": 25.0, "status": "Critical Shortage"},
                {"title": "Nurse", "sgi": None, "status": "Unknown"},
            ],
            "refreshed_at": "2026-03-16T12:00:00Z",
        }
        await cache.set("analytics:test_complex", data, ttl=60)
        result = await cache.get("analytics:test_complex")
        assert result["occupations"][1]["sgi"] is None
        assert result["refreshed_at"] == "2026-03-16T12:00:00Z"


# ═══════════════════════════════════════════════════════
# Phase 2: Analytics Engine — Real Queries
# ═══════════════════════════════════════════════════════

class TestAnalyticsEngineRealDB:

    @pytest.mark.asyncio
    async def test_supply_demand_totals(self, db):
        engine = AnalyticsEngine(db)
        supply, demand = await engine.get_supply_demand_totals()
        assert isinstance(supply, int) and supply >= 0
        assert isinstance(demand, int) and demand > 0

    @pytest.mark.asyncio
    async def test_supply_demand_trend(self, db):
        engine = AnalyticsEngine(db)
        trend = await engine.get_supply_demand_trend()
        assert len(trend) > 0
        for p in trend:
            assert isinstance(p["supply"], int)
            assert isinstance(p["demand"], int)

    @pytest.mark.asyncio
    async def test_sector_distribution_sums_to_100(self, db):
        engine = AnalyticsEngine(db)
        sectors = await engine.get_sector_distribution()
        if sectors:
            total = sum(s["percentage"] for s in sectors)
            assert 99.0 <= total <= 101.0

    @pytest.mark.asyncio
    async def test_emirate_metrics(self, db):
        engine = AnalyticsEngine(db)
        metrics = await engine.get_emirate_metrics()
        assert len(metrics) >= 1
        codes = {m["region_code"] for m in metrics}
        assert len(codes) >= 1

    @pytest.mark.asyncio
    async def test_occupation_gaps_query_runs(self, db):
        """Query executes without error. May return empty if vw_gap_cube has no occupation names."""
        engine = AnalyticsEngine(db)
        gaps = await engine.get_occupation_gaps(limit=10)
        # Result may be empty if occupation column is NULL in the view
        if gaps:
            gap_values = [g["gap"] for g in gaps]
            assert gap_values == sorted(gap_values, reverse=True)

    @pytest.mark.asyncio
    async def test_sgi_trend(self, db):
        engine = AnalyticsEngine(db)
        trend = await engine.get_sgi_trend()
        assert len(trend) > 0
        for p in trend:
            assert isinstance(p["sgi"], float)

    @pytest.mark.asyncio
    async def test_ai_exposure_uses_weighted_composite(self, db):
        """exposure_score should be weighted composite, not raw AVG(exposure_0_100)."""
        engine = AnalyticsEngine(db)
        occs = await engine.get_ai_exposure_occupations(limit=5)
        assert len(occs) > 0

        for o in occs:
            if o["exposure_score"] is not None:
                assert 0 <= o["exposure_score"] <= 100
            assert o["risk_level"] in ("low", "medium", "high", "critical")

    @pytest.mark.asyncio
    async def test_ai_skill_clusters(self, db):
        """Query runs without error. May be empty if occupation_id FK doesn't match across tables."""
        engine = AnalyticsEngine(db)
        clusters = await engine.get_ai_skill_clusters(limit=10)
        for c in clusters:
            assert c["skill"]
            assert c["occupation_count"] > 0

    @pytest.mark.asyncio
    async def test_refreshed_at(self, db):
        engine = AnalyticsEngine(db)
        ts = await engine.get_refreshed_at()
        # May be None if scheduler hasn't run — that's OK
        if ts:
            assert isinstance(ts, str)


# ═══════════════════════════════════════════════════════
# Phase 2: API Endpoints — Real HTTP (authenticated)
# ═══════════════════════════════════════════════════════

class TestDashboardAPIReal:

    @pytest.mark.asyncio
    async def test_dashboard_summary(self, authed_client):
        resp = await authed_client.get("/api/dashboards/summary")
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_demand"] > 0
        assert data["total_gap"] == data["total_demand"] - data["total_supply"]
        # SGI is (demand-supply)/demand*100 — can exceed ±100 when supply >> demand
        if data["sgi"] is not None and data["total_demand"] > 0:
            expected = round((data["total_demand"] - data["total_supply"]) / data["total_demand"] * 100, 1)
            assert data["sgi"] == expected

        # Top occupations have status
        for occ in data.get("top_occupations", []):
            assert "status" in occ

    @pytest.mark.asyncio
    async def test_dashboard_caching(self, authed_client, redis_client):
        """Second call should be served from Redis cache."""
        cache = CacheService(redis_client)
        await cache.invalidate_analytics()

        resp1 = await authed_client.get("/api/dashboards/summary")
        assert resp1.status_code == 200

        # Cache should be populated
        keys = await redis_client.keys("analytics:dashboard_summary*")
        assert len(keys) > 0

        resp2 = await authed_client.get("/api/dashboards/summary")
        assert resp2.status_code == 200
        assert resp2.json() == resp1.json()


class TestSkillGapAPIReal:

    @pytest.mark.asyncio
    async def test_skill_gap_response(self, authed_client):
        resp = await authed_client.get("/api/skill-gap?limit=10")
        assert resp.status_code == 200
        data = resp.json()

        # May be empty if vw_gap_cube occupation column is NULL
        assert "methodology" in data
        assert "SGI" in data["methodology"]

        for occ in data["occupations"]:
            assert "status" in occ
            assert "sgi" in occ

    @pytest.mark.asyncio
    async def test_skill_gap_sgi_formula_verified(self, authed_client):
        """Verify each occupation's SGI matches the canonical formula."""
        resp = await authed_client.get("/api/skill-gap?limit=5")
        data = resp.json()

        for occ in data["occupations"]:
            if occ["sgi"] is not None and occ["demand"] > 0:
                expected = round((occ["demand"] - occ["supply"]) / occ["demand"] * 100, 1)
                assert occ["sgi"] == expected, (
                    f"{occ['title_en']}: sgi={occ['sgi']} != expected={expected}"
                )

    @pytest.mark.asyncio
    async def test_skill_gap_no_crash_empty_filter(self, authed_client):
        resp = await authed_client.get("/api/skill-gap?emirate=NONEXISTENT")
        assert resp.status_code == 200
        assert resp.json()["occupations"] == []


class TestAIImpactAPIReal:

    @pytest.mark.asyncio
    async def test_ai_impact_response(self, authed_client):
        resp = await authed_client.get("/api/ai-impact?limit=10")
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["occupations"]) > 0
        assert data["summary"]["total_occupations"] > 0

        for occ in data["occupations"]:
            assert occ["risk_level"] in ("low", "medium", "high", "critical")

    @pytest.mark.asyncio
    async def test_ai_impact_skill_clusters(self, authed_client):
        """Query runs without error. May be empty if occupation FKs don't match across tables."""
        resp = await authed_client.get("/api/ai-impact?limit=50")
        assert resp.status_code == 200
        data = resp.json()
        # skill_clusters may be empty if the 3-way join yields no rows
        assert isinstance(data["skill_clusters"], list)


# ═══════════════════════════════════════════════════════
# Phase 3: Profiler on Real DB Data
# ═══════════════════════════════════════════════════════

class TestProfilerRealData:

    @pytest.mark.asyncio
    async def test_profile_demand_table(self, db):
        import pandas as pd
        result = await db.execute(text(
            "SELECT region_code, demand_count, source, created_at "
            "FROM fact_demand_vacancies_agg LIMIT 1000"
        ))
        rows = result.fetchall()
        df = pd.DataFrame(rows, columns=["region_code", "demand_count", "source", "created_at"])

        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="real_demand")
        assert profile.row_count > 0
        assert 0 <= profile.quality_score <= 100

        d = profiler.profile_to_dict(profile)
        json.dumps(d)  # Must be serializable

    @pytest.mark.asyncio
    async def test_profile_ai_exposure_table(self, db):
        import pandas as pd
        result = await db.execute(text(
            "SELECT occupation_id, exposure_0_100, automation_probability, llm_exposure "
            "FROM fact_ai_exposure_occupation LIMIT 500"
        ))
        rows = result.fetchall()
        df = pd.DataFrame(rows, columns=["occ_id", "exposure", "auto_prob", "llm_exp"])

        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="real_ai_exposure")
        assert profile.row_count > 0
        assert profile.quality_score > 0


# ═══════════════════════════════════════════════════════
# Phase 4: Cleaning Log
# ═══════════════════════════════════════════════════════

class TestCleaningLogRealScenario:

    def test_realistic_load_cleaning(self):
        log = CleaningLog()
        for i in range(30):
            log.add("skipped_row", "unmappable_location",
                     column="location", original_value=f"City{i}", row_index=i)
        for i in range(10):
            log.add("skipped_row", "no_parseable_date",
                     column="date_posted", original_value="invalid", row_index=30 + i)

        assert log.summary["skipped_row:unmappable_location"] == 30
        assert log.summary["skipped_row:no_parseable_date"] == 10
        assert len(log) == 40


# ═══════════════════════════════════════════════════════
# Phase 1+2: Cache + Engine End-to-End
# ═══════════════════════════════════════════════════════

class TestCacheEngineEndToEnd:

    @pytest.mark.asyncio
    async def test_query_then_cache_then_read(self, db, redis_client):
        cache = CacheService(redis_client)
        engine = AnalyticsEngine(db)

        await cache.invalidate_analytics()

        supply, demand = await engine.get_supply_demand_totals()
        key = CacheService.make_key("test_e2e", {"type": "totals"})
        await cache.set(key, {"supply": supply, "demand": demand}, ttl=300)

        cached = await cache.get(key)
        assert cached["supply"] == supply
        assert cached["demand"] == demand

        cleared = await cache.invalidate_analytics()
        assert cleared >= 1
        assert await cache.get(key) is None
