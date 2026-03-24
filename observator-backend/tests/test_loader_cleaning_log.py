"""Tests for cleaning log integration in data loaders."""
import os
import tempfile
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.ingestion.loaders.rdata_jobs import RdataJobsLoader, LoadResult


# ═══════════════════════════════════════════════════════
# Phase 4: Cleaning Log Integration in rdata_jobs Loader
# ═══════════════════════════════════════════════════════

class TestRdataJobsCleaningLog:
    """Verify that the rdata loader records cleaning actions."""

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1  # time_id = 1
        db.execute = AsyncMock(return_value=mock_result)
        db.commit = AsyncMock()
        return db

    @pytest.fixture
    def csv_with_bad_locations(self):
        """CSV with unmappable locations that should generate cleaning log entries."""
        content = """id,job_title,location,date_posted
1,Developer,"Dubai, UAE",2024-01-15
2,Nurse,"Unknown City",2024-02-20
3,Engineer,"UAE",2024-03-10
4,Teacher,"Abu Dhabi",2024-04-05
5,Analyst,"Mars",2024-05-01
6,Designer,"United Arab Emirates",2024-06-15
"""
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()
        yield tmp.name
        os.unlink(tmp.name)

    @pytest.fixture
    def csv_with_bad_dates(self):
        """CSV with unparseable dates."""
        content = """id,job_title,location,date_posted
1,Developer,Dubai,2024-01-15
2,Nurse,Abu Dhabi,not-a-date
3,Engineer,Sharjah,
4,Teacher,Dubai,2024-04-05
"""
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()
        yield tmp.name
        os.unlink(tmp.name)

    @pytest.fixture
    def empty_csv(self):
        content = """id,job_title,location,date_posted
"""
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()
        yield tmp.name
        os.unlink(tmp.name)

    @pytest.mark.asyncio
    async def test_cleaning_log_records_unmappable_locations(self, mock_db, csv_with_bad_locations):
        loader = RdataJobsLoader()
        result = await loader.load(csv_with_bad_locations, mock_db)

        assert result.cleaning_log is not None
        summary = result.cleaning_log["summary"]
        # "Unknown City", "UAE", "Mars", "United Arab Emirates" should be skipped
        assert "skipped_row:unmappable_location" in summary
        assert summary["skipped_row:unmappable_location"] >= 3  # UAE, Unknown City, Mars

    @pytest.mark.asyncio
    async def test_cleaning_log_records_bad_dates(self, mock_db, csv_with_bad_dates):
        loader = RdataJobsLoader()
        result = await loader.load(csv_with_bad_dates, mock_db)

        assert result.cleaning_log is not None
        summary = result.cleaning_log["summary"]
        # "not-a-date" and empty string should be skipped
        assert "skipped_row:no_parseable_date" in summary

    @pytest.mark.asyncio
    async def test_cleaning_log_entries_have_details(self, mock_db, csv_with_bad_locations):
        loader = RdataJobsLoader()
        result = await loader.load(csv_with_bad_locations, mock_db)

        entries = result.cleaning_log["entries"]
        assert len(entries) > 0

        # Check entry structure
        entry = entries[0]
        assert "action" in entry
        assert "reason" in entry
        assert "column" in entry
        assert "original_value" in entry
        assert "row_index" in entry

    @pytest.mark.asyncio
    async def test_cleaning_log_entries_limited_to_100(self, mock_db):
        """Cleaning log entries are capped at 100 for storage."""
        # Create CSV with 200+ bad rows
        lines = ["id,job_title,location,date_posted"]
        for i in range(200):
            lines.append(f"{i},Job{i},Mars,2024-01-01")
        content = "\n".join(lines)

        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()

        try:
            loader = RdataJobsLoader()
            result = await loader.load(tmp.name, mock_db)
            assert result.cleaning_log is not None
            assert len(result.cleaning_log["entries"]) <= 100
        finally:
            os.unlink(tmp.name)

    @pytest.mark.asyncio
    async def test_load_result_has_cleaning_log_field(self, mock_db, csv_with_bad_locations):
        loader = RdataJobsLoader()
        result = await loader.load(csv_with_bad_locations, mock_db)
        assert hasattr(result, "cleaning_log")
        assert isinstance(result.cleaning_log, dict)

    @pytest.mark.asyncio
    async def test_empty_csv_no_cleaning_entries(self, mock_db, empty_csv):
        loader = RdataJobsLoader()
        result = await loader.load(empty_csv, mock_db)
        # Empty CSV should give an error, not cleaning log entries
        assert len(result.errors) > 0

    @pytest.mark.asyncio
    async def test_successful_rows_not_logged(self, mock_db, csv_with_bad_locations):
        """Only problematic rows should be in the cleaning log."""
        loader = RdataJobsLoader()
        result = await loader.load(csv_with_bad_locations, mock_db)

        # Dubai and Abu Dhabi should succeed, not appear in cleaning log
        entries = result.cleaning_log["entries"]
        original_values = [e["original_value"] for e in entries if e["original_value"]]
        for val in original_values:
            assert "dubai" not in val.lower() or "uae" in val.lower()


class TestRdataLoadResultDataclass:
    """Verify LoadResult dataclass has new cleaning_log field."""

    def test_load_result_default(self):
        result = LoadResult()
        assert result.rows_loaded == 0
        assert result.rows_skipped == 0
        assert result.errors == []
        assert result.target_table == "fact_demand_vacancies_agg"
        assert result.cleaning_log is None

    def test_load_result_with_cleaning_log(self):
        result = LoadResult(
            rows_loaded=100,
            rows_skipped=5,
            cleaning_log={"summary": {"skipped_row:test": 5}, "entries": []},
        )
        assert result.cleaning_log["summary"]["skipped_row:test"] == 5
