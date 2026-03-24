"""CourseSkillMapperAgent — maps education/course data to ESCO skills using
the ``dim_skill`` lookup table.

Runs when the loaded data contains education-related columns (institution,
discipline, graduates, programme).  Produces skill-extraction records that
can be inserted into ``fact_course_skills``.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# Column names that represent course/programme titles or descriptions
_COURSE_COLUMNS = {
    "course", "course_name", "programme", "program", "program_name",
    "module", "subject", "discipline", "field_of_study",
}

# Column names that hold skill-like content
_SKILL_COLUMNS = {
    "skills", "skills_list", "learning_outcomes", "competencies",
    "required_skills", "course_skills",
}


class CourseSkillMapperAgent(BaseAgent):
    name = "course_skill_mapper"
    description = "Map education data to ESCO skills via dim_skill lookup"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        # Only run when we know the data has education content
        has_edu = state.get("has_education_data", False)
        file_path = state.get("file_path")
        return bool(has_edu and file_path and os.path.exists(file_path))

    async def process(self, state: PipelineState, db) -> dict:
        file_path: str = state["file_path"]  # type: ignore[assignment]
        file_type: str = state.get("file_type", "csv") or "csv"

        # Load data
        try:
            if file_type in ("csv",):
                df = pd.read_csv(
                    file_path, encoding="utf-8", low_memory=False, on_bad_lines="skip",
                )
            elif file_type in ("excel",):
                df = pd.read_excel(file_path)
            else:
                return {"skill_extractions": [], "course_skill_mappings": []}
        except Exception as exc:
            logger.error("CourseSkillMapper: cannot read file: %s", exc)
            return {"skill_extractions": [], "course_skill_mappings": []}

        df.columns = [str(c).strip().lower() for c in df.columns]
        col_set = set(df.columns)

        # Load ESCO skills for fuzzy matching
        skill_lookup = await self._load_skill_lookup(db)
        if not skill_lookup:
            logger.warning("CourseSkillMapper: dim_skill is empty — nothing to map")
            return {"skill_extractions": [], "course_skill_mappings": []}

        # Find skill-bearing columns
        skill_cols = col_set & _SKILL_COLUMNS
        course_cols = col_set & _COURSE_COLUMNS

        extractions: list[dict[str, Any]] = []
        mappings: list[dict[str, Any]] = []

        # ---- Extract skills from skill-bearing columns ----
        for col in skill_cols:
            for idx, raw_value in df[col].dropna().items():
                tokens = self._tokenise_skills(str(raw_value))
                for token in tokens:
                    match = self._match_skill(token, skill_lookup)
                    if match:
                        extractions.append({
                            "raw": token,
                            "skill_id": match["skill_id"],
                            "label_en": match["label_en"],
                            "confidence": match["confidence"],
                            "source": col,
                        })

        # ---- Map course/programme names to skills (keyword overlap) ----
        for col in course_cols:
            for idx, raw_value in df[col].dropna().items():
                course_name = str(raw_value).strip()
                matched = self._match_course_to_skills(course_name, skill_lookup)
                for m in matched:
                    course_id = f"{col}:{idx}"
                    mappings.append({
                        "course_id": course_id,
                        "course_name": course_name,
                        "skill_id": m["skill_id"],
                        "label_en": m["label_en"],
                        "confidence": m["confidence"],
                    })

        logger.info(
            "CourseSkillMapper: %d skill extractions, %d course-skill mappings",
            len(extractions),
            len(mappings),
        )

        return {
            "skill_extractions": extractions[:5000],  # cap
            "course_skill_mappings": mappings[:5000],
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _load_skill_lookup(db: AsyncSession) -> dict[str, dict]:
        """Load dim_skill into a dict keyed by normalised label."""
        result = await db.execute(
            text("SELECT skill_id, label_en FROM dim_skill WHERE label_en IS NOT NULL")
        )
        lookup: dict[str, dict] = {}
        for skill_id, label_en in result:
            key = str(label_en).strip().lower()
            lookup[key] = {"skill_id": skill_id, "label_en": label_en}
        return lookup

    @staticmethod
    def _tokenise_skills(raw: str) -> list[str]:
        """Split a raw skill string (comma/semicolon/pipe separated or list)."""
        import ast

        raw = raw.strip()
        # Try Python list literal
        if raw.startswith("["):
            try:
                parsed = ast.literal_eval(raw)
                if isinstance(parsed, list):
                    return [str(s).strip() for s in parsed if s]
            except (ValueError, SyntaxError):
                pass
        # Fallback: split on common delimiters
        tokens = [t.strip() for t in raw.replace("|", ",").replace(";", ",").split(",")]
        return [t for t in tokens if len(t) > 1]

    @staticmethod
    def _match_skill(
        token: str, lookup: dict[str, dict]
    ) -> dict[str, Any] | None:
        """Exact or substring match against the skill lookup."""
        token_lower = token.lower().strip()
        # Exact match
        if token_lower in lookup:
            return {**lookup[token_lower], "confidence": 1.0}
        # Substring match (skill label is contained in the token or vice versa)
        for key, val in lookup.items():
            if len(key) > 3 and (key in token_lower or token_lower in key):
                return {**val, "confidence": 0.7}
        return None

    @staticmethod
    def _match_course_to_skills(
        course_name: str, lookup: dict[str, dict]
    ) -> list[dict[str, Any]]:
        """Find skills whose labels overlap with the course name words."""
        name_lower = course_name.lower()
        name_words = set(name_lower.split())
        matches: list[dict[str, Any]] = []

        for key, val in lookup.items():
            skill_words = set(key.split())
            # At least 2 common words, or a multi-word skill that appears as substring
            common = name_words & skill_words
            if len(common) >= 2:
                matches.append({**val, "confidence": 0.6})
            elif len(key) > 6 and key in name_lower:
                matches.append({**val, "confidence": 0.5})

            if len(matches) >= 20:
                break

        return matches
