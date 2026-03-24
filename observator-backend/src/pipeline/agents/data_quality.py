"""DataQualityAgent — validates ingested data against quality rules.

Wraps ``src.ingestion.validators.validate_dataframe`` and adds schema-aware
required-column checks.  Also sets schema-detection flags used by the
conditional routing in the pipeline graph.
"""
from __future__ import annotations

import logging
import os

import pandas as pd

from src.ingestion.validators import validate_dataframe
from src.pipeline.base import BaseAgent, PipelineState
from src.services.profiler import DataProfiler

logger = logging.getLogger(__name__)

# Required columns per detected schema (mirrors silver.SCHEMA_FINGERPRINTS)
SCHEMA_REQUIRED_COLUMNS: dict[str, list[str]] = {
    "fcsc_sdmx": ["DATAFLOW", "OBS_VALUE", "TIME_PERIOD"],
    "onet": ["O*NET-SOC Code", "Element Name"],
    "gpts": ["O*NET-SOC Code", "dv_rating_beta"],
    "frey_osborne": ["probability"],
    "rdata_jobs": ["job_title"],
    "esco_occupation": ["conceptType", "conceptUri"],
    "esco_skill": ["conceptType", "conceptUri"],
    "esco_relations": ["occupationUri", "skillUri", "relationType"],
    "mohre_excel": [],  # detected by sheet name, columns vary
}

# Column names that indicate job-posting data
_JOB_TITLE_INDICATORS = {
    "job_title", "job title", "position", "occupation",
    "vacancy_title", "role", "job_name",
}

# Column names that indicate education/graduate data
_EDUCATION_INDICATORS = {
    "institution", "discipline", "graduates", "program",
    "university", "expected_graduates_count", "degree",
}


class DataQualityAgent(BaseAgent):
    name = "data_quality"
    description = "Run quality checks: nulls, duplicates, required columns; set schema flags"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        file_path = state.get("file_path")
        return bool(file_path and os.path.exists(file_path))

    async def process(self, state: PipelineState, db) -> dict:
        file_path: str = state["file_path"]  # type: ignore[assignment]
        file_type: str = state.get("file_type", "csv") or "csv"
        detected_schema: str = state.get("detected_schema") or "unknown"

        # Load the data into a DataFrame for validation
        df: pd.DataFrame | None = None
        try:
            if file_type in ("csv",):
                df = pd.read_csv(
                    file_path, encoding="utf-8", low_memory=False, on_bad_lines="skip",
                )
            elif file_type in ("excel",):
                df = pd.read_excel(file_path)
            elif file_type == "json":
                df = pd.read_json(file_path, lines=True)
            else:
                # Non-tabular files (PDF, etc.) — pass through
                logger.info("DataQuality: non-tabular file_type=%s — skipping", file_type)
                return {
                    "quality_report": {"passed": True, "checks": [], "note": "non-tabular"},
                    "quality_passed": True,
                    "has_job_titles": state.get("has_job_titles", False),
                    "has_education_data": state.get("has_education_data", False),
                    "is_pdf": state.get("is_pdf", False),
                    "is_cv": state.get("is_cv", False),
                    "is_api": state.get("is_api", False),
                }
        except Exception as exc:
            logger.error("DataQuality: could not read %s: %s", file_path, exc)
            return {
                "quality_report": {"passed": False, "checks": [], "error": str(exc)[:300]},
                "quality_passed": False,
            }

        # Determine required columns from schema
        required_cols = SCHEMA_REQUIRED_COLUMNS.get(detected_schema, [])

        # Run the existing validation utility
        report = validate_dataframe(df, required_columns=required_cols or None)
        quality_dict = report.to_dict()

        # --- Schema flag detection from column names ---
        col_lower = {c.lower().strip() for c in df.columns}

        has_job_titles = state.get("has_job_titles", False) or bool(
            col_lower & _JOB_TITLE_INDICATORS
        ) or detected_schema in ("rdata_jobs", "mohre_excel")

        has_education_data = state.get("has_education_data", False) or bool(
            col_lower & _EDUCATION_INDICATORS
        ) or detected_schema in ("he_data",)

        is_pdf = state.get("is_pdf", False)
        is_cv = state.get("is_cv", False)
        is_api = state.get("is_api", False)

        # Soft quality gate: only block on truly critical failures (empty data,
        # missing required columns). High nulls in optional columns are normal
        # for real-world scraped data — warn but don't block.
        critical_fail = False
        if len(df) == 0:
            critical_fail = True
        elif required_cols:
            actual_lower = {c.lower().strip() for c in df.columns}
            missing = {r for r in required_cols if r.lower() not in actual_lower}
            if missing:
                logger.warning("DataQuality: missing required columns: %s (have: %s)", missing, list(df.columns)[:10])
                critical_fail = True

        quality_passed = not critical_fail  # Pass unless critical failure

        logger.info(
            "DataQuality: schema=%s rows=%d passed=%s (strict=%s) checks=%d "
            "flags=job:%s edu:%s pdf:%s cv:%s api:%s",
            detected_schema, len(df), quality_passed, report.passed, len(report.checks),
            has_job_titles, has_education_data, is_pdf, is_cv, is_api,
        )

        # --- Statistical profiling ---
        profiler = DataProfiler()
        try:
            profile = profiler.profile_dataframe(df, name=detected_schema)
            profile_dict = profiler.profile_to_dict(profile)
            quality_score = profile.quality_score
        except Exception as exc:
            logger.warning("DataQuality: profiling failed: %s", exc)
            profile_dict = {}
            quality_score = None

        return {
            "quality_report": quality_dict,
            "quality_passed": quality_passed,
            "raw_dataframe": df,
            "row_count": len(df),
            "dataframe_columns": [str(c) for c in df.columns],
            "has_job_titles": has_job_titles,
            "has_education_data": has_education_data,
            "is_pdf": is_pdf,
            "is_cv": is_cv,
            "is_api": is_api,
            "data_profile": profile_dict,
            "quality_score": quality_score,
        }
