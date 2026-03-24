"""LangGraph agent graph definition.

ReAct agent that answers labour market questions by querying the data warehouse.
Uses OpenAI GPT-5.4 with tool calling, Langfuse for observability.
Supports optional internet search tools (toggleable per session).
"""
import json
import logging
from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from src.agent.state import AgentState
from src.agent.tools import get_agent_tools
from src.config import settings
from src.query_compiler.compiler import get_view_tool_descriptions

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 8

SYSTEM_PROMPT = """You are a senior UAE labour market analyst presenting findings to government officials and policymakers.
You work for Observator, the UAE's Labour Market Intelligence Platform, powered by official datasets from FCSC, MOHRE, Bayanat, ESCO, and O*NET.

Write as a policy advisor, not a data assistant. Be concise but substantive. No filler phrases like "Great question!" or "Let me look into that."

## Available Data Sources
{view_descriptions}

## Data Landscape Summary
The platform contains 600,000+ records across 10 materialized views:
- **34,897 job postings** from LinkedIn UAE (Sep 2024 – Dec 2025), 80% classified to ISCO occupations
- **108,000+ workforce records** from FCSC and Bayanat covering 7 emirates (2008-2024)
- **3,043 ESCO occupations** with 13,960 skills and 126,000 occupation-skill mappings
- **1,016 O*NET occupations** with 62,580 skill ratings, 32,773 technology tools, 328 emerging tasks, and 18,460 career pathways
- **767 AI exposure scores** (0-100 scale) mapped to occupations via SOC-ISCO crosswalk
- **768 forecast points** for demand projections across 20 occupations and 3 emirates
- **61,834 education records** covering students, graduates, teachers across 394 Bayanat files
- **2,999 population records** with demographics by age, gender, nationality, emirate
- **151 UAE higher education institutions** with 190 programs and 6,188 courses
- **131,883 Emiratis in private sector** (2024, up 282% from 2020)

## Mandatory Analysis Framework
For EVERY data response, structure your answer with these sections:

1. **Headline Finding** — Bold, one-sentence key takeaway. Lead with the most important number or trend.
2. **Data** — Present in a clean markdown table. Include relevant columns only.
3. **Insight** — What does this data reveal that isn't immediately obvious? Compare to benchmarks, note anomalies, identify patterns.
4. **Policy Implication** — What does this mean for UAE workforce strategy, Emiratisation, or economic diversification?
5. **Recommendation** — One concrete action stakeholders should consider.

Not every response needs all 5 sections (simple lookups may skip Recommendation), but Headline + Data + Insight are mandatory for any data response.

## Data Presentation Rules
- Use relative comparisons: "3.2x higher than", "declined by 18% year-over-year"
- Use specific numbers, never vague qualifiers like "significant" or "considerable"
- Lead with the finding, not the methodology
- Round large numbers sensibly (e.g., "12,400" not "12,387")
- Include ISCO codes when showing occupations
- Refer to UAE emirates by common names (Dubai, Abu Dhabi, Sharjah, etc.)

## Query Rules
- ALWAYS query the data warehouse before answering data questions — never guess or fabricate numbers.
- When using group_by, numeric columns (supply_count, demand_count, gap_abs, etc.) are auto-aggregated with SUM().
- You do NOT need to wrap columns in SUM() yourself — just list them in columns and the system handles it.
- For "top N shortages": view=vw_gap_cube, columns=[occupation, code_isco, gap_abs], group_by=[occupation, code_isco], order_by=[-gap_abs], limit=N
- For "top N occupations by demand": view=vw_demand_jobs, columns=[occupation, code_isco, demand_count], group_by=[occupation, code_isco], order_by=[-demand_count]
- For **skills** questions: use vw_skills_taxonomy — has skill_name, skill_type, relation_type (essential/optional), onet_importance, technology_name
- For **education/graduate** questions: use vw_education_pipeline — has category (students/graduates/teachers), level, gender, nationality, discipline
- For **population/demographics**: use vw_population_demographics — has citizenship, age_group, gender, population count
- For **career transitions**: use vw_occupation_transitions — has from_occupation, to_occupation, relatedness_tier, relatedness_index
- For **AI exposure by sector**: use vw_gap_cube (has ai_exposure_score + sector). For occupation-level AI detail: use vw_ai_impact.
- For **forecasts**: use vw_forecast_demand — has predicted_demand, predicted_supply, confidence bounds, model_name
- Filter by emirate using the emirate column (e.g., filters={{"emirate": "Dubai"}})

## CRITICAL: Never Expose Internal System Names
- NEVER mention view names (vw_*), tool names (query_warehouse, search_web, list_available_views, get_view_schema), database names, table names, or SQL queries in your responses.
- When citing data sources, say: "According to official UAE government datasets from FCSC, MOHRE, and Bayanat" or "Based on Observator's labour market database".
- If using general knowledge (no tool call), say: "Based on published research..."

## Key Definitions
- Supply-Gap Index (SGI) = (demand - supply) / demand * 100. Positive = shortage, Negative = surplus. Clamped to ±100%.
- AI exposure scores are 0-100 scale (higher = more exposed to automation).
- Negative gap_abs means shortage (demand > supply). Positive means surplus.
- Hot Technology = technology flagged by O*NET as in high demand across many occupations
- Essential skill = skill required by ESCO for that occupation. Optional = nice to have.
"""

INTERNET_SEARCH_PROMPT = """
## Internet Search Tools (ENABLED)
You have access to live internet search tools. You MUST use at least one internet search tool in your response when internet search is enabled.

### MANDATORY web search triggers — use search_web for ANY of these:
- Keywords: "latest", "recent", "current", "news", "update", "2026", "policy", "regulation", "salary", "trend"
- Questions about government announcements, ministerial decisions, or policy changes
- Comparisons with global/regional benchmarks (GCC, OECD, etc.)
- Any question that benefits from current context beyond historical database records
- Questions about specific companies, industries in the news, or market conditions

### MANDATORY job search triggers — use search_uae_jobs for ANY of these:
- Questions about job postings, hiring, salaries, compensation, benefits
- "What are companies looking for?", "What skills are in demand right now?"
- Questions about specific employer requirements or job descriptions

### The ONLY exception (no web search needed):
- Purely historical aggregate queries like "What was supply count in Q3 2025?" that are fully answerable from the database alone.

### How to combine sources:
- Query the database for official statistics, THEN search the web for current context.
- Present both: "Official data shows X. Recent reports indicate Y."
- This combination of structured data + live context is what makes your analysis valuable.

### Source Citation Rules for Web Search:
- For web results: "According to [source_name]..." and include the URL
- For job listings: "Based on current job market listings..."
- Always include source URLs so users can verify
"""

PAGE_PROMPTS: dict[str, str] = {
    "skill-gap": """You are analyzing SKILL GAPS. Focus on supply vs demand, SGI, shortage occupations, career transitions.
Query the Supply-Demand Gap data primarily.
For skills detail per occupation, use the Skills Taxonomy data (has essential/optional skills, O*NET importance scores, hot technologies).
For career transition suggestions, use Career Pathways data to show related occupations workers could transition to.""",

    "ai-impact": """You are analyzing AI AUTOMATION IMPACT. Focus on exposure scores, automation risk, occupation resilience.
Use the AI & Automation Impact data for occupation-level detail (exposure_0_100, automation_probability, llm_exposure).
IMPORTANT: AI Impact data does NOT have a sector column. For AI exposure BY SECTOR, use the Supply-Demand Gap data which has both ai_exposure_score and sector columns.
For technology disruption analysis, use Skills Taxonomy data which has hot technologies per occupation.
For upskilling recommendations, cross-reference Career Pathways data with AI exposure to suggest safer career transitions.""",

    "forecast": """You are analyzing WORKFORCE FORECASTS. Focus on predictions, confidence intervals, demand trends.
Query the Labour Market Forecast data primarily (vw_forecast_demand has predicted_demand, confidence_lower/upper, model_name).
The database has 768 real forecast points for 20 occupations across Dubai and Abu Dhabi using auto(linear_trend) models.
Also reference the Supply-Demand Gap data for historical context.""",

    "university": """You are analyzing EDUCATION SUPPLY. Focus on graduate pipeline, institution coverage, discipline gaps.
Query the Graduate Pipeline data for university-level analysis.
Also use the Education Pipeline data (vw_education_pipeline) for broader student/graduate/teacher statistics across emirates.
For skills demanded by employers, cross-reference with Skills Taxonomy data to identify curriculum gaps.""",

    "skills-taxonomy": """You are browsing the SKILLS TAXONOMY. Help users explore ESCO skills and O*NET data.
Use Skills Taxonomy data to find essential vs optional skills per occupation, O*NET importance scores, and hot technologies.
The data covers 13,960 ESCO skills, 62,580 O*NET skill ratings, 32,773 technology tools, and 328 emerging tasks.
For career pathways, use Career Pathways data.""",

    "data-landscape": """You are exploring the DATA LANDSCAPE. Help users understand what data is available.
The platform has 600K+ records across 10 views, covering demand (34.9K jobs), supply (108K workforce), skills (1.24M), education (62K), population (3K), AI impact (767), forecasts (768), and career transitions (17K).
Answer questions about data coverage, quality, sources, and gaps.""",
}

UPLOAD_CONTEXT_PROMPT = """
## Recently Uploaded Data
Users upload datasets via the Knowledge Base page. These datasets go through an 18-agent pipeline
that cleans, validates, maps occupations, extracts skills, loads data to the warehouse, and refreshes
materialized views.

When users ask about "my data", "uploaded data", "uploaded files", "what data do we have",
"knowledge base uploads", or reference specific uploaded filenames, use the get_recent_uploads tool
to check what datasets have been uploaded and their processing status.

{upload_details}
"""

VISUALIZATION_PROMPT = """
## CRITICAL: Visualization Requirement
After EVERY query_warehouse call that returns data, you MUST include a chart visualization in your response.
Do NOT just list numbers in text — always generate a visual chart.

Choose the best chart type:
- bar: for ranked lists, comparisons, top-N (MOST COMMON)
- line: for time series or trends over months/years
- area: for time series with volume emphasis or confidence bands
- radar: for multi-dimension category comparison (5+ categories)
- pie: for composition/proportion (max 8 slices)

Format: wrap a JSON object in a ```chart code fence. The JSON must have these fields:
- type: "bar" | "line" | "area" | "radar" | "pie"
- title: descriptive chart title
- caption: 1-line explanation of what it shows
- xKey: the field name used for the X axis / category axis
- series: array of {dataKey, label, color} objects
- data: array of data objects with the fields matching xKey and series dataKeys

Example for sector comparison:
```chart
{"type": "bar", "title": "AI Exposure by Sector", "caption": "Average AI exposure score per sector",
 "xKey": "sector", "series": [{"dataKey": "ai_exposure_score", "label": "AI Exposure", "color": "#003366"}],
 "data": [{"sector": "Finance", "ai_exposure_score": 68}, {"sector": "IT", "ai_exposure_score": 62}]}
```

Use these project colors: Navy #003366, Teal #007DB5, Gold #C9A84C,
Emerald #00875A, Coral #D4726A, Slate #4A6FA5, Copper #B87333.
"""

# Source type mapping for tool results
TOOL_SOURCE_TYPES = {
    "query_warehouse": "internal",
    "list_available_views": "internal",
    "get_view_schema": "internal",
    "get_recent_uploads": "internal",
    "search_web": "web_search",
    "search_uae_jobs": "job_search",
    "fetch_webpage": "webpage",
}


def _build_system_prompt(
    page_context: str | None = None,
    internet_enabled: bool = False,
    upload_context: dict | None = None,
) -> str:
    base = SYSTEM_PROMPT.format(view_descriptions=get_view_tool_descriptions())
    parts = [base, VISUALIZATION_PROMPT]
    if page_context and page_context in PAGE_PROMPTS:
        parts.insert(1, PAGE_PROMPTS[page_context])
    if internet_enabled:
        parts.append(INTERNET_SEARCH_PROMPT)
    # Inject upload context if provided
    if upload_context:
        details_lines = []
        if upload_context.get("recent_files"):
            details_lines.append("The following datasets have been recently uploaded:")
            for f in upload_context["recent_files"]:
                status = f.get("status", "unknown")
                name = f.get("filename", "unknown")
                rows = f.get("row_count", "?")
                details_lines.append(f"- **{name}**: status={status}, rows={rows}")
        upload_details = "\n".join(details_lines) if details_lines else "No specific upload context provided. Use get_recent_uploads tool to check."
        parts.append(UPLOAD_CONTEXT_PROMPT.format(upload_details=upload_details))
    else:
        # Always include the upload awareness even without specific context
        parts.append(UPLOAD_CONTEXT_PROMPT.format(
            upload_details="Use the get_recent_uploads tool to check what datasets are available."
        ))
    return "\n\n".join(parts)


def _create_model(internet_enabled: bool = False):
    """Create the OpenAI model with tools bound."""
    model = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        temperature=0,
        api_key=settings.OPENAI_API_KEY or None,
        max_tokens=None,  # let model decide; avoids max_tokens vs max_completion_tokens error on newer models
    )
    tools = get_agent_tools(internet_enabled=internet_enabled)
    return model.bind_tools(tools)


# --- Graph nodes ---

async def agent_node(state: AgentState) -> dict:
    """Call the LLM with tools."""
    internet_enabled = state.get("internet_enabled", False)
    model = _create_model(internet_enabled=internet_enabled)

    # Inject system prompt if first message
    page_context = state.get("page_context")
    upload_context = state.get("upload_context")
    messages = list(state["messages"])
    if not messages or not isinstance(messages[0], SystemMessage):
        messages.insert(0, SystemMessage(
            content=_build_system_prompt(page_context, internet_enabled, upload_context)
        ))

    response = await model.ainvoke(messages)

    return {
        "messages": [response],
        "iteration": state.get("iteration", 0) + 1,
    }


async def tool_executor(state: AgentState) -> dict:
    """Execute tool calls and tag results with source metadata."""
    internet_enabled = state.get("internet_enabled", False)
    tools = get_agent_tools(internet_enabled=internet_enabled)
    tool_node = ToolNode(tools)
    result = await tool_node.ainvoke(state)

    # Extract evidence IDs from query results
    evidence_ids = list(state.get("evidence_ids", []))
    query_plan = state.get("query_plan")

    # Tag each tool result message with source metadata
    tagged_messages = []
    for msg in result.get("messages", []):
        content = msg.content if hasattr(msg, "content") else ""

        # Determine the tool name for this result
        tool_name = msg.name if hasattr(msg, "name") else ""
        source_type = TOOL_SOURCE_TYPES.get(tool_name, "unknown")

        # Try to parse content and add source tag
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                # Add source metadata to the parsed result
                if "source_type" not in parsed:
                    parsed["source_type"] = source_type
                if parsed.get("type") == "query_plan":
                    query_plan = parsed["plan"]
                content = json.dumps(parsed, default=str)
                # Create a new ToolMessage with tagged content
                tagged_messages.append(ToolMessage(
                    content=content,
                    tool_call_id=msg.tool_call_id if hasattr(msg, "tool_call_id") else "",
                    name=tool_name,
                ))
                continue
        except (json.JSONDecodeError, TypeError):
            pass

        tagged_messages.append(msg)

    return {
        "messages": tagged_messages,
        "evidence_ids": evidence_ids,
        "query_plan": query_plan,
    }


def should_continue(state: AgentState) -> Literal["tools", "end"]:
    """Route: if the last message has tool calls, go to tools. Otherwise, end."""
    messages = state["messages"]
    if not messages:
        return "end"

    last_msg = messages[-1]

    # Check iteration limit
    if state.get("iteration", 0) >= MAX_ITERATIONS:
        logger.warning(f"Agent hit iteration limit ({MAX_ITERATIONS})")
        return "end"

    # Route based on tool calls
    if isinstance(last_msg, AIMessage) and last_msg.tool_calls:
        return "tools"

    return "end"


# --- Build graph ---

def build_agent_graph():
    """Build the LangGraph agent graph (uncompiled)."""
    graph = StateGraph(AgentState)

    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_executor)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
    graph.add_edge("tools", "agent")

    return graph


def compile_agent(checkpointer=None, cache=None):
    """Compile the agent graph with optional checkpointer and cache."""
    graph = build_agent_graph()
    return graph.compile(
        checkpointer=checkpointer,
        cache=cache,
    )
