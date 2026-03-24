"""Agent 4: Occupation Normalizer — maps raw job titles to ESCO/ISCO occupations.

Uses a two-pass approach:
1. Exact + fuzzy string match against dim_occupation (title_en, title_ar, synonyms)
2. Batch LLM call for unmatched titles (groups of 50)

Results are cached in normalization_cache to avoid repeated LLM calls.
"""
from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher

from sqlalchemy import text

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# Minimum fuzzy match ratio to accept without LLM
FUZZY_THRESHOLD = 0.80
# Batch size for LLM normalization
LLM_BATCH_SIZE = 50


class OccupationNormalizerAgent(BaseAgent):
    name = "occupation_normalizer"
    description = "Map raw job titles to ESCO/ISCO occupations via fuzzy match + LLM"
    requires_llm = True

    async def validate_input(self, state: PipelineState) -> bool:
        return state.get("has_job_titles", False) and state.get("raw_dataframe") is not None

    async def process(self, state: PipelineState, db) -> dict:
        import pandas as pd

        df: pd.DataFrame = state["raw_dataframe"]

        # Identify the job title column
        title_col = _find_title_column(df)
        if not title_col:
            logger.warning("OccupationNormalizer: no job title column found")
            return {"occupation_mappings": []}

        raw_titles = df[title_col].dropna().unique().tolist()
        raw_titles = [str(t).strip() for t in raw_titles if str(t).strip()]

        if not raw_titles:
            return {"occupation_mappings": []}

        logger.info("OccupationNormalizer: %d unique raw titles to normalize", len(raw_titles))

        # Load reference occupations from dim_occupation
        occ_rows = (await db.execute(
            text(
                "SELECT occupation_id, code_isco, code_esco, title_en, title_ar, synonyms "
                "FROM dim_occupation"
            )
        )).fetchall()

        ref_occs = []
        for r in occ_rows:
            syns = r[5] if r[5] else []
            ref_occs.append({
                "occupation_id": r[0],
                "code_isco": r[1],
                "code_esco": r[2],
                "title_en": r[3],
                "title_ar": r[4],
                "synonyms": syns,
            })

        # --- Pass 1: Exact + fuzzy string matching ---
        mappings: list[dict] = []
        unmatched: list[str] = []

        # Check cache first
        cached = await _load_cache(db, raw_titles)

        for raw in raw_titles:
            # Check cache
            if raw.lower() in cached:
                mappings.append(cached[raw.lower()])
                continue

            # Exact match
            exact = _exact_match(raw, ref_occs)
            if exact:
                exact["raw"] = raw
                exact["confidence"] = 1.0
                mappings.append(exact)
                continue

            # Fuzzy match
            fuzzy = _fuzzy_match(raw, ref_occs)
            if fuzzy:
                fuzzy["raw"] = raw
                mappings.append(fuzzy)
                continue

            unmatched.append(raw)

        logger.info(
            "OccupationNormalizer: pass1 matched=%d unmatched=%d",
            len(mappings), len(unmatched),
        )

        # --- Pass 2: Batch LLM for unmatched ---
        if unmatched:
            llm_mappings = await _llm_batch_normalize(unmatched, ref_occs, db)
            mappings.extend(llm_mappings)

        # Cache all results
        await _save_cache(db, mappings)

        logger.info("OccupationNormalizer: total mappings=%d", len(mappings))
        return {"occupation_mappings": mappings}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _find_title_column(df) -> str | None:
    """Find the column most likely to contain job titles."""
    candidates = ["job_title", "job title", "position", "occupation",
                  "vacancy_title", "role", "job_name", "title"]
    col_lower_map = {c.lower().strip(): c for c in df.columns}
    for c in candidates:
        if c in col_lower_map:
            return col_lower_map[c]
    return None


def _exact_match(raw: str, ref_occs: list[dict]) -> dict | None:
    """Check for exact title match (case-insensitive)."""
    raw_lower = raw.lower().strip()
    for occ in ref_occs:
        if occ["title_en"] and occ["title_en"].lower() == raw_lower:
            return {
                "isco_code": occ["code_isco"],
                "esco_uri": occ["code_esco"],
                "title_en": occ["title_en"],
                "occupation_id": occ["occupation_id"],
            }
        if occ["title_ar"] and occ["title_ar"].lower() == raw_lower:
            return {
                "isco_code": occ["code_isco"],
                "esco_uri": occ["code_esco"],
                "title_en": occ["title_en"],
                "occupation_id": occ["occupation_id"],
            }
        for syn in (occ["synonyms"] or []):
            if syn and syn.lower() == raw_lower:
                return {
                    "isco_code": occ["code_isco"],
                    "esco_uri": occ["code_esco"],
                    "title_en": occ["title_en"],
                    "occupation_id": occ["occupation_id"],
                }
    return None


def _fuzzy_match(raw: str, ref_occs: list[dict]) -> dict | None:
    """Fuzzy match using difflib.SequenceMatcher."""
    raw_lower = raw.lower().strip()
    best_ratio = 0.0
    best_occ = None

    for occ in ref_occs:
        # Compare against title_en
        if occ["title_en"]:
            ratio = SequenceMatcher(None, raw_lower, occ["title_en"].lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_occ = occ

        # Compare against synonyms
        for syn in (occ["synonyms"] or []):
            if syn:
                ratio = SequenceMatcher(None, raw_lower, syn.lower()).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_occ = syn  # track the synonym but we need the occ
                    best_occ = occ

    if best_occ and best_ratio >= FUZZY_THRESHOLD:
        return {
            "isco_code": best_occ["code_isco"],
            "esco_uri": best_occ["code_esco"],
            "title_en": best_occ["title_en"],
            "occupation_id": best_occ["occupation_id"],
            "confidence": round(best_ratio, 3),
        }
    return None


async def _llm_batch_normalize(
    unmatched: list[str],
    ref_occs: list[dict],
    db,
) -> list[dict]:
    """Call OpenAI to normalize unmatched job titles in batches."""
    from langchain_openai import ChatOpenAI
    from src.config import settings

    if not settings.OPENAI_API_KEY:
        logger.warning("OccupationNormalizer: no API key, skipping LLM pass")
        return [{"raw": t, "isco_code": None, "esco_uri": None, "title_en": None, "confidence": 0.0} for t in unmatched]

    llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        temperature=0,
        api_key=settings.OPENAI_API_KEY,
    )

    # Build reference list (top 200 by ID to keep prompt size manageable)
    ref_sample = ref_occs[:200]
    ref_text = "\n".join(
        f"- {o['code_isco'] or 'N/A'} | {o['title_en']}"
        for o in ref_sample
    )

    all_mappings: list[dict] = []

    for i in range(0, len(unmatched), LLM_BATCH_SIZE):
        batch = unmatched[i : i + LLM_BATCH_SIZE]
        titles_text = "\n".join(f"{idx+1}. {t}" for idx, t in enumerate(batch))

        prompt = (
            "You are an ESCO/ISCO occupation classifier. Given raw job titles, "
            "map each to the best matching ESCO occupation from the reference list.\n\n"
            f"## Reference Occupations (ISCO code | title):\n{ref_text}\n\n"
            f"## Raw Job Titles to Map:\n{titles_text}\n\n"
            "Return a JSON array. Each element: "
            '{"raw": "<original title>", "isco_code": "<best ISCO code or null>", '
            '"title_en": "<matched ESCO title or null>", "confidence": <0.0-1.0>}\n'
            "Return ONLY the JSON array, no markdown."
        )

        try:
            response = await llm.ainvoke(prompt)
            content = response.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[: content.rfind("```")]

            parsed = json.loads(content)
            if isinstance(parsed, list):
                for item in parsed:
                    item.setdefault("esco_uri", None)
                    item.setdefault("occupation_id", None)
                all_mappings.extend(parsed)
            else:
                logger.warning("LLM returned non-list for occupation normalization")
                all_mappings.extend(
                    {"raw": t, "isco_code": None, "esco_uri": None, "title_en": None, "confidence": 0.0}
                    for t in batch
                )
        except Exception as exc:
            logger.error("LLM occupation normalization failed: %s", exc)
            all_mappings.extend(
                {"raw": t, "isco_code": None, "esco_uri": None, "title_en": None, "confidence": 0.0}
                for t in batch
            )

    return all_mappings


async def _load_cache(db, raw_titles: list[str]) -> dict:
    """Load previously cached normalization results."""
    try:
        result = await db.execute(
            text(
                "SELECT raw_title, mapped_json FROM normalization_cache "
                "WHERE raw_title = ANY(:titles)"
            ),
            {"titles": [t.lower() for t in raw_titles]},
        )
        rows = result.fetchall()
        cache = {}
        for row in rows:
            try:
                cache[row[0]] = json.loads(row[1]) if isinstance(row[1], str) else row[1]
            except (json.JSONDecodeError, TypeError):
                pass
        return cache
    except Exception:
        # Table may not exist yet
        return {}


async def _save_cache(db, mappings: list[dict]) -> None:
    """Save normalization results to cache table (best-effort, won't break pipeline)."""
    try:
        for m in mappings:
            raw = m.get("raw", "").lower()
            if not raw:
                continue
            try:
                await db.execute(
                    text(
                        "INSERT INTO normalization_cache (raw_title, mapped_json) "
                        "VALUES (:raw, :json) ON CONFLICT (raw_title) DO UPDATE SET mapped_json = :json"
                    ),
                    {"raw": raw, "json": json.dumps(m, default=str)},
                )
            except Exception:
                await db.rollback()  # Rollback just this insert, keep session alive
                break
        try:
            await db.commit()
        except Exception:
            await db.rollback()
    except Exception as exc:
        logger.warning("Failed to save normalization cache: %s", exc)
        try:
            await db.rollback()
        except Exception:
            pass
