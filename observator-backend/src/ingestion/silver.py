"""Silver layer: Detect format, dispatch to loader, normalize, validate."""
import logging
import os
import tempfile

from minio import Minio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.ingestion import pii_scrubber, validators
from src.ingestion.loaders.ai_impact_csv import AIImpactCSVLoader
from src.ingestion.loaders.esco_csv import ESCOCSVLoader
from src.ingestion.loaders.fcsc_sdmx import FCSCSDMXLoader
from src.ingestion.loaders.he_data import HEDataLoader
from src.ingestion.loaders.mohre_excel import MOHREExcelLoader
from src.ingestion.loaders.onet_excel import ONetExcelLoader
from src.ingestion.loaders.rdata_jobs import RdataJobsLoader
from src.ingestion.loaders.worldbank_ilo import WorldBankILOLoader

logger = logging.getLogger(__name__)

# Schema fingerprints for auto-detection
SCHEMA_FINGERPRINTS = {
    "fcsc_sdmx": {"DATAFLOW", "REF_AREA", "OBS_VALUE"},
    "onet": {"O*NET-SOC Code", "Element Name"},
    "gpts": {"O*NET-SOC Code", "dv_rating_beta"},
    "frey_osborne": {"_ - code", "probability"},
    "rdata_jobs": {"job_title", "skills_list"},
    "esco_occupation": {"conceptType", "conceptUri", "iscoGroup"},
    "esco_skill": {"conceptType", "conceptUri", "skillType"},
    "esco_relations": {"occupationUri", "skillUri", "relationType"},
}


async def process_to_silver(
    dataset_id: str,
    minio_client: Minio,
    db: AsyncSession,
) -> dict:
    """
    Download from MinIO bronze, detect format, dispatch to loader, validate.
    Returns processing result dict.
    """
    # Get dataset info
    result = await db.execute(
        text("SELECT filename, source_type, minio_path FROM dataset_registry WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    row = result.first()
    if not row:
        raise ValueError(f"Dataset {dataset_id} not found")

    filename, file_type, minio_path = row

    # Update status to processing
    await db.execute(
        text("UPDATE dataset_registry SET status = 'processing', progress = 10 WHERE dataset_id = :id"),
        {"id": dataset_id},
    )
    await db.commit()

    # Download from MinIO to temp file
    tmp_dir = tempfile.mkdtemp()
    local_path = os.path.join(tmp_dir, filename)
    minio_client.fget_object("observator", minio_path, local_path)

    try:
        # PII scan before processing
        pii_report = pii_scrubber.scan_file(local_path, file_type)
        if pii_report.get("pii_found"):
            logger.warning(f"PII detected in {filename}: {pii_report.get('types', [])}")
            pii_scrubber.mask_file(local_path, file_type)
            await db.execute(
                text("""UPDATE dataset_registry SET metadata_json =
                    COALESCE(metadata_json, '{}')::jsonb || :meta::jsonb
                    WHERE dataset_id = :id"""),
                {"id": dataset_id, "meta": f'{{"pii_scan": {{"found": true, "types": {pii_report.get("types", [])}}}}}'},
            )
            await db.commit()

        # Detect schema and dispatch to loader
        loader_type = detect_schema(local_path, file_type)
        logger.info(f"Detected schema: {loader_type} for {filename}")

        await db.execute(
            text("UPDATE dataset_registry SET progress = 30, source_type = :st WHERE dataset_id = :id"),
            {"id": dataset_id, "st": loader_type},
        )
        await db.commit()

        # Read original columns before loader transforms them
        import pandas as pd
        original_columns = []
        try:
            if file_type == "csv":
                preview = pd.read_csv(local_path, nrows=0, encoding="utf-8")
            else:
                preview = pd.read_excel(local_path, nrows=0)
            original_columns = list(preview.columns)
        except Exception:
            pass

        # Profile data quality before loading
        quality_score = None
        profile_dict = {}
        try:
            from src.services.profiler import DataProfiler
            if file_type == "csv":
                df_preview = pd.read_csv(local_path, encoding="utf-8", low_memory=False, on_bad_lines="skip", nrows=5000)
            else:
                df_preview = pd.read_excel(local_path, nrows=5000)
            profiler = DataProfiler()
            profile = profiler.profile_dataframe(df_preview, name=filename)
            quality_score = profile.quality_score
            profile_dict = profiler.profile_to_dict(profile)
        except Exception as e:
            logger.debug(f"Profiling failed for {filename}: {e}")

        # Dispatch to appropriate loader
        load_result = await _dispatch_loader(loader_type, local_path, db)

        # Build metadata for transparency
        import json as _json
        metadata = {
            "original_columns": original_columns,
            "detected_schema": loader_type,
            "target_table": load_result.target_table,
            "rows_loaded": load_result.rows_loaded,
            "rows_skipped": load_result.rows_skipped,
            "data_profile": profile_dict,
            "formulas_applied": {
                "SGI": "(demand - supply) / demand * 100  [positive=shortage, negative=surplus]",
                "AI_composite": "weighted(exposure=0.40, automation=0.25, market=0.20, llm=0.15)",
            },
        }
        if load_result.cleaning_log:
            metadata["cleaning_log"] = load_result.cleaning_log

        # Persist everything to dataset_registry
        await db.execute(
            text("""
                UPDATE dataset_registry
                SET progress = 80,
                    row_count = :rc,
                    quality_score = :qs,
                    metadata_json = :meta,
                    status = 'processing'
                WHERE dataset_id = :id
            """),
            {
                "id": dataset_id,
                "rc": load_result.rows_loaded,
                "qs": quality_score,
                "meta": _json.dumps(metadata, default=str),
            },
        )
        await db.commit()

        return {
            "dataset_id": dataset_id,
            "loader": loader_type,
            "rows_loaded": load_result.rows_loaded,
            "rows_skipped": load_result.rows_skipped,
            "errors": load_result.errors,
            "target_table": load_result.target_table,
            "quality_score": quality_score,
            "cleaning_summary": load_result.cleaning_log.get("summary") if load_result.cleaning_log else None,
        }

    except Exception as e:
        logger.error(f"Silver processing failed for {dataset_id}: {e}")
        await db.execute(
            text("UPDATE dataset_registry SET status = 'error', error_message = :err WHERE dataset_id = :id"),
            {"id": dataset_id, "err": str(e)[:500]},
        )
        await db.commit()
        raise
    finally:
        # Cleanup temp file
        if os.path.exists(local_path):
            os.remove(local_path)
        if os.path.exists(tmp_dir):
            os.rmdir(tmp_dir)


def detect_schema(file_path: str, file_type: str) -> str:
    """Detect the data schema by examining column headers."""
    import pandas as pd

    try:
        if file_type in ("csv",):
            df = pd.read_csv(file_path, nrows=5, encoding="utf-8", low_memory=False)
        elif file_type in ("excel",):
            xls = pd.ExcelFile(file_path)
            # Check for MOHRE pattern (Meta Data sheet)
            if "Meta Data" in xls.sheet_names:
                return "mohre_excel"
            df = pd.read_excel(xls, sheet_name=0, nrows=5)
        else:
            return "unknown"
    except Exception:
        return "unknown"

    columns = set(str(c).strip() for c in df.columns)

    # Match against fingerprints
    for schema_name, required_cols in SCHEMA_FINGERPRINTS.items():
        if required_cols.issubset(columns):
            return schema_name

    # Fallback heuristics
    col_lower = {c.lower() for c in columns}
    if "dataflow" in col_lower:
        return "fcsc_sdmx"
    if any("soc" in c.lower() for c in columns):
        return "onet"

    return "unknown"


async def _dispatch_loader(loader_type: str, file_path: str, db: AsyncSession, dataset_id: str | None = None):
    """Dispatch to the appropriate loader based on detected schema."""
    loaders = {
        "fcsc_sdmx": lambda: FCSCSDMXLoader().load(file_path, db, dataset_id=dataset_id),
        "mohre_excel": lambda: MOHREExcelLoader().load(file_path, db, dataset_id=dataset_id),
        "rdata_jobs": lambda: RdataJobsLoader().load(file_path, db, dataset_id=dataset_id),
        "onet": lambda: ONetExcelLoader().load(file_path, db),
        "esco_occupation": lambda: ESCOCSVLoader().load(file_path, db),
        "esco_skill": lambda: ESCOCSVLoader().load(file_path, db),
        "esco_relations": lambda: ESCOCSVLoader().load(file_path, db),
        "gpts": lambda: AIImpactCSVLoader().load(file_path, "GPTs_are_GPTs", db),
        "frey_osborne": lambda: AIImpactCSVLoader().load(file_path, "FreyOsborne", db),
    }

    loader_fn = loaders.get(loader_type)
    if not loader_fn:
        from dataclasses import dataclass, field

        @dataclass
        class FallbackResult:
            rows_loaded: int = 0
            rows_skipped: int = 0
            errors: list = field(default_factory=list)
            target_table: str | None = None

        r = FallbackResult()
        r.errors.append(f"No loader for schema type: {loader_type}")
        return r

    return await loader_fn()
