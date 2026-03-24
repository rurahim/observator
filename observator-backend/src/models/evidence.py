from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class DatasetRegistry(Base, TimestampMixin):
    """Unified registry of all ingested datasets — single source of truth."""
    __tablename__ = "dataset_registry"

    dataset_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    filename: Mapped[str] = mapped_column(String(500))
    file_type: Mapped[str | None] = mapped_column(String(50))  # csv, xlsx, json, parquet, pdf
    file_size: Mapped[int | None]
    sha256: Mapped[str | None] = mapped_column(String(64))
    minio_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, processing, ready, failed
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    source_type: Mapped[str | None] = mapped_column(String(50))  # FCSC, MOHRE, ESCO, ONET, etc.
    row_count: Mapped[int | None]
    column_count: Mapped[int | None]
    metadata_json: Mapped[str | None] = mapped_column(Text)  # JSON string (Text for portability)
    uploaded_by: Mapped[str | None] = mapped_column(String(100))  # user email or ID
    error_message: Mapped[str | None] = mapped_column(Text)
    last_refreshed_at: Mapped[datetime | None] = mapped_column()
    refresh_interval_hours: Mapped[int | None] = mapped_column(Integer)
    quality_score: Mapped[float | None] = mapped_column(Float)


class Notification(Base):
    """System notifications (pipeline completions, alerts)."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class PipelineRun(Base):
    """Pipeline execution tracking."""
    __tablename__ = "pipeline_runs"

    run_id: Mapped[str] = mapped_column(Text, primary_key=True)
    dataset_id: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[str] = mapped_column(Text, default="manual")
    status: Mapped[str] = mapped_column(Text, default="pending")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    current_step: Mapped[str | None] = mapped_column(Text)
    completed_agents: Mapped[dict | None] = mapped_column(JSONB, default=list)
    errors: Mapped[dict | None] = mapped_column(JSONB, default=list)
    step_timings: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    result_summary: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    options: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    file_path: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()


class PipelineStepLog(Base):
    """Per-agent step logging for pipeline runs."""
    __tablename__ = "pipeline_step_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(Text, ForeignKey("pipeline_runs.run_id"))
    agent_name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending")
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column()


class EvidenceStore(Base, TimestampMixin):
    __tablename__ = "evidence_store"
    __table_args__ = (
        Index("ix_evidence_trace", "trace_id"),
    )

    evidence_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    trace_id: Mapped[str | None] = mapped_column(String(64))
    dataset_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("dataset_registry.dataset_id"))
    query_sql: Mapped[str | None] = mapped_column(Text)
    result_hash: Mapped[str | None] = mapped_column(String(64))
    result_summary: Mapped[str | None] = mapped_column(Text)
    row_count: Mapped[int | None]
    citation_label: Mapped[str | None] = mapped_column(String(200))
    source_type: Mapped[str] = mapped_column(String(30), default="internal")  # internal, web_search, job_search, webpage
    source_url: Mapped[str | None] = mapped_column(String(2000))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)


class ChatSession(Base, TimestampMixin):
    __tablename__ = "chat_sessions"

    session_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id"))
    title: Mapped[str | None] = mapped_column(String(300))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_msg_session", "session_id", "created_at"),
    )

    message_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("chat_sessions.session_id"))
    role: Mapped[str] = mapped_column(String(20))  # user, assistant, system, tool
    content: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[dict | None] = mapped_column(JSONB)
    evidence_ids: Mapped[list | None] = mapped_column(JSONB)  # list of evidence_id refs
    trace_id: Mapped[str | None] = mapped_column(String(64))
    token_count: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(default=func.now())
