"""Chat endpoints — LangGraph agent integration."""
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.dependencies import get_db, get_session_factory
from src.middleware.auth import get_current_user
from src.models.auth import User
from src.models.evidence import ChatMessage, ChatSession
from src.schemas.chat import ChatMessageOut, ChatRequest, ChatResponse, ChatSessionOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Process a chat message via LangGraph agent."""
    session_id = body.session_id or uuid4()
    trace_id = str(uuid4())
    response_text = ""

    # Run LangGraph agent if OpenAI key is configured
    if settings.OPENAI_API_KEY:
        try:
            from src.agent.executor import run_agent
            agent_result = await run_agent(
                message=body.message,
                user_id=str(user.user_id),
                session_id=str(session_id),
                db=db,
                dashboard_filters=body.dashboard_state,
                page_context=body.page_context,
                internet_enabled=body.internet_search,
                upload_context=body.upload_context,
            )
            response_text = agent_result.get("message", "")
            trace_id = agent_result.get("trace_id", trace_id)
        except Exception as e:
            logger.error(f"Agent execution failed: {e}", exc_info=True)
            response_text = (
                "I encountered an error processing your query. "
                "Please try rephrasing or check the dashboard for insights."
            )
    else:
        response_text = (
            "The AI agent requires an OpenAI API key to be configured. "
            "Please set OPENAI_API_KEY in your environment. "
            "In the meantime, explore the dashboard, skill gap, and AI impact pages for insights."
        )

    # Save messages in a fresh session to avoid corrupted transaction state
    try:
        factory = get_session_factory()
        async with factory() as save_db:
            # Ensure session exists — commit first so FK works
            result = await save_db.execute(
                select(ChatSession).where(ChatSession.session_id == session_id)
            )
            if not result.scalar_one_or_none():
                save_db.add(ChatSession(
                    session_id=session_id,
                    user_id=user.user_id,
                    title=body.message[:100],
                ))
                await save_db.flush()

            # Save user + assistant messages
            save_db.add(ChatMessage(
                message_id=uuid4(),
                session_id=session_id,
                role="user",
                content=body.message,
            ))
            save_db.add(ChatMessage(
                message_id=uuid4(),
                session_id=session_id,
                role="assistant",
                content=response_text,
                trace_id=trace_id,
            ))
            await save_db.commit()
    except Exception as e:
        logger.warning(f"Failed to save chat messages: {e}")

    # Fetch citations from evidence store
    citations = []
    try:
        from src.evidence.linker import get_citations_for_trace
        citations = await get_citations_for_trace(db, trace_id)
    except Exception as e:
        logger.warning(f"Failed to fetch citations: {e}")

    return ChatResponse(
        message=response_text,
        session_id=session_id,
        citations=citations,
        trace_id=trace_id,
    )


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's chat sessions."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user.user_id)
        .order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()

    out = []
    for s in sessions:
        count_result = await db.execute(
            select(func.count()).where(ChatMessage.session_id == s.session_id)
        )
        msg_count = count_result.scalar() or 0
        out.append(ChatSessionOut(
            session_id=s.session_id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at if hasattr(s, "updated_at") else None,
            message_count=msg_count,
        ))

    return out


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def get_session_messages(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all messages in a chat session."""
    session_result = await db.execute(
        select(ChatSession).where(
            ChatSession.session_id == session_id,
            ChatSession.user_id == user.user_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chat session not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()

    return [
        ChatMessageOut(
            message_id=m.message_id,
            role=m.role,
            content=m.content,
            citations=[],
            created_at=m.created_at,
        )
        for m in messages
    ]
