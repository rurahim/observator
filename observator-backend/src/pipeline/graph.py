"""Pipeline graph — LangGraph StateGraph wiring all 18 agents.

The graph implements conditional routing:
- START -> file_ingestion (or api_connector / web_scraper depending on source)
- file_ingestion -> pii_scrubber -> data_quality
- data_quality -> CONDITIONAL: if quality fails -> alert -> END
- After quality: CONDITIONAL based on detected schema flags:
    - has_job_titles: occupation_normalizer -> skill_normalizer -> job_description_parser -> db_loader
    - has_education_data: course_skill_mapper -> db_loader
    - is_pdf: pdf_parser -> db_loader
    - is_cv: cv_parser -> db_loader
    - default: db_loader
- db_loader -> skill_gap_calculator -> trend_forecast -> ai_impact_modelling (sequential)
- ai_impact_modelling -> alert
- alert -> CONDITIONAL: report_generator if auto_report, policy_recommendation if policy_brief
- -> END
"""
from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from src.pipeline.base import AgentResult, BaseAgent, PipelineState
from src.pipeline.agents import AGENT_CLASSES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Wrapper: convert BaseAgent.run() into a LangGraph node function
# ---------------------------------------------------------------------------

def _make_node(agent: BaseAgent):
    """Create an async node function that runs the agent and merges results.

    After each agent completes, flushes progress to the DB so the frontend
    can poll real-time status via GET /api/pipeline/status/{run_id}.
    """

    async def _node(state: PipelineState) -> dict:
        # The db session is stashed in state["_db"] by the executor
        db = state.get("_db")  # type: ignore[arg-type]
        result: AgentResult = await agent.run(state, db)

        updates: dict = dict(result.state_updates)

        # Track completed agents and timings in state
        completed = list(state.get("completed_agents", []))
        agent_label = agent.name
        if not result.success:
            agent_label = f"{agent.name}:failed"
        elif result.error_message and "skipped" in (result.error_message or ""):
            agent_label = f"{agent.name}:skipped"
        completed.append(agent_label)
        updates["completed_agents"] = completed

        timings = dict(state.get("step_timings", {}))
        timings[agent.name] = result.duration_ms
        updates["step_timings"] = timings

        # Accumulate errors
        errors = list(state.get("errors", []))
        if not result.success and result.error_message:
            errors.append(f"[{agent.name}] {result.error_message}")
            updates["errors"] = errors

        # Flush progress to DB for real-time polling
        run_id = state.get("run_id")
        if run_id and db:
            try:
                import json as _json
                from sqlalchemy import text as _text
                # Estimate progress: completed agents / ~12 typical agents * 100
                progress = min(round(len(completed) / 12 * 100, 1), 99)
                await db.execute(
                    _text("""UPDATE pipeline_runs
                             SET completed_agents = :agents,
                                 step_timings = :timings,
                                 errors = :errs,
                                 current_step = :step,
                                 progress = :prog,
                                 updated_at = now()
                             WHERE run_id = :rid"""),
                    {
                        "agents": _json.dumps(completed),
                        "timings": _json.dumps(timings),
                        "errs": _json.dumps(errors),
                        "step": agent.name,
                        "prog": progress,
                        "rid": run_id,
                    },
                )
                await db.commit()
            except Exception as e:
                logger.debug(f"Progress flush failed for {run_id}: {e}")

        return updates

    return _node


# ---------------------------------------------------------------------------
# Conditional edge functions
# ---------------------------------------------------------------------------

def _route_after_quality(state: PipelineState) -> str:
    """After data_quality: if quality failed, go to alert; else route by schema."""
    if not state.get("quality_passed", True):
        return "alert_on_failure"
    return "route_by_schema"


def _route_by_schema(state: PipelineState) -> str:
    """Route to the appropriate normalizer/parser based on data type flags."""
    if state.get("is_pdf"):
        return "pdf_parser"
    if state.get("is_cv"):
        return "cv_parser"
    if state.get("has_job_titles"):
        return "occupation_normalizer"
    if state.get("has_education_data"):
        return "course_skill_mapper"
    # Default: go straight to db_loader
    return "db_loader"


def _route_after_alert(state: PipelineState) -> str:
    """After alert: optionally generate report and/or policy brief."""
    options = state.get("options", {})
    if options.get("auto_report"):
        return "report_generator"
    if options.get("policy_brief"):
        return "policy_recommendation"
    return "finish"


def _route_after_report(state: PipelineState) -> str:
    """After report: optionally generate policy brief."""
    options = state.get("options", {})
    if options.get("policy_brief"):
        return "policy_recommendation"
    return "finish"


def _route_entry(state: PipelineState) -> str:
    """Route the entry point based on source type."""
    source = state.get("source_type", "")
    if source in ("api", "fcsc_api", "mohre_api", "bayanat_api",
                   "ilostat_api", "esco_api", "onet_api", "worldbank_api"):
        return "api_connector"
    if source in ("scrape", "web_scrape"):
        return "web_scraper"
    return "file_ingestion"


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------

def build_pipeline_graph() -> StateGraph:
    """Construct the 18-agent pipeline StateGraph (uncompiled).

    Uses conditional edges to skip irrelevant agents based on data type.
    The alert node serves as the convergence point before optional
    report generation and policy recommendations.
    """
    graph = StateGraph(PipelineState)

    # Instantiate all 18 agents and register as nodes
    agents = {name: cls() for name, cls in AGENT_CLASSES.items()}
    for name, agent in agents.items():
        graph.add_node(name, _make_node(agent))

    # Helper pass-through nodes for routing logic
    async def _noop(state: PipelineState) -> dict:
        return {}

    graph.add_node("route_by_schema", _noop)
    graph.add_node("finish", _noop)

    # =====================================================================
    # Entry: route based on source_type
    # =====================================================================
    graph.add_conditional_edges(
        START,
        _route_entry,
        {
            "api_connector": "api_connector",
            "web_scraper": "web_scraper",
            "file_ingestion": "file_ingestion",
        },
    )

    # API/scraper output feeds into file_ingestion for schema detection
    graph.add_edge("api_connector", "file_ingestion")
    graph.add_edge("web_scraper", "file_ingestion")

    # =====================================================================
    # Core pipeline: ingestion -> PII scrub -> quality check
    # =====================================================================
    graph.add_edge("file_ingestion", "pii_scrubber")
    graph.add_edge("pii_scrubber", "data_quality")

    # =====================================================================
    # Quality gate: fail -> alert -> END; pass -> route by schema
    # =====================================================================
    graph.add_conditional_edges(
        "data_quality",
        _route_after_quality,
        {
            "alert_on_failure": "alert",  # quality failed: skip to alert
            "route_by_schema": "route_by_schema",
        },
    )

    # =====================================================================
    # Schema-based routing to specialised agents
    # =====================================================================
    graph.add_conditional_edges(
        "route_by_schema",
        _route_by_schema,
        {
            "pdf_parser": "pdf_parser",
            "cv_parser": "cv_parser",
            "occupation_normalizer": "occupation_normalizer",
            "course_skill_mapper": "course_skill_mapper",
            "db_loader": "db_loader",
        },
    )

    # --- Job data path ---
    # occupation_normalizer -> skill_normalizer -> job_description_parser -> db_loader
    graph.add_edge("occupation_normalizer", "skill_normalizer")
    graph.add_edge("skill_normalizer", "job_description_parser")
    graph.add_edge("job_description_parser", "db_loader")

    # --- Education data path ---
    graph.add_edge("course_skill_mapper", "db_loader")

    # --- PDF / CV paths ---
    graph.add_edge("pdf_parser", "db_loader")
    graph.add_edge("cv_parser", "db_loader")

    # =====================================================================
    # Analytics sequence (after DB load)
    # =====================================================================
    graph.add_edge("db_loader", "skill_gap_calculator")
    graph.add_edge("skill_gap_calculator", "trend_forecast")
    graph.add_edge("trend_forecast", "ai_impact_modelling")
    graph.add_edge("ai_impact_modelling", "alert")

    # =====================================================================
    # Alert -> optional report / policy -> finish
    # =====================================================================
    graph.add_conditional_edges(
        "alert",
        _route_after_alert,
        {
            "report_generator": "report_generator",
            "policy_recommendation": "policy_recommendation",
            "finish": "finish",
        },
    )

    graph.add_conditional_edges(
        "report_generator",
        _route_after_report,
        {
            "policy_recommendation": "policy_recommendation",
            "finish": "finish",
        },
    )

    graph.add_edge("policy_recommendation", "finish")

    # =====================================================================
    # Finish -> END
    # =====================================================================
    graph.add_edge("finish", END)

    return graph


def compile_pipeline(checkpointer=None):
    """Compile the pipeline graph, ready for execution."""
    graph = build_pipeline_graph()
    return graph.compile(checkpointer=checkpointer)
