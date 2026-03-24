"""Pipeline executor — runs the compiled LangGraph pipeline against a dataset.

Creates a PipelineRun record, builds initial state, invokes the graph,
updates the run record with results, and returns the run_id.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.base import PipelineState
from src.pipeline.graph import compile_pipeline

logger = logging.getLogger(__name__)


async def _save_final_status(
    run_id: str, status: str,
    completed_agents: list, errors: list,
    timings: dict, alerts: list,
    result_summary: dict,
) -> None:
    """Save final pipeline status using a FRESH db connection.

    This bypasses any poisoned transaction from agent errors.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AS, async_sessionmaker
    from src.config import settings

    engine = create_async_engine(settings.DATABASE_URL)
    sf = async_sessionmaker(engine, class_=AS)
    try:
        async with sf() as db:
            await db.execute(
                text(
                    "UPDATE pipeline_runs SET "
                    "status = :status, progress = :progress, "
                    "completed_agents = :agents, errors = :errors, "
                    "step_timings = :timings, alerts = :alerts, "
                    "result_summary = :summary, "
                    "updated_at = now(), finished_at = now() "
                    "WHERE run_id = :run_id"
                ),
                {
                    "status": status,
                    "progress": 100.0,
                    "agents": json.dumps(completed_agents, default=str),
                    "errors": json.dumps(errors, default=str),
                    "timings": json.dumps(timings, default=str),
                    "alerts": json.dumps(alerts, default=str),
                    "summary": json.dumps(result_summary, default=str),
                    "run_id": run_id,
                },
            )
            await db.commit()

            # Also log individual steps
            for agent_name in completed_agents:
                name = agent_name.split(":")[0]
                agent_status = "completed" if ":" not in agent_name else agent_name.split(":")[1]
                dur = timings.get(name, 0)
                err_msg = None
                if agent_status == "failed":
                    err_msg = next((str(e) for e in errors if name in str(e)), None)
                try:
                    await db.execute(
                        text("INSERT INTO pipeline_step_logs (run_id, agent_name, status, duration_ms, error_message) VALUES (:r, :a, :s, :d, :e)"),
                        {"r": run_id, "a": name, "s": agent_status, "d": dur, "e": err_msg},
                    )
                except Exception:
                    pass
            await db.commit()
    except Exception as e:
        logger.error("Failed to save pipeline status for %s: %s", run_id, e)
    finally:
        await engine.dispose()


async def run_pipeline(
    dataset_id: str,
    user_id: str,
    triggered_by: str = "manual",
    options: dict | None = None,
    db: AsyncSession | None = None,
) -> str:
    """Execute the full 18-agent pipeline for a dataset.

    Args:
        dataset_id: The dataset_registry.dataset_id to process.
        user_id: ID of the user who triggered the run.
        triggered_by: "manual", "schedule", or "upload".
        options: Optional overrides (auto_report, policy_brief, forecast_horizon, etc.)
        db: An async database session. If None, one is created.

    Returns:
        The run_id (UUID hex string) for status tracking.
    """
    options = options or {}
    # Use API-provided run_id if available (avoids double record creation)
    run_id = options.pop("_api_run_id", None) or uuid4().hex

    # Get a DB session if not provided
    own_session = False
    if db is None:
        from src.dependencies import get_session_factory
        factory = get_session_factory()
        db = factory()
        own_session = True

    try:
        # Create pipeline_runs record (skip if API already created it)
        existing = await db.execute(
            text("SELECT run_id FROM pipeline_runs WHERE run_id = :id"),
            {"id": run_id},
        )
        if not existing.fetchone():
            await _create_run_record(
                db, run_id=run_id, dataset_id=dataset_id,
                user_id=user_id, triggered_by=triggered_by, options=options,
            )
        else:
            # Update existing record to running
            await db.execute(
                text("UPDATE pipeline_runs SET status='running', updated_at=now() WHERE run_id=:id"),
                {"id": run_id},
            )
            await db.commit()

        # Build initial state — populate from options for file-path-based runs
        initial_state: PipelineState = {
            "run_id": run_id,
            "dataset_id": dataset_id,
            "user_id": user_id,
            "triggered_by": triggered_by,
            "options": options,
            "completed_agents": [],
            "errors": [],
            "step_timings": {},
            "alerts": [],
            "skill_extractions": [],
            "occupation_mappings": [],
            "_db": db,  # type: ignore[typeddict-unknown-key]
        }

        # Inject file_path and source_type from options (for direct-file runs)
        if options.get("file_path"):
            initial_state["file_path"] = options["file_path"]
            # Detect file type
            fp = options["file_path"]
            if fp.endswith(".csv"):
                initial_state["file_type"] = "csv"
            elif fp.endswith((".xlsx", ".xls")):
                initial_state["file_type"] = "excel"
            elif fp.endswith(".pdf"):
                initial_state["file_type"] = "pdf"
            initial_state["filename"] = fp.split("/")[-1].split("\\")[-1]
        if options.get("source_type"):
            initial_state["source_type"] = options["source_type"]

        # Detect source_type from dataset registry if not already set
        if not initial_state.get("source_type"):
            try:
                row = await db.execute(
                    text("SELECT source_type FROM dataset_registry WHERE dataset_id = :id"),
                    {"id": dataset_id},
                )
                source_type = row.scalar()
                if source_type:
                    initial_state["source_type"] = source_type
            except Exception:
                pass

        # Compile and run the graph
        logger.info("Pipeline [%s] starting for dataset=%s", run_id, dataset_id)
        pipeline = compile_pipeline()

        # LangGraph invocation
        config = {"recursion_limit": 50}
        final_state = await pipeline.ainvoke(initial_state, config)

        # Extract results
        completed = final_state.get("completed_agents", [])
        errors = final_state.get("errors", [])
        timings = final_state.get("step_timings", {})
        alerts = final_state.get("alerts", [])

        # Use simple "completed" status — frontend checks errors array for details
        status = "completed"

        # Update run record using a FRESH connection (main session may be poisoned)
        await _save_final_status(
            run_id=run_id, status=status,
            completed_agents=completed, errors=errors,
            timings=timings, alerts=alerts,
            result_summary=_build_summary(final_state),
        )

        logger.info(
            "Pipeline [%s] finished: status=%s agents=%d errors=%d",
            run_id, status, len(completed), len(errors),
        )

        return run_id

    except Exception as exc:
        logger.error("Pipeline [%s] failed: %s", run_id, exc, exc_info=True)
        try:
            await _save_final_status(
                run_id=run_id, status="failed",
                completed_agents=[], errors=[str(exc)[:300]],
                timings={}, alerts=[],
                result_summary={"error": str(exc)[:500]},
            )
        except Exception:
            pass
        raise

    finally:
        if own_session:
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            finally:
                await db.close()


async def get_pipeline_status(run_id: str, db: AsyncSession) -> dict:
    """Get the current status of a pipeline run."""
    row = await db.execute(
        text(
            "SELECT run_id, dataset_id, user_id, triggered_by, status, "
            "progress, completed_agents, errors, step_timings, alerts, "
            "result_summary, options, created_at, updated_at, finished_at "
            "FROM pipeline_runs WHERE run_id = :id"
        ),
        {"id": run_id},
    )
    r = row.first()
    if not r:
        return {}

    return {
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
    }


async def list_pipeline_runs(db: AsyncSession, limit: int = 20) -> list[dict]:
    """List recent pipeline runs."""
    rows = await db.execute(
        text(
            "SELECT run_id, dataset_id, user_id, triggered_by, status, "
            "progress, created_at, finished_at "
            "FROM pipeline_runs "
            "ORDER BY created_at DESC LIMIT :lim"
        ),
        {"lim": limit},
    )
    return [
        {
            "run_id": r[0],
            "dataset_id": r[1],
            "user_id": r[2],
            "triggered_by": r[3],
            "status": r[4],
            "progress": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
            "finished_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows.fetchall()
    ]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _create_run_record(
    db: AsyncSession, *, run_id: str, dataset_id: str,
    user_id: str, triggered_by: str, options: dict,
) -> None:
    """Create the pipeline_runs table if needed and insert a run record."""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            run_id          TEXT PRIMARY KEY,
            dataset_id      TEXT NOT NULL,
            user_id         TEXT,
            triggered_by    TEXT DEFAULT 'manual',
            status          TEXT DEFAULT 'running',
            progress        FLOAT DEFAULT 0,
            completed_agents JSONB DEFAULT '[]'::jsonb,
            errors          JSONB DEFAULT '[]'::jsonb,
            step_timings    JSONB DEFAULT '{}'::jsonb,
            alerts          JSONB DEFAULT '[]'::jsonb,
            result_summary  JSONB DEFAULT '{}'::jsonb,
            options         JSONB DEFAULT '{}'::jsonb,
            created_at      TIMESTAMP DEFAULT now(),
            updated_at      TIMESTAMP,
            finished_at     TIMESTAMP
        )
    """))

    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS pipeline_step_logs (
            id              SERIAL PRIMARY KEY,
            run_id          TEXT REFERENCES pipeline_runs(run_id),
            agent_name      TEXT NOT NULL,
            status          TEXT DEFAULT 'running',
            duration_ms     INTEGER,
            error_message   TEXT,
            state_snapshot  JSONB,
            created_at      TIMESTAMP DEFAULT now()
        )
    """))

    await db.execute(
        text(
            "INSERT INTO pipeline_runs "
            "(run_id, dataset_id, user_id, triggered_by, status, options) "
            "VALUES (:run_id, :dataset_id, :user_id, :triggered_by, 'running', :options)"
        ),
        {
            "run_id": run_id,
            "dataset_id": dataset_id,
            "user_id": user_id,
            "triggered_by": triggered_by,
            "options": json.dumps(options, default=str),
        },
    )
    await db.flush()


async def _update_run_record(
    db: AsyncSession, *, run_id: str, status: str,
    completed_agents: list, errors: list,
    timings: dict, alerts: list,
    result_summary: dict,
) -> None:
    """Update the pipeline_runs record with final results."""
    total_agents = len(completed_agents) if completed_agents else 0
    progress = 100.0 if status in ("completed", "completed_with_errors") else (
        min(total_agents * 6.0, 99.0)  # rough progress estimate
    )

    await db.execute(
        text(
            "UPDATE pipeline_runs SET "
            "status = :status, progress = :progress, "
            "completed_agents = :agents, errors = :errors, "
            "step_timings = :timings, alerts = :alerts, "
            "result_summary = :summary, "
            "updated_at = now(), finished_at = now() "
            "WHERE run_id = :run_id"
        ),
        {
            "run_id": run_id,
            "status": status,
            "progress": progress,
            "agents": json.dumps(completed_agents, default=str),
            "errors": json.dumps(errors, default=str),
            "timings": json.dumps(timings, default=str),
            "alerts": json.dumps(alerts, default=str),
            "summary": json.dumps(result_summary, default=str),
        },
    )
    await db.flush()

    # Log individual step results
    for agent_name, duration_ms in timings.items():
        agent_status = "completed"
        error_msg = None
        for err in errors:
            if isinstance(err, str) and agent_name in err:
                agent_status = "failed"
                error_msg = err
                break

        try:
            await db.execute(
                text(
                    "INSERT INTO pipeline_step_logs "
                    "(run_id, agent_name, status, duration_ms, error_message) "
                    "VALUES (:run_id, :agent, :status, :dur, :err)"
                ),
                {
                    "run_id": run_id,
                    "agent": agent_name,
                    "status": agent_status,
                    "dur": int(duration_ms) if isinstance(duration_ms, (int, float)) else 0,
                    "err": error_msg,
                },
            )
        except Exception:
            pass

    await db.flush()


def _build_summary(state: PipelineState) -> dict:
    """Build a concise result summary from final state."""
    load = state.get("load_result", {})
    return {
        "rows_loaded": load.get("rows_loaded", 0),
        "target_table": load.get("target_table"),
        "views_refreshed": state.get("views_refreshed", []),
        "forecasts_generated": state.get("forecasts_generated", 0),
        "ai_impact_updated": state.get("ai_impact_updated", False),
        "occupation_mappings_count": len(state.get("occupation_mappings", [])),
        "skill_extractions_count": len(state.get("skill_extractions", [])),
        "alerts_count": len(state.get("alerts", [])),
        "report_generated": state.get("report_generated", False),
        "policy_brief_length": len(state.get("policy_brief", "")),
        "pii_masked": state.get("pii_masked", False),
        "quality_passed": state.get("quality_passed", True),
    }


def _safe_json(val) -> any:
    """Safely parse a JSON column value."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return val
