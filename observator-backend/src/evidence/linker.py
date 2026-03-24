"""Evidence linker — attaches citations to agent responses.

Connects query results to the evidence store and generates citation references
that the frontend can render as tooltips/modals.
"""
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.evidence import EvidenceStore
from src.schemas.chat import Citation

logger = logging.getLogger(__name__)


async def get_citations_for_trace(
    db: AsyncSession,
    trace_id: str,
) -> list[Citation]:
    """Retrieve all evidence citations linked to a specific agent trace.

    Args:
        db: Database session
        trace_id: The Langfuse trace ID from the agent run

    Returns:
        List of Citation objects ready for the frontend
    """
    result = await db.execute(
        select(EvidenceStore)
        .where(EvidenceStore.trace_id == trace_id)
        .order_by(EvidenceStore.created_at)
    )
    evidences = result.scalars().all()

    citations = []
    for i, ev in enumerate(evidences, 1):
        citations.append(Citation(
            evidence_id=str(ev.evidence_id),
            source=ev.citation_label or f"Source [{i}]",
            excerpt=_build_excerpt(ev),
            location=_build_location(ev),
            source_type=ev.source_type or "internal",
            source_url=ev.source_url,
            retrieved_at=ev.created_at,
        ))

    return citations


async def get_evidence_detail(
    db: AsyncSession,
    evidence_id: str,
) -> dict | None:
    """Get full evidence detail for a citation click/expand.

    Returns the complete evidence record including sample data.
    """
    result = await db.execute(
        select(EvidenceStore).where(EvidenceStore.evidence_id == evidence_id)
    )
    ev = result.scalar_one_or_none()
    if not ev:
        return None

    return {
        "evidence_id": str(ev.evidence_id),
        "trace_id": ev.trace_id,
        "dataset_id": ev.dataset_id,
        "query_sql": ev.query_sql,
        "result_hash": ev.result_hash,
        "result_summary": ev.result_summary,
        "row_count": ev.row_count,
        "citation_label": ev.citation_label,
        "sample_data": ev.metadata_json.get("result_sample", []) if ev.metadata_json else [],
        "created_at": str(ev.created_at) if ev.created_at else None,
    }


def _build_excerpt(ev: EvidenceStore) -> str:
    """Build a short excerpt from evidence for inline citation display."""
    if ev.result_summary:
        return ev.result_summary[:200]

    if ev.metadata_json and ev.metadata_json.get("result_sample"):
        sample = ev.metadata_json["result_sample"]
        if sample:
            first = sample[0]
            parts = [f"{k}: {v}" for k, v in list(first.items())[:3]]
            return ", ".join(parts)

    return f"Query result ({ev.row_count or 0} rows)"


def _build_location(ev: EvidenceStore) -> str | None:
    """Build a location string showing where the evidence came from."""
    if not ev.query_sql:
        return None

    sql_lower = ev.query_sql.lower()
    view_names = {
        "vw_supply_talent": "Workforce Supply",
        "vw_demand_jobs": "Job Demand",
        "vw_gap_cube": "Gap Analysis",
        "vw_ai_impact": "AI Impact",
        "vw_forecast_demand": "Forecasts",
        "vw_supply_education": "Education Supply",
    }

    for view, label in view_names.items():
        if view in sql_lower:
            return f"Data View: {label}"

    return "Data Warehouse"
