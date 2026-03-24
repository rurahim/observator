"""Tests for CacheService — Redis caching with graceful fallback."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.services.cache import CacheService


# ═══════════════════════════════════════════════════════
# Phase 1: Redis Cache Service
# ═══════════════════════════════════════════════════════

class TestCacheServiceKeyGeneration:
    """Test deterministic cache key generation."""

    def test_make_key_no_params(self):
        key = CacheService.make_key("dashboard_summary")
        assert key == "analytics:dashboard_summary"

    def test_make_key_with_params(self):
        key = CacheService.make_key("dashboard_summary", {"emirate": "DXB", "sector": "IT"})
        assert key.startswith("analytics:dashboard_summary:")
        assert len(key) > len("analytics:dashboard_summary:")

    def test_make_key_deterministic(self):
        """Same params always produce same key."""
        key1 = CacheService.make_key("test", {"a": 1, "b": 2})
        key2 = CacheService.make_key("test", {"a": 1, "b": 2})
        assert key1 == key2

    def test_make_key_order_independent(self):
        """Param order doesn't affect key (sorted internally)."""
        key1 = CacheService.make_key("test", {"a": 1, "b": 2})
        key2 = CacheService.make_key("test", {"b": 2, "a": 1})
        assert key1 == key2

    def test_make_key_different_params_different_keys(self):
        key1 = CacheService.make_key("test", {"emirate": "DXB"})
        key2 = CacheService.make_key("test", {"emirate": "AUH"})
        assert key1 != key2

    def test_make_key_empty_params(self):
        key = CacheService.make_key("test", {})
        assert key == "analytics:test"

    def test_make_key_none_params(self):
        key = CacheService.make_key("test", None)
        assert key == "analytics:test"


class TestCacheServiceGracefulFallback:
    """Test that cache is completely no-op when Redis is None (unavailable)."""

    @pytest.mark.asyncio
    async def test_get_returns_none_when_redis_is_none(self):
        cache = CacheService(None)
        result = await cache.get("some_key")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_succeeds_when_redis_is_none(self):
        cache = CacheService(None)
        # Should not raise
        await cache.set("some_key", {"data": 123})

    @pytest.mark.asyncio
    async def test_invalidate_pattern_returns_zero_when_redis_is_none(self):
        cache = CacheService(None)
        count = await cache.invalidate_pattern("analytics:*")
        assert count == 0

    @pytest.mark.asyncio
    async def test_invalidate_analytics_returns_zero_when_redis_is_none(self):
        cache = CacheService(None)
        count = await cache.invalidate_analytics()
        assert count == 0


class TestCacheServiceWithMockRedis:
    """Test cache operations with a mocked Redis client."""

    @pytest.fixture
    def mock_redis(self):
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.set = AsyncMock()
        redis.delete = AsyncMock(return_value=0)
        redis.scan = AsyncMock(return_value=(0, []))
        return redis

    @pytest.mark.asyncio
    async def test_get_cache_miss(self, mock_redis):
        mock_redis.get = AsyncMock(return_value=None)
        cache = CacheService(mock_redis)
        result = await cache.get("analytics:test")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_cache_hit(self, mock_redis):
        data = {"total_supply": 1000, "total_demand": 2000}
        mock_redis.get = AsyncMock(return_value=json.dumps(data))
        cache = CacheService(mock_redis)
        result = await cache.get("analytics:test")
        assert result == data

    @pytest.mark.asyncio
    async def test_get_returns_list(self, mock_redis):
        data = [{"month": "Jan", "sgi": 10.5}]
        mock_redis.get = AsyncMock(return_value=json.dumps(data))
        cache = CacheService(mock_redis)
        result = await cache.get("analytics:test")
        assert result == data

    @pytest.mark.asyncio
    async def test_set_stores_json(self, mock_redis):
        cache = CacheService(mock_redis)
        await cache.set("analytics:test", {"key": "value"}, ttl=3600)
        mock_redis.set.assert_called_once()
        call_args = mock_redis.set.call_args
        assert call_args[0][0] == "analytics:test"
        assert json.loads(call_args[0][1]) == {"key": "value"}
        assert call_args[1]["ex"] == 3600

    @pytest.mark.asyncio
    async def test_set_custom_ttl(self, mock_redis):
        cache = CacheService(mock_redis)
        await cache.set("analytics:test", {"data": 1}, ttl=7200)
        call_args = mock_redis.set.call_args
        assert call_args[1]["ex"] == 7200

    @pytest.mark.asyncio
    async def test_invalidate_pattern_no_keys(self, mock_redis):
        mock_redis.scan = AsyncMock(return_value=(0, []))
        cache = CacheService(mock_redis)
        count = await cache.invalidate_pattern("analytics:*")
        assert count == 0
        mock_redis.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalidate_pattern_with_keys(self, mock_redis):
        mock_redis.scan = AsyncMock(return_value=(0, [b"analytics:a", b"analytics:b"]))
        mock_redis.delete = AsyncMock(return_value=2)
        cache = CacheService(mock_redis)
        count = await cache.invalidate_pattern("analytics:*")
        assert count == 2
        mock_redis.delete.assert_called_once_with(b"analytics:a", b"analytics:b")

    @pytest.mark.asyncio
    async def test_invalidate_analytics(self, mock_redis):
        mock_redis.scan = AsyncMock(return_value=(0, [b"analytics:dashboard:abc123"]))
        mock_redis.delete = AsyncMock(return_value=1)
        cache = CacheService(mock_redis)
        count = await cache.invalidate_analytics()
        assert count == 1

    @pytest.mark.asyncio
    async def test_get_handles_redis_error(self, mock_redis):
        """Graceful on Redis errors — returns None, doesn't crash."""
        mock_redis.get = AsyncMock(side_effect=ConnectionError("Redis down"))
        cache = CacheService(mock_redis)
        result = await cache.get("analytics:test")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_handles_redis_error(self, mock_redis):
        mock_redis.set = AsyncMock(side_effect=ConnectionError("Redis down"))
        cache = CacheService(mock_redis)
        # Should not raise
        await cache.set("analytics:test", {"data": 1})

    @pytest.mark.asyncio
    async def test_invalidate_handles_redis_error(self, mock_redis):
        mock_redis.scan = AsyncMock(side_effect=ConnectionError("Redis down"))
        cache = CacheService(mock_redis)
        count = await cache.invalidate_pattern("analytics:*")
        assert count == 0

    @pytest.mark.asyncio
    async def test_get_invalid_json(self, mock_redis):
        """Corrupted cache entry should return None, not crash."""
        mock_redis.get = AsyncMock(return_value="not valid json{{{")
        cache = CacheService(mock_redis)
        result = await cache.get("analytics:test")
        assert result is None
