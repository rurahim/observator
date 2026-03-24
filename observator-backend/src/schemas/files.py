"""File/dataset API schemas matching frontend KBFile interface."""
from datetime import datetime

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    dataset_id: str
    name: str
    status: str
    minio_path: str | None = None
    pipeline_run_id: str | None = None


class FileMetadata(BaseModel):
    """Matches frontend KBFile interface."""
    id: str
    name: str
    type: str  # csv, excel, json, pdf, parquet
    size: int | None = None
    records: int | None = None
    uploaded: str  # ISO datetime string
    status: str  # processed, processing, failed, uploaded
    progress: int | None = None
    version: str | None = None
    source_type: str | None = None


class DatasetDetail(FileMetadata):
    sha256: str | None = None
    minio_path: str | None = None
    error_message: str | None = None
    metadata_json: dict | None = None
