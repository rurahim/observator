"""PDF report generator using WeasyPrint + Jinja2.

Renders HTML templates with report data, then converts to PDF bytes.
Supports Arabic RTL, government styling (navy/gold), bilingual headers.
Falls back to styled HTML download if WeasyPrint/GTK is not available (e.g., Windows).
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


TEMPLATE_DIR = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"


def _get_jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=True,
    )


def _load_css() -> str:
    css_path = STATIC_DIR / "report.css"
    return css_path.read_text(encoding="utf-8")


async def generate_pdf(report_type: str, filters: dict, db: AsyncSession) -> bytes:
    """Generate a PDF report and return bytes."""
    # Collect data based on report type
    data = await _collect_report_data(report_type, filters, db)

    # Common template context
    now = datetime.now(timezone.utc)
    context = {
        "css": _load_css(),
        "generated_date": now.strftime("%d %B %Y"),
        "data_date": now.strftime("%B %Y"),
        "period": filters.get("period", "Latest Available"),
        **data,
    }

    # Render HTML
    env = _get_jinja_env()
    template_name = f"{report_type}.html"
    template = env.get_template(template_name)
    html_content = template.render(**context)

    # Try WeasyPrint for real PDF; fall back to styled HTML on Windows
    pdf_bytes = _try_weasyprint(html_content)
    if pdf_bytes:
        return pdf_bytes
    return html_content.encode("utf-8")


def _try_weasyprint(html: str) -> bytes | None:
    """Attempt PDF conversion via WeasyPrint. Returns None if unavailable."""
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        return None


async def _collect_report_data(report_type: str, filters: dict, db: AsyncSession) -> dict:
    """Collect data for the specified report type from materialized views."""

    if report_type == "executive":
        return await _collect_executive(filters, db)
    elif report_type == "skill_gap":
        return await _collect_skill_gap(filters, db)
    elif report_type == "emiratisation":
        return await _collect_emiratisation(filters, db)
    elif report_type == "ai_risk":
        return await _collect_ai_risk(filters, db)
    else:
        return {}


async def _collect_executive(filters: dict, db: AsyncSession) -> dict:
    supply = (await db.execute(text("SELECT COALESCE(SUM(supply_count), 0) FROM vw_supply_talent"))).scalar()
    demand = (await db.execute(text("SELECT COALESCE(SUM(demand_count), 0) FROM vw_demand_jobs"))).scalar()
    total_supply = int(supply or 0)
    total_demand = int(demand or 0)
    gap = total_supply - total_demand
    sgi = round(total_supply / max(total_demand, 1), 3)

    # Top shortages (demand > supply)
    shortage_rows = (await db.execute(text("""
        SELECT occupation, code_isco,
               COALESCE(SUM(supply_count), 0) as supply,
               COALESCE(SUM(demand_count), 0) as demand
        FROM vw_gap_cube
        WHERE occupation IS NOT NULL
        GROUP BY occupation, code_isco
        HAVING COALESCE(SUM(demand_count), 0) > COALESCE(SUM(supply_count), 0)
        ORDER BY (COALESCE(SUM(supply_count), 0) - COALESCE(SUM(demand_count), 0)) ASC
        LIMIT 15
    """))).fetchall()

    top_shortages = [{
        "occupation": r[0], "code_isco": r[1],
        "supply": int(r[2]), "demand": int(r[3]),
        "gap": int(r[2]) - int(r[3]),
    } for r in shortage_rows]

    # Top surpluses
    surplus_rows = (await db.execute(text("""
        SELECT occupation, code_isco,
               COALESCE(SUM(supply_count), 0) as supply,
               COALESCE(SUM(demand_count), 0) as demand
        FROM vw_gap_cube
        WHERE occupation IS NOT NULL
        GROUP BY occupation, code_isco
        HAVING COALESCE(SUM(supply_count), 0) > COALESCE(SUM(demand_count), 0)
        ORDER BY (COALESCE(SUM(supply_count), 0) - COALESCE(SUM(demand_count), 0)) DESC
        LIMIT 10
    """))).fetchall()

    top_surpluses = [{
        "occupation": r[0], "code_isco": r[1],
        "supply": int(r[2]), "demand": int(r[3]),
        "gap": int(r[2]) - int(r[3]),
    } for r in surplus_rows]

    # By emirate
    emirate_rows = (await db.execute(text("""
        SELECT emirate, region_code,
               COALESCE(SUM(supply_count), 0),
               COALESCE(SUM(demand_count), 0)
        FROM vw_gap_cube
        WHERE emirate IS NOT NULL
        GROUP BY emirate, region_code
        ORDER BY COALESCE(SUM(supply_count), 0) DESC
    """))).fetchall()

    emirate_data = [{
        "emirate": r[0], "supply": int(r[2]), "demand": int(r[3]),
        "gap": int(r[2]) - int(r[3]),
        "sgi": round(int(r[2]) / max(int(r[3]), 1), 2),
    } for r in emirate_rows]

    return {
        "title_en": "Executive Summary",
        "subtitle_en": "UAE Labour Market Intelligence Report",
        "total_supply": total_supply,
        "total_demand": total_demand,
        "gap": gap,
        "sgi": sgi,
        "top_shortages": top_shortages,
        "top_surpluses": top_surpluses,
        "emirate_data": emirate_data,
    }


async def _collect_skill_gap(filters: dict, db: AsyncSession) -> dict:
    rows = (await db.execute(text("""
        SELECT occupation, code_isco,
               COALESCE(SUM(supply_count), 0) as supply,
               COALESCE(SUM(demand_count), 0) as demand,
               AVG(ai_exposure_score) as ai_exp
        FROM vw_gap_cube
        WHERE occupation IS NOT NULL
        GROUP BY occupation, code_isco
        ORDER BY (COALESCE(SUM(supply_count), 0) - COALESCE(SUM(demand_count), 0)) ASC
        LIMIT 50
    """))).fetchall()

    occupations = [{
        "occupation": r[0], "code_isco": r[1],
        "supply": int(r[2]), "demand": int(r[3]),
        "gap": int(r[2]) - int(r[3]),
        "sgi": round(int(r[2]) / max(int(r[3]), 1), 2),
        "ai_exposure": round(float(r[4]), 1) if r[4] else None,
    } for r in rows]

    critical = sum(1 for o in occupations if o["gap"] < -500)
    surplus = sum(1 for o in occupations if o["gap"] > 0)

    return {
        "title_en": "Skill Gap Analysis",
        "subtitle_en": "Supply-Demand Gap by Occupation",
        "occupations": occupations,
        "total_occupations": len(occupations),
        "total_sectors": 21,
        "critical_count": critical,
        "surplus_count": surplus,
        "overall_sgi": round(sum(o["supply"] for o in occupations) / max(sum(o["demand"] for o in occupations), 1), 2),
    }


async def _collect_emiratisation(filters: dict, db: AsyncSession) -> dict:
    rows = (await db.execute(text("""
        SELECT nationality, COALESCE(SUM(supply_count), 0) as cnt
        FROM vw_supply_talent
        WHERE nationality IS NOT NULL
        GROUP BY nationality
    """))).fetchall()

    total = sum(int(r[1]) for r in rows) or 1
    emirati = sum(int(r[1]) for r in rows if r[0] and "citizen" in str(r[0]).lower())
    expat = total - emirati

    by_nationality = [{
        "nationality": r[0] or "Unknown",
        "count": int(r[1]),
        "pct": round(int(r[1]) / total * 100, 1),
    } for r in rows]

    # By sector
    sector_rows = (await db.execute(text("""
        SELECT sector,
               COALESCE(SUM(supply_count), 0) as total,
               COALESCE(SUM(CASE WHEN nationality = 'citizen' THEN supply_count ELSE 0 END), 0) as emirati
        FROM vw_supply_talent
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY total DESC
        LIMIT 15
    """))).fetchall()

    by_sector = [{
        "sector": r[0],
        "total": int(r[1]),
        "emirati": int(r[2]),
        "pct": round(int(r[2]) / max(int(r[1]), 1) * 100, 1),
    } for r in sector_rows]

    return {
        "title_en": "Emiratisation Progress Report",
        "subtitle_en": "UAE National Workforce Participation",
        "total_workforce": total,
        "emirati_count": emirati,
        "expat_count": expat,
        "emiratisation_rate": round(emirati / total * 100, 1),
        "by_nationality": by_nationality,
        "by_sector": by_sector,
    }


async def _collect_ai_risk(filters: dict, db: AsyncSession) -> dict:
    rows = (await db.execute(text("""
        SELECT occupation, code_isco,
               AVG(exposure_0_100) as avg_exp,
               AVG(automation_probability) as avg_auto,
               AVG(llm_exposure) as avg_llm
        FROM vw_ai_impact
        WHERE occupation IS NOT NULL
        GROUP BY occupation, code_isco
        ORDER BY avg_exp DESC NULLS LAST
    """))).fetchall()

    all_data = [{
        "occupation": r[0], "code_isco": r[1],
        "exposure": round(float(r[2] or 0), 1),
        "automation": round(float(r[3] or 0), 3),
        "llm_exposure": round(float(r[4] or 0), 3) if r[4] else None,
    } for r in rows]

    high_risk = [d for d in all_data if d["exposure"] > 70]
    medium_risk = [d for d in all_data if 30 <= d["exposure"] <= 70]
    low_risk = [d for d in all_data if d["exposure"] < 30]

    return {
        "title_en": "AI Risk Assessment",
        "subtitle_en": "Automation & AI Exposure Analysis",
        "total_assessed": len(all_data),
        "high_risk_count": len(high_risk),
        "medium_risk_count": len(medium_risk),
        "low_risk_count": len(low_risk),
        "top_exposed": all_data[:25],
        "lowest_exposed": all_data[-10:] if len(all_data) > 10 else [],
    }
