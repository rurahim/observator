"""FileIngestionAgent — downloads from MinIO or reads a local file, detects
the data schema, and populates initial pipeline state."""
from __future__ import annotations

import logging
import os
import tempfile

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.ingestion.silver import SCHEMA_FINGERPRINTS, detect_schema
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class FileIngestionAgent(BaseAgent):
    name = "file_ingestion"
    description = "Download file from MinIO or local path and detect schema"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        # We need either a dataset_id (MinIO) or a file_path (local).
        return bool(state.get("dataset_id") or state.get("file_path"))

    async def process(self, state: PipelineState, db: AsyncSession) -> dict:
        file_path = state.get("file_path")
        file_type = state.get("file_type")
        dataset_id = state.get("dataset_id")

        # ---- If we have a dataset_id, pull from MinIO ----
        if dataset_id and not file_path:
            file_path, file_type = await self._download_from_minio(dataset_id, db)

        if not file_path or not os.path.exists(file_path):
            return {"errors": [f"File not found: {file_path}"]}

        # ---- Detect file type from extension if not set ----
        if not file_type:
            ext = os.path.splitext(file_path)[1].lower()
            file_type = {
                ".csv": "csv",
                ".xlsx": "excel",
                ".xls": "excel",
                ".json": "json",
                ".pdf": "pdf",
            }.get(ext, "csv")

        # ---- Read a sample to detect schema and gather metadata ----
        detected_schema = "unknown"
        row_count = 0
        dataframe_columns: list[str] = []
        schema_drift: list[str] = []

        try:
            if file_type in ("csv",):
                # Encoding fallback chain: UTF-8 → latin-1 → cp1252
                df_sample = None
                used_encoding = "utf-8"
                for enc in ("utf-8", "latin-1", "cp1252"):
                    try:
                        df_sample = pd.read_csv(
                            file_path, nrows=100, encoding=enc,
                            low_memory=False, on_bad_lines="skip",
                        )
                        used_encoding = enc
                        break
                    except (UnicodeDecodeError, UnicodeError):
                        continue
                if df_sample is None:
                    return {"errors": [f"Cannot decode {file_path} with any known encoding"]}
                if used_encoding != "utf-8":
                    logger.info("FileIngestion: used %s encoding for %s", used_encoding, file_path)

                # Full row count (fast via line counting)
                row_count = sum(1 for _ in open(file_path, encoding=used_encoding, errors="ignore")) - 1
            elif file_type in ("excel",):
                xls = pd.ExcelFile(file_path)
                df_sample = pd.read_excel(xls, sheet_name=0, nrows=100)
                row_count = len(pd.read_excel(xls, sheet_name=0))
            elif file_type == "json":
                df_sample = pd.read_json(file_path, lines=True, nrows=100)
                row_count = sum(1 for _ in open(file_path, encoding="utf-8", errors="ignore"))
            else:
                # Non-tabular (e.g. PDF) — downstream agents handle
                return {
                    "file_path": file_path,
                    "file_type": file_type,
                    "detected_schema": "unknown",
                    "row_count": 0,
                    "dataframe_columns": [],
                }

            dataframe_columns = [str(c) for c in df_sample.columns]
            detected_schema = detect_schema(file_path, file_type)

            # Schema drift detection: compare incoming columns vs known schemas
            schema_drift = []
            known = SCHEMA_FINGERPRINTS.get(detected_schema)
            if known:
                incoming = set(dataframe_columns)
                new_cols = incoming - known
                missing_cols = known - incoming
                if new_cols:
                    schema_drift.append(f"New columns not in schema '{detected_schema}': {new_cols}")
                    logger.info("Schema drift: new columns %s in %s", new_cols, file_path)
                if missing_cols:
                    schema_drift.append(f"Missing expected columns: {missing_cols}")
                    logger.warning("Schema drift: missing columns %s in %s", missing_cols, file_path)

        except Exception as exc:
            logger.warning("Schema detection failed for %s: %s", file_path, exc)

        logger.info(
            "FileIngestion: path=%s type=%s schema=%s rows=%d cols=%d",
            file_path, file_type, detected_schema, row_count, len(dataframe_columns),
        )

        result = {
            "file_path": file_path,
            "file_type": file_type,
            "detected_schema": detected_schema,
            "row_count": row_count,
            "dataframe_columns": dataframe_columns,
        }
        if schema_drift:
            result["schema_drift"] = schema_drift
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _download_from_minio(
        self, dataset_id: str, db: AsyncSession
    ) -> tuple[str, str]:
        """Look up the dataset in the registry and download from MinIO."""
        row = (
            await db.execute(
                text(
                    "SELECT filename, source_type, minio_path "
                    "FROM dataset_registry WHERE dataset_id = :id"
                ),
                {"id": dataset_id},
            )
        ).first()

        if not row:
            raise FileNotFoundError(f"Dataset {dataset_id} not in registry")

        filename, source_type, minio_path = row

        # Download to a temp directory
        tmp_dir = tempfile.mkdtemp(prefix="obs_ingest_")
        local_path = os.path.join(tmp_dir, filename)

        try:
            from minio import Minio

            client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            client.fget_object(settings.MINIO_BUCKET, minio_path, local_path)
        except Exception as exc:
            raise RuntimeError(f"MinIO download failed for {minio_path}: {exc}") from exc

        # Infer file_type from extension
        ext = os.path.splitext(filename)[1].lower()
        file_type = {
            ".csv": "csv",
            ".xlsx": "excel",
            ".xls": "excel",
            ".json": "json",
            ".pdf": "pdf",
        }.get(ext, source_type or "csv")

        return local_path, file_type
