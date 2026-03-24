"""PDFParserAgent — extracts text and tables from PDF files.

Uses ``pdfplumber`` when available, with a ``PyPDF2`` fallback for text-only
extraction.  Extracted data is written to a temp CSV (if tables are found)
or stored as raw text in the pipeline state.
"""
from __future__ import annotations

import csv
import logging
import os
import tempfile
from typing import Any

from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class PDFParserAgent(BaseAgent):
    name = "pdf_parser"
    description = "Extract text and tables from PDF files"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        file_path = state.get("file_path", "")
        file_type = state.get("file_type", "")
        # Run only for PDF files
        if file_type == "pdf":
            return True
        if file_path and str(file_path).lower().endswith(".pdf"):
            return True
        return False

    async def process(self, state: PipelineState, db) -> dict:
        file_path: str = state["file_path"]  # type: ignore[assignment]

        full_text = ""
        tables: list[list[list[str]]] = []

        # --- Try pdfplumber first (best for tables) ---
        try:
            full_text, tables = self._extract_with_pdfplumber(file_path)
        except ImportError:
            logger.info("PDFParser: pdfplumber not installed, trying PyPDF2")
            try:
                full_text = self._extract_with_pypdf2(file_path)
            except ImportError:
                logger.warning("PDFParser: neither pdfplumber nor PyPDF2 installed")
                return {
                    "errors": [
                        "No PDF library available. Install pdfplumber or PyPDF2."
                    ],
                }
        except Exception as exc:
            logger.error("PDFParser: pdfplumber extraction failed: %s", exc)
            try:
                full_text = self._extract_with_pypdf2(file_path)
            except Exception as exc2:
                return {"errors": [f"PDF extraction failed: {exc}; {exc2}"]}

        logger.info(
            "PDFParser: extracted %d chars, %d tables from %s",
            len(full_text),
            len(tables),
            file_path,
        )

        result: dict[str, Any] = {
            "pdf_text": full_text[:50_000],  # cap to avoid huge state
            "pdf_tables": [
                {"rows": len(t), "columns": len(t[0]) if t else 0} for t in tables
            ],
            "is_pdf": True,
        }

        # If tables were found, write the largest one as CSV for downstream use
        if tables:
            largest = max(tables, key=len)
            csv_path = self._table_to_csv(largest)
            if csv_path:
                result["file_path"] = csv_path
                result["file_type"] = "csv"
                result["detected_schema"] = "unknown"
                result["row_count"] = len(largest) - 1  # minus header
                result["dataframe_columns"] = [str(c) for c in largest[0]]

        return result

    # ------------------------------------------------------------------
    # Extraction backends
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_with_pdfplumber(file_path: str) -> tuple[str, list[list[list[str]]]]:
        import pdfplumber  # type: ignore[import-untyped]

        full_text_parts: list[str] = []
        all_tables: list[list[list[str]]] = []

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text_parts.append(text)

                page_tables = page.extract_tables() or []
                for table in page_tables:
                    # table is list[list[str|None]]
                    cleaned = [
                        [str(cell) if cell is not None else "" for cell in row]
                        for row in table
                        if row  # skip empty rows
                    ]
                    if cleaned:
                        all_tables.append(cleaned)

        return "\n\n".join(full_text_parts), all_tables

    @staticmethod
    def _extract_with_pypdf2(file_path: str) -> str:
        from PyPDF2 import PdfReader  # type: ignore[import-untyped]

        reader = PdfReader(file_path)
        parts: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            parts.append(text)
        return "\n\n".join(parts)

    @staticmethod
    def _table_to_csv(table: list[list[str]]) -> str | None:
        """Write a 2-D table to a temp CSV file and return the path."""
        if not table or len(table) < 2:
            return None

        tmp_dir = tempfile.mkdtemp(prefix="obs_pdf_")
        csv_path = os.path.join(tmp_dir, "pdf_table.csv")

        try:
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                for row in table:
                    writer.writerow(row)
            return csv_path
        except Exception as exc:
            logger.warning("PDFParser: failed to write table CSV: %s", exc)
            return None
