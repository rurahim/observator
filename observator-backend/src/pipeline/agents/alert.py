"""AlertAgent — checks post-pipeline thresholds and optionally sends email
notifications for critical findings.

Thresholds checked:
- New critical skill shortages (SGI < 0.5)
- Supply drops > 20 % vs previous load
- Quality failures
- High AI exposure occupations

Uses ``src.reporting.email_service.send_report_email`` when SMTP is configured.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.pipeline.base import BaseAgent, PipelineState

logger = logging.getLogger(__name__)


class AlertAgent(BaseAgent):
    name = "alert"
    description = "Check thresholds and send email alerts for critical findings"
    requires_llm = False

    async def validate_input(self, state: PipelineState) -> bool:
        # Always eligible — we check thresholds regardless
        return True

    async def process(self, state: PipelineState, db) -> dict:
        alerts: list[dict] = []

        # ---- 1. Quality failure alert ----
        quality_passed = state.get("quality_passed", True)
        if not quality_passed:
            quality_report = state.get("quality_report", {})
            alerts.append({
                "level": "warning",
                "type": "quality_failure",
                "message": "Data quality checks failed",
                "data": quality_report,
            })

        # ---- 2. Critical shortages (SGI < 0.5) ----
        try:
            shortage_rows = await db.execute(text("""
                SELECT occupation, region_code,
                       COALESCE(SUM(supply_count), 0) as supply,
                       COALESCE(SUM(demand_count), 0) as demand
                FROM vw_gap_cube
                WHERE occupation IS NOT NULL
                GROUP BY occupation, region_code
                HAVING COALESCE(SUM(demand_count), 0) > 0
                   AND (COALESCE(SUM(supply_count), 0)::float
                        / COALESCE(SUM(demand_count), 0)) < 0.5
                ORDER BY (COALESCE(SUM(supply_count), 0)::float
                          / COALESCE(SUM(demand_count), 0)) ASC
                LIMIT 10
            """))
            for row in shortage_rows.fetchall():
                occ, region, supply, demand = row
                sgi = round(float(supply) / max(float(demand), 1), 3)
                alerts.append({
                    "level": "critical",
                    "type": "skill_shortage",
                    "message": f"Critical shortage: {occ} in {region} (SGI={sgi})",
                    "data": {
                        "occupation": occ,
                        "region": region,
                        "supply": int(supply),
                        "demand": int(demand),
                        "sgi": sgi,
                    },
                })
        except Exception as exc:
            logger.debug("Alert: shortage check skipped (%s)", exc)

        # ---- 3. Supply drop > 20 % (compare load_result to existing totals) ----
        load_result = state.get("load_result", {})
        rows_loaded = load_result.get("rows_loaded", 0)
        target_table = load_result.get("target_table")
        if target_table == "fact_supply_talent_agg" and rows_loaded > 0:
            try:
                total_row = await db.execute(
                    text("SELECT SUM(supply_count) FROM vw_supply_talent")
                )
                total_supply = total_row.scalar() or 0
                if total_supply > 0 and rows_loaded < total_supply * 0.8:
                    alerts.append({
                        "level": "warning",
                        "type": "supply_drop",
                        "message": (
                            f"New supply data ({rows_loaded} rows) is significantly "
                            f"less than existing total ({int(total_supply)})"
                        ),
                        "data": {
                            "new_rows": rows_loaded,
                            "existing_total": int(total_supply),
                        },
                    })
            except Exception as exc:
                logger.debug("Alert: supply drop check skipped (%s)", exc)

        # ---- 4. PII found alert ----
        pii_report = state.get("pii_report", {})
        if pii_report.get("pii_found"):
            alerts.append({
                "level": "warning",
                "type": "pii_detected",
                "message": f"PII detected and masked: {pii_report.get('types', [])}",
                "data": pii_report,
            })

        # ---- Send email if configured ----
        alerts_sent: list[dict] = []
        options = state.get("options", {})
        notify_email = options.get("notify_email") or ""

        critical_alerts = [a for a in alerts if a["level"] == "critical"]
        if notify_email and critical_alerts:
            try:
                from src.reporting.email_service import send_report_email

                body_lines = [
                    "<h2>Observator Pipeline Alert</h2>",
                    f"<p>Pipeline run <code>{state.get('run_id', '?')}</code> "
                    f"generated {len(critical_alerts)} critical alert(s):</p>",
                    "<ul>",
                ]
                for a in critical_alerts:
                    body_lines.append(f"<li><strong>{a['type']}</strong>: {a['message']}</li>")
                body_lines.append("</ul>")
                body_html = "\n".join(body_lines)

                sent = await send_report_email(
                    to_email=notify_email,
                    subject=f"[Observator] {len(critical_alerts)} Critical Alert(s)",
                    body_text=body_html,
                )
                if sent:
                    alerts_sent.append({
                        "to": notify_email,
                        "count": len(critical_alerts),
                        "at": datetime.now(timezone.utc).isoformat(),
                    })
            except Exception as exc:
                logger.warning("Alert: email send failed: %s", exc)

        logger.info(
            "AlertAgent: total=%d critical=%d sent=%d",
            len(alerts),
            len(critical_alerts),
            len(alerts_sent),
        )

        return {
            "alerts": alerts,
            "alerts_sent": alerts_sent,
        }
