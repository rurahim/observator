"""Load O*NET data into production database."""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent
_CANDIDATES = [_SCRIPT_ROOT / "_master_tables", Path("/app/_master_tables")]
BASE = next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0])


async def main():
    try:
        from src.ingestion.mappings_onet import ONET_MAPPINGS
        from src.ingestion.generic_loader import GenericLoader
    except ImportError as e:
        logger.warning(f"O*NET mappings not available: {e}")
        return

    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    total = 0

    for mapping in ONET_MAPPINGS:
        fp = BASE / mapping.file_pattern
        if not fp.exists():
            logger.warning(f"File not found: {fp}")
            continue
        try:
            async with factory() as db:
                loader = GenericLoader(db)
                await loader.build_context()
                r = await loader.load(mapping, fp)
                total += r.rows_loaded
                logger.info(f"{mapping.target_table}: {r.rows_loaded} loaded, {r.rows_skipped} skipped")
        except Exception as ex:
            logger.error(f"Error loading {mapping.source_id}: {ex}")

    logger.info(f"Total O*NET rows loaded: {total}")
    await engine.dispose()


asyncio.run(main())
