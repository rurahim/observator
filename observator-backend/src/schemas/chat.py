"""Chat schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: UUID | None = None
    dashboard_state: dict | None = None
    selected_files: list[str] | None = None
    page_context: str | None = None
    internet_search: bool = False
    self_knowledge: bool = False
    upload_context: dict | None = None
    stateless: bool = False  # Skip checkpointer — for auto-generated analysis calls


class Citation(BaseModel):
    evidence_id: str
    source: str
    excerpt: str
    location: str | None = None
    source_type: str = "internal"
    source_url: str | None = None
    retrieved_at: datetime | None = None


class ChatResponse(BaseModel):
    message: str
    session_id: UUID
    citations: list[Citation] = []
    dashboard_patch: dict | None = None
    trace_id: str | None = None


class ChatSessionOut(BaseModel):
    session_id: UUID
    title: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    message_count: int = 0

    model_config = {"from_attributes": True}


class ChatMessageOut(BaseModel):
    message_id: UUID
    role: str
    content: str
    citations: list[Citation] = []
    created_at: datetime

    model_config = {"from_attributes": True}
