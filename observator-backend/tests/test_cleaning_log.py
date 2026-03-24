"""Tests for CleaningLog — data cleaning action documentation."""
import pytest

from src.services.cleaning_log import CleaningLog, CleaningEntry


# ═══════════════════════════════════════════════════════
# Phase 4: Cleaning Log
# ═══════════════════════════════════════════════════════

class TestCleaningEntry:
    def test_dataclass_fields(self):
        entry = CleaningEntry(
            action="skipped_row",
            reason="unmappable_location",
            column="location",
            original_value="Somewhere",
            row_index=42,
        )
        assert entry.action == "skipped_row"
        assert entry.reason == "unmappable_location"
        assert entry.column == "location"
        assert entry.original_value == "Somewhere"
        assert entry.row_index == 42

    def test_optional_fields_default_none(self):
        entry = CleaningEntry(action="dropped_duplicate", reason="exact_match")
        assert entry.column is None
        assert entry.original_value is None
        assert entry.row_index is None


class TestCleaningLog:
    def test_empty_log(self):
        log = CleaningLog()
        assert len(log) == 0
        assert log.summary == {}
        assert log.to_dict() == []

    def test_add_single_entry(self):
        log = CleaningLog()
        log.add("skipped_row", "unmappable_location", column="location", original_value="UAE", row_index=5)
        assert len(log) == 1

    def test_add_multiple_entries(self):
        log = CleaningLog()
        log.add("skipped_row", "unmappable_location")
        log.add("skipped_row", "no_parseable_date")
        log.add("mapped_value", "normalized_emirate")
        assert len(log) == 3

    def test_summary_counts_by_action_reason(self):
        log = CleaningLog()
        log.add("skipped_row", "unmappable_location")
        log.add("skipped_row", "unmappable_location")
        log.add("skipped_row", "no_parseable_date")
        log.add("mapped_value", "normalized")
        summary = log.summary
        assert summary["skipped_row:unmappable_location"] == 2
        assert summary["skipped_row:no_parseable_date"] == 1
        assert summary["mapped_value:normalized"] == 1

    def test_to_dict_format(self):
        log = CleaningLog()
        log.add("skipped_row", "unmappable_location", column="location", original_value="xyz", row_index=10)
        result = log.to_dict()
        assert len(result) == 1
        assert result[0] == {
            "action": "skipped_row",
            "reason": "unmappable_location",
            "column": "location",
            "original_value": "xyz",
            "row_index": 10,
        }

    def test_to_dict_optional_fields(self):
        log = CleaningLog()
        log.add("dropped_duplicate", "exact_match")
        result = log.to_dict()
        assert result[0]["column"] is None
        assert result[0]["original_value"] is None
        assert result[0]["row_index"] is None

    def test_long_value_truncated(self):
        """Original values are truncated to 200 chars."""
        log = CleaningLog()
        long_value = "x" * 500
        log.add("skipped_row", "test", original_value=long_value)
        result = log.to_dict()
        assert len(result[0]["original_value"]) == 200

    def test_summary_empty_when_no_entries(self):
        log = CleaningLog()
        assert log.summary == {}

    def test_len_matches_entries(self):
        log = CleaningLog()
        for i in range(25):
            log.add("skipped_row", f"reason_{i % 5}")
        assert len(log) == 25
        assert sum(log.summary.values()) == 25
