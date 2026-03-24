"""Re-seed ESCO occupations, skills, and occupation-skill mappings.
Run after unique constraints are added to dim_occupation and dim_skill.
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings
from src.ingestion.generic_loader import GenericLoader
from src.ingestion.mappings import ESCO_OCCUPATIONS, ESCO_SKILLS, ESCO_OCC_SKILL_MAP

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent
_CANDIDATES = [
    _SCRIPT_ROOT / "_master_tables",
    Path("/app/_master_tables"),
    Path("_master_tables"),
]
BASE = next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0])


async def main():
    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    for mapping in [ESCO_OCCUPATIONS, ESCO_SKILLS, ESCO_OCC_SKILL_MAP]:
        fp = BASE / mapping.file_pattern
        logger.info(f"Loading {mapping.source_id} from {fp} (exists: {fp.exists()})")
        async with factory() as db:
            loader = GenericLoader(db)
            await loader.build_context()
            try:
                r = await loader.load(mapping, fp)
                logger.info(f"  {mapping.target_table}: loaded={r.rows_loaded}, skipped={r.rows_skipped}")
            except Exception as e:
                logger.error(f"  ERROR: {type(e).__name__}: {e}")

    await engine.dispose()
    logger.info("ESCO re-seed complete")


asyncio.run(main())
