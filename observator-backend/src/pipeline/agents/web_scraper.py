"""WebScraperAgent — fetches UAE job postings from real job boards.

Strategy (in priority order):
  1. JobSpy library — open-source, supports Bayt.com, LinkedIn, Indeed, Google
  2. SerpAPI Google Jobs — aggregated results, requires API key
  3. Direct HTTP scraping — fallback for specific URLs

JobSpy: pip install python-jobspy (or uv add python-jobspy)
SerpAPI: requires SERPAPI_KEY in settings (free tier: 100/month)
"""
from __future__ import annotations

import csv
import logging
import os
import tempfile
from typing import Any

from src.config import settings
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# Default search queries for UAE labour market
DEFAULT_QUERIES = [
    "software engineer",
    "data scientist",
    "registered nurse",
    "accountant",
    "civil engineer",
    "marketing manager",
    "teacher",
    "cybersecurity",
]

UAE_LOCATIONS = ["Dubai, UAE", "Abu Dhabi, UAE", "Sharjah, UAE"]


class WebScraperAgent(BaseAgent):
    name = "web_scraper"
    description = "Scrape UAE job postings from Bayt, LinkedIn, Google Jobs via JobSpy/SerpAPI"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        return state.get("source_type") in ("scrape", "web_scrape")

    async def process(self, state: PipelineState, db) -> dict:
        options = state.get("options", {})
        queries = options.get("search_queries", DEFAULT_QUERIES[:5])
        max_results = options.get("max_results_per_query", 50)

        all_rows: list[dict[str, Any]] = []
        errors: list[str] = []
        method_used = "none"

        # Strategy 1: Try JobSpy (supports Bayt, LinkedIn, Indeed, Google)
        try:
            rows, method_used = await self._scrape_jobspy(queries, max_results)
            all_rows.extend(rows)
        except Exception as exc:
            errors.append(f"JobSpy failed: {exc}")
            logger.warning("WebScraper: JobSpy failed: %s", exc)

        # Strategy 2: Try SerpAPI Google Jobs if JobSpy got nothing
        if not all_rows:
            try:
                serpapi_key = getattr(settings, "SERPAPI_KEY", None)
                if serpapi_key:
                    rows, method_used = await self._scrape_serpapi(queries, serpapi_key)
                    all_rows.extend(rows)
                else:
                    errors.append("SERPAPI_KEY not configured — skipping Google Jobs")
            except Exception as exc:
                errors.append(f"SerpAPI failed: {exc}")
                logger.warning("WebScraper: SerpAPI failed: %s", exc)

        # Strategy 3: Direct HTTP fallback
        if not all_rows:
            try:
                rows, method_used = await self._scrape_direct()
                all_rows.extend(rows)
            except Exception as exc:
                errors.append(f"Direct scrape failed: {exc}")

        if not all_rows:
            return {"errors": errors or ["No jobs scraped from any source"]}

        # Normalize and deduplicate
        all_rows = self._normalize_rows(all_rows)
        all_rows = self._deduplicate(all_rows)

        # Write to CSV
        tmp_dir = tempfile.mkdtemp(prefix="obs_scrape_")
        csv_path = os.path.join(tmp_dir, "scraped_jobs.csv")

        fieldnames = ["job_title", "location", "company", "date_posted",
                       "skills_list", "description", "salary", "source", "url"]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(all_rows)

        logger.info(
            "WebScraper: %d jobs via %s, saved to %s",
            len(all_rows), method_used, csv_path,
        )

        result: dict = {
            "file_path": csv_path,
            "file_type": "csv",
            "detected_schema": "rdata_jobs",
            "row_count": len(all_rows),
            "dataframe_columns": fieldnames,
        }
        if errors:
            result["errors"] = errors
        return result

    # ─── Strategy 1: JobSpy ──────────────────────────

    async def _scrape_jobspy(
        self, queries: list[str], max_results: int
    ) -> tuple[list[dict], str]:
        """Use python-jobspy to scrape Bayt, LinkedIn, Indeed, Google."""
        import importlib
        jobspy = importlib.import_module("jobspy")
        scrape_jobs = jobspy.scrape_jobs

        all_jobs = []
        for query in queries:
            for location in UAE_LOCATIONS[:2]:  # Dubai + Abu Dhabi
                try:
                    jobs = scrape_jobs(
                        site_name=["bayt", "indeed", "linkedin", "google"],
                        search_term=query,
                        location=location,
                        results_wanted=max_results,
                        country_indeed="UAE",
                        hours_old=168,  # last 7 days
                    )
                    if jobs is not None and len(jobs) > 0:
                        for _, row in jobs.iterrows():
                            all_jobs.append({
                                "job_title": str(row.get("title", "")),
                                "location": str(row.get("location", location)),
                                "company": str(row.get("company", "")),
                                "date_posted": str(row.get("date_posted", "")),
                                "description": str(row.get("description", ""))[:2000],
                                "salary": str(row.get("min_amount", "")) if row.get("min_amount") else "",
                                "source": str(row.get("site", "jobspy")),
                                "url": str(row.get("job_url", "")),
                                "skills_list": "",
                            })
                except Exception as exc:
                    logger.debug("JobSpy query '%s' in '%s' failed: %s", query, location, exc)
                    continue

        return all_jobs, "jobspy"

    # ─── Strategy 2: SerpAPI Google Jobs ─────────────

    async def _scrape_serpapi(
        self, queries: list[str], api_key: str
    ) -> tuple[list[dict], str]:
        """Use SerpAPI Google Jobs API (100 free searches/month)."""
        import httpx

        all_jobs = []
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            for query in queries[:3]:  # Limit to conserve free tier
                try:
                    resp = await client.get(
                        "https://serpapi.com/search",
                        params={
                            "engine": "google_jobs",
                            "q": f"{query} UAE",
                            "location": "Dubai, United Arab Emirates",
                            "gl": "ae",
                            "api_key": api_key,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    for job in data.get("jobs_results", []):
                        extensions = job.get("detected_extensions", {})
                        all_jobs.append({
                            "job_title": job.get("title", ""),
                            "location": job.get("location", "UAE"),
                            "company": job.get("company_name", ""),
                            "date_posted": extensions.get("posted_at", ""),
                            "description": job.get("description", "")[:2000],
                            "salary": extensions.get("salary", ""),
                            "source": "google_jobs",
                            "url": job.get("apply_options", [{}])[0].get("link", "") if job.get("apply_options") else "",
                            "skills_list": "",
                        })
                except Exception as exc:
                    logger.debug("SerpAPI query '%s' failed: %s", query, exc)

        return all_jobs, "serpapi"

    # ─── Strategy 3: Direct HTTP fallback ────────────

    async def _scrape_direct(self) -> tuple[list[dict], str]:
        """Direct HTTP scrape of job board pages as last resort."""
        import httpx
        import re
        import asyncio

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        }

        targets = [
            ("bayt", "https://www.bayt.com/en/uae/jobs/"),
            ("gulftalent", "https://www.gulftalent.com/uae/jobs"),
        ]

        all_jobs = []
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), headers=headers, follow_redirects=True) as client:
            for name, url in targets:
                try:
                    await asyncio.sleep(2)  # Rate limit
                    resp = await client.get(url)
                    resp.raise_for_status()

                    # Strip HTML tags
                    text = re.sub(r"<script[^>]*>.*?</script>", "", resp.text, flags=re.DOTALL)
                    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
                    text = re.sub(r"<[^>]+>", "\n", text)
                    text = re.sub(r"\n{3,}", "\n\n", text)

                    # Extract job-like blocks
                    blocks = re.split(r"\n{2,}", text)
                    for block in blocks[:200]:
                        block = block.strip()
                        if len(block) < 30:
                            continue
                        lines = [l.strip() for l in block.splitlines() if l.strip()]
                        if not lines:
                            continue

                        has_location = any(
                            k in " ".join(lines).lower()
                            for k in ("dubai", "abu dhabi", "sharjah", "uae", "ajman")
                        )
                        if has_location and len(lines) >= 2:
                            all_jobs.append({
                                "job_title": lines[0][:200],
                                "location": next(
                                    (l for l in lines if any(k in l.lower() for k in ("dubai", "abu dhabi", "sharjah"))),
                                    "UAE",
                                ),
                                "company": lines[1][:100] if len(lines) > 1 else "",
                                "source": name,
                                "skills_list": "",
                                "description": "",
                                "date_posted": "",
                                "salary": "",
                                "url": url,
                            })
                        if len(all_jobs) >= 100:
                            break
                except Exception as exc:
                    logger.warning("Direct scrape of %s failed: %s", name, exc)

        return all_jobs, "direct_http"

    # ─── Helpers ─────────────────────────────────────

    @staticmethod
    def _normalize_rows(rows: list[dict]) -> list[dict]:
        """Clean up and standardize field values."""
        for row in rows:
            row["job_title"] = str(row.get("job_title", "")).strip()[:200]
            row["location"] = str(row.get("location", "")).strip()[:200]
            row["company"] = str(row.get("company", "")).strip()[:200]
            row["source"] = str(row.get("source", "")).strip()[:50]
            # Remove empty rows
        return [r for r in rows if r.get("job_title")]

    @staticmethod
    def _deduplicate(rows: list[dict]) -> list[dict]:
        """Remove exact duplicate job titles from same company."""
        seen = set()
        unique = []
        for row in rows:
            key = (row.get("job_title", "").lower(), row.get("company", "").lower())
            if key not in seen:
                seen.add(key)
                unique.append(row)
        return unique
