FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv (pinned version for reproducibility)
RUN pip install --no-cache-dir uv==0.7.12

# Copy only dependency files first (maximizes Docker layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies into /opt/venv so volume mounts can't overwrite them
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV UV_HTTP_TIMEOUT=120
RUN uv sync --no-dev --frozen --extra ai

# --- Runtime stage ---
FROM python:3.12-slim

WORKDIR /app

# Copy the pre-built venv from builder
COPY --from=builder /opt/venv /opt/venv

# Put venv on PATH
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy application code
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "src.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
