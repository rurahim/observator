"""Pydantic request / response schemas for the pipeline API."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class PipelineRunRequest(BaseModel):
    """Body for ``POST /api/pipeline/run``."""

    dataset_id: str | None = Field(
        None, description="ID from dataset_registry. None when using api/scrape source."
    )
    source_type: str = Field(
        "auto", description="Source type hint: auto, fcsc_sdmx, rdata_jobs, api, scrape, pdf …"
    )
    auto_report: bool = Field(
        False, description="Generate an executive report after pipeline completes."
    )
    policy_brief: bool = Field(
        False, description="Generate a policy-brief PDF (future use)."
    )
    notify_email: str | None = Field(
        None, description="Email address to notify on completion/failure."
    )
    skip_agents: list[str] = Field(
        default_factory=list,
        description="Agent names to skip (e.g. ['pii_scrubber', 'alert']).",
    )


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class PipelineRunResponse(BaseModel):
    """Returned immediately when a pipeline run is accepted."""

    run_id: str
    status: str = "pending"
    started_at: datetime | None = None


class StepLogOut(BaseModel):
    """Summary of a single agent step."""

    agent_name: str
    status: str
    duration_ms: int | None = None
    error_message: str | None = None


class PipelineStatusResponse(BaseModel):
    """Full status of a pipeline run (polling / SSE)."""

    run_id: str
    dataset_id: str | None = None
    status: str
    progress: float = 0.0
    current_step: str | None = None
    steps_completed: dict | None = None
    errors: dict | None = None
    result_summary: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    step_logs: list[StepLogOut] = Field(default_factory=list)
