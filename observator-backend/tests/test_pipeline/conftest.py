"""Shared fixtures for pipeline agent tests."""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture
def sample_csv_path():
    """Create a sample CSV file for testing."""
    content = """id,job_title,location,date,sector,skills_list,occupation
1,Software Developer,"Dubai, UAE",2024-10-01,IT,"['Python', 'Django']",2-Professional
2,Nurse,"Abu Dhabi, UAE",2024-09-15,Healthcare,"['Patient Care']",2-Professional
3,Accountant,"Sharjah, UAE",2024-08-20,Finance,"['Excel', 'SAP']",4-Clerical Support Worker
4,Marketing Manager,"Dubai, UAE",2024-10-05,Marketing,"['SEO', 'Analytics']",1-Manager
5,DevOps Engineer,"Dubai, UAE",2024-10-10,IT,"['Kubernetes', 'Docker', 'CI/CD']",2-Professional
"""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
    tmp.write(content)
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def sample_csv_with_pii():
    """Create a CSV with PII data for testing PII scrubber."""
    content = """name,email,phone,job_title,emirates_id
Ahmed Hassan,ahmed@test.com,+971501234567,Software Developer,784-1990-1234567-1
Fatima Ali,fatima@gov.ae,+971551234567,Data Analyst,784-1985-7654321-2
John Smith,john@company.com,+44123456789,Manager,AB1234567
"""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
    tmp.write(content)
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def sample_education_csv():
    """Create education data CSV."""
    content = """year,institution,discipline,gender,graduates
2023,Higher Colleges of Technology,Computer Science,Male,150
2023,Higher Colleges of Technology,Computer Science,Female,120
2023,UAE University,Engineering,Male,200
2024,Khalifa University,Data Science,Female,80
"""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
    tmp.write(content)
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def sample_fcsc_csv():
    """Create FCSC SDMX format CSV."""
    content = """DATAFLOW,REF_AREA,FREQ,UNIT_MEASURE,SOURCE_DETAIL,MEASURE,CITIZENSHIP,GENDER,AGE,MARITAL,EDUCATION,OCCUPATION,ECON_ACTIV,EMP_SECTOR,MTH_SALARY,EMP_STATUS,REASON_OUTLF,REASON_UNMP,TIME_PERIOD,OBS_VALUE,OBS_STATUS,UNIT_MULT,OBS_COMMENT,DECIMALS
FCSA:DF_LFEP_SECT(2.0.0),AE,A,NUMBER,FCSC,EMP,_T,_T,_Z,_Z,_Z,_Z,_Z,PRI,_Z,_Z,_Z,_Z,2023,5500000,,,,1
FCSA:DF_LFEP_SECT(2.0.0),AE-DU,A,NUMBER,FCSC,EMP,EMIRATI,M,_Z,_Z,_Z,_Z,_Z,PRI,_Z,_Z,_Z,_Z,2023,25000,,,,1
"""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
    tmp.write(content)
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def mock_db():
    """Mock async database session."""
    db = AsyncMock()
    # Default execute returns empty result that supports fetchall/scalar
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []
    mock_result.scalar.return_value = 0
    mock_result.fetchone.return_value = None
    db.execute = AsyncMock(return_value=mock_result)
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.fixture
def base_pipeline_state():
    """Minimal pipeline state for testing individual agents."""
    return {
        "run_id": "test-run-001",
        "dataset_id": "test-dataset-001",
        "user_id": "test-user-001",
        "triggered_by": "test",
        "file_path": None,
        "file_type": None,
        "original_filename": None,
        "minio_path": None,
        "pii_report": None,
        "pii_masked": False,
        "quality_report": None,
        "quality_passed": False,
        "detected_schema": None,
        "dataframe_columns": [],
        "row_count": 0,
        "occupation_mappings": [],
        "skill_extractions": [],
        "load_result": None,
        "views_refreshed": [],
        "forecasts_generated": 0,
        "gap_recalculated": False,
        "ai_impact_updated": False,
        "report_generated": False,
        "report_path": None,
        "alerts_sent": [],
        "policy_brief": None,
        "errors": [],
        "current_step": "",
        "steps_completed": [],
        "status": "pending",
        "progress": 0,
        "started_at": None,
        "completed_at": None,
    }


@pytest.fixture
def mock_openai():
    """Mock OpenAI LLM for AI agent tests."""
    with patch("langchain_openai.ChatOpenAI") as mock_cls:
        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MagicMock(
            content='[{"raw": "Software Developer", "esco_code": "2512", "title_en": "software developer", "confidence": 0.95}]'
        ))
        mock_cls.return_value = mock_llm
        yield mock_llm
