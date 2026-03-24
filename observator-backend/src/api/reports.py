"""Report generation endpoints — JSON and PDF formats."""
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.middleware.rbac import require_permission
from src.schemas.reports import ReportOut, ReportRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])

REPORT_TYPES = {"executive", "skill_gap", "emiratisation", "ai_risk"}


@router.post("")
async def generate_report(
    body: ReportRequest,
    user=require_permission("export"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a report. Returns JSON by default, PDF if format='pdf'."""
    if body.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Use: {', '.join(REPORT_TYPES)}")

    report_id = str(uuid4())[:12]
    title = f"{body.report_type.replace('_', ' ').title()} Report"
    now = datetime.now(timezone.utc)

    if body.format == "pdf":
        # Generate PDF
        from src.reporting.pdf_generator import generate_pdf
        try:
            pdf_bytes = await generate_pdf(body.report_type, body.filters or {}, db)
        except Exception as e:
            logger.error(f"PDF generation failed: {e}")
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

        filename = f"observator_{body.report_type}_{now.strftime('%Y%m%d')}.pdf"

        # Detect if we got HTML fallback (WeasyPrint not installed)
        content_type = "application/pdf"
        if pdf_bytes[:5] == b"<!DOC":
            content_type = "text/html"
            filename = filename.replace(".pdf", ".html")

        return Response(
            content=pdf_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    # JSON format (default)
    data = await _build_report(body.report_type, body.filters or {}, db)

    return ReportOut(
        report_id=report_id,
        report_type=body.report_type,
        title=title,
        status="ready",
        created_at=now,
        data=data,
    )


@router.get("/types")
async def list_report_types(user=Depends(get_current_user)):
    """List available report types."""
    return [
        {"id": "executive", "title": "Executive Summary", "description": "High-level labour market overview", "formats": ["json", "pdf"]},
        {"id": "skill_gap", "title": "Skill Gap Analysis", "description": "Detailed supply-demand gap by occupation", "formats": ["json", "pdf"]},
        {"id": "emiratisation", "title": "Emiratisation Progress", "description": "National workforce participation metrics", "formats": ["json", "pdf"]},
        {"id": "ai_risk", "title": "AI Risk Assessment", "description": "Automation and AI exposure analysis", "formats": ["json", "pdf"]},
    ]


async def _build_report(report_type: str, filters: dict, db: AsyncSession) -> dict:
    """Build report data from materialized views (JSON format)."""
    if report_type == "executive":
        supply = (await db.execute(text("SELECT COALESCE(SUM(supply_count), 0) FROM vw_supply_talent"))).scalar()
        demand = (await db.execute(text("SELECT COALESCE(SUM(demand_count), 0) FROM vw_demand_jobs"))).scalar()
        return {
            "total_supply": int(supply or 0),
            "total_demand": int(demand or 0),
            "gap": int((supply or 0) - (demand or 0)),
            "sgi": round(int(supply or 0) / max(int(demand or 1), 1), 3),
        }

    elif report_type == "skill_gap":
        rows = (await db.execute(text("""
            SELECT occupation, code_isco,
                   COALESCE(SUM(supply_count), 0),
                   COALESCE(SUM(demand_count), 0)
            FROM vw_gap_cube
            WHERE occupation IS NOT NULL
            GROUP BY occupation, code_isco
            ORDER BY (COALESCE(SUM(supply_count), 0) - COALESCE(SUM(demand_count), 0)) ASC
            LIMIT 20
        """))).fetchall()
        return {
            "top_gaps": [
                {"occupation": r[0], "code_isco": r[1], "supply": int(r[2]), "demand": int(r[3]), "gap": int(r[2]) - int(r[3])}
                for r in rows
            ]
        }

    elif report_type == "emiratisation":
        rows = (await db.execute(text("""
            SELECT nationality, COALESCE(SUM(supply_count), 0) as cnt
            FROM vw_supply_talent
            WHERE nationality IS NOT NULL
            GROUP BY nationality
        """))).fetchall()
        return {
            "by_nationality": [{"nationality": r[0], "count": int(r[1])} for r in rows],
        }

    elif report_type == "ai_risk":
        rows = (await db.execute(text("""
            SELECT occupation, AVG(exposure_0_100), AVG(automation_probability)
            FROM vw_ai_impact
            WHERE occupation IS NOT NULL
            GROUP BY occupation
            ORDER BY AVG(exposure_0_100) DESC NULLS LAST
            LIMIT 20
        """))).fetchall()
        return {
            "top_exposed": [
                {"occupation": r[0], "exposure": round(float(r[1] or 0), 1), "automation": round(float(r[2] or 0), 3)}
                for r in rows
            ]
        }

    return {}
