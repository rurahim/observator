"""Data quality validation checks for ingested datasets."""
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class QualityReport:
    passed: bool = True
    checks: list[dict] = field(default_factory=list)
    total_rows: int = 0
    null_counts: dict = field(default_factory=dict)
    duplicate_count: int = 0

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "checks": self.checks,
            "total_rows": self.total_rows,
            "null_counts": self.null_counts,
            "duplicate_count": self.duplicate_count,
        }


def validate_dataframe(df: pd.DataFrame, required_columns: list[str] | None = None) -> QualityReport:
    """Run standard quality checks on a DataFrame."""
    report = QualityReport(total_rows=len(df))

    # Check: non-empty
    if len(df) == 0:
        report.passed = False
        report.checks.append({"name": "non_empty", "passed": False, "detail": "DataFrame is empty"})
        return report
    report.checks.append({"name": "non_empty", "passed": True})

    # Check: required columns
    if required_columns:
        missing = [c for c in required_columns if c not in df.columns]
        ok = len(missing) == 0
        report.checks.append({"name": "required_columns", "passed": ok, "missing": missing})
        if not ok:
            report.passed = False

    # Check: null counts per column
    null_counts = df.isnull().sum().to_dict()
    report.null_counts = {k: int(v) for k, v in null_counts.items() if v > 0}
    high_null_cols = [k for k, v in null_counts.items() if v > len(df) * 0.5]
    report.checks.append({
        "name": "null_ratio",
        "passed": len(high_null_cols) == 0,
        "high_null_columns": high_null_cols,
    })

    # Check: duplicates
    dup_count = df.duplicated().sum()
    report.duplicate_count = int(dup_count)
    report.checks.append({
        "name": "duplicates",
        "passed": dup_count < len(df) * 0.1,
        "count": int(dup_count),
    })

    # Overall pass
    report.passed = all(c.get("passed", True) for c in report.checks)
    return report
