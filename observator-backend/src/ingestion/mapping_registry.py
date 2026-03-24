"""Column mapping registry — maps CSV sources to DB tables via config."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)


@dataclass
class ColumnMapping:
    """Maps one CSV column to one DB column."""
    source_col: str        # CSV column name
    target_col: str        # DB column name
    transform: str | None = None  # function name from transforms.py
    default: Any = None    # fallback if source missing or transform returns None
    required: bool = False # if True, skip row when value is None after transform


@dataclass
class SourceMapping:
    """Complete mapping config for one data source."""
    source_id: str          # unique identifier e.g. "linkedin_jobs"
    file_pattern: str       # path relative to _master_tables/ or glob
    target_table: str       # DB table name
    columns: list[ColumnMapping]
    source_label: str       # value for `source` column in DB
    dedup_strategy: str = "skip"   # "skip" (ON CONFLICT DO NOTHING), "upsert", "replace"
    batch_size: int = 1000
    encoding: str = "utf-8"
    # Extra static columns always inserted (e.g. source='linkedin')
    static_columns: dict[str, Any] = field(default_factory=dict)
    # Columns that form the unique constraint for dedup
    unique_keys: list[str] = field(default_factory=list)
    # Optional post-transform: mutate db_row dict after column transforms.
    # Signature: (db_row: dict) -> dict | None (return None to skip row)
    row_transform: Callable[[dict], dict | None] | None = None


class MappingRegistry:
    """Registry of all source mappings. Singleton-ish — import and use."""

    def __init__(self):
        self._mappings: dict[str, SourceMapping] = {}

    def register(self, mapping: SourceMapping):
        self._mappings[mapping.source_id] = mapping

    def get(self, source_id: str) -> SourceMapping | None:
        return self._mappings.get(source_id)

    def all(self) -> list[SourceMapping]:
        return list(self._mappings.values())

    def detect_source(self, csv_columns: set[str]) -> SourceMapping | None:
        """Score CSV columns against registered mappings, return best match."""
        best_score = 0
        best_mapping = None
        csv_lower = {c.lower().strip().lstrip("\ufeff") for c in csv_columns}

        for mapping in self._mappings.values():
            source_cols = {cm.source_col.lower() for cm in mapping.columns}
            overlap = len(source_cols & csv_lower)
            total = len(source_cols)
            if total == 0:
                continue
            score = overlap / total
            if score > best_score and overlap >= 2:
                best_score = score
                best_mapping = mapping

        if best_mapping and best_score >= 0.4:
            logger.info(f"Detected source: {best_mapping.source_id} (score={best_score:.2f})")
            return best_mapping
        return None


# Global registry instance
registry = MappingRegistry()
