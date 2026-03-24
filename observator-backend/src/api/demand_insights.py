"""Deep demand analysis endpoint — rich LinkedIn job posting analytics.

Reads directly from the LinkedIn CSV (the DB only stores aggregated fact rows,
not raw detail), caches the result in Redis with 24h TTL.
"""
import csv
import logging
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends

from src.dependencies import get_cache
from src.middleware.auth import get_current_user
from src.services.cache import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/demand-insights", tags=["demand-insights"])

# Path to the raw LinkedIn CSV — contains full detail not available in DB
# In Docker: /app/_master_tables/... (mounted volume)
# Locally: G:/Observer-agent/_master_tables/...
_APP_DIR = Path(__file__).resolve().parents[3]
CSV_PATH = _APP_DIR / "_master_tables" / "3_demand_jobs" / "linkedin_uae_job_postings_2024_2025.csv"
if not CSV_PATH.exists():
    # Docker fallback
    CSV_PATH = Path("/app/_master_tables/3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv")

CACHE_TTL = 86400  # 24 hours


def _parse_csv() -> dict:
    """Parse the LinkedIn CSV and compute all demand insight metrics.

    This is intentionally synchronous (runs in-process) because it is called
    rarely and the result is cached for 24 hours.
    """
    rows = []
    # Encoding fallback chain (same as ingestion pipeline)
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            with open(CSV_PATH, "r", encoding=encoding, errors="replace") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            break
        except UnicodeDecodeError:
            continue

    if not rows:
        return {"error": "Could not read CSV file", "total_postings": 0}

    total = len(rows)

    # Unique counts
    unique_titles = len({r.get("job_title", "").strip() for r in rows if r.get("job_title", "").strip()})
    unique_companies = len({r.get("org_name", "").strip() for r in rows if r.get("org_name", "").strip()})

    # Date range
    dates = sorted(d for r in rows if (d := r.get("date", "").strip()))
    date_range = {"min": dates[0] if dates else None, "max": dates[-1] if dates else None}

    # Monthly volume
    month_counter: Counter = Counter()
    for r in rows:
        date_val = r.get("date", "").strip()
        if date_val and len(date_val) >= 7:
            month_counter[date_val[:7]] += 1
    monthly_volume = [
        {"month": m, "count": c}
        for m, c in sorted(month_counter.items())
    ]

    # Location distribution (top 10)
    loc_counter: Counter = Counter()
    for r in rows:
        loc = r.get("location", "").strip()
        if loc:
            loc_counter[loc] += 1
    top_locations = [
        {"location": loc, "count": cnt, "pct": round(cnt / total * 100, 1)}
        for loc, cnt in loc_counter.most_common(10)
    ]

    # Industry distribution (top 15)
    ind_counter: Counter = Counter()
    for r in rows:
        ind = r.get("industry", "").strip()
        if ind:
            ind_counter[ind] += 1
    top_industries = [
        {"industry": ind, "count": cnt}
        for ind, cnt in ind_counter.most_common(15)
    ]

    # Employment type distribution
    emp_counter: Counter = Counter()
    for r in rows:
        emp = r.get("employment_type", "").strip()
        if emp:
            emp_counter[emp] += 1
    employment_types = [
        {"type": t, "count": c, "pct": round(c / total * 100, 1)}
        for t, c in emp_counter.most_common()
    ]

    # Experience level distribution
    exp_counter: Counter = Counter()
    for r in rows:
        exp = r.get("experience", "").strip()
        if exp:
            exp_counter[exp] += 1
    experience_levels = [
        {"level": lv, "count": c, "pct": round(c / total * 100, 1)}
        for lv, c in exp_counter.most_common()
    ]

    # ISCO occupation distribution (top 10)
    occ_counter: Counter = Counter()
    for r in rows:
        occ = r.get("occupation", "").strip()
        if occ:
            occ_counter[occ] += 1
    isco_distribution = [
        {"group": g, "count": c}
        for g, c in occ_counter.most_common(10)
    ]

    # Top companies (top 15)
    comp_counter: Counter = Counter()
    for r in rows:
        comp = r.get("org_name", "").strip()
        if comp:
            comp_counter[comp] += 1
    top_companies = [
        {"company": comp, "count": c}
        for comp, c in comp_counter.most_common(15)
    ]

    # Data quality metrics
    missing_occ = sum(1 for r in rows if not r.get("occupation", "").strip())
    missing_ind = sum(1 for r in rows if not r.get("industry", "").strip())
    missing_date = sum(1 for r in rows if not r.get("date", "").strip())
    standardized = sum(1 for r in rows if r.get("is_standardized", "").strip().lower() == "true")

    # Duplicate job_ids
    job_ids = [r.get("job_id", "").strip() for r in rows if r.get("job_id", "").strip()]
    duplicate_ids = len(job_ids) - len(set(job_ids))

    data_quality = {
        "missing_occupation_pct": round(missing_occ / total * 100, 1) if total else 0,
        "missing_industry_pct": round(missing_ind / total * 100, 1) if total else 0,
        "missing_date_pct": round(missing_date / total * 100, 1) if total else 0,
        "standardized_pct": round(standardized / total * 100, 1) if total else 0,
        "duplicate_ids": duplicate_ids,
    }

    return {
        "total_postings": total,
        "unique_titles": unique_titles,
        "unique_companies": unique_companies,
        "date_range": date_range,
        "monthly_volume": monthly_volume,
        "top_locations": top_locations,
        "top_industries": top_industries,
        "employment_types": employment_types,
        "experience_levels": experience_levels,
        "isco_distribution": isco_distribution,
        "top_companies": top_companies,
        "data_quality": data_quality,
    }


@router.get("")
async def get_demand_insights(
    user=Depends(get_current_user),
    cache: CacheService = Depends(get_cache),
):
    """Return deep demand analysis from raw LinkedIn job posting data.

    Parses the full CSV for rich breakdowns not available in the aggregated
    DB tables.  Result is cached in Redis for 24 hours.
    """
    cache_key = CacheService.make_key("demand_insights")
    cached = await cache.get(cache_key)
    if cached:
        logger.debug("demand_insights: returning cached result")
        return cached

    if not CSV_PATH.exists():
        logger.warning("demand_insights: CSV not found at %s", CSV_PATH)
        return {
            "error": f"LinkedIn CSV not found at {CSV_PATH}",
            "total_postings": 0,
        }

    logger.info("demand_insights: parsing CSV at %s", CSV_PATH)
    result = _parse_csv()

    await cache.set(cache_key, result, ttl=CACHE_TTL)
    return result
