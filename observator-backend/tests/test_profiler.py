"""Tests for DataProfiler — statistical data profiling and quality scores."""
import pytest
import pandas as pd
import numpy as np

from src.services.profiler import DataProfiler, DataProfile, ColumnProfile


# ═══════════════════════════════════════════════════════
# Phase 3: Data Profiling & Quality Scores
# ═══════════════════════════════════════════════════════

class TestDataProfilerBasic:
    """Test basic profiling functionality."""

    def test_profile_simple_dataframe(self):
        df = pd.DataFrame({
            "name": ["Alice", "Bob", "Charlie"],
            "age": [25, 30, 35],
            "salary": [50000, 60000, 70000],
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="test_data")

        assert profile.name == "test_data"
        assert profile.row_count == 3
        assert profile.col_count == 3
        assert 0 <= profile.quality_score <= 100

    def test_profile_empty_dataframe(self):
        df = pd.DataFrame(columns=["a", "b", "c"])
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="empty")

        assert profile.row_count == 0
        assert profile.col_count == 3

    def test_profile_single_column(self):
        df = pd.DataFrame({"value": [1, 2, 3, 4, 5]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        assert len(profile.columns) == 1
        assert profile.columns[0].name == "value"

    def test_default_name(self):
        df = pd.DataFrame({"x": [1]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        assert profile.name == "dataset"


class TestColumnProfiling:
    """Test per-column statistics."""

    def test_numeric_column_stats(self):
        df = pd.DataFrame({"val": [10, 20, 30, 40, 50]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]

        assert col.name == "val"
        assert col.null_count == 0
        assert col.null_pct == 0.0
        assert col.unique_count == 5
        assert col.min_value == "10"
        assert col.max_value == "50"
        assert col.mean == 30.0
        assert col.std is not None

    def test_string_column_stats(self):
        df = pd.DataFrame({"city": ["Dubai", "Abu Dhabi", "Sharjah", "Dubai"]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]

        assert col.name == "city"
        assert col.unique_count == 3
        assert col.mean is None  # Not numeric
        assert col.std is None
        assert col.min_value is not None
        assert col.max_value is not None

    def test_null_detection(self):
        df = pd.DataFrame({"val": [1, None, 3, None, 5]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]

        assert col.null_count == 2
        assert col.null_pct == 40.0

    def test_all_null_column(self):
        df = pd.DataFrame({"empty": [None, None, None]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]

        assert col.null_count == 3
        assert col.null_pct == 100.0

    def test_top_values(self):
        df = pd.DataFrame({"status": ["active", "active", "active", "inactive", "pending"]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]

        assert col.top_values is not None
        assert len(col.top_values) <= 5
        assert col.top_values[0]["value"] == "active"
        assert col.top_values[0]["count"] == 3

    def test_top_values_skipped_for_high_cardinality(self):
        """Top values not computed when unique count > 100."""
        df = pd.DataFrame({"id": list(range(200))})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        col = profile.columns[0]
        assert col.top_values is None


class TestQualityScore:
    """Test quality score computation: completeness * 0.6 + uniqueness * 0.4."""

    def test_perfect_data_high_score(self):
        """All unique, no nulls → high quality."""
        df = pd.DataFrame({
            "a": list(range(100)),
            "b": [f"val_{i}" for i in range(100)],
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        assert profile.quality_score >= 80.0

    def test_all_nulls_low_score(self):
        """All nulls → low completeness → low score."""
        df = pd.DataFrame({
            "a": [None] * 10,
            "b": [None] * 10,
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        assert profile.quality_score < 20.0

    def test_mixed_quality(self):
        """Mix of nulls and values → medium score."""
        df = pd.DataFrame({
            "good": list(range(100)),
            "bad": [None] * 50 + list(range(50)),
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        assert 30.0 < profile.quality_score < 90.0

    def test_all_duplicates_lower_uniqueness(self):
        """All same value → low uniqueness → lower score."""
        df = pd.DataFrame({"val": ["same"] * 100})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        # completeness is 100% (no nulls), but uniqueness is 1/100 = 1%
        # score = 0.6 * 1.0 + 0.4 * 0.01 = 0.604 * 100 = 60.4
        assert profile.quality_score < 65.0

    def test_score_range_0_to_100(self):
        """Score always in [0, 100]."""
        for _ in range(5):
            n = 50
            df = pd.DataFrame({
                "a": np.random.choice([1, 2, None], size=n),
                "b": np.random.choice(["x", "y", None], size=n),
            })
            profiler = DataProfiler()
            profile = profiler.profile_dataframe(df)
            assert 0 <= profile.quality_score <= 100


class TestProfileToDict:
    """Test serialization to JSON-safe dict."""

    def test_to_dict_keys(self):
        df = pd.DataFrame({"a": [1, 2], "b": ["x", "y"]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="test")
        d = profiler.profile_to_dict(profile)

        assert d["name"] == "test"
        assert d["row_count"] == 2
        assert d["col_count"] == 2
        assert "quality_score" in d
        assert "columns" in d
        assert len(d["columns"]) == 2

    def test_to_dict_column_structure(self):
        df = pd.DataFrame({"val": [10, 20, 30]})
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        d = profiler.profile_to_dict(profile)

        col = d["columns"][0]
        expected_keys = {"name", "dtype", "null_count", "null_pct",
                         "unique_count", "unique_pct", "min", "max",
                         "mean", "std", "top_values"}
        assert set(col.keys()) == expected_keys

    def test_to_dict_json_serializable(self):
        """Ensure output can be JSON-serialized (for storage in metadata_json)."""
        import json
        df = pd.DataFrame({
            "num": [1, 2, 3],
            "str": ["a", "b", "c"],
            "mix": [1, None, 3],
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df)
        d = profiler.profile_to_dict(profile)
        # Should not raise
        json_str = json.dumps(d)
        assert isinstance(json_str, str)

    def test_real_world_data_profile(self):
        """Simulate profiling a real-world CSV with mixed data."""
        df = pd.DataFrame({
            "job_title": ["Engineer", "Nurse", None, "Teacher", "Engineer"],
            "location": ["Dubai", "Abu Dhabi", "Sharjah", None, "Dubai"],
            "salary": [50000, 45000, 38000, 42000, None],
            "date_posted": ["2024-01-01", "2024-02-01", None, "2024-03-01", "2024-04-01"],
        })
        profiler = DataProfiler()
        profile = profiler.profile_dataframe(df, name="rdata_sample")

        assert profile.row_count == 5
        assert profile.col_count == 4
        assert 30 < profile.quality_score < 90  # Some nulls

        # Verify column-level stats
        title_col = next(c for c in profile.columns if c.name == "job_title")
        assert title_col.null_count == 1
        assert title_col.unique_count == 3  # Engineer, Nurse, Teacher

        salary_col = next(c for c in profile.columns if c.name == "salary")
        assert salary_col.null_count == 1
        assert salary_col.mean is not None
