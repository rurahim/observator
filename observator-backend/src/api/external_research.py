"""External Research Agent for filter-driven projection adjustments.

When user changes Future Supply Projection filters, this endpoint:
1. Builds a research query from the filter combination
2. Performs deep web search via Tavily/DDG
3. Uses LLM to extract weighted external signal (-30% to +30%)
4. Returns external factors with sources for display
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/external-research", tags=["external-research"])


class FilterContext(BaseModel):
    metric: str = "enrollment"  # enrollment | graduates
    region: Optional[str] = None
    sector: Optional[str] = None
    specialty: Optional[str] = None
    institution: Optional[str] = None
    program: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    horizon_years: int = 5


class ExternalFactor(BaseModel):
    title: str
    summary: str
    impact: str  # "positive" | "negative" | "neutral"
    weight: float  # -1.0 to +1.0 contribution
    source_name: str
    source_url: str
    date: Optional[str] = None


class ResearchResult(BaseModel):
    query: str
    market_signal_pct: int  # -30 to +30, recommended slider value
    confidence: str  # "low" | "medium" | "high"
    rationale: str
    factors: list[ExternalFactor]
    research_summary: str


def _build_research_query(ctx: FilterContext) -> str:
    """Build a focused web search query from the filter context."""
    parts = ["UAE higher education"]
    if ctx.metric == "graduates":
        parts.append("graduates outcomes")
    else:
        parts.append("student enrollment")
    if ctx.specialty:
        parts.append(ctx.specialty)
    if ctx.institution:
        parts.append(ctx.institution)
    if ctx.program:
        parts.append(ctx.program)
    if ctx.region:
        region_names = {"AUH": "Abu Dhabi", "DXB": "Dubai", "SHJ": "Sharjah", "AJM": "Ajman", "RAK": "Ras Al Khaimah", "FUJ": "Fujairah", "UAQ": "Umm Al Quwain"}
        parts.append(region_names.get(ctx.region, ctx.region))
    if ctx.sector:
        parts.append(f"{ctx.sector} sector")
    parts.append(f"forecast {ctx.year_to or 2030}")
    parts.append("trends policy")
    return " ".join(parts)


@router.post("/projection-signal")
async def projection_signal(
    ctx: FilterContext = Body(...),
    user=Depends(get_current_user),
) -> ResearchResult:
    """Multi-agent external research for projection signal.

    Pipeline:
    1. Build research query from filter
    2. Web research agent: 3 parallel searches (factual, trend, policy)
    3. Synthesizer agent: extract weighted factors via GPT
    4. Return signal % + rationale + sources
    """
    from src.agent.tools import _tavily_search, _ddg_search
    from src.config import settings

    query = _build_research_query(ctx)
    logger.info(f"[ExternalResearch] Query: {query}")

    # ── Phase 1: Multi-angle web search ──
    angles = [
        (query, "factual"),
        (f"{query} growth rate trends statistics", "trend"),
        (f"UAE Vision 2031 education policy initiatives {ctx.specialty or 'higher education'}", "policy"),
    ]

    all_results = []
    for q, angle in angles:
        try:
            if settings.TAVILY_API_KEY:
                results = await _tavily_search(q, max_results=4)
            else:
                results = await _ddg_search(q, max_results=4)
            for r in results:
                r["angle"] = angle
            all_results.extend(results)
        except Exception as e:
            logger.warning(f"Search failed for '{q}': {e}")

    if not all_results:
        return ResearchResult(
            query=query,
            market_signal_pct=0,
            confidence="low",
            rationale="No external sources available — keeping baseline projection.",
            factors=[],
            research_summary="External research unavailable. Using historical trend only.",
        )

    # ── Phase 2: LLM synthesis — extract weighted factors ──
    from langchain_openai import ChatOpenAI

    sources_text = "\n\n".join([
        f"[{i+1}] ({r.get('angle', '?')}) {r.get('title', '')}\n"
        f"URL: {r.get('url', '')}\n"
        f"{r.get('content', '')[:800]}"
        for i, r in enumerate(all_results[:8])
    ])

    filter_desc_parts = [f"metric: {ctx.metric}"]
    if ctx.region: filter_desc_parts.append(f"region: {ctx.region}")
    if ctx.specialty: filter_desc_parts.append(f"specialty: {ctx.specialty}")
    if ctx.institution: filter_desc_parts.append(f"institution: {ctx.institution}")
    if ctx.program: filter_desc_parts.append(f"program: {ctx.program}")
    if ctx.sector: filter_desc_parts.append(f"sector: {ctx.sector}")
    filter_desc = ", ".join(filter_desc_parts)

    prompt = f"""You are an external research analyst for UAE labour/education projections.

The user is forecasting UAE higher education {ctx.metric} for the next {ctx.horizon_years} years, filtered by: {filter_desc}.

I have gathered web research below. Your job is to:
1. Extract 4-6 SPECIFIC external factors (not generic statements)
2. Determine if each factor is BULLISH (positive growth signal), BEARISH (negative), or NEUTRAL
3. Assign each a weight from -1.0 (strong negative) to +1.0 (strong positive)
4. Compute an OVERALL market signal as a percentage from -30% (deep bearish) to +30% (strong bullish)
5. Explain the rationale in 2-3 sentences

WEIGHTING RULES:
- Government policy/Vision 2031 initiatives that boost this specialty → +0.15 to +0.30
- Economic diversification, foreign investment → +0.10 to +0.25
- New university campuses, scholarships → +0.10 to +0.20
- AI automation displacing this field → -0.15 to -0.30
- Saturation, declining demand → -0.10 to -0.25
- Brain drain, regional competition → -0.05 to -0.15
- Sum all weights, multiply by 30 = market_signal_pct (cap at ±30)

Return ONLY valid JSON in this exact schema:
{{
  "market_signal_pct": <int between -30 and 30>,
  "confidence": "low" | "medium" | "high",
  "rationale": "<2-3 sentences explaining why this signal>",
  "research_summary": "<3-4 sentence summary of what you learned>",
  "factors": [
    {{
      "title": "<short factor name>",
      "summary": "<1-2 sentence explanation>",
      "impact": "positive" | "negative" | "neutral",
      "weight": <-1.0 to 1.0>,
      "source_name": "<source publication>",
      "source_url": "<full URL>",
      "date": "<YYYY or YYYY-MM if known>"
    }}
  ]
}}

WEB RESEARCH RESULTS:
{sources_text}
"""

    try:
        model = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0.2,
            api_key=settings.OPENAI_API_KEY or None,
        )
        response = await model.ainvoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        # Extract JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        parsed = json.loads(content.strip())

        # Build typed result
        factors = [
            ExternalFactor(
                title=f.get("title", "")[:120],
                summary=f.get("summary", "")[:400],
                impact=f.get("impact", "neutral"),
                weight=max(-1.0, min(1.0, float(f.get("weight", 0)))),
                source_name=f.get("source_name", "")[:80],
                source_url=f.get("source_url", ""),
                date=f.get("date"),
            )
            for f in parsed.get("factors", [])[:6]
        ]
        signal = max(-30, min(30, int(parsed.get("market_signal_pct", 0))))

        return ResearchResult(
            query=query,
            market_signal_pct=signal,
            confidence=parsed.get("confidence", "medium"),
            rationale=parsed.get("rationale", ""),
            factors=factors,
            research_summary=parsed.get("research_summary", ""),
        )
    except Exception as e:
        logger.error(f"LLM synthesis failed: {e}", exc_info=True)
        # Fallback: return raw search results as factors
        factors = [
            ExternalFactor(
                title=r.get("title", "")[:120],
                summary=r.get("content", "")[:300],
                impact="neutral",
                weight=0.0,
                source_name=r.get("url", "").split("/")[2] if r.get("url") else "web",
                source_url=r.get("url", ""),
            )
            for r in all_results[:5]
        ]
        return ResearchResult(
            query=query,
            market_signal_pct=0,
            confidence="low",
            rationale="Synthesis failed; raw research results provided.",
            factors=factors,
            research_summary="LLM synthesis unavailable. Showing top web search results.",
        )
