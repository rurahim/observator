"""PIIScrubberAgent — scans ingested files for PII patterns and masks them.

Wraps ``src.ingestion.pii_scrubber.scan_file`` and ``mask_file``.
"""
from __future__ import annotations

import logging
import os

from src.ingestion import pii_scrubber
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class PIIScrubberAgent(BaseAgent):
    name = "pii_scrubber"
    description = "Scan file for PII (UAE national IDs, emails, phones) and mask"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        file_path = state.get("file_path")
        return bool(file_path and os.path.exists(file_path))

    async def process(self, state: PipelineState, db) -> dict:
        file_path: str = state["file_path"]  # type: ignore[assignment]
        file_type: str = state.get("file_type", "csv") or "csv"

        # scan_file and mask_file are synchronous (pandas-based)
        pii_report = pii_scrubber.scan_file(file_path, file_type)
        pii_masked = False

        if pii_report.get("pii_found"):
            logger.warning(
                "PII detected in %s: types=%s — masking",
                file_path,
                pii_report.get("types", []),
            )
            pii_scrubber.mask_file(file_path, file_type)
            pii_masked = True

        logger.info(
            "PIIScrubber: pii_found=%s masked=%s types=%s",
            pii_report.get("pii_found"),
            pii_masked,
            pii_report.get("types", []),
        )

        return {
            "pii_report": pii_report,
            "pii_masked": pii_masked,
        }
