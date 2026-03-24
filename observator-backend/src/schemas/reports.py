"""Report schemas."""
from datetime import datetime

from pydantic import BaseModel, Field


class ReportRequest(BaseModel):
    report_type: str = Field(..., description="executive, skill_gap, emiratisation, ai_risk")
    filters: dict | None = None
    format: str = Field(default="json", description="json, pdf, csv")


class ReportOut(BaseModel):
    report_id: str
    report_type: str
    title: str
    status: str  # ready, generating, failed
    created_at: datetime | None = None
    data: dict | None = None
