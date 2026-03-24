"""Agent state definition."""
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State for the Observator agent graph."""
    # Core messages (LLM conversation)
    messages: Annotated[list[BaseMessage], add_messages]

    # User context
    user_id: str
    session_id: str

    # Dashboard filter context (passed from frontend)
    dashboard_filters: dict | None

    # Page context for scoped AI assistant (skill-gap, ai-impact, forecast, university)
    page_context: str | None

    # Evidence collection (filled by tools)
    evidence_ids: list[str]

    # Query plan compiled by the agent
    query_plan: dict | None

    # Whether web search tools are available for this session
    internet_enabled: bool

    # Iteration counter (prevent infinite loops)
    iteration: int

    # Upload context: info about recently uploaded datasets for the agent
    upload_context: dict | None
