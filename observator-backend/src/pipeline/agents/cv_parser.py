"""Agent 7: CV Parser — extracts skills, experience, education from CV text.

Similar to JobDescriptionParser but for supply-side data (CVs/resumes).
Processes in batches of 20.
"""
from __future__ import annotations

import json
import logging

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

BATCH_SIZE = 20


class CVParserAgent(BaseAgent):
    name = "cv_parser"
    description = "Extract skills, experience, and education from CV/resume text"
    requires_llm = True

    async def validate_input(self, state: PipelineState) -> bool:
        return state.get("is_cv", False) and state.get("raw_dataframe") is not None

    async def process(self, state: PipelineState, db) -> dict:
        import pandas as pd
        from langchain_openai import ChatOpenAI
        from src.config import settings

        df: pd.DataFrame = state["raw_dataframe"]

        # Find text column (could be full CV text or structured)
        text_col = _find_text_column(df)
        if not text_col:
            # Maybe the whole file is CV text from PDF parsing
            pdf_text = state.get("pdf_text", "")
            if pdf_text:
                cv_texts = [pdf_text]
            else:
                logger.info("CVParser: no text column or PDF text found")
                return {"parsed_cvs": []}
        else:
            cv_texts = df[text_col].dropna().tolist()
            cv_texts = [str(t).strip() for t in cv_texts if str(t).strip() and len(str(t).strip()) > 30]

        if not cv_texts:
            return {"parsed_cvs": []}

        logger.info("CVParser: %d CVs to parse", len(cv_texts))

        llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0,
            api_key=settings.OPENAI_API_KEY,
        )

        all_parsed: list[dict] = []
        all_skills: list[dict] = []

        for i in range(0, len(cv_texts), BATCH_SIZE):
            batch = cv_texts[i : i + BATCH_SIZE]
            batch_text = ""
            for idx, cv in enumerate(batch):
                truncated = cv[:2000] if len(cv) > 2000 else cv
                batch_text += f"\n---CV {idx+1}---\n{truncated}\n"

            prompt = (
                "You are an expert HR analyst. Extract structured data from each CV/resume.\n\n"
                f"## CVs:{batch_text}\n\n"
                "For EACH CV, extract:\n"
                "- skills: list of technical and soft skills mentioned\n"
                "- education: list of objects {degree, field, institution}\n"
                "- experience_years: total years of experience (integer or null)\n"
                "- current_role: current or most recent job title\n"
                "- languages: list of languages mentioned\n\n"
                "Return a JSON array with one object per CV. Each:\n"
                '{"cv_index": 1, "skills": ["..."], "education": [...], '
                '"experience_years": N, "current_role": "...", "languages": ["..."]}\n'
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
                    for item in parsed:
                        for sk in item.get("skills", []):
                            all_skills.append({"raw": sk, "source": "cv", "relation": "demonstrated"})
            except Exception as exc:
                logger.error("CVParser batch %d failed: %s", i, exc)

        # Merge skills
        existing_skills = list(state.get("skill_extractions", []))
        existing_skills.extend(all_skills)

        logger.info("CVParser: parsed %d CVs, extracted %d skills", len(all_parsed), len(all_skills))

        return {
            "parsed_cvs": all_parsed,
            "skill_extractions": existing_skills,
        }


def _find_text_column(df) -> str | None:
    """Find column most likely to contain CV text."""
    candidates = [
        "cv_text", "resume_text", "text", "content", "body",
        "cv", "resume", "description", "summary",
    ]
    col_lower_map = {c.lower().strip(): c for c in df.columns}
    for c in candidates:
        if c in col_lower_map:
            return col_lower_map[c]
    return None
