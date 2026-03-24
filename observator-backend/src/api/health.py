import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_minio, get_qdrant, get_redis
from src.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    loop = asyncio.get_event_loop()

    # Check database
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # Check MinIO (run in executor with timeout to avoid hanging)
    minio_status = "ok"
    try:
        def _check_minio():
            client = get_minio()
            client.list_buckets()
        await asyncio.wait_for(loop.run_in_executor(None, _check_minio), timeout=3)
    except Exception:
        minio_status = "error"

    # Check Qdrant (run in executor with timeout)
    qdrant_status = "ok"
    try:
        def _check_qdrant():
            client = get_qdrant()
            client.get_collections()
        await asyncio.wait_for(loop.run_in_executor(None, _check_qdrant), timeout=3)
    except Exception:
        qdrant_status = "error"

    # Check Redis
    redis_status = "ok"
    try:
        client = await get_redis()
        await asyncio.wait_for(client.ping(), timeout=3)
    except Exception:
        redis_status = "error"

    overall = "ok" if all(s == "ok" for s in [db_status, minio_status, qdrant_status, redis_status]) else "degraded"

    return HealthResponse(
        status=overall,
        version="0.1.0",
        db=db_status,
        minio=minio_status,
        qdrant=qdrant_status,
        redis=redis_status,
    )
