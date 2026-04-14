"""SSE streaming endpoint for the chat agent."""
import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.dependencies import get_db, get_session_factory
from src.middleware.auth import get_current_user
from src.models.auth import User
from src.models.evidence import ChatMessage, ChatSession
from src.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat-stream"])


@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream agent response via Server-Sent Events."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Get or create session
    if body.session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.session_id == body.session_id,
                ChatSession.user_id == user.user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            # Create on-the-fly with the provided UUID (for frontend-generated session IDs)
            session = ChatSession(
                session_id=body.session_id,
                user_id=user.user_id,
                title=body.message[:100],
            )
            db.add(session)
            await db.flush()
    else:
        session = ChatSession(
            session_id=uuid4(),
            user_id=user.user_id,
            title=body.message[:100],
        )
        db.add(session)
        await db.flush()

    # Save user message
    user_msg = ChatMessage(
        message_id=uuid4(),
        session_id=session.session_id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()
    await db.commit()

    session_id = str(session.session_id)
    user_id = str(user.user_id)

    async def event_generator():
        """Generate SSE events from agent stream.

        Creates its own DB session so tools can query the warehouse
        throughout the stream's lifetime.
        """
        from langchain_core.messages import AIMessageChunk, HumanMessage
        from src.agent.executor import get_checkpointer
        from src.agent.graph import compile_agent
        from src.agent.state import AgentState
        from src.agent.tools import set_db_session, set_current_session_id
        from src.agent.tracing import create_callback_handler, flush_langfuse
        from src.evidence.linker import get_citations_for_trace

        # Yield immediately to establish the SSE connection
        yield _sse_event("status", {"message": "connecting"})

        # Create a dedicated DB session for the agent tools
        factory = get_session_factory()
        try:
            async with factory() as agent_db:
                set_db_session(agent_db)
                set_current_session_id(str(session_id) if session_id else None)

                try:
                    # Get checkpointer for session memory persistence
                    checkpointer = None
                    try:
                        checkpointer = await get_checkpointer()
                    except Exception as e:
                        logger.warning(f"Checkpointer init failed for stream: {e}")

                    agent = compile_agent(checkpointer=checkpointer)
                    trace_id = uuid4().hex

                    config = {
                        "configurable": {"thread_id": session_id},
                        "recursion_limit": 25,
                    }

                    # Add Langfuse tracing if configured
                    handler = create_callback_handler(
                        user_id=user_id,
                        session_id=session_id,
                        trace_id=trace_id,
                        page_context=body.page_context,
                        tags=["stream"],
                        metadata={"dashboard_filters": body.dashboard_state},
                    )
                    if handler:
                        config["callbacks"] = [handler]

                    input_state: AgentState = {
                        "messages": [HumanMessage(content=body.message)],
                        "user_id": user_id,
                        "session_id": session_id,
                        "dashboard_filters": body.dashboard_state,
                        "page_context": body.page_context,
                        "internet_enabled": body.internet_search,
                        "evidence_ids": [],
                        "query_plan": None,
                        "iteration": 0,
                        "upload_context": body.upload_context,
                    }

                    # Send session info
                    yield _sse_event("session", {"session_id": session_id, "trace_id": trace_id})

                    full_response = ""

                    try:
                        async for part in agent.astream(input_state, config, stream_mode="messages"):
                            if isinstance(part, tuple) and len(part) == 2:
                                chunk = part[0]
                            elif isinstance(part, dict) and "data" in part:
                                raw = part["data"]
                                chunk = raw[0] if isinstance(raw, tuple) else raw
                            elif hasattr(part, "data"):
                                raw = part.data
                                chunk = raw[0] if isinstance(raw, tuple) else raw
                            else:
                                chunk = part

                            if isinstance(chunk, AIMessageChunk) and chunk.content:
                                full_response += chunk.content
                                yield _sse_event("token", {"content": chunk.content})
                            elif isinstance(chunk, AIMessageChunk):
                                # Capture tool call chunks (args stream in incrementally)
                                # tool_call_chunks have 'index', 'name', 'args' (str), 'id'
                                if hasattr(chunk, 'tool_call_chunks') and chunk.tool_call_chunks:
                                    for tcc in chunk.tool_call_chunks:
                                        yield _sse_event("tool_call_delta", {
                                            "index": tcc.get("index", 0),
                                            "id": tcc.get("id", ""),
                                            "name": tcc.get("name", ""),
                                            "args_delta": tcc.get("args", ""),  # JSON string fragment
                                        })
                                # Also emit final tool_calls when complete
                                elif chunk.tool_calls:
                                    for tc in chunk.tool_calls:
                                        yield _sse_event("tool_call", {
                                            "name": tc.get("name", ""),
                                            "args": tc.get("args", {}),
                                            "id": tc.get("id", ""),
                                        })
                            # Detect ToolMessage results from modify_dashboard
                            elif hasattr(chunk, 'name') and chunk.name == 'modify_dashboard':
                                try:
                                    parsed = json.loads(chunk.content) if isinstance(chunk.content, str) else {}
                                    if 'dashboard_patch' in parsed:
                                        yield _sse_event("dashboard_patch", parsed["dashboard_patch"])
                                except Exception:
                                    pass

                    except Exception as e:
                        logger.error(f"Stream error: {e}", exc_info=True)
                        yield _sse_event("error", {"message": str(e)[:200]})

                    # Send done event
                    yield _sse_event("done", {"message": full_response, "trace_id": trace_id})

                    # Emit citations event after done
                    try:
                        citations = await get_citations_for_trace(agent_db, trace_id)
                        if citations:
                            yield _sse_event("citations", {
                                "citations": [c.model_dump(mode="json") for c in citations]
                            })
                    except Exception as e:
                        logger.warning(f"Failed to fetch citations for stream: {e}")

                    # Flush Langfuse traces
                    flush_langfuse()

                finally:
                    set_db_session(None)
                    set_current_session_id(None)

        except Exception as e:
            logger.error(f"Stream generator crashed: {e}", exc_info=True)
            yield _sse_event("error", {"message": f"Internal error: {str(e)[:150]}"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
