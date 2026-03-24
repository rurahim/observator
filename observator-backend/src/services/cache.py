"""Redis caching service with graceful fallback and auto-invalidation."""
import hashlib
import json
import logging

from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class CacheService:
    """Thin Redis cache wrapper. All methods are no-op safe: if Redis is down,
    get() returns None and set()/invalidate*() silently succeed."""

    def __init__(self, redis: Redis | None):
        self._redis = redis

    # --- Core ops ---

    async def get(self, key: str) -> dict | list | None:
        if self._redis is None:
            return None
        try:
            raw = await self._redis.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.debug("cache miss (error) key=%s", key)
            return None

    async def set(self, key: str, value, ttl: int = 3600) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.set(key, json.dumps(value, default=str), ex=ttl)
        except Exception:
            logger.debug("cache set failed key=%s", key)

    async def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching *pattern* (e.g. ``analytics:*``).
        Returns count of deleted keys, 0 on error."""
        if self._redis is None:
            return 0
        try:
            cursor, keys = b"0", []
            while True:
                cursor, batch = await self._redis.scan(cursor=cursor, match=pattern, count=200)
                keys.extend(batch)
                if cursor == 0 or cursor == b"0":
                    break
            if keys:
                return await self._redis.delete(*keys)
            return 0
        except Exception:
            logger.debug("cache invalidate_pattern failed pattern=%s", pattern)
            return 0

    async def invalidate_analytics(self) -> int:
        """Convenience: wipe all analytics cache entries."""
        return await self.invalidate_pattern("analytics:*")

    # --- Key helpers ---

    @staticmethod
    def make_key(prefix: str, params: dict | None = None) -> str:
        """Build a deterministic cache key from *prefix* and optional *params*."""
        if not params:
            return f"analytics:{prefix}"
        # Sort for determinism, hash for brevity
        raw = json.dumps(params, sort_keys=True, default=str)
        h = hashlib.md5(raw.encode()).hexdigest()[:12]
        return f"analytics:{prefix}:{h}"
