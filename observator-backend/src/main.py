from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.admin import router as admin_router
from src.api.ai_impact import router as ai_impact_router
from src.api.auth import router as auth_router
from src.api.chat import router as chat_router
from src.api.chat_stream import router as chat_stream_router
from src.api.dashboard import router as dashboard_router
from src.api.data_status import router as data_status_router
from src.api.evidence import router as evidence_router
from src.api.files import router as files_router
from src.api.filters import router as filters_router
from src.api.forecast import router as forecast_router
from src.api.health import router as health_router
from src.api.query import router as query_router
from src.api.reports import router as reports_router
from src.api.settings import router as settings_router
from src.api.skill_gap import router as skill_gap_router
from src.api.notifications import router as notifications_router
from src.api.pipeline import router as pipeline_router
from src.api.scheduler import router as scheduler_router
from src.api.university import router as university_router
from src.api.skills_taxonomy import router as skills_taxonomy_router
from src.api.data_landscape import router as data_landscape_router
from src.api.demand_insights import router as demand_insights_router
from src.api.demographics import router as demographics_router
from src.api.education_pipeline import router as education_pipeline_router
from src.api.transitions import router as transitions_router
from src.config import settings
from src.dependencies import get_engine, get_minio, get_qdrant, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize connections
    get_engine()

    import asyncio

    # Init infrastructure services with timeouts (avoid hanging if Docker is down)
    loop = asyncio.get_event_loop()

    try:
        await asyncio.wait_for(loop.run_in_executor(None, get_minio), timeout=5)
    except Exception:
        pass  # MinIO may not be running in dev without Docker

    try:
        await asyncio.wait_for(loop.run_in_executor(None, get_qdrant), timeout=5)
    except Exception:
        pass

    try:
        await asyncio.wait_for(get_redis(), timeout=5)
    except Exception:
        pass

    # Log Langfuse tracing status
    from src.agent.tracing import log_langfuse_status
    log_langfuse_status()

    # Start data pipeline scheduler (refresh views every 6 hours)
    try:
        from src.ingestion.scheduler import start_scheduler
        start_scheduler(interval_hours=6)
    except Exception:
        pass  # APScheduler may not be installed in minimal setups

    # Start API-source pipeline scheduler (checks every 60s for due sources)
    try:
        from src.api.scheduler import start_scheduler_loop
        start_scheduler_loop()
    except Exception:
        pass

    yield

    # Shutdown: cleanup
    try:
        from src.ingestion.scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass

    try:
        from src.api.scheduler import stop_scheduler_loop
        stop_scheduler_loop()
    except Exception:
        pass

    try:
        from src.agent.executor import close_checkpointer
        await close_checkpointer()
    except Exception:
        pass

    engine = get_engine()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Observator",
        description="UAE Labour Market Intelligence Platform API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — allow local dev origins + any production origins from ALLOWED_ORIGINS env var
    allowed_origins = [
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://localhost:5174",
    ]
    # Add production/staging origins from env (comma-separated)
    if settings.ALLOWED_ORIGINS:
        allowed_origins.extend(
            origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"https://.*\.(vercel\.app|cloudfront\.net)",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(files_router)
    app.include_router(dashboard_router)
    app.include_router(query_router)
    app.include_router(filters_router)
    app.include_router(skill_gap_router)
    app.include_router(ai_impact_router)
    app.include_router(forecast_router)
    app.include_router(chat_router)
    app.include_router(chat_stream_router)
    app.include_router(admin_router)
    app.include_router(university_router)
    app.include_router(skills_taxonomy_router)
    app.include_router(data_landscape_router)
    app.include_router(demand_insights_router)
    app.include_router(demographics_router)
    app.include_router(education_pipeline_router)
    app.include_router(transitions_router)
    app.include_router(reports_router)
    app.include_router(settings_router)
    app.include_router(data_status_router)
    app.include_router(evidence_router)
    app.include_router(notifications_router)
    app.include_router(pipeline_router)
    app.include_router(scheduler_router)

    return app
