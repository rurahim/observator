"""Centralized analytics engine — single source of truth for ALL formulas + queries.

Every API endpoint (dashboard, skill_gap, ai_impact) delegates to this engine
instead of embedding inline SQL and ad-hoc calculations.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AnalyticsEngine:
    """Stateless query + formula engine.  Accepts an AsyncSession per request."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ──────────────────────────────────────────────
    # Canonical formulas (static — no DB needed)
    # ──────────────────────────────────────────────

    @staticmethod
    def compute_sgi(supply: int, demand: int) -> float | None:
        """Skill Gap Index (percentage), clamped to [-100, 100].

        ``SGI = (demand - supply) / demand * 100``

        * Positive → shortage (demand exceeds supply)
        * Negative → surplus (supply exceeds demand)
        * None     → demand is zero (undefined)

        Clamped to ±100 because supply (stock) and demand (flow) can be on
        vastly different scales, making raw ratios nonsensical.
        """
        if demand <= 0:
            return None
        raw = (demand - supply) / demand * 100
        return round(max(-100.0, min(100.0, raw)), 1)

    @staticmethod
    def classify_status(sgi: float | None) -> str:
        """Map an SGI % value to a human-readable status label."""
        if sgi is None:
            return "Unknown"
        if sgi > 20:
            return "Critical Shortage"
        if sgi > 5:
            return "Moderate Shortage"
        if sgi >= -5:
            return "Balanced"
        if sgi >= -20:
            return "Moderate Surplus"
        return "Critical Surplus"

    @staticmethod
    def compute_ai_composite(
        exposure: float | None,
        automation_prob: float | None,
        llm_exposure: float | None,
        market_signal: float | None = None,
    ) -> float | None:
        """Weighted AI composite score (0-100).

        Weights: task_auto=0.40, adoption=0.25, market=0.20, replacement=0.15
        Falls back to simple average when only exposure is available.
        """
        vals: list[tuple[float, float]] = []  # (weight, value)
        if exposure is not None:
            vals.append((0.40, exposure))
        if automation_prob is not None:
            # automation_prob is 0-1, scale to 0-100
            scaled = automation_prob * 100 if automation_prob <= 1 else automation_prob
            vals.append((0.25, scaled))
        if market_signal is not None:
            vals.append((0.20, market_signal))
        if llm_exposure is not None:
            scaled = llm_exposure * 100 if llm_exposure <= 1 else llm_exposure
            vals.append((0.15, scaled))

        if not vals:
            return None

        total_weight = sum(w for w, _ in vals)
        weighted = sum(w * v for w, v in vals) / total_weight
        return round(weighted, 1)

    # ──────────────────────────────────────────────
    # Aggregation queries
    # ──────────────────────────────────────────────

    async def get_supply_demand_totals(
        self,
        emirate: str | None = None,
        sector: str | None = None,
        data_source: str | None = None,
    ) -> tuple[int, int]:
        """Return (total_supply, total_demand) from the gap cube.

        Uses vw_gap_cube which already handles latest-year supply and
        proper occupation-level matching — avoids cross-year inflation.
        """
        params: dict = {}
        conds: list[str] = []

        if emirate:
            conds.append("region_code = :emirate")
            params["emirate"] = emirate
        if sector:
            conds.append("sector = :sector")
            params["sector"] = sector

        where = (" WHERE " + " AND ".join(conds)) if conds else ""

        row = (await self.db.execute(
            text(f"SELECT COALESCE(SUM(supply_count), 0), COALESCE(SUM(demand_count), 0) FROM vw_gap_cube{where}"),
            params,
        )).fetchone()

        return int(row[0]), int(row[1])

    async def get_supply_demand_trend(
        self,
        emirate: str | None = None,
        sector: str | None = None,
        data_source: str | None = None,
        limit: int = 24,
    ) -> list[dict]:
        """Monthly supply vs demand trend, filterable by emirate/sector."""
        conds: list[str] = []
        params: dict = {"lim": limit}
        if emirate:
            conds.append("region_code = :emirate")
            params["emirate"] = emirate
        if sector:
            conds.append("sector = :sector")
            params["sector"] = sector
        src = self._source_condition(data_source)
        if src:
            conds.append(src)
        where = (" WHERE " + " AND ".join(conds)) if conds else ""

        q = text(f"""
            SELECT COALESCE(s.month_label, d.month_label) as ml,
                   COALESCE(s.supply, 0), COALESCE(d.demand, 0)
            FROM (
                SELECT month_label, SUM(supply_count) as supply
                FROM vw_supply_talent{where} GROUP BY month_label
            ) s
            FULL OUTER JOIN (
                SELECT month_label, SUM(demand_count) as demand
                FROM vw_demand_jobs{where} GROUP BY month_label
            ) d ON s.month_label = d.month_label
            ORDER BY ml
            LIMIT :lim
        """)
        rows = (await self.db.execute(q, params)).fetchall()
        return [
            {"month": r[0] or "", "supply": int(r[1] or 0), "demand": int(r[2] or 0)}
            for r in rows
        ]

    async def get_sector_distribution(
        self,
        emirate: str | None = None,
        data_source: str | None = None,
        limit: int = 10,
    ) -> dict:
        """Sector distribution with auto-detection of data side.

        Returns {data_side: "demand"|"supply"|"both", sectors: [...]}
        """
        extra_cond = ""
        params: dict = {"lim": limit}
        if emirate:
            extra_cond += " AND f.region_code = :emirate"
            params["emirate"] = emirate
        src_cond = self._source_and(data_source)

        # Check demand side
        demand_q = text(f"""
            SELECT f.sector, f.sector as sector_ar, COALESCE(SUM(f.demand_count), 0) as cnt
            FROM vw_demand_jobs f
            WHERE f.sector IS NOT NULL{src_cond}{extra_cond}
            GROUP BY f.sector
            ORDER BY cnt DESC
            LIMIT :lim
        """)
        demand_rows = (await self.db.execute(demand_q, params)).fetchall()

        # Check supply side
        supply_q = text(f"""
            SELECT f.sector, f.sector as sector_ar, COALESCE(SUM(f.supply_count), 0) as cnt
            FROM vw_supply_talent f
            WHERE f.sector IS NOT NULL{src_cond}{extra_cond}
            GROUP BY f.sector
            ORDER BY cnt DESC
            LIMIT :lim
        """)
        supply_rows = (await self.db.execute(supply_q, params)).fetchall()

        has_demand = bool(demand_rows)
        has_supply = bool(supply_rows)

        if has_demand:
            rows = demand_rows
            data_side = "both" if has_supply else "demand"
        elif has_supply:
            rows = supply_rows
            data_side = "supply"
        else:
            return {"data_side": "none", "sectors": []}

        total = sum(int(r[2]) for r in rows) or 1
        sectors = [
            {
                "sector": r[0],
                "sector_ar": r[1],
                "count": int(r[2]),
                "percentage": round(int(r[2]) / total * 100, 1),
            }
            for r in rows
        ]
        return {"data_side": data_side, "sectors": sectors}

    async def get_emirate_metrics(
        self,
        sector: str | None = None,
        data_source: str | None = None,
    ) -> list[dict]:
        """Emirate-level supply, demand, gap from the gap cube."""
        conds: list[str] = []
        params: dict = {}
        if sector:
            conds.append("g.sector = :sector")
            params["sector"] = sector
        where = (" AND " + " AND ".join(conds)) if conds else ""

        q = text(f"""
            SELECT r.region_code, r.emirate, r.emirate_ar,
                   COALESCE(SUM(g.supply_count), 0) as supply,
                   COALESCE(SUM(g.demand_count), 0) as demand
            FROM dim_region r
            LEFT JOIN vw_gap_cube g ON r.region_code = g.region_code
            WHERE (g.supply_count > 0 OR g.demand_count > 0) {where}
            GROUP BY r.region_code, r.emirate, r.emirate_ar
            ORDER BY COALESCE(SUM(g.demand_count), 0) DESC
        """)
        rows = (await self.db.execute(q, params)).fetchall()
        results = []
        for r in rows:
            supply, demand = int(r[3]), int(r[4])
            sgi = self.compute_sgi(supply, demand)
            results.append({
                "region_code": r[0],
                "emirate": r[1],
                "emirate_ar": r[2],
                "supply": supply,
                "demand": demand,
                "gap": demand - supply,
                "sgi": sgi,
                "status": self.classify_status(sgi),
            })
        return results

    async def get_occupation_gaps(
        self,
        emirate: str | None = None,
        sector: str | None = None,
        limit: int = 50,
        data_source: str | None = None,
    ) -> list[dict]:
        """Occupation-level supply vs demand from vw_gap_cube."""
        conditions: list[str] = ["g.occupation IS NOT NULL"]
        params: dict = {"lim": min(limit, 200)}
        if emirate:
            conditions.append("g.region_code = :emirate")
            params["emirate"] = emirate
        if sector:
            conditions.append("g.sector = :sector")
            params["sector"] = sector
        src_cond = self._source_condition(data_source)
        if src_cond:
            conditions.append(src_cond)

        where = " WHERE " + " AND ".join(conditions)

        q = text(f"""
            SELECT g.code_isco, g.occupation, g.occupation as title_ar,
                   COALESCE(SUM(g.supply_count), 0) as supply,
                   COALESCE(SUM(g.demand_count), 0) as demand,
                   ROUND(AVG(g.ai_exposure_score)::numeric, 1) as ai_score
            FROM vw_gap_cube g
            {where}
            GROUP BY g.code_isco, g.occupation
            ORDER BY (COALESCE(SUM(g.demand_count), 0) - COALESCE(SUM(g.supply_count), 0)) DESC
            LIMIT :lim
        """)
        rows = (await self.db.execute(q, params)).fetchall()
        results = []
        for r in rows:
            supply, demand = int(r[3] or 0), int(r[4] or 0)
            sgi = self.compute_sgi(supply, demand)
            ai_score = float(r[5]) if r[5] is not None else None
            results.append({
                "code_isco": r[0],
                "title_en": r[1],
                "title_ar": r[2],
                "supply": supply,
                "demand": demand,
                "gap": demand - supply,
                "sgi": sgi,
                "status": self.classify_status(sgi),
                "ai_exposure_score": ai_score,
            })
        return results

    async def get_sgi_trend(self, limit: int = 24) -> list[dict]:
        """Monthly SGI trend (supply / demand as percentage gap)."""
        q = text("""
            SELECT COALESCE(s.month_label, d.month_label) as ml,
                   COALESCE(s.supply, 0) as supply, COALESCE(d.demand, 0) as demand
            FROM (
                SELECT month_label, SUM(supply_count) as supply
                FROM vw_supply_talent GROUP BY month_label
            ) s
            FULL OUTER JOIN (
                SELECT month_label, SUM(demand_count) as demand
                FROM vw_demand_jobs GROUP BY month_label
            ) d ON s.month_label = d.month_label
            ORDER BY ml
            LIMIT :lim
        """)
        rows = (await self.db.execute(q, {"lim": limit})).fetchall()
        results = []
        for r in rows:
            supply, demand = int(r[1] or 0), int(r[2] or 0)
            sgi = self.compute_sgi(supply, demand)
            results.append({"month": r[0] or "", "sgi": sgi if sgi is not None else 0.0})
        return results

    async def get_ai_exposure_occupations(
        self, sector: str | None = None, limit: int = 50
    ) -> list[dict]:
        q = text("""
            SELECT o.occupation_id, o.title_en, o.title_ar, o.code_isco,
                   AVG(a.exposure_0_100) as avg_exposure,
                   AVG(a.automation_probability) as avg_automation,
                   AVG(a.llm_exposure) as avg_llm
            FROM vw_ai_impact a
            JOIN dim_occupation o ON a.occupation_id = o.occupation_id
            GROUP BY o.occupation_id, o.title_en, o.title_ar, o.code_isco
            ORDER BY avg_exposure DESC NULLS LAST
            LIMIT :lim
        """)
        rows = (await self.db.execute(q, {"lim": min(limit, 200)})).fetchall()
        results = []
        for r in rows:
            exp = float(r[4]) if r[4] is not None else None
            auto_prob = float(r[5]) if r[5] is not None else None
            llm_exp = float(r[6]) if r[6] is not None else None
            composite = self.compute_ai_composite(exp, auto_prob, llm_exp)
            risk = self._risk_level(composite or exp)
            results.append({
                "occupation_id": r[0],
                "title_en": r[1],
                "title_ar": r[2],
                "code_isco": r[3],
                "exposure_score": round(composite, 1) if composite is not None else (round(exp, 1) if exp is not None else None),
                "automation_probability": round(auto_prob, 3) if auto_prob is not None else None,
                "llm_exposure": round(llm_exp, 3) if llm_exp is not None else None,
                "risk_level": risk,
            })
        return results

    async def get_ai_exposure_sectors(self) -> list[dict]:
        """AI exposure by sector. Falls back to ISCO major group when sector_id is empty."""
        # Try sector-based first
        q = text("""
            SELECT s.label_en, s.label_ar,
                   AVG(a.exposure_0_100) as avg_exp,
                   COUNT(DISTINCT a.occupation_id) as occ_count,
                   COUNT(DISTINCT CASE WHEN a.exposure_0_100 >= 50 THEN a.occupation_id END) as high_risk
            FROM fact_ai_exposure_occupation a
            JOIN dim_occupation o_ai ON a.occupation_id = o_ai.occupation_id
            JOIN dim_occupation o_dem ON o_ai.isco_major_group = o_dem.isco_major_group
            JOIN fact_demand_vacancies_agg d ON d.occupation_id = o_dem.occupation_id
            JOIN dim_sector s ON d.sector_id = s.sector_id
            WHERE a.exposure_0_100 IS NOT NULL AND s.label_en IS NOT NULL
            GROUP BY s.label_en, s.label_ar
            ORDER BY avg_exp DESC NULLS LAST
        """)
        try:
            rows = (await self.db.execute(q)).fetchall()
            if rows:
                return [
                    {"sector": r[0], "sector_ar": r[1],
                     "avg_exposure": round(float(r[2]), 1) if r[2] else 0.0,
                     "occupation_count": int(r[3]), "high_risk_count": int(r[4])}
                    for r in rows
                ]
        except Exception:
            pass

        # Fallback: group by ISCO major group
        isco_labels = {
            '1': 'Managers', '2': 'Professionals', '3': 'Technicians & Associates',
            '4': 'Clerical Support', '5': 'Service & Sales',
            '6': 'Agricultural Workers', '7': 'Craft & Trade Workers',
            '8': 'Plant & Machine Operators', '9': 'Elementary Occupations',
        }
        q2 = text("""
            SELECT o.isco_major_group,
                   ROUND(AVG(a.exposure_0_100)::numeric, 1),
                   COUNT(DISTINCT a.occupation_id),
                   COUNT(DISTINCT CASE WHEN a.exposure_0_100 >= 60 THEN a.occupation_id END)
            FROM fact_ai_exposure_occupation a
            JOIN dim_occupation o ON a.occupation_id = o.occupation_id
            WHERE a.exposure_0_100 IS NOT NULL AND o.isco_major_group IS NOT NULL
            GROUP BY o.isco_major_group ORDER BY 2 DESC
        """)
        try:
            rows = (await self.db.execute(q2)).fetchall()
        except Exception:
            return []
        return [
            {"sector": isco_labels.get(str(r[0]), f"ISCO Group {r[0]}"), "sector_ar": None,
             "avg_exposure": round(float(r[1]), 1) if r[1] else 0.0,
             "occupation_count": int(r[2]), "high_risk_count": int(r[3])}
            for r in rows
        ]

    async def get_ai_skill_clusters(self, limit: int = 20) -> list[dict]:
        q = text("""
            SELECT sk.label_en,
                   AVG(a.exposure_0_100) as avg_exp,
                   COUNT(DISTINCT a.occupation_id) as occ_count
            FROM fact_ai_exposure_occupation a
            JOIN fact_occupation_skills os ON a.occupation_id = os.occupation_id
            JOIN dim_skill sk ON os.skill_id = sk.skill_id
            GROUP BY sk.label_en
            ORDER BY avg_exp DESC NULLS LAST
            LIMIT :lim
        """)
        try:
            rows = (await self.db.execute(q, {"lim": limit})).fetchall()
        except Exception:
            return []
        return [
            {
                "skill": r[0],
                "exposure": round(float(r[1]), 1) if r[1] else 0.0,
                "occupation_count": int(r[2]),
            }
            for r in rows
        ]

    async def get_refreshed_at(self) -> str | None:
        """Return the latest view refresh timestamp from dataset_registry."""
        try:
            row = (await self.db.execute(
                text("SELECT MAX(last_refreshed_at) FROM dataset_registry WHERE status = 'ready'")
            )).scalar()
            return row.isoformat() if row else None
        except Exception:
            return None

    # ──────────────────────────────────────────────
    # Source metadata for transparency
    # ──────────────────────────────────────────────

    async def get_source_metadata(
        self,
        views: list[str] | None = None,
        emirate: str | None = None,
        sector: str | None = None,
        data_source: str | None = None,
    ) -> dict:
        """Query source distribution, row counts, date range, coverage.

        Queries fact tables directly (more reliable than views which may lack columns).
        Returns a dict matching the DataMeta schema structure.
        """
        # Map view names to fact table queries
        fact_queries = {
            "vw_demand_jobs": ("fact_demand_vacancies_agg", "demand"),
            "vw_supply_talent": ("fact_supply_talent_agg", "supply"),
            "vw_ai_impact": ("fact_ai_exposure_occupation", "ai"),
        }
        if views is None:
            views = ["vw_demand_jobs", "vw_supply_talent"]

        sources = []
        total_rows = 0
        min_date = None
        max_date = None
        emirates_with_data = set()

        src_and = self._source_and(data_source)

        for vw in views:
            table, side = fact_queries.get(vw, (vw, None))
            try:
                # Source breakdown from fact table
                rows = (await self.db.execute(text(
                    f"SELECT COALESCE(source, 'system') as src, COUNT(*) as cnt "
                    f"FROM {table} WHERE 1=1 {src_and} "
                    f"GROUP BY COALESCE(source, 'system') ORDER BY cnt DESC"
                ))).fetchall()

                for r in rows:
                    src_name = str(r[0]) if r[0] else "system"
                    sources.append({"name": src_name, "rows": int(r[1]), "side": side})
                    total_rows += int(r[1])
            except Exception as ex:
                logger.debug(f"Source metadata skip {table}: {ex}")
                try:
                    await self.db.rollback()
                except Exception:
                    pass

        # Date range from fact tables (only those with time_id)
        for table in ["fact_demand_vacancies_agg", "fact_supply_talent_agg"]:
            try:
                dr = (await self.db.execute(text(
                    f"SELECT MIN(t.year), MAX(t.year) FROM {table} f "
                    f"JOIN dim_time t ON f.time_id = t.time_id"
                ))).fetchone()
                if dr and dr[0]:
                    yr_min = str(dr[0])
                    yr_max = str(dr[1])
                    if min_date is None or yr_min < min_date:
                        min_date = yr_min
                    if max_date is None or yr_max > max_date:
                        max_date = yr_max
            except Exception:
                try:
                    await self.db.rollback()
                except Exception:
                    pass

        # Emirate coverage
        for table in ["fact_demand_vacancies_agg", "fact_supply_talent_agg"]:
            try:
                ecov = (await self.db.execute(text(
                    f"SELECT DISTINCT region_code FROM {table} "
                    f"WHERE region_code IS NOT NULL"
                ))).fetchall()
                for e in ecov:
                    emirates_with_data.add(e[0])
            except Exception:
                try:
                    await self.db.rollback()
                except Exception:
                    pass

        # Freshness
        refreshed_at = await self.get_refreshed_at()
        freshness_label = None
        if refreshed_at:
            try:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(refreshed_at)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                delta = datetime.now(timezone.utc) - dt
                hours = delta.total_seconds() / 3600
                if hours < 1:
                    freshness_label = f"{int(delta.total_seconds() / 60)}m ago"
                elif hours < 24:
                    freshness_label = f"{int(hours)}h ago"
                else:
                    freshness_label = f"{int(hours / 24)}d ago"
            except Exception:
                pass

        # Quality score (avg from dataset_registry)
        quality_score = None
        try:
            qs = (await self.db.execute(text(
                "SELECT ROUND(AVG(quality_score)) FROM dataset_registry "
                "WHERE quality_score IS NOT NULL AND status = 'ready'"
            ))).scalar()
            quality_score = int(qs) if qs else None
        except Exception:
            try:
                await self.db.rollback()
            except Exception:
                pass

        return {
            "sources": sources,
            "total_rows": total_rows,
            "date_range": {"min": min_date or "N/A", "max": max_date or "N/A"},
            "refreshed_at": refreshed_at,
            "freshness_label": freshness_label,
            "quality_score": quality_score,
            "coverage": {
                "emirates": len(emirates_with_data),
                "total": 7,
            },
        }

    async def get_available_sources(self) -> list[dict]:
        """Return all distinct data sources with row counts for the source filter."""
        results = []
        queries = [
            ("vw_demand_jobs", "demand"),
            ("vw_supply_talent", "supply"),
            ("vw_ai_impact", "ai"),
        ]
        for vw, side in queries:
            try:
                rows = (await self.db.execute(text(
                    f"SELECT COALESCE(source, 'system') as src, COUNT(*) as cnt "
                    f"FROM {vw} GROUP BY COALESCE(source, 'system') ORDER BY cnt DESC"
                ))).fetchall()
                for r in rows:
                    results.append({
                        "value": str(r[0]),
                        "label": str(r[0]).replace("_", " ").title(),
                        "rows": int(r[1]),
                        "side": side,
                    })
            except Exception:
                pass
        return results

    # ──────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────

    @staticmethod
    def _risk_level(score: float | None) -> str:
        if score is None:
            return "Low"
        if score >= 60:
            return "High"
        if score >= 30:
            return "Moderate"
        return "Low"

    @staticmethod
    def _source_condition(data_source: str | None) -> str:
        """Return a bare SQL condition (no leading AND/WHERE)."""
        if data_source == "user_upload":
            return "source = 'user_upload'"
        if data_source == "system":
            return "(source IS NULL OR source != 'user_upload')"
        return ""

    @staticmethod
    def _source_where(data_source: str | None) -> str:
        """Return a WHERE clause or empty string."""
        cond = AnalyticsEngine._source_condition(data_source)
        return f"WHERE {cond}" if cond else ""

    @staticmethod
    def _source_and(data_source: str | None) -> str:
        """Return an AND clause fragment (for appending to existing WHERE)."""
        cond = AnalyticsEngine._source_condition(data_source)
        return f" AND {cond}" if cond else ""
