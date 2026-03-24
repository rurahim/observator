"""DBLoaderAgent — dispatches to the appropriate loader from
``src.ingestion.loaders`` based on the detected schema.

The existing loaders are *async* (they accept ``AsyncSession``), so we call
them directly.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession

from src.ingestion.silver import _dispatch_loader
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class DBLoaderAgent(BaseAgent):
    name = "db_loader"
    description = "Load validated data into warehouse via schema-appropriate loader"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        file_path = state.get("file_path")
        detected_schema = state.get("detected_schema")
        # We need a file and a schema that is not "unknown"
        if not file_path or not os.path.exists(file_path):
            return False
        if not detected_schema or detected_schema == "unknown":
            logger.warning("DBLoader: detected_schema is '%s' — skipping", detected_schema)
            return False
        return True

    async def process(self, state: PipelineState, db) -> dict:
        file_path: str = state["file_path"]  # type: ignore[assignment]
        detected_schema: str = state["detected_schema"]  # type: ignore[assignment]

        logger.info("DBLoader: dispatching schema=%s file=%s", detected_schema, file_path)

        try:
            load_result_obj = await _dispatch_loader(detected_schema, file_path, db, dataset_id=state.get("dataset_id"))
        except Exception as exc:
            logger.error("DBLoader: loader failed for schema=%s: %s", detected_schema, exc)
            return {
                "load_result": {
                    "rows_loaded": 0,
                    "rows_skipped": 0,
                    "errors": [str(exc)[:500]],
                    "target_table": None,
                },
            }

        # Convert the loader's dataclass into a plain dict
        result_dict = {
            "rows_loaded": getattr(load_result_obj, "rows_loaded", 0),
            "rows_skipped": getattr(load_result_obj, "rows_skipped", 0),
            "errors": getattr(load_result_obj, "errors", []),
            "target_table": getattr(load_result_obj, "target_table", None),
        }

        logger.info(
            "DBLoader: loaded=%d skipped=%d table=%s errors=%d",
            result_dict["rows_loaded"],
            result_dict["rows_skipped"],
            result_dict["target_table"],
            len(result_dict["errors"]),
        )

        return {"load_result": result_dict}
