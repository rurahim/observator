"""ReportGeneratorAgent — generates an executive summary PDF/HTML report
after the pipeline has finished processing data.

Wraps ``src.reporting.pdf_generator.generate_pdf``.
"""
from __future__ import annotations

import logging
import os
import tempfile
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class ReportGeneratorAgent(BaseAgent):
    name = "report_generator"
    description = "Generate executive summary report (PDF/HTML)"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        # Only generate a report if requested via options or auto_report
        options = state.get("options", {})
        return bool(options.get("auto_report", False))

    async def process(self, state: PipelineState, db) -> dict:
        from src.reporting.pdf_generator import generate_pdf

        report_type = "executive"
        filters: dict = {}

        # Optionally narrow the report scope based on loaded data
        load_result = state.get("load_result", {})
        dataset_id = state.get("dataset_id")
        if dataset_id:
            filters["dataset_id"] = dataset_id

        try:
            pdf_bytes = await generate_pdf(report_type, filters, db)
        except Exception as exc:
            logger.error("ReportGenerator: PDF generation failed: %s", exc)
            return {
                "report_generated": False,
                "report_path": None,
                "errors": [f"Report generation failed: {exc}"],
            }

        # Write to a temp file so other agents (email, MinIO upload) can use it
        now = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        suffix = ".pdf" if pdf_bytes[:4] == b"%PDF" else ".html"
        tmp_dir = tempfile.mkdtemp(prefix="obs_report_")
        report_filename = f"executive_report_{now}{suffix}"
        report_path = os.path.join(tmp_dir, report_filename)

        with open(report_path, "wb") as f:
            f.write(pdf_bytes)

        logger.info(
            "ReportGenerator: generated %s (%d bytes) at %s",
            report_type,
            len(pdf_bytes),
            report_path,
        )

        return {
            "report_generated": True,
            "report_path": report_path,
        }
