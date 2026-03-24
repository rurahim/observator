from collections.abc import AsyncGenerator

from minio import Minio
from qdrant_client import QdrantClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings
from src.services.cache import CacheService
from src.services.analytics_engine import AnalyticsEngine

# Database engine (lazy init)
_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
            pool_size=20,
            max_overflow=10,
        )
    return _engine


def get_async_engine():
    """Alias for background tasks that need the engine directly."""
    return get_engine()


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# MinIO client (singleton)
_minio_client = None


def get_minio() -> Minio:
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        if not _minio_client.bucket_exists(settings.MINIO_BUCKET):
            _minio_client.make_bucket(settings.MINIO_BUCKET)
    return _minio_client


# Qdrant client (singleton)
_qdrant_client = None


def get_qdrant() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _qdrant_client


# Redis client (singleton)
_redis_client = None


async def get_redis() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def get_cache() -> CacheService:
    """Return a CacheService wrapping the global Redis client.
    Graceful: if Redis is unavailable, returns a no-op cache."""
    try:
        redis = await get_redis()
        # Quick ping to verify connectivity
        await redis.ping()
        return CacheService(redis)
    except Exception:
        return CacheService(None)


async def get_analytics_engine(
    db: AsyncSession = None,
) -> AnalyticsEngine:
    """Factory for AnalyticsEngine — requires a db session from the caller."""
    # This is used as: engine = AnalyticsEngine(db) in endpoint functions.
    # The Depends(get_db) provides the session; we just return the class.
    raise NotImplementedError("Use AnalyticsEngine(db) directly in endpoints")
