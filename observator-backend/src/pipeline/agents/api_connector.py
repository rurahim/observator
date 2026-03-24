"""APIConnectorAgent — fetches data from verified government and international
labour data APIs, normalises the response into CSV for downstream pipeline.

Verified API sources (March 2026):
  1. FCSC Open Data (CKAN) — https://opendata.fcsc.gov.ae/api/3/action/
  2. Bayanat.ae — https://admin.bayanat.ae/api/opendata/
  3. ILOSTAT SDMX — https://sdmx.ilo.org/rest/
  4. ESCO REST — https://ec.europa.eu/esco/api/
  5. O*NET Web Services — https://services.onetcenter.org/ws/
  6. World Bank — https://api.worldbank.org/v2/
"""
from __future__ import annotations

import csv
import logging
import os
import tempfile
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.ingestion.silver import detect_schema
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)

# ─── Verified API Registry ────────────────────────────

API_REGISTRY: dict[str, dict[str, Any]] = {
    # UAE Government
    "fcsc_opendata": {
        "url": "https://opendata.fcsc.gov.ae/api/3/action/package_search",
        "description": "FCSC Open Data portal (CKAN) — UAE employment, labour force statistics",
        "params": {"q": "labour", "rows": 50},
        "auth": None,
        "response_path": "result.results",
    },
    "fcsc_labour_force": {
        "url": "https://opendata.fcsc.gov.ae/api/3/action/datastore_search",
        "description": "FCSC labour force dataset (direct data query)",
        "params": {"limit": 500},
        "auth": None,
        "response_path": "result.records",
        "requires_resource_id": True,
    },
    "bayanat": {
        "url": "https://admin.bayanat.ae/api/opendata/GetDatasetResourceData",
        "description": "Bayanat.ae UAE National Open Data Portal",
        "params": {"limit": 500},
        "auth": None,
        "response_path": "Data",
        "requires_resource_id": True,
    },

    # International
    "ilostat": {
        "url": "https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_AGE_NB/.ARE...",
        "description": "ILO SDMX — UAE employment by sex and age",
        "params": {"startPeriod": "2015", "endPeriod": "2025", "format": "csv"},
        "headers": {"Accept": "application/vnd.sdmx.data+csv;version=2.0.0"},
        "auth": None,
        "response_format": "csv",
    },
    "ilostat_unemployment": {
        "url": "https://sdmx.ilo.org/rest/data/ILO,DF_UNE_TUNE_SEX_AGE_NB/.ARE...",
        "description": "ILO SDMX — UAE unemployment by sex and age",
        "params": {"startPeriod": "2015", "endPeriod": "2025", "format": "csv"},
        "headers": {"Accept": "application/vnd.sdmx.data+csv;version=2.0.0"},
        "auth": None,
        "response_format": "csv",
    },
    "ilostat_participation": {
        "url": "https://sdmx.ilo.org/rest/data/ILO,DF_EAP_TEAP_SEX_AGE_NB/.ARE...",
        "description": "ILO SDMX — UAE labour force participation",
        "params": {"startPeriod": "2015", "endPeriod": "2025", "format": "csv"},
        "headers": {"Accept": "application/vnd.sdmx.data+csv;version=2.0.0"},
        "auth": None,
        "response_format": "csv",
    },

    # Taxonomy
    "esco_occupations": {
        "url": "https://ec.europa.eu/esco/api/search",
        "description": "ESCO occupation taxonomy search",
        "params": {"text": "*", "type": "occupation", "language": "en", "selectedVersion": "v1.2.0", "limit": 100, "offset": 0},
        "auth": None,
        "response_path": "_embedded.results",
    },
    "esco_skills": {
        "url": "https://ec.europa.eu/esco/api/search",
        "description": "ESCO skill taxonomy search",
        "params": {"text": "*", "type": "skill", "language": "en", "selectedVersion": "v1.2.0", "limit": 100, "offset": 0},
        "auth": None,
        "response_path": "_embedded.results",
    },

    # O*NET (requires API key from https://services.onetcenter.org/developer/signup)
    "onet_occupations": {
        "url": "https://services.onetcenter.org/ws/online/search",
        "description": "O*NET occupation search",
        "params": {"keyword": "engineer", "start": 1, "end": 50},
        "auth": "onet_api_key",  # Uses settings.ONET_API_KEY
        "headers": {"Accept": "application/json"},
        "response_path": "occupation",
    },

    # World Bank (macro indicators)
    "worldbank_labour": {
        "url": "https://api.worldbank.org/v2/country/AE/indicator/SL.TLF.TOTL.IN",
        "description": "World Bank — UAE total labour force",
        "params": {"format": "json", "date": "2015:2025", "per_page": 50},
        "auth": None,
        "response_path": "1",  # World Bank returns [metadata, data]
    },
    "worldbank_unemployment": {
        "url": "https://api.worldbank.org/v2/country/AE/indicator/SL.UEM.TOTL.ZS",
        "description": "World Bank — UAE unemployment rate",
        "params": {"format": "json", "date": "2015:2025", "per_page": 50},
        "auth": None,
        "response_path": "1",
    },
}


class APIConnectorAgent(BaseAgent):
    name = "api_connector"
    description = "Fetch data from verified UAE government and international labour APIs"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        source_type = state.get("source_type", "")
        return source_type in (
            "api", "fcsc_api", "bayanat_api", "ilostat_api",
            "esco_api", "onet_api", "worldbank_api",
        )

    async def process(self, state: PipelineState, db) -> dict:
        source_type = state.get("source_type", "api")

        try:
            import httpx
        except ImportError:
            return {"errors": ["httpx not installed"]}

        # Determine which API(s) to call
        api_keys = self._resolve_apis(source_type)
        all_rows: list[dict] = []
        errors: list[str] = []
        api_sources_used: list[str] = []

        for api_key in api_keys:
            config = API_REGISTRY.get(api_key)
            if not config:
                errors.append(f"Unknown API: {api_key}")
                continue

            logger.info("APIConnector: fetching from %s (%s)", api_key, config["url"])

            try:
                rows = await self._fetch_api(config, api_key)
                all_rows.extend(rows)
                api_sources_used.append(api_key)
                logger.info("APIConnector: got %d rows from %s", len(rows), api_key)
            except Exception as exc:
                msg = f"API fetch failed for {api_key}: {exc}"
                logger.warning(msg)
                errors.append(msg)

        if not all_rows:
            return {"errors": errors or [f"No data from any API for source_type={source_type}"]}

        # Transform API data to match a known schema so db_loader can process it
        transformed, schema = self._transform_to_schema(all_rows, source_type)

        # Write to CSV
        tmp_dir = tempfile.mkdtemp(prefix="obs_api_")
        csv_path = os.path.join(tmp_dir, f"{source_type}_fetch.csv")

        fieldnames = list(transformed[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(transformed)

        # Use forced schema from transform, or try fingerprint detection
        if schema == "unknown":
            schema = detect_schema(csv_path, "csv")

        logger.info(
            "APIConnector: total %d rows (%d transformed) from %s, schema=%s",
            len(all_rows), len(transformed), api_sources_used, schema,
        )

        result: dict = {
            "file_path": csv_path,
            "file_type": "csv",
            "detected_schema": schema,
            "row_count": len(transformed),
            "dataframe_columns": fieldnames,
            "is_api": True,
            "api_data": transformed[:5],
            "has_job_titles": schema == "rdata_jobs",
        }
        if errors:
            result["errors"] = errors
        return result

    def _transform_to_schema(
        self, rows: list[dict], source_type: str
    ) -> tuple[list[dict], str]:
        """Transform raw API response rows into a known schema format.

        Returns (transformed_rows, schema_name).
        """
        if source_type in ("worldbank_api",):
            return self._transform_worldbank(rows), "fcsc_sdmx"
        if source_type in ("ilostat_api",):
            return self._transform_ilostat(rows), "fcsc_sdmx"
        if source_type in ("fcsc_api",):
            # FCSC OpenData already has SDMX-like structure
            return rows, "fcsc_sdmx"
        # Default: return raw rows, let fingerprint detection decide
        return rows, "unknown"

    def _transform_worldbank(self, rows: list[dict]) -> list[dict]:
        """Transform World Bank indicator data to FCSC SDMX format.

        World Bank format: {country, countryiso3code, date, value, indicator, ...}
        FCSC SDMX format: {DATAFLOW, REF_AREA, TIME_PERIOD, OBS_VALUE, INDICATOR, ...}
        """
        transformed = []
        for r in rows:
            value = r.get("value")
            if value is None:
                continue
            indicator_id = ""
            indicator_obj = r.get("indicator")
            if isinstance(indicator_obj, dict):
                indicator_id = indicator_obj.get("id", "")
            elif isinstance(indicator_obj, str):
                indicator_id = indicator_obj

            transformed.append({
                "DATAFLOW": f"WB,{indicator_id}",
                "REF_AREA": "AE",
                "TIME_PERIOD": str(r.get("date", "")),
                "OBS_VALUE": str(value),
                "INDICATOR": indicator_id,
                "MEASURE": "TOTAL",
                "SEX": "_T",
                "AGE": "_T",
                "ACTIVITY": "_T",
            })
        return transformed

    def _transform_ilostat(self, rows: list[dict]) -> list[dict]:
        """Transform ILO SDMX CSV data to standard FCSC SDMX format.

        ILO CSV format varies but typically has: REF_AREA, TIME_PERIOD, OBS_VALUE, SEX, AGE
        If already in SDMX-like format, just ensure DATAFLOW is set.
        """
        transformed = []
        for r in rows:
            row = dict(r)  # Copy
            if "DATAFLOW" not in row:
                row["DATAFLOW"] = "ILO,EMPLOYMENT"
            if "REF_AREA" not in row:
                row["REF_AREA"] = "AE"
            transformed.append(row)
        return transformed

    # ─── Internal ─────────────────────────────────────

    def _resolve_apis(self, source_type: str) -> list[str]:
        """Map source_type to one or more API registry keys."""
        mapping: dict[str, list[str]] = {
            "fcsc_api": ["fcsc_opendata"],
            "bayanat_api": ["bayanat"],
            "ilostat_api": ["ilostat", "ilostat_unemployment", "ilostat_participation"],
            "esco_api": ["esco_occupations", "esco_skills"],
            "onet_api": ["onet_occupations"],
            "worldbank_api": ["worldbank_labour", "worldbank_unemployment"],
            "api": ["fcsc_opendata"],  # default
        }
        return mapping.get(source_type, ["fcsc_opendata"])

    async def _fetch_api(self, config: dict, api_key: str) -> list[dict]:
        """Fetch from a single API endpoint and return flat rows."""
        import httpx

        url = config["url"]
        params = dict(config.get("params", {}))
        headers = dict(config.get("headers", {}))

        # Add auth if required
        auth_type = config.get("auth")
        if auth_type == "onet_api_key":
            onet_key = getattr(settings, "ONET_API_KEY", None)
            if not onet_key:
                raise ValueError("ONET_API_KEY not configured in settings")
            headers["Authorization"] = f"Basic {onet_key}"

        # Handle resource_id requirement (FCSC datastore, Bayanat)
        if config.get("requires_resource_id"):
            resource_id = params.pop("resource_id", None)
            if not resource_id:
                logger.info("APIConnector: %s requires resource_id, fetching catalogue first", api_key)
                return []  # Need resource_id to query specific dataset

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
        ) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()

            # Handle CSV response (ILOSTAT SDMX)
            if config.get("response_format") == "csv":
                return self._parse_csv_response(resp.text)

            data = resp.json()

        # Navigate to the data within the response
        response_path = config.get("response_path", "")
        items = data
        for key in response_path.split("."):
            if not key:
                continue
            if isinstance(items, dict):
                items = items.get(key, [])
            elif isinstance(items, list) and key.isdigit():
                idx = int(key)
                items = items[idx] if idx < len(items) else []

        if not isinstance(items, list):
            items = [items] if isinstance(items, dict) else []

        return self._flatten_rows(items)

    @staticmethod
    def _flatten_rows(items: list) -> list[dict]:
        """Flatten nested dicts one level deep."""
        rows = []
        for item in items:
            if not isinstance(item, dict):
                continue
            flat: dict[str, Any] = {}
            for k, v in item.items():
                if isinstance(v, dict):
                    for k2, v2 in v.items():
                        flat[f"{k}_{k2}"] = v2
                elif isinstance(v, list):
                    flat[k] = str(v)[:500]
                else:
                    flat[k] = v
            rows.append(flat)
        return rows

    @staticmethod
    def _parse_csv_response(csv_text: str) -> list[dict]:
        """Parse a CSV text response (from ILOSTAT SDMX) into row dicts."""
        import io
        reader = csv.DictReader(io.StringIO(csv_text))
        return [dict(row) for row in reader]
