"""Pipeline API endpoints — trigger, monitor, and list pipeline runs."""
import asyncio
import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.audit import log_action
from src.middleware.rbac import require_permission
from src.schemas.pipeline import (
    PipelineRunRequest,
    PipelineRunResponse,
    PipelineRunSummary,
    PipelineStatusResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

# Ensure pipeline_runs table exists
_TABLE_CREATED = False


async def _ensure_tables(db: AsyncSession):
    global _TABLE_CREATED
    if _TABLE_CREATED:
        return
    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                run_id TEXT PRIMARY KEY,
                dataset_id TEXT,
                user_id TEXT,
                triggered_by TEXT DEFAULT 'manual',
                status TEXT DEFAULT 'pending',
                progress FLOAT DEFAULT 0,
                current_step TEXT,
                completed_agents JSONB DEFAULT '[]'::jsonb,
                errors JSONB DEFAULT '[]'::jsonb,
                step_timings JSONB DEFAULT '{}'::jsonb,
                result_summary JSONB DEFAULT '{}'::jsonb,
                options JSONB DEFAULT '{}'::jsonb,
                file_path TEXT,
                source_type TEXT,
                created_at TIMESTAMP DEFAULT now(),
                updated_at TIMESTAMP,
                finished_at TIMESTAMP
            )
        """))
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS pipeline_step_logs (
                id SERIAL PRIMARY KEY,
                run_id TEXT REFERENCES pipeline_runs(run_id),
                agent_name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                duration_ms INT,
                error_message TEXT,
                started_at TIMESTAMP DEFAULT now(),
                completed_at TIMESTAMP
            )
        """))
        await db.commit()
        _TABLE_CREATED = True
    except Exception as e:
        logger.warning(f"Table creation warning: {e}")
        _TABLE_CREATED = True


async def _run_pipeline_bg(run_id: str, request: dict):
    """Background task: run the full pipeline in an independent asyncio task.

    Uses its own DB engine + session so it doesn't block the API server.
    Updates pipeline_runs incrementally so the frontend can poll progress.
    """
    import traceback as tb
    from sqlalchemy.ext.asyncio import (
        create_async_engine,
        AsyncSession as AS,
        async_sessionmaker,
    )
    from src.config import settings

    logger.info(f"[BG] Pipeline {run_id} background task starting...")

    engine = None
    try:
        engine = create_async_engine(settings.DATABASE_URL, pool_size=3)
        session_factory = async_sessionmaker(engine, class_=AS)

        async with session_factory() as db:
            # Mark as running
            await db.execute(
                text("UPDATE pipeline_runs SET status='running', updated_at=now() WHERE run_id=:id"),
                {"id": run_id},
            )
            await db.commit()

            from src.pipeline.executor import run_pipeline

            options = {
                "file_path": request.get("file_path"),
                "source_type": request.get("source_type"),
                "auto_report": request.get("auto_report", False),
                "policy_brief": request.get("policy_brief", False),
                "_api_run_id": run_id,
            }

            await run_pipeline(
                dataset_id=request.get("dataset_id") or "",
                user_id=request.get("user_id", ""),
                triggered_by=request.get("triggered_by", "manual"),
                options=options,
                db=db,
            )
            logger.info(f"[BG] Pipeline {run_id} completed successfully")

            # --- Create a completion notification (broadcast) ---
            try:
                from src.api.notifications import create_notification

                summary_row = (await db.execute(
                    text("SELECT result_summary, source_type FROM pipeline_runs WHERE run_id = :id"),
                    {"id": run_id},
                )).fetchone()
                if summary_row:
                    result_summary = summary_row[0] if isinstance(summary_row[0], dict) else json.loads(summary_row[0] or "{}")
                    src_type = summary_row[1] or request.get("source_type", "unknown")
                    rows_loaded = result_summary.get("rows_loaded", 0)
                    views_refreshed = result_summary.get("views_refreshed", [])
                    await create_notification(
                        db=db,
                        title=f"Pipeline completed: {src_type}",
                        message=f"Loaded {rows_loaded} rows into {result_summary.get('target_table', 'N/A')}. {len(views_refreshed)} views refreshed.",
                        type="pipeline_complete",
                        metadata=result_summary,
                        user_id=None,  # broadcast
                    )
            except Exception as notif_err:
                logger.warning(f"[BG] Failed to create pipeline notification: {notif_err}")

    except Exception as e:
        logger.error(f"[BG] Pipeline {run_id} CRASHED: {e}\n{tb.format_exc()}")
        try:
            if engine:
                async with async_sessionmaker(engine, class_=AS)() as db2:
                    await db2.execute(
                        text("""UPDATE pipeline_runs
                                SET status='failed', errors=:err, finished_at=now(), updated_at=now()
                                WHERE run_id=:id"""),
                        {"id": run_id, "err": json.dumps([{"agent": "background_task", "error": str(e)[:500]}])},
                    )
                    await db2.commit()
        except Exception:
            pass
    finally:
        if engine:
            await engine.dispose()


@router.post("/run", response_model=PipelineRunResponse)
async def trigger_pipeline(
    body: PipelineRunRequest,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger the 18-agent pipeline. Returns immediately; pipeline runs in background.

    Poll GET /api/pipeline/status/{run_id} for real-time progress.
    """
    await _ensure_tables(db)

    # Allow API/scrape sources without a file
    api_sources = {"api", "fcsc_api", "bayanat_api", "ilostat_api", "esco_api",
                   "onet_api", "worldbank_api", "scrape", "web_scrape"}
    if not body.dataset_id and not body.file_path and body.source_type not in api_sources:
        raise HTTPException(400, "Provide dataset_id, file_path, or an API/scrape source_type")

    run_id = uuid4().hex[:12]

    # Insert run record (status=pending)
    await db.execute(
        text("""INSERT INTO pipeline_runs
            (run_id, dataset_id, user_id, triggered_by, status, file_path, source_type, options)
            VALUES (:rid, :did, :uid, :trig, 'pending', :fp, :st, :opts)"""),
        {
            "rid": run_id,
            "did": body.dataset_id or "",
            "uid": str(user.user_id),
            "trig": body.triggered_by,
            "fp": body.file_path,
            "st": body.source_type,
            "opts": json.dumps({"auto_report": body.auto_report, "policy_brief": body.policy_brief}),
        },
    )
    await db.commit()

    await log_action(db, user_id=user.user_id, action="pipeline_run",
                     resource_type="pipeline", resource_id=run_id)

    # Launch pipeline as an independent asyncio task (non-blocking)
    request_data = {
        "dataset_id": body.dataset_id or "",
        "user_id": str(user.user_id),
        "triggered_by": body.triggered_by,
        "file_path": body.file_path,
        "source_type": body.source_type,
        "auto_report": body.auto_report,
        "policy_brief": body.policy_brief,
    }
    asyncio.create_task(_run_pipeline_bg(run_id, request_data))

    # Return immediately — client polls /status/{run_id}
    return PipelineRunResponse(
        run_id=run_id,
        dataset_id=body.dataset_id or "",
        status="running",
        message="Pipeline started. Poll /api/pipeline/status/{run_id} for progress.",
    )


@router.get("/status/{run_id}", response_model=PipelineStatusResponse)
async def get_status(
    run_id: str,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Get pipeline run status with real-time agent progress."""
    await _ensure_tables(db)
    row = (await db.execute(
        text("SELECT * FROM pipeline_runs WHERE run_id = :id"), {"id": run_id}
    )).fetchone()

    if not row:
        raise HTTPException(404, f"Run {run_id} not found")

    d = dict(row._mapping)
    return PipelineStatusResponse(
        run_id=d["run_id"],
        dataset_id=d.get("dataset_id", ""),
        status=d.get("status", "unknown"),
        progress=d.get("progress", 0),
        completed_agents=d.get("completed_agents", []),
        errors=d.get("errors", []),
        step_timings=d.get("step_timings", {}),
        result_summary=d.get("result_summary", {}),
        created_at=str(d.get("created_at", "")),
        finished_at=str(d.get("finished_at", "")) if d.get("finished_at") else None,
    )


@router.get("/runs", response_model=list[PipelineRunSummary])
async def list_runs(
    limit: int = 20,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """List recent pipeline runs."""
    await _ensure_tables(db)
    rows = (await db.execute(
        text("""SELECT run_id, dataset_id, user_id, triggered_by, status, progress,
                       source_type, created_at, finished_at
                FROM pipeline_runs ORDER BY created_at DESC LIMIT :lim"""),
        {"lim": min(limit, 100)},
    )).fetchall()

    return [PipelineRunSummary(
        run_id=r[0], dataset_id=r[1] or "", user_id=r[2],
        triggered_by=r[3], status=r[4], progress=r[5] or 0,
        source_type=r[6],
        created_at=str(r[7]) if r[7] else None,
        finished_at=str(r[8]) if r[8] else None,
    ) for r in rows]


@router.get("/data-preview/{run_id}")
async def get_data_preview(
    run_id: str,
    limit: int = 20,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Preview the data loaded by a pipeline run.

    Returns sample rows from the target table filtered by the run's time window,
    plus aggregate stats from the affected materialized views.
    """
    await _ensure_tables(db)

    # Get the run record
    row = (await db.execute(
        text("SELECT source_type, result_summary, created_at FROM pipeline_runs WHERE run_id = :id"),
        {"id": run_id},
    )).fetchone()

    if not row:
        raise HTTPException(404, f"Run {run_id} not found")

    source_type = row[0] or ""
    summary = row[1] if isinstance(row[1], dict) else json.loads(row[1] or "{}")
    created_at = row[2]
    target_table = summary.get("target_table")
    rows_loaded = summary.get("rows_loaded", 0)
    views_refreshed = summary.get("views_refreshed", [])

    preview: dict = {
        "run_id": run_id,
        "source_type": source_type,
        "rows_loaded": rows_loaded,
        "target_table": target_table,
        "views_refreshed": views_refreshed,
        "sample_data": [],
        "affected_views": {},
    }

    # Sample rows from the target fact table (most recent rows near the run time)
    if target_table and rows_loaded > 0:
        try:
            sample = (await db.execute(
                text(f"""SELECT * FROM {target_table}
                         ORDER BY COALESCE(created_at, '2020-01-01') DESC
                         LIMIT :lim"""),
                {"lim": min(limit, 50)},
            )).fetchall()
            if sample:
                cols = sample[0]._fields if hasattr(sample[0], '_fields') else list(sample[0]._mapping.keys())
                preview["sample_data"] = [
                    {c: (str(v) if v is not None else None) for c, v in zip(cols, r)}
                    for r in sample
                ]
        except Exception as e:
            logger.debug(f"Preview sample query failed: {e}")

    # Aggregate stats from affected views
    for view_name in views_refreshed:
        try:
            count = (await db.execute(
                text(f"SELECT COUNT(*) FROM {view_name}")
            )).scalar()
            preview["affected_views"][view_name] = {"total_rows": count}
        except Exception:
            pass

    # Skill gap stats from vw_gap_cube if refreshed
    if "vw_gap_cube" in views_refreshed:
        try:
            gap_stats = (await db.execute(text("""
                SELECT
                    COUNT(*) as total_occupations,
                    COUNT(*) FILTER (WHERE demand > supply) as shortage_count,
                    COUNT(*) FILTER (WHERE supply > demand) as surplus_count,
                    COUNT(*) FILTER (WHERE ABS(demand - supply) <= GREATEST(demand, 1) * 0.05) as balanced_count
                FROM (
                    SELECT occupation, SUM(demand_count) as demand, SUM(supply_count) as supply
                    FROM vw_gap_cube GROUP BY occupation
                ) sub
            """))).fetchone()
            if gap_stats:
                preview["skill_gap_summary"] = {
                    "total_occupations": gap_stats[0],
                    "shortage": gap_stats[1],
                    "surplus": gap_stats[2],
                    "balanced": gap_stats[3],
                }
        except Exception:
            pass

    return preview
