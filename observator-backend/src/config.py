from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://observator:observator@localhost:5432/observator"
    DATABASE_URL_SYNC: str = "postgresql://observator:observator@localhost:5432/observator"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "observator"
    MINIO_SECURE: bool = False

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "evidence"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-5.4"

    # Tavily — AI-optimized web search
    TAVILY_API_KEY: str = ""

    # Langfuse — tracing & evaluation
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_BASE_URL: str = "https://cloud.langfuse.com"
    LANGFUSE_ENABLED: bool = True

    # App
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True
    MIN_COHORT_SIZE: int = 10
    MAX_QUERY_LIMIT: int = 1000

    # CORS — comma-separated list of allowed origins for production
    ALLOWED_ORIGINS: str = ""

    # External API keys (optional — for api_connector and web_scraper agents)
    ONET_API_KEY: str = ""       # Free: https://services.onetcenter.org/developer/signup
    SERPAPI_KEY: str = ""         # Free tier 100/month: https://serpapi.com

    # SMTP — email report delivery (optional)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@observator.ae"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
