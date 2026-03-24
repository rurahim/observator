"""Glassdoor salary estimation loader — fetch UAE salary benchmarks per occupation.

Uses Real-Time Glassdoor Data API (RapidAPI) to get min/median/max salaries
in AED for job titles across UAE emirates.

Usage:
    POST /api/admin/fetch-salaries
"""
import hashlib
import logging
import time
from dataclasses import dataclass, field

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.ingestion.esco_matcher import EscoMatcher

logger = logging.getLogger(__name__)

# Emirates to query (Glassdoor uses city names)
SALARY_LOCATIONS = [
    ("dubai", "DXB"),
    ("abu dhabi", "AUH"),
    ("sharjah", "SHJ"),
]

# Job titles to query — high-demand UAE occupations covering major ISCO groups
SALARY_JOB_TITLES = [
    # ISCO 1 - Managers
    "project manager", "marketing manager", "operations manager",
    "human resources manager", "finance manager", "general manager",
    "product manager", "IT manager",
    # ISCO 2 - Professionals
    "software engineer", "data analyst", "civil engineer",
    "mechanical engineer", "electrical engineer", "architect",
    "business analyst", "financial analyst", "UX designer",
    "data scientist", "devops engineer", "network engineer",
    # ISCO 3 - Technicians
    "quality assurance", "lab technician", "dental hygienist",
    # ISCO 4 - Clerical
    "accountant", "administrative assistant", "receptionist",
    # ISCO 5 - Service & Sales
    "sales executive", "customer service", "real estate agent",
    "chef", "hotel manager",
    # ISCO 6-8 - Skilled trades / operators
    "electrician", "welder", "heavy equipment operator",
    # ISCO 9 - Elementary
    "security guard", "cleaner",
    # Education & Health
    "teacher", "nurse", "pharmacist", "doctor", "dentist",
]


@dataclass
class SalaryLoadResult:
    rows_loaded: int = 0
    rows_updated: int = 0
    rows_skipped: int = 0
    api_calls: int = 0
    errors: list[str] = field(default_factory=list)
    duration_seconds: float = 0.0


class GlassdoorSalaryLoader:
    """Fetch salary benchmarks from Glassdoor via RapidAPI."""

    BASE_URL = "https://real-time-glassdoor-data.p.rapidapi.com/salary-estimation"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.JSEARCH_API_KEY  # Same RapidAPI key
        self.host = "real-time-glassdoor-data.p.rapidapi.com"

    async def fetch_salary(
        self,
        client: httpx.AsyncClient,
        job_title: str,
        location: str,
    ) -> dict | None:
        """Fetch salary estimation for a job title + location."""
        params = {
            "job_title": job_title,
            "location": location,
            "location_type": "ANY",
            "years_of_experience": "ALL",
        }
        resp = await client.get(self.BASE_URL, params=params)
        resp.raise_for_status()
        result = resp.json()

        data = result.get("data")
        if not data or not data.get("median_salary"):
            return None
        return data

    async def load(self, db: AsyncSession) -> SalaryLoadResult:
        """Fetch salary data for all job titles across UAE emirates."""
        result = SalaryLoadResult()
        start = time.time()

        if not self.api_key:
            result.errors.append("API key not configured")
            return result

        # Load ESCO matcher for occupation_id lookup
        matcher = EscoMatcher()
        await matcher.load_from_db(db)

        headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": self.host,
        }

        rate_limited = False

        async with httpx.AsyncClient(timeout=45.0, headers=headers) as client:
            for location, region_code in SALARY_LOCATIONS:
                if rate_limited:
                    break
                for job_title in SALARY_JOB_TITLES:
                    if rate_limited:
                        break
                    try:
                        data = await self.fetch_salary(client, job_title, location)
                        result.api_calls += 1
                    except httpx.HTTPStatusError as e:
                        if e.response.status_code == 429:
                            logger.warning("Glassdoor rate limit hit after %d calls", result.api_calls)
                            result.errors.append(f"Rate limit after {result.api_calls} calls")
                            rate_limited = True
                            break
                        result.errors.append(f"HTTP {e.response.status_code} for {job_title}@{location}")
                        continue
                    except httpx.RequestError as e:
                        result.errors.append(f"Request error: {type(e).__name__}: {e}")
                        continue

                    if not data:
                        result.rows_skipped += 1
                        continue

                    # Match to ESCO occupation
                    occupation_id = matcher.match_any(job_title)

                    # Upsert — update if same occupation+region+source exists
                    row_hash = hashlib.sha256(
                        f"{job_title}|{location}|glassdoor".encode()
                    ).hexdigest()[:16]

                    existing = await db.execute(
                        text("""
                            SELECT id FROM fact_salary_benchmark
                            WHERE job_title_queried = :title AND region_code = :rc AND source = 'Glassdoor'
                        """),
                        {"title": job_title, "rc": region_code},
                    )

                    if existing.scalar():
                        # Update existing
                        await db.execute(
                            text("""
                                UPDATE fact_salary_benchmark SET
                                    min_salary = :min_sal, max_salary = :max_sal, median_salary = :med_sal,
                                    min_base_salary = :min_base, max_base_salary = :max_base,
                                    median_base_salary = :med_base,
                                    sample_count = :samples, confidence = :conf,
                                    salary_currency = :currency, salary_period = :period,
                                    occupation_id = :occ_id, dataset_id = :hash,
                                    updated_at = now()
                                WHERE job_title_queried = :title AND region_code = :rc AND source = 'Glassdoor'
                            """),
                            {
                                "min_sal": data.get("min_salary"),
                                "max_sal": data.get("max_salary"),
                                "med_sal": data.get("median_salary"),
                                "min_base": data.get("min_base_salary"),
                                "max_base": data.get("max_base_salary"),
                                "med_base": data.get("median_base_salary"),
                                "samples": data.get("salary_count"),
                                "conf": data.get("confidence"),
                                "currency": data.get("salary_currency", "AED"),
                                "period": data.get("salary_period", "MONTH"),
                                "occ_id": occupation_id,
                                "hash": row_hash,
                                "title": job_title,
                                "rc": region_code,
                            },
                        )
                        result.rows_updated += 1
                    else:
                        # Insert new
                        await db.execute(
                            text("""
                                INSERT INTO fact_salary_benchmark
                                    (occupation_id, region_code, job_title_queried,
                                     salary_currency, salary_period,
                                     min_salary, max_salary, median_salary,
                                     min_base_salary, max_base_salary, median_base_salary,
                                     sample_count, confidence, source, dataset_id, created_at)
                                VALUES
                                    (:occ_id, :rc, :title,
                                     :currency, :period,
                                     :min_sal, :max_sal, :med_sal,
                                     :min_base, :max_base, :med_base,
                                     :samples, :conf, 'Glassdoor', :hash, now())
                            """),
                            {
                                "occ_id": occupation_id,
                                "rc": region_code,
                                "title": job_title,
                                "currency": data.get("salary_currency", "AED"),
                                "period": data.get("salary_period", "MONTH"),
                                "min_sal": data.get("min_salary"),
                                "max_sal": data.get("max_salary"),
                                "med_sal": data.get("median_salary"),
                                "min_base": data.get("min_base_salary"),
                                "max_base": data.get("max_base_salary"),
                                "med_base": data.get("median_base_salary"),
                                "samples": data.get("salary_count"),
                                "conf": data.get("confidence"),
                                "hash": row_hash,
                            },
                        )
                        result.rows_loaded += 1

            await db.commit()

        result.duration_seconds = round(time.time() - start, 2)
        logger.info(
            "Glassdoor salary load: %d new, %d updated, %d skipped, %d API calls",
            result.rows_loaded, result.rows_updated, result.rows_skipped, result.api_calls,
        )

        return result
