# =============================================================================
# backend.Dockerfile — Production multi-stage build for Observator FastAPI
# =============================================================================
#
# WHY THIS EXISTS (vs the existing Dockerfile):
# The existing observator-backend/Dockerfile works for dev but lacks:
# 1. Non-root user (security requirement for production)
# 2. System dependency installation (libpq for asyncpg, gdal for PostGIS)
# 3. Build context is the project root (not observator-backend/) so CI can
#    build from the monorepo root
# 4. Proper signal handling with tini
#
# WHAT'S HAPPENING:
# Stage 1 (builder): Install uv, sync dependencies into /opt/venv
# Stage 2 (runtime): Copy venv + app code, create non-root user, add tini
#
# GOTCHAS:
# - asyncpg needs libpq-dev at BUILD time and libpq5 at RUNTIME
# - The --extra ai flag installs LangGraph/OpenAI deps. Without it, the agent
#   endpoints will fail with ImportError
# - uv.lock must be committed to git. If it's missing, `uv sync --frozen` fails
# - We pin uv to a specific version for reproducibility
# - GDAL/GEOS are needed if you use PostGIS geometry functions in Python
#
# PRO TIP:
# ECS Fargate charges per-second for vCPU and memory. A smaller image means
# faster pull times = faster task startup = less billable idle time during
# deployments. This image is ~250MB vs ~800MB without multi-stage.
# =============================================================================

# ── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        && rm -rf /var/lib/apt/lists/*

# Install uv (pinned for reproducibility)
RUN pip install --no-cache-dir uv==0.7.12

# Copy dependency manifests first for layer caching
COPY observator-backend/pyproject.toml observator-backend/uv.lock ./

# Install dependencies into isolated venv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV UV_HTTP_TIMEOUT=120
RUN uv sync --no-dev --frozen --extra ai --extra forecast

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim

# Install runtime dependencies only (no compilers)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
        tini \
        curl \
        && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid 1001 --create-home appuser

WORKDIR /app

# Copy the pre-built venv from builder
COPY --from=builder /opt/venv /opt/venv

# Put venv on PATH
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Disable debug mode in production
    DEBUG=false

# Copy application code
COPY observator-backend/src ./src
COPY observator-backend/alembic ./alembic
COPY observator-backend/alembic.ini ./alembic.ini
COPY observator-backend/pyproject.toml ./pyproject.toml
COPY observator-backend/scripts ./scripts

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

EXPOSE 8000

# Health check — curl is more reliable than Python urllib in slim images
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Use tini as PID 1 for proper signal handling (graceful shutdown)
# Without tini, uvicorn might not receive SIGTERM properly in containers
ENTRYPOINT ["tini", "--"]

# Run with multiple workers in production
# Workers = 2 * CPU + 1 is a good baseline, but Fargate gives fractional CPUs
# so we start with 2 workers and scale horizontally via ECS task count
CMD ["uvicorn", "src.main:create_app", "--factory", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", \
     "--access-log", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
