"""Analyze every real data file and produce a live results report.

Processes all CSV/XLS/XLSX files from data_sources_downloads through:
1. File reading (all sheets for Excel)
2. Schema detection
3. Data profiling (quality score, column stats, null rates)
4. Cleaning log (nulls, duplicates, issues)
5. DataQualityAgent pipeline

Outputs results to: scripts/analysis_results/
"""
import asyncio
import glob
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services.profiler import DataProfiler
from src.services.cleaning_log import CleaningLog
from src.services.analytics_engine import AnalyticsEngine
from src.ingestion.silver import detect_schema

_SCRIPT_ROOT = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_ROOT.parent.parent
DATA_ROOT = os.environ.get("DATA_ROOT", str(_PROJECT_ROOT / "data_sources_downloads"))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", str(_SCRIPT_ROOT / "analysis_results"))


def read_file(path: str) -> list[tuple[str, pd.DataFrame]]:
    ext = Path(path).suffix.lower()
    results = []
    if ext == ".csv":
        try:
            df = pd.read_csv(path, encoding="utf-8", low_memory=False, on_bad_lines="skip")
            results.append(("sheet0", df))
        except Exception:
            try:
                df = pd.read_csv(path, encoding="latin-1", low_memory=False, on_bad_lines="skip")
                results.append(("sheet0", df))
            except Exception as e:
                results.append(("READ_ERROR", pd.DataFrame()))
    elif ext in (".xls", ".xlsx"):
        try:
            xls = pd.ExcelFile(path)
            for sheet in xls.sheet_names:
                try:
                    df = pd.read_excel(xls, sheet_name=sheet)
                    results.append((sheet, df))
                except Exception:
                    results.append((f"{sheet}_ERROR", pd.DataFrame()))
        except Exception:
            results.append(("READ_ERROR", pd.DataFrame()))
    return results


def analyze_file(filepath: str, profiler: DataProfiler) -> dict:
    """Full analysis of one file."""
    rel = os.path.relpath(filepath, DATA_ROOT)
    ext = Path(filepath).suffix.lower()
    file_type = "csv" if ext == ".csv" else "excel"
    result = {
        "file": rel,
        "size_kb": round(os.path.getsize(filepath) / 1024, 1),
        "type": ext,
        "sheets": [],
        "schema_detected": "unknown",
        "total_rows": 0,
        "total_cols": 0,
        "overall_quality": 0,
        "cleaning_issues": {},
        "errors": [],
    }

    # Schema detection
    try:
        result["schema_detected"] = detect_schema(filepath, file_type)
    except Exception as e:
        result["schema_detected"] = f"error: {str(e)[:80]}"

    # Read all sheets
    sheets = read_file(filepath)
    if not sheets:
        result["errors"].append("Could not read file")
        return result

    total_quality = 0
    sheet_count = 0
    cleaning_log = CleaningLog()

    for sheet_name, df in sheets:
        if df.empty and "ERROR" in sheet_name:
            result["errors"].append(f"Sheet '{sheet_name}' unreadable")
            continue

        sheet_info = {
            "name": sheet_name,
            "rows": len(df),
            "cols": len(df.columns),
            "columns": [],
            "quality_score": 0,
            "null_columns": [],
            "duplicate_rows": 0,
        }

        # Profile
        profile = profiler.profile_dataframe(df, name=f"{Path(filepath).stem}:{sheet_name}")
        sheet_info["quality_score"] = profile.quality_score
        total_quality += profile.quality_score
        sheet_count += 1
        result["total_rows"] += profile.row_count
        result["total_cols"] = max(result["total_cols"], profile.col_count)

        # Column details
        for col in profile.columns:
            col_info = {
                "name": col.name,
                "dtype": col.dtype,
                "nulls": col.null_count,
                "null_pct": col.null_pct,
                "unique": col.unique_count,
            }
            if col.mean is not None:
                col_info["mean"] = col.mean
            if col.min_value is not None:
                col_info["min"] = col.min_value[:50]
            if col.max_value is not None:
                col_info["max"] = col.max_value[:50]
            if col.top_values:
                col_info["top_values"] = col.top_values[:3]
            sheet_info["columns"].append(col_info)

            # Log null issues
            if col.null_pct > 0:
                sheet_info["null_columns"].append(f"{col.name} ({col.null_pct}%)")
                cleaning_log.add("null_values", "column_has_nulls",
                                 column=col.name,
                                 original_value=f"{col.null_count}/{profile.row_count}")

        # Duplicates
        if len(df) > 0:
            dup = int(df.duplicated().sum())
            sheet_info["duplicate_rows"] = dup
            if dup > 0:
                cleaning_log.add("duplicates", "exact_row_duplicate",
                                 original_value=f"{dup}/{len(df)} rows")

        result["sheets"].append(sheet_info)

    result["overall_quality"] = round(total_quality / max(sheet_count, 1), 1)
    result["cleaning_issues"] = cleaning_log.summary

    return result


def print_file_result(r: dict):
    """Print one file's analysis to stdout."""
    status = "OK" if r["overall_quality"] >= 50 else "WARN" if r["overall_quality"] > 0 else "FAIL"
    print(f"\n{'='*80}")
    print(f"{status} {r['file']}")
    print(f"  Type: {r['type']} | Size: {r['size_kb']} KB | Schema: {r['schema_detected']}")
    print(f"  Total: {r['total_rows']} rows, {r['total_cols']} cols | Quality: {r['overall_quality']}/100")

    if r["errors"]:
        for e in r["errors"]:
            print(f"  ERROR: {e}")

    for sheet in r["sheets"]:
        sheet_label = f"  [{sheet['name']}]" if len(r["sheets"]) > 1 else "  "
        print(f"{sheet_label} {sheet['rows']} rows × {sheet['cols']} cols | Quality: {sheet['quality_score']}/100")

        if sheet["null_columns"]:
            nulls = ", ".join(sheet["null_columns"][:5])
            extra = f" +{len(sheet['null_columns'])-5} more" if len(sheet['null_columns']) > 5 else ""
            print(f"    Nulls: {nulls}{extra}")

        if sheet["duplicate_rows"] > 0:
            print(f"    Duplicates: {sheet['duplicate_rows']} rows")

        # Show first 5 columns
        for col in sheet["columns"][:8]:
            dtype_short = col["dtype"][:10]
            parts = [f"{col['name']:<30} {dtype_short:<10} nulls={col['null_pct']:>5.1f}% unique={col['unique']}"]
            if "mean" in col:
                parts.append(f"mean={col['mean']}")
            if "top_values" in col:
                top = ", ".join(f"{v['value']}({v['count']})" for v in col["top_values"][:2])
                parts.append(f"top=[{top}]")
            print(f"    {'  '.join(parts)}")

        if len(sheet["columns"]) > 8:
            print(f"    ... +{len(sheet['columns'])-8} more columns")

    if r["cleaning_issues"]:
        print(f"  Cleaning: {r['cleaning_issues']}")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Collect all files
    extensions = ("csv", "xls", "xlsx")
    all_files = []
    for ext in extensions:
        for fp in glob.glob(os.path.join(DATA_ROOT, f"**/*.{ext}"), recursive=True):
            if "_files" in fp or "__MACOSX" in fp or "Program Outline" in fp:
                continue
            all_files.append(fp)
    all_files.sort()

    print(f"{'='*80}")
    print(f"  DATA ANALYSIS PIPELINE — REAL FILE PROCESSING")
    print(f"  Source: {DATA_ROOT}")
    print(f"  Files: {len(all_files)} (CSV/XLS/XLSX)")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*80}")

    profiler = DataProfiler()
    all_results = []
    start = time.time()

    for i, filepath in enumerate(all_files, 1):
        try:
            result = analyze_file(filepath, profiler)
            all_results.append(result)
            print_file_result(result)
        except Exception as e:
            err = {"file": os.path.relpath(filepath, DATA_ROOT), "errors": [str(e)]}
            all_results.append(err)
            print(f"\nFAIL {err['file']}: {e}")

        if i % 50 == 0:
            elapsed = time.time() - start
            print(f"\n--- Progress: {i}/{len(all_files)} files ({elapsed:.1f}s) ---")

    elapsed = time.time() - start

    # Summary
    print(f"\n\n{'='*80}")
    print(f"  ANALYSIS COMPLETE")
    print(f"{'='*80}")
    total_rows = sum(r.get("total_rows", 0) for r in all_results)
    total_sheets = sum(len(r.get("sheets", [])) for r in all_results)
    avg_quality = sum(r.get("overall_quality", 0) for r in all_results) / max(len(all_results), 1)
    schemas = {}
    for r in all_results:
        s = r.get("schema_detected", "unknown")
        schemas[s] = schemas.get(s, 0) + 1
    error_files = [r["file"] for r in all_results if r.get("errors")]

    print(f"  Files processed: {len(all_results)}")
    print(f"  Total sheets: {total_sheets}")
    print(f"  Total rows: {total_rows:,}")
    print(f"  Average quality: {avg_quality:.1f}/100")
    print(f"  Time: {elapsed:.1f}s")
    print(f"\n  Schema distribution:")
    for schema, count in sorted(schemas.items(), key=lambda x: -x[1]):
        print(f"    {schema}: {count} files")
    if error_files:
        print(f"\n  Files with errors ({len(error_files)}):")
        for f in error_files[:20]:
            print(f"    - {f}")

    # Save full results to JSON
    output_path = os.path.join(OUTPUT_DIR, "full_analysis.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n  Full results saved to: {output_path}")

    # Save summary CSV
    summary_path = os.path.join(OUTPUT_DIR, "summary.csv")
    rows = []
    for r in all_results:
        rows.append({
            "file": r.get("file", ""),
            "type": r.get("type", ""),
            "size_kb": r.get("size_kb", 0),
            "schema": r.get("schema_detected", ""),
            "sheets": len(r.get("sheets", [])),
            "total_rows": r.get("total_rows", 0),
            "total_cols": r.get("total_cols", 0),
            "quality": r.get("overall_quality", 0),
            "errors": "; ".join(r.get("errors", [])),
        })
    pd.DataFrame(rows).to_csv(summary_path, index=False)
    print(f"  Summary CSV saved to: {summary_path}")


if __name__ == "__main__":
    main()
