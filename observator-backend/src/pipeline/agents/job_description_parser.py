"""Agent 6: Job Description Parser — extracts structured skills from
Arabic+English job descriptions using GPT.

Processes in batches of 20 descriptions and adds results to skill_extractions.
"""
from __future__ import annotations

import json
import logging

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

BATCH_SIZE = 20


class JobDescriptionParserAgent(BaseAgent):
    name = "job_description_parser"
    description = "Extract required/preferred skills, education, experience from job descriptions"
    requires_llm = True

    async def validate_input(self, state: PipelineState) -> bool:
        if not state.get("has_job_titles", False):
            return False
        df = state.get("raw_dataframe")
        if df is None:
            return False
        col_lower = {c.lower().strip() for c in df.columns}
        return bool(col_lower & {
            "description", "job_description", "job_desc", "desc",
            "requirements", "details", "responsibilities",
        })

    async def process(self, state: PipelineState, db) -> dict:
        import pandas as pd
        from langchain_openai import ChatOpenAI
        from src.config import settings

        df: pd.DataFrame = state["raw_dataframe"]

        # Find the description column
        desc_col = _find_desc_column(df)
        if not desc_col:
            logger.info("JobDescriptionParser: no description column found")
            return {"parsed_job_descriptions": []}

        descriptions = df[desc_col].dropna().tolist()
        descriptions = [str(d).strip() for d in descriptions if str(d).strip() and len(str(d).strip()) > 20]

        if not descriptions:
            return {"parsed_job_descriptions": []}

        logger.info("JobDescriptionParser: %d descriptions to parse", len(descriptions))

        llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0,
            api_key=settings.OPENAI_API_KEY,
        )

        all_parsed: list[dict] = []
        all_skills: list[dict] = []

        for i in range(0, len(descriptions), BATCH_SIZE):
            batch = descriptions[i : i + BATCH_SIZE]
            batch_text = ""
            for idx, desc in enumerate(batch):
                # Truncate very long descriptions
                truncated = desc[:1500] if len(desc) > 1500 else desc
                batch_text += f"\n---JOB {idx+1}---\n{truncated}\n"

            prompt = (
                "You are an expert HR analyst. Extract structured data from each job description.\n\n"
                f"## Job Descriptions:{batch_text}\n\n"
                "For EACH job (numbered), extract:\n"
                "- required_skills: list of required skills/competencies\n"
                "- preferred_skills: list of preferred/nice-to-have skills\n"
                "- education_level: highest education requirement (e.g. Bachelor, Master, PhD, Diploma, None)\n"
                "- experience_years: minimum years of experience (integer or null)\n\n"
                "Return a JSON array with one object per job. Each object:\n"
                '{"job_index": 1, "required_skills": ["..."], "preferred_skills": ["..."], '
                '"education_level": "...", "experience_years": N}\n'
                "Return ONLY the JSON array."
            )

            try:
                response = await llm.ainvoke(prompt)
                content = response.content.strip()
                if content.startswith("```"):
                    content = content.split("\n", 1)[1] if "\n" in content else content[3:]
                if content.endswith("```"):
                    content = content[: content.rfind("```")]

                parsed = json.loads(content)
                if isinstance(parsed, list):
                    all_parsed.extend(parsed)
                    # Collect unique skills for downstream normalization
                    for item in parsed:
                        for sk in item.get("required_skills", []):
                            all_skills.append({"raw": sk, "source": "job_description", "relation": "required"})
                        for sk in item.get("preferred_skills", []):
                            all_skills.append({"raw": sk, "source": "job_description", "relation": "preferred"})
            except Exception as exc:
                logger.error("JobDescriptionParser batch %d failed: %s", i, exc)

        # Merge skills with existing extractions
        existing_skills = list(state.get("skill_extractions", []))
        existing_skills.extend(all_skills)

        logger.info(
            "JobDescriptionParser: parsed %d descriptions, extracted %d skills",
            len(all_parsed), len(all_skills),
        )

        return {
            "parsed_job_descriptions": all_parsed,
            "skill_extractions": existing_skills,
        }


def _find_desc_column(df) -> str | None:
    """Find the column most likely to contain job descriptions."""
    candidates = [
        "description", "job_description", "job_desc", "desc",
        "requirements", "details", "responsibilities",
    ]
    col_lower_map = {c.lower().strip(): c for c in df.columns}
    for c in candidates:
        if c in col_lower_map:
            return col_lower_map[c]
    return None
