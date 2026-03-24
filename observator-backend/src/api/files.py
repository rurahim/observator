"""File upload, listing, and management endpoints."""
import json
import logging
import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db, get_minio
from src.middleware.auth import get_current_user
from src.middleware.rbac import require_permission
from src.schemas.files import DatasetDetail, FileMetadata, FileUploadResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    minio_client=Depends(get_minio),
):
    """Upload a file to bronze storage and trigger the 18-agent processing pipeline."""
    from src.ingestion.bronze import ingest_to_bronze

    dataset_id = await ingest_to_bronze(file, str(user.user_id), minio_client, db)

    # Save uploaded file to local temp path for pipeline
    temp_dir = os.path.join(tempfile.gettempdir(), "observator_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{dataset_id}_{file.filename or 'unknown'}")
    try:
        await file.seek(0)
        contents = await file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)
    except Exception:
        temp_path = None

    # Run pipeline SYNCHRONOUSLY (background tasks are unreliable on Windows)
    run_id = None
    pipeline_status = "processing"
    try:
        from src.pipeline.executor import run_pipeline
        options = {"file_path": temp_path} if temp_path else {}
        run_id = await run_pipeline(
            dataset_id=dataset_id,
            user_id=str(user.user_id),
            triggered_by="upload",
            options=options,
        )
        pipeline_status = "processed"

        # Invalidate analytics cache so charts show the new data
        try:
            from src.dependencies import get_redis
            from src.services.cache import CacheService
            redis = await get_redis()
            cache = CacheService(redis)
            await cache.invalidate_analytics()
            logger.info("Cache invalidated after upload for %s", dataset_id)
        except Exception:
            pass  # Cache invalidation is best-effort

        # Update dataset_registry using fresh connection
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AS2, async_sessionmaker as asm2
        from src.config import settings
        eng2 = create_async_engine(settings.DATABASE_URL)
        try:
            async with asm2(eng2, class_=AS2)() as db2:
                pr = await db2.execute(
                    text("SELECT result_summary FROM pipeline_runs WHERE run_id = :id"),
                    {"id": run_id},
                )
                summary_raw = pr.scalar()
                row_count = 0
                if summary_raw:
                    summary = summary_raw if isinstance(summary_raw, dict) else json.loads(summary_raw)
                    row_count = summary.get("rows_loaded", 0)
                await db2.execute(
                    text("UPDATE dataset_registry SET status='ready', progress=100, row_count=:rows WHERE dataset_id=:id"),
                    {"id": dataset_id, "rows": row_count},
                )
                await db2.commit()
        finally:
            await eng2.dispose()

    except Exception as e:
        logger.error(f"Pipeline failed for {dataset_id}: {e}")
        pipeline_status = "failed"

    # Clean up temp file
    if temp_path and os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    return FileUploadResponse(
        dataset_id=dataset_id,
        name=file.filename or "unknown",
        status=pipeline_status,
        minio_path=f"bronze/{dataset_id}/{file.filename}",
        pipeline_run_id=run_id,
    )


@router.get("", response_model=list[FileMetadata])
async def list_files(
    search: str | None = None,
    status: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all uploaded datasets."""
    query = "SELECT dataset_id, filename, file_type, file_size, row_count, created_at, status, progress, source_type FROM dataset_registry"
    conditions = []
    params: dict = {}

    if search:
        conditions.append("filename ILIKE :search")
        params["search"] = f"%{search}%"
    if status:
        conditions.append("status = :status")
        params["status"] = status

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC"

    result = await db.execute(text(query), params)
    rows = result.fetchall()

    return [
        FileMetadata(
            id=row[0],
            name=row[1],
            type=row[2] or "unknown",
            size=row[3],
            records=row[4],
            uploaded=row[5].isoformat() if row[5] else "",
            status=_map_status(row[6]),
            progress=row[7],
            source_type=row[8],
        )
        for row in rows
    ]


@router.get("/{dataset_id}/pipeline-results")
async def get_pipeline_results(
    dataset_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return pipeline_runs data for a given dataset."""
    result = await db.execute(
        text("""
            SELECT run_id, dataset_id, user_id, triggered_by, status,
                   progress, completed_agents, errors, step_timings, alerts,
                   result_summary, options, created_at, updated_at, finished_at
            FROM pipeline_runs
            WHERE dataset_id = :dataset_id
            ORDER BY created_at DESC
        """),
        {"dataset_id": dataset_id},
    )
    rows = result.fetchall()
    if not rows:
        return {"dataset_id": dataset_id, "runs": []}

    runs = []
    for r in rows:
        runs.append({
            "run_id": r[0],
            "dataset_id": r[1],
            "user_id": r[2],
            "triggered_by": r[3],
            "status": r[4],
            "progress": r[5],
            "completed_agents": _safe_json(r[6]),
            "errors": _safe_json(r[7]),
            "step_timings": _safe_json(r[8]),
            "alerts": _safe_json(r[9]),
            "result_summary": _safe_json(r[10]),
            "options": _safe_json(r[11]),
            "created_at": r[12].isoformat() if r[12] else None,
            "updated_at": r[13].isoformat() if r[13] else None,
            "finished_at": r[14].isoformat() if r[14] else None,
        })

    return {"dataset_id": dataset_id, "runs": runs}


@router.get("/{dataset_id}", response_model=DatasetDetail)
async def get_file(
    dataset_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed info for a specific dataset."""
    result = await db.execute(
        text("""
            SELECT dataset_id, filename, file_type, file_size, sha256, minio_path,
                   row_count, created_at, status, progress, source_type, error_message, metadata_json
            FROM dataset_registry WHERE dataset_id = :id
        """),
        {"id": dataset_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return DatasetDetail(
        id=row[0],
        name=row[1],
        type=row[2] or "unknown",
        size=row[3],
        sha256=row[4],
        minio_path=row[5],
        records=row[6],
        uploaded=row[7].isoformat() if row[7] else "",
        status=_map_status(row[8]),
        progress=row[9],
        source_type=row[10],
        error_message=row[11],
        metadata_json=row[12],
    )


@router.delete("/{dataset_id}")
async def delete_file(
    dataset_id: str,
    user=require_permission("manage_datasets"),
    db: AsyncSession = Depends(get_db),
    minio_client=Depends(get_minio),
):
    """Delete a dataset and its MinIO objects."""
    result = await db.execute(
        text("SELECT minio_path FROM dataset_registry WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Delete from MinIO
    if row[0]:
        try:
            minio_client.remove_object("observator", row[0])
        except Exception:
            pass  # File may not exist

    # Cascade delete from fact tables (remove rows loaded by this upload)
    for table in ["fact_demand_vacancies_agg", "fact_supply_talent_agg", "fact_supply_graduates"]:
        try:
            await db.execute(
                text(f"DELETE FROM {table} WHERE dataset_id = :id"),
                {"id": dataset_id},
            )
        except Exception as e:
            logger.warning("Cascade delete from %s failed: %s", table, e)

    # Delete pipeline run records
    try:
        await db.execute(
            text("DELETE FROM pipeline_step_logs WHERE run_id IN (SELECT run_id FROM pipeline_runs WHERE dataset_id = :id)"),
            {"id": dataset_id},
        )
        await db.execute(
            text("DELETE FROM pipeline_runs WHERE dataset_id = :id"),
            {"id": dataset_id},
        )
    except Exception as e:
        logger.warning("Pipeline records cleanup failed: %s", e)

    # Delete from dataset_registry
    await db.execute(
        text("DELETE FROM dataset_registry WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    await db.commit()

    # Refresh materialized views in background (best-effort)
    for view in ["vw_supply_talent", "vw_demand_jobs", "vw_supply_education", "vw_gap_cube"]:
        try:
            await db.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
        except Exception:
            pass

    return {"ok": True, "cascade_deleted": True}


@router.post("/{dataset_id}/reprocess")
async def reprocess_file(
    dataset_id: str,
    background_tasks: BackgroundTasks,
    user=require_permission("manage_datasets"),
    db: AsyncSession = Depends(get_db),
):
    """Re-trigger the 18-agent pipeline for a dataset."""
    result = await db.execute(
        text("SELECT dataset_id FROM dataset_registry WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Dataset not found")

    await db.execute(
        text("UPDATE dataset_registry SET status = 'processing', progress = 0, error_message = NULL WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    await db.commit()

    user_id = str(user.user_id) if hasattr(user, "user_id") else "system"
    background_tasks.add_task(_process_pipeline, dataset_id, user_id, None)
    return {"ok": True}


async def _process_pipeline(
    dataset_id: str,
    user_id: str,
    temp_file_path: str | None = None,
):
    """Background task: run the 18-agent pipeline for an uploaded dataset.

    Uses a fresh DB connection to avoid poisoned sessions from the request handler.
    After pipeline completes, updates dataset_registry status to 'ready' or 'error'.
    """
    from sqlalchemy.ext.asyncio import (
        AsyncSession as AS,
        async_sessionmaker,
        create_async_engine,
    )
    from src.config import settings

    run_id = None
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AS, expire_on_commit=False)

    try:
        from src.pipeline.executor import run_pipeline

        # Build pipeline options — pass temp file path so agents can read the file
        options = {}
        if temp_file_path and os.path.exists(temp_file_path):
            options["file_path"] = temp_file_path

        run_id = await run_pipeline(
            dataset_id=dataset_id,
            user_id=user_id,
            triggered_by="upload",
            options=options,
        )

        logger.info(
            "Pipeline completed for dataset=%s run_id=%s", dataset_id, run_id
        )

        # Invalidate analytics cache so charts show the new data
        try:
            import redis.asyncio as aioredis
            from src.services.cache import CacheService
            from src.config import settings as _settings
            _redis = aioredis.from_url(_settings.REDIS_URL, decode_responses=True)
            await CacheService(_redis).invalidate_analytics()
            await _redis.aclose()
        except Exception:
            pass

        # Update dataset_registry to 'ready' using a fresh connection
        async with session_factory() as db:
            # Read the result_summary from the pipeline run to get row_count
            row_count = 0
            try:
                pr_result = await db.execute(
                    text("SELECT result_summary FROM pipeline_runs WHERE run_id = :id"),
                    {"id": run_id},
                )
                summary_raw = pr_result.scalar()
                if summary_raw:
                    summary = summary_raw if isinstance(summary_raw, dict) else json.loads(summary_raw)
                    row_count = summary.get("rows_loaded", 0)
            except Exception as e:
                logger.warning("Could not read pipeline result_summary: %s", e)

            await db.execute(
                text(
                    "UPDATE dataset_registry "
                    "SET status = 'ready', progress = 100, row_count = :rows, "
                    "    error_message = NULL "
                    "WHERE dataset_id = :id"
                ),
                {"id": dataset_id, "rows": row_count},
            )
            await db.commit()

    except Exception as e:
        logger.error("Pipeline failed for dataset=%s: %s", dataset_id, e, exc_info=True)

        # Update dataset_registry to 'error' using a fresh connection
        try:
            async with session_factory() as db:
                await db.execute(
                    text(
                        "UPDATE dataset_registry "
                        "SET status = 'error', error_message = :err "
                        "WHERE dataset_id = :id"
                    ),
                    {"id": dataset_id, "err": str(e)[:500]},
                )
                await db.commit()
        except Exception as db_err:
            logger.error("Failed to update dataset status to error: %s", db_err)

    finally:
        # Clean up temp file
        if temp_file_path:
            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                    logger.debug("Cleaned up temp file: %s", temp_file_path)
            except Exception:
                pass

        await engine.dispose()


def _map_status(status: str | None) -> str:
    """Map internal status to frontend-compatible status."""
    mapping = {
        "uploaded": "processing",
        "processing": "processing",
        "ready": "processed",
        "error": "failed",
    }
    return mapping.get(status or "", "processing")


def _safe_json(val):
    """Safely parse a JSON column value."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return val
