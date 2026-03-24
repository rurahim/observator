"""PII detection and masking for ingested data."""
import hashlib
import re
from dataclasses import dataclass, field

import pandas as pd

# UAE-specific and general PII patterns
PII_PATTERNS = {
    "uae_national_id": re.compile(r"\b784-?\d{4}-?\d{7}-?\d\b"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone_uae": re.compile(r"\+?971[\s-]?\d{1,2}[\s-]?\d{7}"),
    "phone_intl": re.compile(r"\+\d{1,3}[\s-]?\d{6,14}"),
    "passport": re.compile(r"\b[A-Z]{1,2}\d{6,9}\b"),
}


@dataclass
class PIIScanResult:
    has_pii: bool = False
    detections: dict[str, list[str]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"has_pii": self.has_pii, "detections": {k: len(v) for k, v in self.detections.items()}}


def scan(df: pd.DataFrame, text_columns: list[str] | None = None) -> PIIScanResult:
    """Scan DataFrame for PII patterns."""
    result = PIIScanResult()
    cols = text_columns or [c for c in df.columns if df[c].dtype == "object"]

    for col in cols:
        if col not in df.columns:
            continue
        series = df[col].dropna().astype(str)
        for pii_type, pattern in PII_PATTERNS.items():
            matches = series[series.str.contains(pattern, na=False)]
            if len(matches) > 0:
                result.has_pii = True
                key = f"{col}:{pii_type}"
                result.detections[key] = matches.head(5).tolist()

    return result


def mask(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    """Mask PII values in specified columns."""
    df = df.copy()
    cols = columns or [c for c in df.columns if df[c].dtype == "object"]

    for col in cols:
        if col not in df.columns:
            continue
        for pattern in PII_PATTERNS.values():
            df[col] = df[col].astype(str).apply(
                lambda x: pattern.sub(lambda m: _mask_value(m.group()), x)
            )

    return df


def _mask_value(value: str) -> str:
    """Replace PII with a pseudonymized token."""
    prefix = hashlib.sha256(value.encode()).hexdigest()[:8]
    return f"[MASKED:{prefix}]"


def scan_file(file_path: str, file_type: str = "csv") -> dict:
    """Scan a file on disk for PII. Returns dict with pii_found and types."""
    try:
        if file_type in ("csv",) or file_path.endswith(".csv"):
            df = pd.read_csv(file_path, nrows=1000, encoding="utf-8", low_memory=False, on_bad_lines="skip")
        elif file_type in ("excel",) or file_path.endswith((".xlsx", ".xls")):
            df = pd.read_excel(file_path, nrows=1000)
        else:
            return {"pii_found": False, "types": []}

        result = scan(df)
        types = list({d.split(":")[1] for d in result.detections.keys()}) if result.has_pii else []
        return {"pii_found": result.has_pii, "types": types}
    except Exception:
        return {"pii_found": False, "types": []}


def mask_file(file_path: str, file_type: str = "csv") -> None:
    """Mask PII in a file on disk, overwriting the original."""
    try:
        if file_type in ("csv",) or file_path.endswith(".csv"):
            df = pd.read_csv(file_path, encoding="utf-8", low_memory=False, on_bad_lines="skip")
            df = mask(df)
            df.to_csv(file_path, index=False, encoding="utf-8")
        elif file_type in ("excel",) or file_path.endswith((".xlsx", ".xls")):
            df = pd.read_excel(file_path)
            df = mask(df)
            df.to_excel(file_path, index=False)
    except Exception:
        pass  # Best-effort masking
