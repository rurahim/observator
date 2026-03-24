"""Langfuse tracing utilities for the Observator agent.

Provides full observability: every LLM call, tool invocation, tool response,
agent iteration, and final output is captured as a hierarchical trace.

Uses Langfuse v4 with:
- @observe decorator for function-level spans (agent executor, tool calls)
- CallbackHandler for LangChain/LangGraph LLM generation spans
- Manual spans for custom metadata (user_id, session_id, page_context)
"""
import logging
from uuid import uuid4

from src.config import settings

logger = logging.getLogger(__name__)

_langfuse_available: bool | None = None


def _init_langfuse():
    """Initialize Langfuse client with env vars (called once)."""
    import os
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.LANGFUSE_SECRET_KEY)
    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.LANGFUSE_PUBLIC_KEY)
    os.environ.setdefault("LANGFUSE_HOST", settings.LANGFUSE_BASE_URL)


def is_langfuse_available() -> bool:
    """Check if Langfuse is configured and importable."""
    global _langfuse_available
    if _langfuse_available is not None:
        return _langfuse_available

    if not settings.LANGFUSE_ENABLED:
        logger.info("Langfuse disabled via LANGFUSE_ENABLED=false")
        _langfuse_available = False
        return False

    if not settings.LANGFUSE_SECRET_KEY or not settings.LANGFUSE_PUBLIC_KEY:
        logger.info("Langfuse not configured — set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY")
        _langfuse_available = False
        return False

    try:
        import langfuse  # noqa: F401
        _init_langfuse()
        _langfuse_available = True
        logger.info(f"Langfuse tracing enabled → {settings.LANGFUSE_BASE_URL}")
        return True
    except ImportError:
        logger.info("Langfuse package not installed — tracing disabled")
        _langfuse_available = False
        return False


def create_callback_handler(
    *,
    user_id: str,
    session_id: str,
    trace_id: str | None = None,
    page_context: str | None = None,
    tags: list[str] | None = None,
    metadata: dict | None = None,
):
    """Create a Langfuse CallbackHandler for LangChain/LangGraph.

    This captures ALL LLM calls, tool calls, and chain runs automatically.
    The handler is passed via config["callbacks"] to the LangGraph agent.

    Traced details:
    - LLM generations: model, prompt, completion, tokens, latency
    - Tool calls: tool name, arguments, response
    - Chain runs: agent iterations, routing decisions

    Returns None if Langfuse is not available.
    """
    if not is_langfuse_available():
        return None

    try:
        from langfuse.langchain import CallbackHandler
        from langfuse import get_client

        # Langfuse v4 requires 32 lowercase hex chars (no dashes)
        final_trace_id = (trace_id or str(uuid4())).replace("-", "")

        final_tags = ["observator"]
        if tags:
            final_tags.extend(tags)
        if page_context:
            final_tags.append(f"page:{page_context}")

        final_metadata = metadata or {}
        final_metadata["user_id"] = user_id
        final_metadata["session_id"] = session_id
        if page_context:
            final_metadata["page_context"] = page_context

        # Langfuse v4: CallbackHandler with trace_context
        handler = CallbackHandler(
            trace_context={"trace_id": final_trace_id},
        )

        # Create a root observation to hold metadata for this trace
        client = get_client()
        root_span = client.start_observation(
            trace_context={"trace_id": final_trace_id},
            name="agent-session",
            as_type="agent",
            input={
                "user_id": user_id,
                "session_id": session_id,
                "page_context": page_context,
                "tags": final_tags,
            },
            metadata=final_metadata,
        )
        root_span.end()

        logger.debug(f"Langfuse handler created: trace_id={final_trace_id}")
        return handler
    except Exception as e:
        logger.warning(f"Failed to create Langfuse callback: {e}")
        return None


def score_trace(
    trace_id: str,
    name: str,
    value: float,
    comment: str | None = None,
    data_type: str = "NUMERIC",
) -> bool:
    """Send a score to Langfuse for a given trace.

    Returns True if scored successfully, False otherwise.
    """
    if not is_langfuse_available():
        return False

    try:
        from langfuse import get_client
        client = get_client()
        client.create_score(
            trace_id=trace_id,
            name=name,
            value=value,
            data_type=data_type,
            comment=comment,
        )
        logger.debug(f"Langfuse score: trace={trace_id} {name}={value}")
        return True
    except Exception as e:
        logger.warning(f"Langfuse scoring failed: {e}")
        return False


def flush_langfuse():
    """Flush any pending Langfuse events. Call after agent completes."""
    if not is_langfuse_available():
        return
    try:
        from langfuse import get_client
        get_client().flush()
    except Exception:
        pass


def log_langfuse_status():
    """Log Langfuse configuration status at startup."""
    if is_langfuse_available():
        logger.info(
            f"Langfuse tracing ACTIVE — "
            f"host={settings.LANGFUSE_BASE_URL}, "
            f"public_key={settings.LANGFUSE_PUBLIC_KEY[:12]}..."
        )
    else:
        reasons = []
        if not settings.LANGFUSE_ENABLED:
            reasons.append("disabled")
        elif not settings.LANGFUSE_SECRET_KEY:
            reasons.append("no LANGFUSE_SECRET_KEY")
        elif not settings.LANGFUSE_PUBLIC_KEY:
            reasons.append("no LANGFUSE_PUBLIC_KEY")
        else:
            reasons.append("package not installed")
        logger.warning(f"Langfuse tracing INACTIVE — {', '.join(reasons)}")
