"""Tests for DataQualityAgent integration with DataProfiler."""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Ensure src importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.pipeline.agents.data_quality import DataQualityAgent


# ═══════════════════════════════════════════════════════
# Phase 3: Profiler Integration in DataQualityAgent
# ═══════════════════════════════════════════════════════

class TestDataQualityWithProfiler:
    """Verify DataQualityAgent produces data_profile and quality_score."""

    @pytest.fixture
    def agent(self):
        return DataQualityAgent()

    @pytest.fixture
    def sample_csv(self):
        content = """id,job_title,location,date,sector,skills_list
1,Developer,Dubai,2024-01-01,IT,"['Python']"
2,Nurse,Abu Dhabi,2024-02-01,Healthcare,"['Care']"
3,Engineer,Sharjah,2024-03-01,Construction,"['CAD']"
4,,Dubai,,IT,
5,Teacher,Abu Dhabi,2024-05-01,Education,"['Teaching']"
"""
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()
        yield tmp.name
        os.unlink(tmp.name)

    @pytest.fixture
    def perfect_csv(self):
        content = """id,name,value
1,Alice,100
2,Bob,200
3,Charlie,300
"""
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
        tmp.write(content)
        tmp.close()
        yield tmp.name
        os.unlink(tmp.name)

    @pytest.fixture
    def base_state(self, sample_csv):
        return {
            "file_path": sample_csv,
            "file_type": "csv",
            "detected_schema": "rdata_jobs",
            "has_job_titles": False,
            "has_education_data": False,
            "is_pdf": False,
            "is_cv": False,
            "is_api": False,
        }

    @pytest.mark.asyncio
    async def test_profile_output_exists(self, agent, base_state):
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        assert "data_profile" in result
        assert "quality_score" in result

    @pytest.mark.asyncio
    async def test_quality_score_is_numeric(self, agent, base_state):
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        score = result["quality_score"]
        assert isinstance(score, (int, float))
        assert 0 <= score <= 100

    @pytest.mark.asyncio
    async def test_profile_has_expected_fields(self, agent, base_state):
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        profile = result["data_profile"]
        assert "name" in profile
        assert "row_count" in profile
        assert "col_count" in profile
        assert "quality_score" in profile
        assert "columns" in profile

    @pytest.mark.asyncio
    async def test_profile_column_count_matches(self, agent, base_state):
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        profile = result["data_profile"]
        assert profile["col_count"] == len(profile["columns"])

    @pytest.mark.asyncio
    async def test_profile_row_count_matches(self, agent, base_state):
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        profile = result["data_profile"]
        assert profile["row_count"] == result["row_count"]

    @pytest.mark.asyncio
    async def test_perfect_data_high_quality(self, agent, perfect_csv):
        state = {
            "file_path": perfect_csv,
            "file_type": "csv",
            "detected_schema": "unknown",
            "has_job_titles": False,
            "has_education_data": False,
            "is_pdf": False,
            "is_cv": False,
            "is_api": False,
        }
        mock_db = AsyncMock()
        result = await agent.process(state, mock_db)

        assert result["quality_score"] >= 70.0
        assert result["quality_passed"] is True

    @pytest.mark.asyncio
    async def test_profile_detects_nulls(self, agent, base_state):
        """CSV with some nulls should show null_count > 0 in some columns."""
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        profile = result["data_profile"]
        # Our sample CSV has some missing values (row 4 has empty job_title and date)
        has_nulls = any(c["null_count"] > 0 for c in profile["columns"])
        assert has_nulls

    @pytest.mark.asyncio
    async def test_non_tabular_skips_profiling(self, agent):
        """Non-tabular files (PDF) should skip profiling."""
        state = {
            "file_path": "/nonexistent/file.pdf",
            "file_type": "pdf",
            "detected_schema": "unknown",
            "has_job_titles": False,
            "has_education_data": False,
            "is_pdf": True,
            "is_cv": False,
            "is_api": False,
        }
        mock_db = AsyncMock()
        result = await agent.process(state, mock_db)

        # Non-tabular should pass through without profiling
        assert result.get("quality_passed") is True
        assert "data_profile" not in result

    @pytest.mark.asyncio
    async def test_existing_outputs_preserved(self, agent, base_state):
        """Profiler integration should not break existing outputs."""
        mock_db = AsyncMock()
        result = await agent.process(base_state, mock_db)

        # Original outputs still present
        assert "quality_report" in result
        assert "quality_passed" in result
        assert "row_count" in result
        assert "dataframe_columns" in result
        assert "has_job_titles" in result
        assert "has_education_data" in result
