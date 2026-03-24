"""Pipeline request/response schemas."""
from datetime import datetime

from pydantic import BaseModel, Field


class PipelineRunRequest(BaseModel):
    """Request body for POST /api/pipeline/run."""
    dataset_id: str | None = Field(default=None, description="dataset_registry.dataset_id to process")
    file_path: str | None = Field(default=None, description="Direct file path for testing")
    source_type: str | None = Field(default=None, description="rdata_jobs, fcsc_sdmx, mohre_excel, etc.")
    triggered_by: str = Field(default="manual", description="manual | schedule | upload")
    auto_report: bool = Field(default=False, description="Generate PDF report on completion")
    policy_brief: bool = Field(default=False, description="Generate AI policy brief")
    options: dict = Field(
        default_factory=dict,
        description="Additional overrides: forecast_horizon, notify_email, etc.",
    )


class PipelineRunResponse(BaseModel):
    """Response for POST /api/pipeline/run — returned immediately."""
    run_id: str
    dataset_id: str
    status: str = "running"
    message: str = "Pipeline started"


class PipelineStatusResponse(BaseModel):
    """Response for GET /api/pipeline/status/{run_id}."""
    run_id: str
    dataset_id: str
    user_id: str | None = None
    triggered_by: str | None = None
    status: str
    progress: float = 0
    completed_agents: list = []
    errors: list = []
    step_timings: dict = {}
    alerts: list = []
    result_summary: dict = {}
    options: dict = {}
    created_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None


class PipelineRunSummary(BaseModel):
    """Summary item for GET /api/pipeline/runs list."""
    run_id: str
    dataset_id: str
    user_id: str | None = None
    triggered_by: str | None = None
    status: str
    progress: float = 0
    source_type: str | None = None
    created_at: str | None = None
    finished_at: str | None = None
