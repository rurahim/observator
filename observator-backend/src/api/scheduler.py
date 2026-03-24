"""Pipeline scheduler — schedule, toggle, and manually trigger API source pipelines."""
import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.rbac import require_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])

# ---------------------------------------------------------------------------
# In-memory schedule configuration
# ---------------------------------------------------------------------------
SCHEDULED_SOURCES: dict[str, dict] = {
    "worldbank_api": {"enabled": False, "interval_hours": 24, "label": "World Bank UAE Labour Stats"},
    "ilostat_api": {"enabled": False, "interval_hours": 168, "label": "ILO International Labour Stats"},
    "fcsc_api": {"enabled": False, "interval_hours": 168, "label": "FCSC Labour Force"},
    "web_scrape": {"enabled": False, "interval_hours": 24, "label": "UAE Job Board Scraping"},
}

# Last-run timestamps (in-memory — lost on restart, acceptable for now)
_last_runs: dict[str, datetime] = {}

# Background loop handle
_scheduler_task: asyncio.Task | None = None


# ---------------------------------------------------------------------------
# Background scheduler loop
# ---------------------------------------------------------------------------
async def _scheduler_loop():
    """Check every 60 seconds if any enabled source is due for a pipeline run."""
    logger.info("[Scheduler] Background loop started")
    while True:
        try:
            await asyncio.sleep(60)
            now = datetime.now(timezone.utc)

            for source_type, cfg in SCHEDULED_SOURCES.items():
                if not cfg["enabled"]:
                    continue

                last = _last_runs.get(source_type)
                interval_sec = cfg["interval_hours"] * 3600

                if last is None or (now - last).total_seconds() >= interval_sec:
                    logger.info(f"[Scheduler] Triggering scheduled run for {source_type}")
                    try:
                        await _trigger_pipeline(source_type, triggered_by="scheduler")
                        _last_runs[source_type] = now
                    except Exception as e:
                        logger.error(f"[Scheduler] Failed to trigger {source_type}: {e}")
        except asyncio.CancelledError:
            logger.info("[Scheduler] Background loop cancelled")
            break
        except Exception as e:
            logger.error(f"[Scheduler] Unexpected error in loop: {e}")


def start_scheduler_loop():
    """Start the background scheduler loop (called from app lifespan)."""
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())
        logger.info("[Scheduler] Loop task created")


def stop_scheduler_loop():
    """Cancel the background scheduler loop."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("[Scheduler] Loop task cancelled")


# ---------------------------------------------------------------------------
# Pipeline trigger helper (reuses pipeline background runner)
# ---------------------------------------------------------------------------
async def _trigger_pipeline(source_type: str, triggered_by: str = "scheduler"):
    """Create a pipeline_runs record and launch the pipeline in background.

    Reuses the same background runner from src.api.pipeline.
    """
    from src.api.pipeline import _ensure_tables as ensure_pipeline_tables, _run_pipeline_bg

    from sqlalchemy.ext.asyncio import (
        create_async_engine,
        AsyncSession as AS,
        async_sessionmaker,
    )
    from src.config import settings

    engine = create_async_engine(settings.DATABASE_URL, pool_size=2)
    try:
        factory = async_sessionmaker(engine, class_=AS)
        async with factory() as db:
            await ensure_pipeline_tables(db)
            run_id = uuid4().hex[:12]
            await db.execute(
                text("""INSERT INTO pipeline_runs
                    (run_id, dataset_id, user_id, triggered_by, status, source_type, options)
                    VALUES (:rid, '', 'scheduler', :trig, 'pending', :st, :opts)"""),
                {
                    "rid": run_id,
                    "trig": triggered_by,
                    "st": source_type,
                    "opts": json.dumps({"scheduled": True}),
                },
            )
            await db.commit()

        request_data = {
            "dataset_id": "",
            "user_id": "scheduler",
            "triggered_by": triggered_by,
            "file_path": None,
            "source_type": source_type,
            "auto_report": False,
            "policy_brief": False,
        }
        asyncio.create_task(_run_pipeline_bg(run_id, request_data))
        return run_id
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/sources")
async def list_sources(
    user=require_permission("*"),
):
    """List all schedulable pipeline sources with their config."""
    result = []
    for source_type, cfg in SCHEDULED_SOURCES.items():
        result.append({
            "source_type": source_type,
            "label": cfg["label"],
            "enabled": cfg["enabled"],
            "interval_hours": cfg["interval_hours"],
            "last_run": _last_runs.get(source_type, None),
        })
    return result


@router.post("/sources/{source_type}/toggle")
async def toggle_source(
    source_type: str,
    user=require_permission("*"),
):
    """Toggle a scheduled source on or off."""
    if source_type not in SCHEDULED_SOURCES:
        raise HTTPException(404, f"Unknown source: {source_type}")

    SCHEDULED_SOURCES[source_type]["enabled"] = not SCHEDULED_SOURCES[source_type]["enabled"]
    new_state = SCHEDULED_SOURCES[source_type]["enabled"]

    logger.info(f"[Scheduler] {source_type} toggled to {'enabled' if new_state else 'disabled'} by {user.user_id}")

    return {
        "source_type": source_type,
        "enabled": new_state,
        "label": SCHEDULED_SOURCES[source_type]["label"],
    }


@router.post("/sources/{source_type}/run-now")
async def run_now(
    source_type: str,
    user=require_permission("*"),
):
    """Trigger an immediate pipeline run for a source."""
    if source_type not in SCHEDULED_SOURCES:
        raise HTTPException(404, f"Unknown source: {source_type}")

    run_id = await _trigger_pipeline(source_type, triggered_by=f"manual:{user.user_id}")
    _last_runs[source_type] = datetime.now(timezone.utc)

    return {
        "run_id": run_id,
        "source_type": source_type,
        "status": "running",
        "message": f"Pipeline started for {source_type}. Poll /api/pipeline/status/{run_id} for progress.",
    }
