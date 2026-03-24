"""Evidence collector — records query results as citable evidence.

Every time the agent executes a query, the result is hashed and stored as evidence.
This provides an audit trail and allows citations to reference specific data points.
"""
import hashlib
import json
import logging
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.evidence import EvidenceStore

logger = logging.getLogger(__name__)


async def collect_evidence(
    db: AsyncSession,
    *,
    trace_id: str,
    query_sql: str,
    result_data: list[dict],
    dataset_id: str | None = None,
    citation_label: str | None = None,
    source_type: str = "internal",
    source_url: str | None = None,
    metadata: dict | None = None,
) -> str:
    """Store query result as citable evidence.

    Args:
        db: Database session
        trace_id: Langfuse trace ID linking to the agent run
        query_sql: The SQL that produced this evidence
        result_data: The actual query result rows
        dataset_id: Optional link to source dataset
        citation_label: Human-readable citation label
        metadata: Additional metadata (view, filters, etc.)

    Returns:
        evidence_id as string
    """
    # Hash the result for deduplication
    result_json = json.dumps(result_data, sort_keys=True, default=str)
    result_hash = hashlib.sha256(result_json.encode()).hexdigest()[:16]

    # Build summary
    row_count = len(result_data)
    if row_count == 0:
        summary = "Query returned no results."
    elif row_count == 1:
        summary = f"Single result: {_summarize_row(result_data[0])}"
    else:
        summary = f"{row_count} rows. First: {_summarize_row(result_data[0])}"

    # Auto-generate citation label if not provided
    if not citation_label:
        citation_label = _auto_label(query_sql, row_count, source_type)

    evidence = EvidenceStore(
        evidence_id=uuid4(),
        trace_id=trace_id,
        dataset_id=dataset_id,
        query_sql=query_sql,
        result_hash=result_hash,
        result_summary=summary[:2000],
        row_count=row_count,
        citation_label=citation_label,
        source_type=source_type,
        source_url=source_url,
        metadata_json={
            **(metadata or {}),
            "result_sample": result_data[:3],  # Store first 3 rows as sample
        },
    )
    db.add(evidence)
    await db.flush()

    logger.info(f"Collected evidence {evidence.evidence_id}: {citation_label} ({row_count} rows)")
    return str(evidence.evidence_id)


def _summarize_row(row: dict) -> str:
    """Create a brief text summary of a data row."""
    parts = []
    for k, v in list(row.items())[:5]:
        if v is not None:
            parts.append(f"{k}={v}")
    return ", ".join(parts)


def _auto_label(sql: str, row_count: int, source_type: str = "internal") -> str:
    """Generate a citation label from the SQL query and source type."""
    if source_type == "web_search":
        return f"Web Search ({row_count} results)"
    elif source_type == "job_search":
        return f"Live Job Data ({row_count} results)"
    elif source_type == "webpage":
        return "Web Page Content"

    sql_lower = sql.lower()
    if "vw_supply_talent" in sql_lower:
        source = "Workforce Supply Data"
    elif "vw_demand_jobs" in sql_lower:
        source = "Job Demand Data"
    elif "vw_gap_cube" in sql_lower:
        source = "Supply-Demand Gap Analysis"
    elif "vw_ai_impact" in sql_lower:
        source = "AI Exposure Analysis"
    elif "vw_forecast_demand" in sql_lower:
        source = "Demand Forecast"
    elif "vw_supply_education" in sql_lower:
        source = "Graduate Supply Data"
    else:
        source = "Labour Market Data"

    return f"{source} ({row_count} records)"
