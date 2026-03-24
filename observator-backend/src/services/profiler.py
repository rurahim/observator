"""Statistical data profiler — produces per-column stats and a quality score."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class ColumnProfile:
    name: str
    dtype: str
    null_count: int
    null_pct: float
    unique_count: int
    unique_pct: float
    min_value: str | None = None
    max_value: str | None = None
    mean: float | None = None
    std: float | None = None
    top_values: list[dict] | None = None  # [{value, count}, ...]


@dataclass
class DataProfile:
    name: str
    row_count: int
    col_count: int
    quality_score: float  # 0-100
    columns: list[ColumnProfile] = field(default_factory=list)


class DataProfiler:
    """Profile a DataFrame and compute a quality score."""

    def profile_dataframe(self, df: pd.DataFrame, name: str = "dataset") -> DataProfile:
        row_count = len(df)
        col_count = len(df.columns)

        columns: list[ColumnProfile] = []
        completeness_scores: list[float] = []
        uniqueness_scores: list[float] = []

        for col in df.columns:
            series = df[col]
            null_count = int(series.isna().sum())
            null_pct = round(null_count / row_count * 100, 2) if row_count > 0 else 0.0
            unique_count = int(series.nunique())
            unique_pct = round(unique_count / row_count * 100, 2) if row_count > 0 else 0.0

            completeness_scores.append(1 - (null_count / row_count) if row_count > 0 else 1.0)
            uniqueness_scores.append(unique_count / row_count if row_count > 0 else 1.0)

            cp = ColumnProfile(
                name=str(col),
                dtype=str(series.dtype),
                null_count=null_count,
                null_pct=null_pct,
                unique_count=unique_count,
                unique_pct=unique_pct,
            )

            # Numeric stats
            try:
                if pd.api.types.is_numeric_dtype(series):
                    cp.min_value = str(series.min()) if not series.isna().all() else None
                    cp.max_value = str(series.max()) if not series.isna().all() else None
                    cp.mean = round(float(series.mean()), 4) if not series.isna().all() else None
                    cp.std = round(float(series.std()), 4) if not series.isna().all() else None
                else:
                    non_null = series.dropna()
                    if len(non_null) > 0:
                        # Cast to string to handle mixed-type columns safely
                        as_str = non_null.astype(str)
                        cp.min_value = str(as_str.min())
                        cp.max_value = str(as_str.max())
            except (TypeError, ValueError):
                # Mixed types (str + int in same column) — skip min/max
                pass

            # Top values (up to 5)
            try:
                if unique_count <= 100 and row_count > 0:
                    vc = series.value_counts().head(5)
                    cp.top_values = [{"value": str(v), "count": int(c)} for v, c in vc.items()]
            except (TypeError, ValueError):
                pass

            columns.append(cp)

        # Quality score: completeness * 0.6 + uniqueness * 0.4
        avg_completeness = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 1.0
        avg_uniqueness = sum(uniqueness_scores) / len(uniqueness_scores) if uniqueness_scores else 1.0
        quality_score = round((avg_completeness * 0.6 + avg_uniqueness * 0.4) * 100, 1)

        return DataProfile(
            name=name,
            row_count=row_count,
            col_count=col_count,
            quality_score=quality_score,
            columns=columns,
        )

    def profile_to_dict(self, profile: DataProfile) -> dict:
        """Serialize profile to a JSON-safe dict for storage."""
        return {
            "name": profile.name,
            "row_count": profile.row_count,
            "col_count": profile.col_count,
            "quality_score": profile.quality_score,
            "columns": [
                {
                    "name": c.name,
                    "dtype": c.dtype,
                    "null_count": c.null_count,
                    "null_pct": c.null_pct,
                    "unique_count": c.unique_count,
                    "unique_pct": c.unique_pct,
                    "min": c.min_value,
                    "max": c.max_value,
                    "mean": c.mean,
                    "std": c.std,
                    "top_values": c.top_values,
                }
                for c in profile.columns
            ],
        }
