"""Agent 18: Policy Recommendation — generates a policy brief from pipeline results.

Takes gap data, forecast data, and alerts from the pipeline state and generates
a 1-2 paragraph policy brief using GPT.
"""
from __future__ import annotations

import json
import logging

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class PolicyRecommendationAgent(BaseAgent):
    name = "policy_recommendation"
    description = "Generate a policy brief from gap, forecast, and alert data"
    requires_llm = True

    async def validate_input(self, state: PipelineState) -> bool:
        # Need at least some analytics data or alerts to write about
        return bool(
            state.get("skill_gap_results")
            or state.get("forecast_results")
            or state.get("ai_impact_results")
            or state.get("alerts")
        )

    async def process(self, state: PipelineState, db) -> dict:
        from langchain_openai import ChatOpenAI
        from src.config import settings

        llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0.3,  # Slightly creative for policy writing
            api_key=settings.OPENAI_API_KEY,
        )

        # Assemble context from pipeline state
        context_parts: list[str] = []

        gap_results = state.get("skill_gap_results", {})
        if gap_results:
            context_parts.append(
                f"## Skill Gap Analysis\n{json.dumps(gap_results, default=str)[:2000]}"
            )

        forecast_results = state.get("forecast_results", {})
        if forecast_results:
            context_parts.append(
                f"## Forecast Data\n{json.dumps(forecast_results, default=str)[:2000]}"
            )

        ai_impact = state.get("ai_impact_results", {})
        if ai_impact:
            context_parts.append(
                f"## AI Impact Assessment\n{json.dumps(ai_impact, default=str)[:2000]}"
            )

        alerts = state.get("alerts", [])
        if alerts:
            context_parts.append(
                f"## Alerts Raised\n{json.dumps(alerts, default=str)[:1000]}"
            )

        # Include load summary if available
        load_result = state.get("load_result", {})
        if load_result:
            context_parts.append(
                f"## Data Update\n"
                f"Rows loaded: {load_result.get('rows_loaded', 0)}, "
                f"Target table: {load_result.get('target_table', 'N/A')}"
            )

        context = "\n\n".join(context_parts)

        prompt = (
            "You are a senior policy advisor for the UAE Ministry of Human Resources "
            "and Emiratisation (MOHRE). Based on the following labour market intelligence "
            "data, write a concise policy brief (1-2 paragraphs, max 250 words).\n\n"
            "Focus on:\n"
            "- Key findings and their implications for UAE workforce strategy\n"
            "- Specific, actionable recommendations for policymakers\n"
            "- Reference Emiratisation goals and Vision 2031 where relevant\n"
            "- Highlight urgent areas (critical skill shortages, high AI exposure sectors)\n\n"
            f"## Data Context:\n{context}\n\n"
            "Write the policy brief now. Be specific with numbers and occupations. "
            "Do not use generic language."
        )

        try:
            response = await llm.ainvoke(prompt)
            policy_brief = response.content.strip()
            logger.info("PolicyRecommendation: generated %d-char brief", len(policy_brief))
        except Exception as exc:
            logger.error("PolicyRecommendation failed: %s", exc)
            policy_brief = (
                "Policy brief generation failed. Please review the pipeline "
                "alerts and analytics data manually."
            )

        return {"policy_brief": policy_brief}
