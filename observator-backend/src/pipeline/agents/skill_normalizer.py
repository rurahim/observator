"""Agent 5: Skill Normalizer — maps raw skill strings to ESCO dim_skill entries.

Same two-pass pattern as OccupationNormalizerAgent:
1. Exact + fuzzy string match against dim_skill (label_en, label_ar)
2. Batch LLM call for unmatched skills (groups of 50)
"""
from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher

from sqlalchemy import text

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

FUZZY_THRESHOLD = 0.80
LLM_BATCH_SIZE = 50


class SkillNormalizerAgent(BaseAgent):
    name = "skill_normalizer"
    description = "Map raw skill strings to ESCO skills via fuzzy match + LLM"
    requires_llm = True

    async def validate_input(self, state: PipelineState) -> bool:
        # Run if there are skill extractions or a DataFrame with skill columns
        if state.get("skill_extractions"):
            return True
        df = state.get("raw_dataframe")
        if df is not None:
            col_lower = {c.lower().strip() for c in df.columns}
            return bool(col_lower & {"skills", "skills_list", "required_skills", "skill"})
        return False

    async def process(self, state: PipelineState, db) -> dict:
        import pandas as pd

        # Gather raw skills from extractions or DataFrame
        raw_skills: set[str] = set()

        # From prior skill_extractions (e.g. from JobDescriptionParser)
        for ext in state.get("skill_extractions", []):
            raw_val = ext.get("raw", "")
            if raw_val:
                raw_skills.add(str(raw_val).strip())

        # From DataFrame skill columns
        df = state.get("raw_dataframe")
        if df is not None:
            for col in df.columns:
                if col.lower().strip() in ("skills", "skills_list", "required_skills", "skill"):
                    for val in df[col].dropna().unique():
                        # Skills may be Python list strings like "['A', 'B']"
                        parsed = _parse_skill_value(val)
                        raw_skills.update(parsed)

        raw_list = sorted(raw_skills)
        if not raw_list:
            return {"skill_extractions": state.get("skill_extractions", [])}

        logger.info("SkillNormalizer: %d unique raw skills to normalize", len(raw_list))

        # Load reference skills from dim_skill
        skill_rows = (await db.execute(
            text("SELECT skill_id, uri_esco, label_en, label_ar, skill_type FROM dim_skill")
        )).fetchall()

        ref_skills = []
        for r in skill_rows:
            ref_skills.append({
                "skill_id": r[0],
                "uri_esco": r[1],
                "label_en": r[2],
                "label_ar": r[3],
                "skill_type": r[4],
            })

        # --- Pass 1: Exact + fuzzy matching ---
        results: list[dict] = []
        unmatched: list[str] = []

        for raw in raw_list:
            exact = _exact_match(raw, ref_skills)
            if exact:
                exact["raw"] = raw
                exact["confidence"] = 1.0
                exact["source"] = "exact_match"
                results.append(exact)
                continue

            fuzzy = _fuzzy_match(raw, ref_skills)
            if fuzzy:
                fuzzy["raw"] = raw
                fuzzy["source"] = "fuzzy_match"
                results.append(fuzzy)
                continue

            unmatched.append(raw)

        logger.info(
            "SkillNormalizer: pass1 matched=%d unmatched=%d",
            len(results), len(unmatched),
        )

        # --- Pass 2: Batch LLM ---
        if unmatched:
            llm_results = await _llm_batch_normalize_skills(unmatched, ref_skills)
            results.extend(llm_results)

        # Merge with existing extractions
        existing = list(state.get("skill_extractions", []))
        # Deduplicate by raw key
        seen = {e.get("raw", "").lower() for e in existing}
        for r in results:
            if r.get("raw", "").lower() not in seen:
                existing.append(r)
                seen.add(r.get("raw", "").lower())

        logger.info("SkillNormalizer: total skill_extractions=%d", len(existing))
        return {"skill_extractions": existing}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_skill_value(val) -> list[str]:
    """Parse a skill cell value which may be a Python list string or CSV."""
    import ast

    val_str = str(val).strip()
    if val_str.startswith("["):
        try:
            parsed = ast.literal_eval(val_str)
            if isinstance(parsed, list):
                return [str(s).strip() for s in parsed if s]
        except (ValueError, SyntaxError):
            pass
    return [s.strip() for s in val_str.split(",") if s.strip()]


def _exact_match(raw: str, ref_skills: list[dict]) -> dict | None:
    raw_lower = raw.lower().strip()
    for sk in ref_skills:
        if sk["label_en"] and sk["label_en"].lower() == raw_lower:
            return {"skill_id": sk["skill_id"], "label_en": sk["label_en"], "uri_esco": sk["uri_esco"]}
        if sk["label_ar"] and sk["label_ar"].lower() == raw_lower:
            return {"skill_id": sk["skill_id"], "label_en": sk["label_en"], "uri_esco": sk["uri_esco"]}
    return None


def _fuzzy_match(raw: str, ref_skills: list[dict]) -> dict | None:
    raw_lower = raw.lower().strip()
    best_ratio = 0.0
    best_sk = None

    for sk in ref_skills:
        if sk["label_en"]:
            ratio = SequenceMatcher(None, raw_lower, sk["label_en"].lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_sk = sk

    if best_sk and best_ratio >= FUZZY_THRESHOLD:
        return {
            "skill_id": best_sk["skill_id"],
            "label_en": best_sk["label_en"],
            "uri_esco": best_sk["uri_esco"],
            "confidence": round(best_ratio, 3),
        }
    return None


async def _llm_batch_normalize_skills(
    unmatched: list[str], ref_skills: list[dict]
) -> list[dict]:
    """Call OpenAI to normalize unmatched skills in batches."""
    from langchain_openai import ChatOpenAI
    from src.config import settings

    if not settings.OPENAI_API_KEY:
        return [{"raw": s, "skill_id": None, "label_en": None, "confidence": 0.0, "source": "unmatched"} for s in unmatched]

    llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        temperature=0,
        api_key=settings.OPENAI_API_KEY,
    )

    ref_sample = ref_skills[:200]
    ref_text = "\n".join(f"- {s['label_en']}" for s in ref_sample if s["label_en"])

    all_results: list[dict] = []

    for i in range(0, len(unmatched), LLM_BATCH_SIZE):
        batch = unmatched[i : i + LLM_BATCH_SIZE]
        skills_text = "\n".join(f"{idx+1}. {s}" for idx, s in enumerate(batch))

        prompt = (
            "You are an ESCO skills classifier. Given raw skill strings, "
            "map each to the best matching ESCO skill from the reference list.\n\n"
            f"## Reference Skills:\n{ref_text}\n\n"
            f"## Raw Skills to Map:\n{skills_text}\n\n"
            "Return a JSON array. Each element: "
            '{"raw": "<original>", "label_en": "<matched ESCO skill or null>", '
            '"confidence": <0.0-1.0>}\n'
            "Return ONLY the JSON array, no markdown."
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
                for item in parsed:
                    item.setdefault("skill_id", None)
                    item.setdefault("uri_esco", None)
                    item.setdefault("source", "llm")
                all_results.extend(parsed)
            else:
                all_results.extend(
                    {"raw": s, "skill_id": None, "label_en": None, "confidence": 0.0, "source": "unmatched"}
                    for s in batch
                )
        except Exception as exc:
            logger.error("LLM skill normalization failed: %s", exc)
            all_results.extend(
                {"raw": s, "skill_id": None, "label_en": None, "confidence": 0.0, "source": "unmatched"}
                for s in batch
            )

    return all_results
