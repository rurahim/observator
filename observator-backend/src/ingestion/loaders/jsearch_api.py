"""JSearch API loader — fetch live UAE job postings from RapidAPI.

Usage:
    # Manual trigger via admin endpoint:
    POST /api/admin/fetch-jsearch

    # Programmatic:
    loader = JSearchLoader()
    result = await loader.load(db)
"""
import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.ingestion.esco_matcher import EscoMatcher
from src.ingestion.loaders.rdata_jobs import LoadResult

logger = logging.getLogger(__name__)

# JSearch query locations → region codes
EMIRATES = [
    ("Dubai, UAE", "DXB"),
    ("Abu Dhabi, UAE", "AUH"),
    ("Sharjah, UAE", "SHJ"),
    ("Ajman, UAE", "AJM"),
    ("Ras Al Khaimah, UAE", "RAK"),
    ("Fujairah, UAE", "FUJ"),
    ("Umm Al Quwain, UAE", "UAQ"),
]

# Arabic location → region code (JSearch returns Arabic in job_state)
ARABIC_LOCATION_MAP = {
    "دبي": "DXB",
    "أبوظبي": "AUH",
    "أبو ظبي": "AUH",
    "الشارقة": "SHJ",
    "عجمان": "AJM",
    "رأس الخيمة": "RAK",
    "الفجيرة": "FUJ",
    "أم القيوين": "UAQ",
}

# Search queries — include location in query for better UAE coverage.
# {loc} is replaced with emirate name at runtime.
SEARCH_QUERIES = [
    "jobs in {loc}",
    "engineer {loc}",
    "manager {loc}",
    "developer {loc}",
    "sales {loc}",
    "accountant {loc}",
    "nurse {loc}",
    "teacher {loc}",
    "marketing {loc}",
    "hiring {loc}",
]


@dataclass
class FetchStats:
    """Per-run statistics returned alongside LoadResult."""
    api_calls: int = 0
    total_fetched: int = 0
    duplicates_skipped: int = 0
    match_rate: float = 0.0
    duration_seconds: float = 0.0


class JSearchLoader:
    """Fetch UAE job postings from JSearch (RapidAPI) and insert into fact_demand_vacancies_agg."""

    BASE_URL = "https://jsearch.p.rapidapi.com/search"

    def __init__(self, api_key: str | None = None, max_pages: int = 2):
        self.api_key = api_key or settings.JSEARCH_API_KEY
        self.host = settings.JSEARCH_HOST
        self.max_pages = max_pages  # pages per query+emirate combo (10 results/page)

    async def fetch_jobs(
        self,
        client: httpx.AsyncClient,
        query: str = "jobs",
        location: str = "Dubai, UAE",
        page: int = 1,
        date_posted: str = "month",
    ) -> list[dict]:
        """Fetch a single page of jobs from JSearch API."""
        params = {
            "query": query,
            "location": location,
            "page": str(page),
            "num_pages": "1",
            "date_posted": date_posted,
            "country": "ae",
        }

        resp = await client.get(self.BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

        return data.get("data", [])

    async def load(self, db: AsyncSession) -> tuple[LoadResult, FetchStats]:
        """Fetch jobs for all emirates, match to ESCO, and insert into DB."""
        result = LoadResult(target_table="fact_demand_vacancies_agg")
        stats = FetchStats()
        start = time.time()

        if not self.api_key:
            result.errors.append("JSEARCH_API_KEY not configured")
            return result, stats

        # Load ESCO matcher from DB
        matcher = EscoMatcher()
        await matcher.load_from_db(db)

        # Get existing job hashes to deduplicate
        existing_hashes = await self._get_existing_hashes(db)

        rows_to_insert: list[dict] = []
        matched_count = 0
        total_processed = 0
        rate_limited = False

        headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": self.host,
        }

        async with httpx.AsyncClient(timeout=45.0, headers=headers) as client:
          for location, query_region_code in EMIRATES:
            if rate_limited:
                break
            for query_tpl in SEARCH_QUERIES:
                if rate_limited:
                    break
                # Replace {loc} with emirate name (e.g. "Dubai")
                emirate_name = location.split(",")[0].strip()
                query = query_tpl.format(loc=emirate_name)
                for page in range(1, self.max_pages + 1):
                    try:
                        jobs = await self.fetch_jobs(client, query=query, location=location, page=page)
                        stats.api_calls += 1
                        stats.total_fetched += len(jobs)
                    except httpx.HTTPStatusError as e:
                        if e.response.status_code == 429:
                            logger.warning("JSearch rate limit hit after %d calls", stats.api_calls)
                            result.errors.append(f"Rate limit hit after {stats.api_calls} calls")
                            rate_limited = True
                            break
                        result.errors.append(f"HTTP {e.response.status_code} for {query}@{location} p{page}")
                        continue
                    except httpx.RequestError as e:
                        result.errors.append(f"Request error for {location}: {type(e).__name__}: {e}")
                        continue

                    if not jobs:
                        break  # No more results for this query+emirate

                    for job in jobs:
                        total_processed += 1
                        job_hash = self._hash_job(job)

                        if job_hash in existing_hashes:
                            stats.duplicates_skipped += 1
                            result.rows_skipped += 1
                            continue

                        existing_hashes.add(job_hash)

                        # Resolve region: trust query param, but cross-check with Arabic response
                        region_code = self._resolve_region(job, query_region_code)

                        # Parse date — API often returns None for datetime fields,
                        # so we parse the relative Arabic string or fall back to today
                        year, month = self._parse_date(job)
                        if not year:
                            result.rows_skipped += 1
                            continue

                        # Get time_id
                        time_id = await self._get_or_create_time_id(db, year, month)
                        if not time_id:
                            result.rows_skipped += 1
                            continue

                        # Match job title to ESCO occupation
                        title = job.get("job_title", "")
                        occupation_id = matcher.match_any(title)
                        if occupation_id:
                            matched_count += 1

                        rows_to_insert.append({
                            "time_id": time_id,
                            "region_code": region_code,
                            "occupation_id": occupation_id,
                            "demand_count": 1,
                            "source": "JSearch",
                            "dataset_id": job_hash,
                        })

        # Batch insert
        if rows_to_insert:
            for i in range(0, len(rows_to_insert), 500):
                batch = rows_to_insert[i : i + 500]
                await db.execute(
                    text("""
                        INSERT INTO fact_demand_vacancies_agg
                            (time_id, region_code, occupation_id, demand_count, source, dataset_id, created_at)
                        VALUES (:time_id, :region_code, :occupation_id, :demand_count, :source, :dataset_id, now())
                    """),
                    batch,
                )
            await db.commit()

        result.rows_loaded = len(rows_to_insert)
        stats.duration_seconds = round(time.time() - start, 2)
        stats.match_rate = round(matched_count / max(total_processed, 1) * 100, 1)

        logger.info(
            "JSearch load complete: %d loaded, %d skipped, %d dupes, %.1f%% ESCO match rate",
            result.rows_loaded, result.rows_skipped, stats.duplicates_skipped, stats.match_rate,
        )

        return result, stats

    async def _get_existing_hashes(self, db: AsyncSession) -> set[str]:
        """Get dataset_id hashes of already-loaded JSearch jobs."""
        result = await db.execute(
            text("SELECT dataset_id FROM fact_demand_vacancies_agg WHERE source = 'JSearch' AND dataset_id IS NOT NULL")
        )
        return {row[0] for row in result.fetchall()}

    async def _get_or_create_time_id(self, db: AsyncSession, year: int, month: int) -> int | None:
        """Look up or create a time dimension entry."""
        result = await db.execute(
            text("SELECT time_id FROM dim_time WHERE year = :y AND month = :m LIMIT 1"),
            {"y": year, "m": month},
        )
        time_id = result.scalar()
        if time_id:
            return time_id

        # Try year-level fallback
        result = await db.execute(
            text("SELECT time_id FROM dim_time WHERE year = :y LIMIT 1"),
            {"y": year},
        )
        return result.scalar()

    @staticmethod
    def _resolve_region(job: dict, fallback_region: str) -> str:
        """Resolve region code from job response, falling back to query param."""
        # Check Arabic location fields
        for field_name in ("job_state", "job_location", "job_city"):
            val = job.get(field_name)
            if val:
                for arabic, code in ARABIC_LOCATION_MAP.items():
                    if arabic in val:
                        return code
        return fallback_region

    @staticmethod
    def _hash_job(job: dict) -> str:
        """Create a deduplication hash. Prefer job_id if available, else title+company."""
        job_id = job.get("job_id")
        if job_id:
            return hashlib.sha256(job_id.encode()).hexdigest()[:16]
        key = "|".join([
            (job.get("job_title") or "").strip().lower(),
            (job.get("employer_name") or "").strip().lower(),
            (job.get("job_posted_at") or "")[:20],
        ])
        return hashlib.sha256(key.encode()).hexdigest()[:16]

    @staticmethod
    def _parse_date(job: dict) -> tuple[int | None, int | None]:
        """Extract (year, month) from job posting date.

        JSearch UAE results often return None for datetime_utc fields.
        Falls back to parsing the relative Arabic text or using current date.
        """
        # Try ISO datetime first
        dt_str = job.get("job_posted_at_datetime_utc")
        if dt_str:
            try:
                dt = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
                return dt.year, dt.month
            except (ValueError, TypeError):
                pass

        # Try timestamp
        ts = job.get("job_posted_at_timestamp")
        if ts:
            try:
                dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
                return dt.year, dt.month
            except (ValueError, TypeError, OSError):
                pass

        # Parse relative Arabic string: "قبل X أيام", "قبل X ساعات", etc.
        posted_at = job.get("job_posted_at", "")
        if posted_at:
            now = datetime.now(tz=timezone.utc)
            # Match Arabic "قبل N أيام/يوم" (N days ago)
            m = re.search(r"(\d+)\s*(?:أيام|يوم|days?)", str(posted_at))
            if m:
                days_ago = int(m.group(1))
                dt = now - timedelta(days=days_ago)
                return dt.year, dt.month
            # Match Arabic "قبل N ساعات/ساعة" (N hours ago)
            m = re.search(r"(\d+)\s*(?:ساعات|ساعة|hours?)", str(posted_at))
            if m:
                return now.year, now.month
            # "قبل" alone or any other relative text → treat as recent
            if "قبل" in str(posted_at) or "ago" in str(posted_at).lower():
                return now.year, now.month

        # Last resort: we queried date_posted=month, so it's within last 30 days
        now = datetime.now(tz=timezone.utc)
        return now.year, now.month
