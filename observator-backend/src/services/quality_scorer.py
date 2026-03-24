"""6-dimension Data Quality Scorer per ILO/SDMX standards.

Dimensions:
  Completeness (25%) — non-null required fields
  Validity     (20%) — rows passing type + codelist checks
  Consistency  (20%) — cross-source agreement
  Timeliness   (15%) — freshness since expected delivery
  Uniqueness   (10%) — deduplication ratio
  Accuracy     (10%) — values within plausible range

Composite DQS = weighted sum (0-100).
  >= 90 → auto-promote (green)
  70-89 → promote with warning (yellow)
  < 70  → block, require review (red)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

WEIGHTS = {
    "completeness": 0.25,
    "validity": 0.20,
    "consistency": 0.20,
    "timeliness": 0.15,
    "uniqueness": 0.10,
    "accuracy": 0.10,
}


@dataclass
class DQScore:
    completeness: float = 0.0
    validity: float = 0.0
    consistency: float = 100.0  # default: no cross-source check available
    timeliness: float = 100.0   # default: just uploaded = fresh
    uniqueness: float = 0.0
    accuracy: float = 100.0     # default: no range check available
    composite: float = 0.0
    details: dict = field(default_factory=dict)

    def compute_composite(self):
        self.composite = round(
            self.completeness * WEIGHTS["completeness"]
            + self.validity * WEIGHTS["validity"]
            + self.consistency * WEIGHTS["consistency"]
            + self.timeliness * WEIGHTS["timeliness"]
            + self.uniqueness * WEIGHTS["uniqueness"]
            + self.accuracy * WEIGHTS["accuracy"],
            1,
        )
        return self.composite

    @property
    def grade(self) -> str:
        if self.composite >= 90:
            return "green"
        if self.composite >= 70:
            return "yellow"
        return "red"


class DataQualityScorer:
    """Score a DataFrame on 6 quality dimensions."""

    def score(
        self,
        df: pd.DataFrame,
        required_columns: list[str] | None = None,
        valid_codes: dict[str, set] | None = None,
        expected_ranges: dict[str, tuple[float, float]] | None = None,
        days_since_expected: float = 0.0,
    ) -> DQScore:
        dqs = DQScore()
        row_count = len(df)
        if row_count == 0:
            return dqs

        # 1. Completeness — non-null in required columns
        if required_columns:
            total_required_cells = row_count * len(required_columns)
            non_null = sum(df[c].notna().sum() for c in required_columns if c in df.columns)
            dqs.completeness = round(non_null / max(total_required_cells, 1) * 100, 1)
        else:
            # All columns: average non-null rate
            total_cells = row_count * len(df.columns)
            non_null = sum(df[c].notna().sum() for c in df.columns)
            dqs.completeness = round(non_null / max(total_cells, 1) * 100, 1)

        col_details = {}
        for c in df.columns:
            null_pct = round(df[c].isna().sum() / row_count * 100, 1)
            col_details[str(c)] = {"null_pct": null_pct}

        # 2. Validity — rows passing type + codelist checks
        valid_rows = row_count
        if valid_codes:
            for col, allowed in valid_codes.items():
                if col in df.columns:
                    invalid = (~df[col].isin(allowed) & df[col].notna()).sum()
                    valid_rows -= int(invalid)
                    col_details.setdefault(str(col), {})["invalid_codes"] = int(invalid)
        dqs.validity = round(max(valid_rows, 0) / row_count * 100, 1)

        # 3. Consistency — cross-source (default 100 if no check)
        # This would compare against another dataset — caller must provide
        dqs.consistency = 100.0

        # 4. Timeliness — decay based on days since expected delivery
        decay_per_day = 5.0  # lose 5 points per day late
        dqs.timeliness = round(max(0, 100 - days_since_expected * decay_per_day), 1)

        # 5. Uniqueness — distinct rows / total rows
        dup_count = int(df.duplicated().sum())
        dqs.uniqueness = round((row_count - dup_count) / row_count * 100, 1)
        dqs.details["duplicate_rows"] = dup_count

        # 6. Accuracy — values within expected ranges
        if expected_ranges:
            in_range = 0
            total_checked = 0
            for col, (lo, hi) in expected_ranges.items():
                if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
                    non_null = df[col].dropna()
                    total_checked += len(non_null)
                    in_range += int(((non_null >= lo) & (non_null <= hi)).sum())
            if total_checked > 0:
                dqs.accuracy = round(in_range / total_checked * 100, 1)

        dqs.details["column_stats"] = col_details
        dqs.compute_composite()
        return dqs

    async def persist(
        self,
        db: AsyncSession,
        dataset_id: str,
        dqs: DQScore,
        run_id: str | None = None,
        layer: str = "silver",
    ) -> None:
        """Save DQS to data_quality_scores table."""
        try:
            await db.execute(
                text("""
                    INSERT INTO data_quality_scores
                        (dataset_id, run_id, layer, completeness, validity, consistency,
                         timeliness, uniqueness, accuracy, composite_score, details_json)
                    VALUES (:did, :rid, :layer, :comp, :val, :cons, :time, :uniq, :acc, :score, :details)
                """),
                {
                    "did": dataset_id,
                    "rid": run_id,
                    "layer": layer,
                    "comp": dqs.completeness,
                    "val": dqs.validity,
                    "cons": dqs.consistency,
                    "time": dqs.timeliness,
                    "uniq": dqs.uniqueness,
                    "acc": dqs.accuracy,
                    "score": dqs.composite,
                    "details": json.dumps(dqs.details, default=str),
                },
            )
        except Exception as e:
            logger.warning("Failed to persist DQS for %s: %s", dataset_id, e)
