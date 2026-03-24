import sys
from logging.config import fileConfig
from pathlib import Path

# Ensure project root is on sys.path so "src" is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.config import settings
from src.models.base import Base

# Import all models so Alembic detects them
from src.models.auth import User  # noqa: F401
from src.models.audit import AuditLog  # noqa: F401
from src.models.dim import *  # noqa: F401, F403
from src.models.fact import *  # noqa: F401, F403
from src.models.evidence import *  # noqa: F401, F403
from src.models.dashboard import *  # noqa: F401, F403

try:
    from src.models.onet import *  # noqa: F401, F403
except ImportError:
    pass
try:
    from src.models.education import *  # noqa: F401, F403
except ImportError:
    pass

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url from settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

target_metadata = Base.metadata

# Only track tables defined in our models (allowlist approach)
OUR_TABLES = set(Base.metadata.tables.keys())


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and reflected:
        # Exclude LangGraph checkpoint tables (managed by AsyncPostgresSaver)
        if name.startswith("checkpoint"):
            return False
        return name in OUR_TABLES
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=False,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=False,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
