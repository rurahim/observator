"""Shared ESCO occupation fuzzy matcher.

Extracted from scripts/seed_real_data.py so both the seed script
and live loaders (JSearch, etc.) can reuse the same matching logic.
"""
import re
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

STOP_WORDS = {
    "and", "the", "of", "in", "for", "a", "an", "to", "at", "or", "with", "on",
    "is", "are", "be", "we", "our", "you", "your", "this", "that", "will",
    "can", "all", "from", "not", "has", "have", "been",
}


def tokenize(text_str: str) -> set[str]:
    """Extract meaningful lowercase tokens from a text string."""
    words = re.findall(r"[a-z]+", text_str.lower())
    return {w for w in words if len(w) > 2 and w not in STOP_WORDS}


class EscoMatcher:
    """Fast fuzzy matcher using inverted token index.

    Instead of checking all 3000 occupations for each job title,
    uses an inverted index to only check occupations sharing tokens.
    """

    def __init__(self):
        self.groups: dict[str, list[tuple[int, str, set[str]]]] = {}
        self.token_index: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        self.cache: dict[tuple[str, str], int | None] = {}

    def add_group(self, group_name: str, occupations: list[tuple[int, str, set[str]]]):
        """Register a group of ESCO occupations."""
        self.groups[group_name] = occupations
        for idx, (oid, title, tokens) in enumerate(occupations):
            for token in tokens:
                self.token_index[token][group_name].append(idx)

    def match(self, job_title: str, group_name: str) -> int | None:
        """Match a job title to the best ESCO occupation in the given group."""
        key = (job_title.strip().lower(), group_name)
        if key in self.cache:
            return self.cache[key]

        title_tokens = tokenize(job_title)
        if not title_tokens:
            self.cache[key] = None
            return None

        candidates = self.groups.get(group_name, [])
        if not candidates:
            self.cache[key] = None
            return None

        # Use inverted index to find candidate indices sharing at least one token
        candidate_indices: set[int] = set()
        for token in title_tokens:
            indices = self.token_index.get(token, {}).get(group_name, [])
            candidate_indices.update(indices)

        if not candidate_indices:
            self.cache[key] = None
            return None

        # Score only the candidates that share tokens
        best_score = 0.0
        best_oid = None
        for idx in candidate_indices:
            oid, esco_title, esco_tokens = candidates[idx]
            overlap = len(title_tokens & esco_tokens)
            if overlap > 0:
                score = overlap / max(len(title_tokens | esco_tokens), 1)
                if score > best_score:
                    best_score = score
                    best_oid = oid

        result = best_oid if best_score > 0.08 else None
        self.cache[key] = result
        return result

    def match_any(self, job_title: str) -> int | None:
        """Match a job title against all registered groups, return best match."""
        title_tokens = tokenize(job_title)
        if not title_tokens:
            return None

        best_score = 0.0
        best_oid = None

        for group_name, candidates in self.groups.items():
            candidate_indices: set[int] = set()
            for token in title_tokens:
                indices = self.token_index.get(token, {}).get(group_name, [])
                candidate_indices.update(indices)

            for idx in candidate_indices:
                oid, esco_title, esco_tokens = candidates[idx]
                overlap = len(title_tokens & esco_tokens)
                if overlap > 0:
                    score = overlap / max(len(title_tokens | esco_tokens), 1)
                    if score > best_score:
                        best_score = score
                        best_oid = oid

        return best_oid if best_score > 0.08 else None

    async def load_from_db(self, db: AsyncSession) -> "EscoMatcher":
        """Load all ESCO occupations from dim_occupation and register them by ISCO major group."""
        result = await db.execute(text(
            "SELECT occupation_id, title_en, isco_major_group FROM dim_occupation WHERE title_en IS NOT NULL"
        ))
        rows = result.fetchall()

        groups: dict[str, list[tuple[int, str, set[str]]]] = defaultdict(list)
        for oid, title_en, major_group in rows:
            tokens = tokenize(title_en)
            group = major_group or "unknown"
            groups[group].append((oid, title_en, tokens))

        for group_name, occupations in groups.items():
            self.add_group(group_name, occupations)

        return self
