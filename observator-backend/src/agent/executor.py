"""Agent executor — runs the compiled graph against user messages.

Sets up the DB session for tools, runs the LangGraph agent, and
collects evidence from query results.
"""
import json
import logging
from uuid import uuid4

from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from sqlalchemy.ext.asyncio import AsyncSession

from src.agent.graph import compile_agent
from src.agent.state import AgentState
from src.agent.tools import set_db_session
from src.agent.tracing import create_callback_handler, flush_langfuse
from src.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton checkpointer for session memory persistence.
# Uses AsyncSqliteSaver (cross-platform, no event-loop issues on Windows).
# For production on Linux, can be swapped to AsyncPostgresSaver.
_checkpointer: AsyncSqliteSaver | None = None
_checkpointer_cm = None  # Keep context manager alive

# Checkpoint DB stored alongside the backend source
_CHECKPOINT_DB = str(Path(__file__).resolve().parents[2] / "checkpoints.db")


async def get_checkpointer() -> AsyncSqliteSaver:
    """Get or create the singleton AsyncSqliteSaver checkpointer."""
    global _checkpointer, _checkpointer_cm
    if _checkpointer is None:
        _checkpointer_cm = AsyncSqliteSaver.from_conn_string(_CHECKPOINT_DB)
        _checkpointer = await _checkpointer_cm.__aenter__()
        logger.info(f"AsyncSqliteSaver checkpointer initialized: {_CHECKPOINT_DB}")
    return _checkpointer


async def close_checkpointer() -> None:
    """Close the checkpointer. Called on app shutdown."""
    global _checkpointer, _checkpointer_cm
    if _checkpointer_cm is not None:
        try:
            await _checkpointer_cm.__aexit__(None, None, None)
        except Exception:
            pass
        _checkpointer_cm = None
        _checkpointer = None
        logger.info("AsyncSqliteSaver checkpointer closed")


async def run_agent(
    message: str,
    user_id: str,
    session_id: str,
    db: AsyncSession,
    dashboard_filters: dict | None = None,
    page_context: str | None = None,
    internet_enabled: bool = False,
    checkpointer=None,
    upload_context: dict | None = None,
) -> dict:
    """Run the agent on a user message and return the response.

    Returns:
        {
            "message": str,
            "evidence_ids": list,
            "trace_id": str,
            "data": list[dict] | None,
        }
    """
    # Give the tools access to the DB session
    set_db_session(db)

    # Use the singleton checkpointer if none provided
    if checkpointer is None:
        try:
            checkpointer = await get_checkpointer()
        except Exception as e:
            logger.warning(f"Checkpointer init failed, running without memory: {e}")

    agent = compile_agent(checkpointer=checkpointer)
    trace_id = uuid4().hex  # 32 hex chars, no dashes (Langfuse requirement)

    config = {
        "configurable": {"thread_id": session_id},
        "recursion_limit": 25,
    }

    # Add Langfuse tracing if configured
    handler = create_callback_handler(
        user_id=user_id,
        session_id=session_id,
        trace_id=trace_id,
        page_context=page_context,
        tags=["query-agent"],
        metadata={"dashboard_filters": dashboard_filters},
    )
    if handler:
        config["callbacks"] = [handler]

    input_state: AgentState = {
        "messages": [HumanMessage(content=message)],
        "user_id": user_id,
        "session_id": session_id,
        "dashboard_filters": dashboard_filters,
        "page_context": page_context,
        "internet_enabled": internet_enabled,
        "evidence_ids": [],
        "query_plan": None,
        "iteration": 0,
        "upload_context": upload_context,
    }

    # Run the agent
    result = await agent.ainvoke(input_state, config)

    # Extract the final AI response
    messages = result.get("messages", [])
    response_text = ""
    query_data = None

    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            response_text = msg.content
            break

    # Extract last query data from tool messages
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.content:
            try:
                parsed = json.loads(msg.content)
                if isinstance(parsed, dict) and parsed.get("status") == "ok":
                    query_data = parsed.get("data")
                    break
            except (json.JSONDecodeError, TypeError):
                pass

    if not response_text:
        response_text = (
            "I was unable to complete the analysis within the allowed steps. "
            "The data warehouse is available — try a more specific question like "
            "'Show me AI Engineer supply vs demand in Dubai' or "
            "'What is the SGI for Registered Nurses?'"
        )

    # Collect evidence from query data
    evidence_ids = list(result.get("evidence_ids", []))
    if query_data:
        try:
            from src.evidence.collector import collect_evidence

            # Determine source type from the last tool message
            source_type = "internal"
            source_url = None
            for msg in reversed(messages):
                if isinstance(msg, ToolMessage) and msg.content:
                    try:
                        parsed = json.loads(msg.content)
                        if isinstance(parsed, dict):
                            source_type = parsed.get("source_type", "internal")
                            source_url = parsed.get("url")
                            break
                    except (json.JSONDecodeError, TypeError):
                        pass

            eid = await collect_evidence(
                db,
                trace_id=trace_id,
                query_sql="agent query (compiled)",
                result_data=query_data,
                source_type=source_type,
                source_url=source_url,
                metadata={},
            )
            evidence_ids.append(eid)
        except Exception as e:
            logger.warning(f"Evidence collection failed: {e}")

    # Clear the shared DB session
    set_db_session(None)

    # Flush Langfuse traces to ensure they're sent
    flush_langfuse()

    return {
        "message": response_text,
        "evidence_ids": evidence_ids,
        "trace_id": trace_id,
        "data": query_data,
    }
