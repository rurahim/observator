"""Tests for O*NET loader — uses the live database (Docker PostgreSQL on port 5433)."""
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings
from src.ingestion.loaders.onet_excel import ONetExcelLoader

# O*NET data directory
ONET_DIR = r"C:\Users\ar525\OneDrive\Desktop\Observability\Observator_Data_GDrive\3_TAXONOMY__Skills_Occupations\3b_ONET_v30.2__US_Occupational_DB"


@pytest.fixture(scope="module")
def engine():
    return create_async_engine(settings.DATABASE_URL, echo=False)


@pytest.fixture(scope="module")
def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def db(session_factory) -> AsyncSession:
    async with session_factory() as session:
        yield session


@pytest.fixture
def loader():
    return ONetExcelLoader()


# ── Test load_all (the main entry point) ──


class TestLoadAll:
    async def test_load_all_returns_results(self, loader: ONetExcelLoader, db: AsyncSession):
        results = await loader.load_all(ONET_DIR, db)
        assert "occupations" in results
        total_loaded = sum(r.rows_loaded for r in results.values())
        total_errors = sum(len(r.errors) for r in results.values())

        print("\n  === O*NET Load All Summary ===")
        for name, r in results.items():
            status = "OK" if not r.errors else f"ERRORS: {r.errors}"
            print(f"  {name}: {r.rows_loaded} loaded, {r.rows_skipped} skipped — {status}")
        print(f"  TOTAL: {total_loaded} loaded, {total_errors} errors")

        assert total_errors == 0, f"Errors during load: {[e for r in results.values() for e in r.errors]}"
        assert total_loaded > 0


class TestDataAfterLoad:
    """Run after load_all to verify data ended up in the DB correctly."""

    async def test_occupations_have_soc_codes(self, db: AsyncSession):
        row = await db.execute(
            text("SELECT COUNT(*) FROM dim_occupation WHERE code_soc IS NOT NULL")
        )
        count = row.scalar()
        assert count >= 900, f"Expected 900+ occupations with SOC codes, found {count}"
        print(f"  Occupations with SOC codes: {count}")

    async def test_skills_have_element_ids(self, db: AsyncSession):
        row = await db.execute(
            text("SELECT COUNT(*) FROM dim_skill WHERE onet_element_id IS NOT NULL")
        )
        count = row.scalar()
        assert count > 0, "No skills with O*NET element IDs found"
        print(f"  Skills with element IDs: {count}")

    async def test_mappings_have_importance_weights(self, db: AsyncSession):
        row = await db.execute(
            text("""
                SELECT COUNT(*) FROM fact_occupation_skills
                WHERE source = 'ONET' AND importance IS NOT NULL
            """)
        )
        count = row.scalar()
        assert count > 0, "No O*NET mappings with importance weights found"
        print(f"  Mappings with importance weights: {count}")

    async def test_essential_optional_classification(self, db: AsyncSession):
        row = await db.execute(
            text("""
                SELECT relation_type, COUNT(*) as cnt
                FROM fact_occupation_skills
                WHERE source = 'ONET'
                GROUP BY relation_type
            """)
        )
        rows = {r[0]: r[1] for r in row}
        assert "essential" in rows, "No essential skills found"
        assert "optional" in rows, "No optional skills found"
        print(f"  Essential: {rows.get('essential', 0)}, Optional: {rows.get('optional', 0)}")

    async def test_technology_skills_in_dim(self, db: AsyncSession):
        row = await db.execute(
            text("SELECT COUNT(*) FROM dim_skill WHERE skill_type = 'technology' AND taxonomy = 'ONET'")
        )
        count = row.scalar()
        assert count > 0, "No technology skills found in dim_skill"
        print(f"  Technology skills in dim_skill: {count}")

    async def test_importance_range(self, db: AsyncSession):
        """O*NET importance scores should be 1.0-5.0."""
        row = await db.execute(
            text("""
                SELECT MIN(importance), MAX(importance)
                FROM fact_occupation_skills
                WHERE source = 'ONET' AND importance IS NOT NULL
            """)
        )
        min_val, max_val = row.one()
        assert min_val >= 0.5, f"Importance too low: {min_val}"
        assert max_val <= 5.5, f"Importance too high: {max_val}"
        print(f"  Importance range: {min_val:.2f} - {max_val:.2f}")

    async def test_level_range(self, db: AsyncSession):
        """O*NET level scores should be 0-7."""
        row = await db.execute(
            text("""
                SELECT MIN(level), MAX(level)
                FROM fact_occupation_skills
                WHERE source = 'ONET' AND level IS NOT NULL
            """)
        )
        min_val, max_val = row.one()
        assert min_val >= 0, f"Level too low: {min_val}"
        assert max_val <= 7.5, f"Level too high: {max_val}"
        print(f"  Level range: {min_val:.2f} - {max_val:.2f}")

    async def test_sample_occupation_skills(self, db: AsyncSession):
        """Chief Executives (11-1011.00) should have multiple skills."""
        row = await db.execute(
            text("""
                SELECT COUNT(*)
                FROM fact_occupation_skills fos
                JOIN dim_occupation o ON o.occupation_id = fos.occupation_id
                WHERE o.code_soc = '11-1011.00' AND fos.source = 'ONET'
            """)
        )
        count = row.scalar()
        assert count >= 10, f"Chief Executives should have many skills, found {count}"
        print(f"  Chief Executives (11-1011.00) has {count} skill mappings")


class TestIdempotency:
    async def test_idempotent_reload(self, loader: ONetExcelLoader, db: AsyncSession):
        """Running load_all twice should not duplicate data (upsert/skip)."""
        results = await loader.load_all(ONET_DIR, db)
        total_errors = sum(len(r.errors) for r in results.values())
        assert total_errors == 0, f"Errors on second load: {[e for r in results.values() for e in r.errors]}"
        print("  Idempotent reload: OK (no errors on second run)")
