"""Evidence API — search, retrieve, and score citations."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.models.auth import User
from src.models.evidence import EvidenceStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/evidence", tags=["evidence"])


# --- Schemas ---

class EvidenceSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    file_ids: list[str] | None = None
    k: int = Field(default=5, le=20)


class EvidenceSnippet(BaseModel):
    evidence_id: str
    source: str | None = None
    excerpt: str | None = None
    location: str | None = None
    dataset_id: str | None = None
    score: float | None = None


class EvidenceDetail(BaseModel):
    evidence_id: str
    trace_id: str | None = None
    dataset_id: str | None = None
    query_sql: str | None = None
    result_summary: str | None = None
    row_count: int | None = None
    citation_label: str | None = None
    sample_data: list[dict] = []
    created_at: str | None = None


class FeedbackRequest(BaseModel):
    evidence_id: str
    trace_id: str
    score: int = Field(..., ge=-1, le=1, description="-1 bad, 0 neutral, 1 good")
    comment: str | None = None


# --- Endpoints ---

@router.post("/search", response_model=list[EvidenceSnippet])
async def search_evidence(
    body: EvidenceSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search evidence store. Uses vector search (Qdrant) if available, falls back to SQL."""
    # Try vector search first
    try:
        from src.evidence.vector_store import search_similar
        vector_results = await search_similar(
            query=body.query,
            k=body.k,
            file_ids=body.file_ids,
        )
        if vector_results:
            # Enrich with DB data
            snippets = []
            for vr in vector_results:
                ev = await db.execute(
                    select(EvidenceStore).where(
                        EvidenceStore.evidence_id == vr["evidence_id"]
                    )
                )
                evidence = ev.scalar_one_or_none()
                if evidence:
                    snippets.append(EvidenceSnippet(
                        evidence_id=str(evidence.evidence_id),
                        source=evidence.citation_label,
                        excerpt=evidence.result_summary[:300] if evidence.result_summary else vr.get("text", ""),
                        location=None,
                        dataset_id=evidence.dataset_id,
                        score=vr.get("score"),
                    ))
            if snippets:
                return snippets
    except Exception as e:
        logger.debug(f"Vector search unavailable, using SQL fallback: {e}")

    # SQL fallback: text search on citation_label and result_summary
    query = select(EvidenceStore).order_by(EvidenceStore.created_at.desc()).limit(body.k)

    if body.file_ids:
        query = query.where(EvidenceStore.dataset_id.in_(body.file_ids))

    result = await db.execute(query)
    evidences = result.scalars().all()

    return [
        EvidenceSnippet(
            evidence_id=str(e.evidence_id),
            source=e.citation_label,
            excerpt=e.result_summary[:300] if e.result_summary else None,
            location=None,
            dataset_id=e.dataset_id,
        )
        for e in evidences
    ]


@router.get("/{evidence_id}", response_model=EvidenceDetail)
async def get_evidence(
    evidence_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full evidence detail for a citation. Used when user clicks a citation."""
    from src.evidence.linker import get_evidence_detail

    detail = await get_evidence_detail(db, evidence_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Evidence not found")

    return EvidenceDetail(**detail)


@router.get("/trace/{trace_id}", response_model=list[EvidenceSnippet])
async def get_evidence_by_trace(
    trace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all evidence citations for a specific agent trace."""
    result = await db.execute(
        select(EvidenceStore)
        .where(EvidenceStore.trace_id == trace_id)
        .order_by(EvidenceStore.created_at)
    )
    evidences = result.scalars().all()

    return [
        EvidenceSnippet(
            evidence_id=str(e.evidence_id),
            source=e.citation_label,
            excerpt=e.result_summary[:300] if e.result_summary else None,
            dataset_id=e.dataset_id,
        )
        for e in evidences
    ]


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit user feedback on an evidence citation. Feeds into Langfuse scoring."""
    from src.agent.tracing import score_trace

    score_trace(
        trace_id=body.trace_id,
        name="citation-feedback",
        value=body.score,
        comment=body.comment or f"Evidence {body.evidence_id}",
    )

    # Also store feedback in evidence metadata
    result = await db.execute(
        select(EvidenceStore).where(EvidenceStore.evidence_id == body.evidence_id)
    )
    evidence = result.scalar_one_or_none()
    if evidence:
        meta = evidence.metadata_json or {}
        feedback_list = meta.get("feedback", [])
        feedback_list.append({
            "user_id": str(user.user_id),
            "score": body.score,
            "comment": body.comment,
        })
        meta["feedback"] = feedback_list
        evidence.metadata_json = meta
        await db.flush()

    return {"ok": True}
