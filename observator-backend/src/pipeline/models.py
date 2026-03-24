"""ORM models for pipeline run tracking and step-level logging."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin


class PipelineRun(Base, TimestampMixin):
    """Top-level record for a single pipeline execution."""

    __tablename__ = "pipeline_run"

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str | None] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | running | completed | failed | cancelled
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    current_step: Mapped[str | None] = mapped_column(String(100))
    steps_completed: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    errors: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    result_summary: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()

    # Relationship to step logs
    step_logs: Mapped[list["PipelineStepLog"]] = relationship(
        "PipelineStepLog", back_populates="run", cascade="all, delete-orphan"
    )


class PipelineStepLog(Base):
    """Per-agent execution log within a pipeline run."""

    __tablename__ = "pipeline_step_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("pipeline_run.run_id", ondelete="CASCADE"), index=True
    )
    agent_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | running | completed | failed | skipped
    input_summary: Mapped[dict | None] = mapped_column(JSONB)
    output_summary: Mapped[dict | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()

    # Back-reference
    run: Mapped["PipelineRun"] = relationship("PipelineRun", back_populates="step_logs")
