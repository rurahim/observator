"""Pipeline foundation — shared state, base agent ABC, and result container."""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, TypedDict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared pipeline state that flows between all agents
# ---------------------------------------------------------------------------

class PipelineState(TypedDict, total=False):
    """Mutable state dict carried through the full agent pipeline.

    Every agent reads what it needs, then returns a dict of updates that are
    merged back in by the orchestrator.
    """

    # -- Run metadata --
    run_id: str
    dataset_id: str
    user_id: str | None
    triggered_by: str  # "manual", "schedule", "upload"
    source_type: str  # fcsc_sdmx, rdata_jobs, mohre_excel, api, scrape ...

    # -- File / ingestion layer --
    file_path: str | None
    file_type: str | None  # csv, excel, pdf, json
    filename: str
    detected_schema: str | None  # schema fingerprint key from silver.py
    row_count: int
    dataframe_columns: list[str]
    raw_dataframe: Any  # pandas DataFrame (kept as Any to avoid import at module level)

    # -- PII --
    pii_report: dict[str, Any]
    pii_masked: bool

    # -- Quality --
    quality_report: dict[str, Any]
    quality_passed: bool

    # -- Schema detection flags (set by data_quality agent) --
    has_job_titles: bool
    has_education_data: bool
    is_pdf: bool
    is_cv: bool
    is_api: bool

    # -- Occupation normalizer output --
    occupation_mappings: list[dict]
    # Each: {raw, isco_code, esco_uri, title_en, confidence}

    # -- Skill normalizer / extraction output --
    skill_extractions: list[dict]
    # Each: {raw, skill_id, label_en, confidence, source}

    # -- Job description parser output --
    parsed_job_descriptions: list[dict]
    # Each: {required_skills, preferred_skills, education_level, experience_years}

    # -- CV parser output --
    parsed_cvs: list[dict]

    # -- Course skill mapper output --
    course_skill_mappings: list[dict]

    # -- PDF parser output --
    pdf_text: str
    pdf_tables: list[dict]

    # -- API connector output --
    api_data: list[dict]

    # -- DB loading --
    rows_loaded: int
    target_table: str
    load_result: dict[str, Any]
    load_errors: list[str]

    # -- Materialized views --
    views_refreshed: list[str]
    gap_recalculated: bool

    # -- Analytics outputs --
    skill_gap_results: dict
    forecast_results: dict
    ai_impact_results: dict
    forecasts_generated: int
    ai_impact_updated: bool

    # -- Alert output --
    alerts: list[dict]
    # Each: {level, type, message, data}
    alerts_sent: list[dict[str, Any]]

    # -- Reporting --
    report_id: str
    report_json: dict
    report_generated: bool
    report_path: str | None

    # -- Policy recommendation output --
    policy_brief: str

    # -- Execution tracking --
    completed_agents: list[str]
    errors: list[str | dict]
    step_timings: dict  # {agent_name: seconds}

    # -- Options (user-provided overrides) --
    options: dict  # auto_report, skip_pii, skip_quality, etc.

    # -- Internal: DB session passed through state (not serialised) --
    _db: Any


# ---------------------------------------------------------------------------
# Agent result dataclass
# ---------------------------------------------------------------------------

@dataclass
class AgentResult:
    """Structured return value produced by every agent."""

    agent_name: str
    success: bool = True
    state_updates: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    duration_ms: int = 0


# ---------------------------------------------------------------------------
# Abstract base agent
# ---------------------------------------------------------------------------

class BaseAgent(ABC):
    """Abstract base class for all pipeline agents.

    Subclasses must implement :meth:`process` and may override
    :meth:`validate_input`.
    """

    name: str = "base_agent"
    description: str = ""
    requires_llm: bool = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run(self, state: PipelineState, db) -> AgentResult:
        """Validate input, execute processing, and return an AgentResult.

        This is the method called by the orchestrator.  It wraps
        :meth:`process` with timing, validation, and error handling.
        """
        start = time.monotonic()
        try:
            # Skip LLM agents if no API key
            if self.requires_llm:
                from src.config import settings
                if not settings.OPENAI_API_KEY:
                    logger.warning(
                        "[%s] Skipped — OPENAI_API_KEY not set", self.name
                    )
                    return AgentResult(
                        agent_name=self.name,
                        success=True,
                        state_updates={},
                        error_message="skipped:no_api_key",
                        duration_ms=int((time.monotonic() - start) * 1000),
                    )

            if not await self.validate_input(state):
                return AgentResult(
                    agent_name=self.name,
                    success=True,
                    error_message=f"{self.name}: input validation failed",
                    duration_ms=int((time.monotonic() - start) * 1000),
                )

            # Retry loop: up to 3 attempts with exponential backoff (1s, 4s, 16s)
            max_retries = 3
            last_exc: Exception | None = None
            for attempt in range(1, max_retries + 1):
                try:
                    updates = await self.process(state, db)
                    if attempt > 1:
                        logger.info("[%s] Succeeded on retry %d", self.name, attempt)
                    return AgentResult(
                        agent_name=self.name,
                        success=True,
                        state_updates=updates,
                        duration_ms=int((time.monotonic() - start) * 1000),
                    )
                except Exception as exc:
                    last_exc = exc
                    if attempt < max_retries:
                        backoff = 4 ** (attempt - 1)  # 1s, 4s, 16s
                        logger.warning(
                            "[%s] Attempt %d/%d failed: %s — retrying in %ds",
                            self.name, attempt, max_retries, exc, backoff,
                        )
                        import asyncio
                        await asyncio.sleep(backoff)
                    else:
                        logger.exception(
                            "[%s] All %d attempts failed: %s",
                            self.name, max_retries, exc,
                        )

            return AgentResult(
                agent_name=self.name,
                success=False,
                error_message=str(last_exc)[:500] if last_exc else "unknown error",
                duration_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as exc:
            logger.exception("%s failed: %s", self.name, exc)
            return AgentResult(
                agent_name=self.name,
                success=False,
                error_message=str(exc)[:500],
                duration_ms=int((time.monotonic() - start) * 1000),
            )

    # ------------------------------------------------------------------
    # Hooks for subclasses
    # ------------------------------------------------------------------

    @abstractmethod
    async def process(self, state: PipelineState, db) -> dict:
        """Execute the agent's main logic and return state updates.

        Returns:
            A dict whose keys are a subset of :class:`PipelineState` fields.
        """
        ...

    async def validate_input(self, state: PipelineState) -> bool:
        """Return *True* if the state has everything this agent needs.

        Default implementation always passes.  Override in subclasses that
        have hard prerequisites (e.g. a file path must exist).
        """
        return True
