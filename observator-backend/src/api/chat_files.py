"""Lightweight file upload for chat — extracts text/data, stores in-memory by session.

Used by the AI Research Assistant to attach files (Excel, CSV, PDF, TXT, JSON)
that the agent can then query via the query_chat_files tool.
"""
import io
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat-files"])

# In-memory store: session_id → list of file dicts
# Each file: {file_id, filename, type, summary, content (text), rows (for tabular), uploaded_at}
SESSION_FILES: dict[str, list[dict[str, Any]]] = {}
MAX_FILES_PER_SESSION = 10
MAX_FILE_SIZE_MB = 10
MAX_TEXT_CHARS = 200_000  # ~50K tokens


def _extract_text_from_excel(content: bytes, filename: str) -> dict:
    """Parse Excel/CSV file and return text + structured data."""
    import pandas as pd

    try:
        if filename.lower().endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
    except Exception as e:
        raise HTTPException(400, f"Failed to parse {filename}: {e}")

    # Limit rows to prevent context overflow
    total_rows = len(df)
    sample = df.head(100)

    # Build text representation
    text_parts = [
        f"FILE: {filename}",
        f"ROWS: {total_rows} | COLUMNS: {len(df.columns)}",
        f"COLUMNS: {', '.join(str(c) for c in df.columns)}",
        "",
        "DATA SAMPLE (first 100 rows):",
        sample.to_string(max_cols=20, max_colwidth=50),
        "",
        "STATISTICS:",
        sample.describe(include='all').to_string(max_cols=20, max_colwidth=30) if len(sample) > 0 else "(no data)",
    ]
    text = "\n".join(text_parts)[:MAX_TEXT_CHARS]

    return {
        "type": "tabular",
        "rows": total_rows,
        "columns": list(df.columns.astype(str)),
        "text": text,
        "summary": f"{total_rows} rows × {len(df.columns)} columns. Columns: {', '.join(str(c) for c in df.columns[:8])}{'...' if len(df.columns) > 8 else ''}",
    }


def _extract_text_from_pdf(content: bytes, filename: str) -> dict:
    """Extract text from PDF. Requires pdfplumber or fallback."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                if page_text:
                    text_parts.append(f"--- Page {i+1} ---\n{page_text}")
                if sum(len(t) for t in text_parts) > MAX_TEXT_CHARS:
                    break
        text = "\n\n".join(text_parts)[:MAX_TEXT_CHARS]
    except ImportError:
        # Fallback: try simple PDF text extraction
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n\n".join(p.extract_text() or "" for p in reader.pages)[:MAX_TEXT_CHARS]
        except Exception:
            raise HTTPException(400, "PDF parsing requires pdfplumber or pypdf")

    page_count = text.count("--- Page ") if "--- Page " in text else len(text) // 2000
    return {
        "type": "pdf",
        "rows": page_count,
        "text": text,
        "summary": f"PDF document, ~{page_count} pages, {len(text)} chars extracted",
    }


def _extract_text_from_text(content: bytes, filename: str) -> dict:
    """Plain text or JSON file."""
    try:
        text = content.decode('utf-8', errors='replace')[:MAX_TEXT_CHARS]
    except Exception as e:
        raise HTTPException(400, f"Failed to read {filename}: {e}")

    line_count = text.count('\n') + 1
    return {
        "type": "text",
        "rows": line_count,
        "text": text,
        "summary": f"Text file, {line_count} lines, {len(text)} chars",
    }


@router.post("/upload-file")
async def upload_chat_file(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    user=Depends(get_current_user),
):
    """Upload a file for use in the AI chat. Extracts content and stores by session.

    Supported: .xlsx, .xls, .csv, .pdf, .txt, .json, .md
    """
    if not file.filename:
        raise HTTPException(400, "No filename")

    content = await file.read()
    size_mb = len(content) / 1024 / 1024
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(400, f"File too large ({size_mb:.1f}MB). Max {MAX_FILE_SIZE_MB}MB")

    name_lower = file.filename.lower()

    # Route to appropriate parser
    if name_lower.endswith(('.xlsx', '.xls', '.csv')):
        result = _extract_text_from_excel(content, file.filename)
    elif name_lower.endswith('.pdf'):
        result = _extract_text_from_pdf(content, file.filename)
    elif name_lower.endswith(('.txt', '.json', '.md', '.log')):
        result = _extract_text_from_text(content, file.filename)
    else:
        raise HTTPException(400, f"Unsupported file type: {file.filename}. Supported: xlsx, csv, pdf, txt, json, md")

    file_id = str(uuid4())[:8]
    file_record = {
        "file_id": file_id,
        "filename": file.filename,
        "size_kb": round(len(content) / 1024, 1),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }

    # Enforce per-session limit
    if session_id not in SESSION_FILES:
        SESSION_FILES[session_id] = []
    SESSION_FILES[session_id].append(file_record)
    if len(SESSION_FILES[session_id]) > MAX_FILES_PER_SESSION:
        SESSION_FILES[session_id].pop(0)

    logger.info(f"Chat file uploaded: {file.filename} ({result['type']}) for session {session_id}")

    return {
        "file_id": file_id,
        "filename": file.filename,
        "type": result["type"],
        "summary": result["summary"],
        "session_files_count": len(SESSION_FILES[session_id]),
    }


@router.get("/files/{session_id}")
async def list_chat_files(session_id: str, user=Depends(get_current_user)):
    """List files attached to a chat session."""
    files = SESSION_FILES.get(session_id, [])
    return {
        "session_id": session_id,
        "count": len(files),
        "files": [
            {k: v for k, v in f.items() if k != "text"}  # Don't return full text in listing
            for f in files
        ],
    }


@router.delete("/files/{session_id}/{file_id}")
async def remove_chat_file(session_id: str, file_id: str, user=Depends(get_current_user)):
    """Remove a file from a chat session."""
    if session_id not in SESSION_FILES:
        raise HTTPException(404, "Session not found")
    SESSION_FILES[session_id] = [f for f in SESSION_FILES[session_id] if f["file_id"] != file_id]
    return {"removed": file_id, "remaining": len(SESSION_FILES[session_id])}


# Module-level accessor for the agent tool
def get_session_files(session_id: str) -> list[dict]:
    """Called by query_chat_files agent tool."""
    return SESSION_FILES.get(session_id, [])
