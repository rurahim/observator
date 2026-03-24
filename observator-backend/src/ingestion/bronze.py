"""Bronze layer: Upload files to MinIO and register in dataset_registry."""
import hashlib
import os
from uuid import uuid4

from fastapi import UploadFile
from minio import Minio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def ingest_to_bronze(
    file: UploadFile,
    user_id: str,
    minio_client: Minio,
    db: AsyncSession,
) -> str:
    """
    Upload file to MinIO bronze bucket and register in dataset_registry.
    Returns dataset_id.
    """
    dataset_id = uuid4().hex
    original_name = file.filename or "unknown"
    ext = os.path.splitext(original_name)[1].lower().lstrip(".")
    file_type = _detect_file_type(ext)
    minio_path = f"bronze/{dataset_id}/{original_name}"

    # Stream file, compute hash and size
    sha256 = hashlib.sha256()
    chunks = []
    total_size = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        sha256.update(chunk)
        chunks.append(chunk)
        total_size += len(chunk)

    file_hash = sha256.hexdigest()

    # Check for duplicate by hash
    existing = await db.execute(
        text("SELECT dataset_id FROM dataset_registry WHERE sha256 = :h"),
        {"h": file_hash},
    )
    existing_id = existing.scalar()
    if existing_id:
        # Return existing dataset_id instead of re-uploading
        return existing_id

    # Upload to MinIO
    import io

    data = io.BytesIO(b"".join(chunks))
    minio_client.put_object(
        "observator",
        minio_path,
        data,
        length=total_size,
        content_type=file.content_type or "application/octet-stream",
    )

    # Register in database
    await db.execute(
        text("""
            INSERT INTO dataset_registry
                (dataset_id, filename, file_type, file_size, sha256, minio_path, status, progress, uploaded_by, source_type, created_at)
            VALUES
                (:id, :name, :type, :size, :hash, :path, 'uploaded', 0, :user_id, 'user_upload', NOW())
        """),
        {
            "id": dataset_id,
            "name": original_name,
            "type": file_type,
            "size": total_size,
            "hash": file_hash,
            "path": minio_path,
            "user_id": user_id,
        },
    )
    await db.commit()

    return dataset_id


def _detect_file_type(ext: str) -> str:
    mapping = {
        "csv": "csv",
        "xlsx": "excel",
        "xls": "excel",
        "json": "json",
        "parquet": "parquet",
        "pdf": "pdf",
    }
    return mapping.get(ext, "unknown")
