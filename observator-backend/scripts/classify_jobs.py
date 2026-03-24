"""NLP Classify unclassified LinkedIn job postings into ISCO occupations.

Uses a 3-step approach:
1. Exact/fuzzy match against 57K O*NET alternate titles → ~65% hit rate
2. Industry-to-ISCO major group heuristic → ~80% of remaining
3. (Optional) OpenAI batch for final ~5-10%

Updates fact_demand_vacancies_agg.occupation_id in-place.
"""
import asyncio
import logging
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from src.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def normalize_title(title: str) -> str:
    """Normalize a job title for matching."""
    if not title:
        return ""
    s = title.lower().strip()
    # Remove common prefixes/suffixes
    s = re.sub(r'\b(senior|junior|lead|chief|head of|assistant|associate|intern|trainee)\b', '', s)
    s = re.sub(r'\b(i|ii|iii|iv|v|vi)\b', '', s)  # Roman numerals
    s = re.sub(r'\b(level \d+|grade \d+)\b', '', s)
    s = re.sub(r'[^a-z\s]', ' ', s)  # Remove non-alpha
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def tokenize(title: str) -> set[str]:
    """Tokenize a normalized title into word set."""
    return set(title.split()) - {'', 'and', 'or', 'the', 'of', 'in', 'for', 'a', 'an', 'to', 'at', 'with'}


def jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity between two sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


# Industry → ISCO major group mapping
INDUSTRY_TO_ISCO_MAJOR = {
    "administration": "4",
    "tourism and accommodation service": "5",
    "retail": "5",
    "financial service": "2",
    "information and communication technologies (ict)": "2",
    "housing and construction": "7",
    "logistic": "8",
    "human resource": "4",
    "training and education": "2",
    "accountancy": "2",
    "healthcare": "2",
    "transport": "8",
    "food production, manufacturing and service": "7",
    "media": "2",
    "engineering and manufacturing": "2",
    "agriculture": "6",
    "security": "5",
    "legal services": "2",
    "built environment": "7",
    "sales": "5",
    "hospitality": "5",
    "technology": "2",
    "marketing": "2",
}


async def main():
    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    t0 = time.time()

    # ── Step 0: Build lookup tables ──
    logger.info("Building O*NET alternate title index...")
    async with factory() as db:
        # Get all alternate titles with their occupation_id
        rows = (await db.execute(text("""
            SELECT LOWER(TRIM(alternate_title)), occupation_id
            FROM fact_onet_alternate_titles
            WHERE occupation_id IS NOT NULL AND alternate_title IS NOT NULL
        """))).fetchall()

    # Build exact match dict and token index
    exact_match: dict[str, int] = {}
    token_index: dict[str, list[tuple[set, int]]] = defaultdict(list)

    for alt_title, occ_id in rows:
        norm = normalize_title(alt_title)
        if norm:
            exact_match[norm] = occ_id
            tokens = tokenize(norm)
            if tokens:
                # Index by first token for fast lookup
                first = sorted(tokens)[0]
                token_index[first].append((tokens, occ_id))

    logger.info(f"  Exact index: {len(exact_match):,} titles")
    logger.info(f"  Token index: {len(token_index):,} first-token buckets")

    # Also build ISCO major group → occupation_id map
    async with factory() as db:
        major_rows = (await db.execute(text("""
            SELECT DISTINCT ON (isco_major_group) occupation_id, isco_major_group
            FROM dim_occupation
            WHERE isco_major_group IS NOT NULL
            ORDER BY isco_major_group, occupation_id
        """))).fetchall()
    major_group_map = {r[1]: r[0] for r in major_rows}
    logger.info(f"  ISCO major groups: {len(major_group_map)}")

    # ── Step 1: Get unclassified jobs ──
    async with factory() as db:
        unclassified = (await db.execute(text("""
            SELECT id, occupation_id FROM fact_demand_vacancies_agg
            WHERE occupation_id IS NULL
        """))).fetchall()
    job_ids = [r[0] for r in unclassified]
    logger.info(f"\nUnclassified jobs: {len(job_ids):,}")

    # We need job titles — read from original CSV since titles aren't in the DB
    import pandas as pd
    _script_root = Path(__file__).resolve().parent.parent.parent
    _csv_candidates = [
        _script_root / "_master_tables/3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv",
        Path("/app/_master_tables/3_demand_jobs/linkedin_uae_job_postings_2024_2025.csv"),
    ]
    csv_path = next((p for p in _csv_candidates if p.exists()), _csv_candidates[0])
    jobs_df = pd.read_csv(csv_path, dtype=str, low_memory=False)
    jobs_df.columns = [c.strip().lstrip('\ufeff') for c in jobs_df.columns]
    # Build a map from job characteristics to title+industry
    # Since we don't have original row IDs in the DB, we need to match via date+location
    # Actually, the DB rows were created from CSV rows in order — let's use a simpler approach:
    # Read the occupation and industry columns from CSV for rows that had no occupation
    unclassified_titles = jobs_df[jobs_df['occupation'].isna() | (jobs_df['occupation'].str.strip() == '')].copy()
    logger.info(f"  CSV rows without occupation: {len(unclassified_titles):,}")

    # ── Step 2: Classify by title matching ──
    logger.info("\nStep 1: Title matching against O*NET alternate titles...")
    matched_exact = 0
    matched_fuzzy = 0
    matched_industry = 0
    unmatched = 0

    # Build classification results: {csv_index: (occupation_id, method)}
    classifications: dict[int, tuple[int, str]] = {}

    for idx, row in unclassified_titles.iterrows():
        title = str(row.get('job_title', '')).strip()
        industry = str(row.get('industry', '')).strip()

        if not title:
            unmatched += 1
            continue

        norm = normalize_title(title)
        occ_id = None
        method = None

        # Try exact match first
        if norm in exact_match:
            occ_id = exact_match[norm]
            method = 'exact_title'
            matched_exact += 1
        else:
            # Try fuzzy (Jaccard) match
            tokens = tokenize(norm)
            if tokens:
                best_score = 0.0
                best_occ = None
                # Check token index for candidate matches
                for token in sorted(tokens)[:3]:  # check first 3 tokens
                    for candidate_tokens, candidate_occ in token_index.get(token, []):
                        score = jaccard(tokens, candidate_tokens)
                        if score > best_score:
                            best_score = score
                            best_occ = candidate_occ
                if best_score >= 0.5 and best_occ:
                    occ_id = best_occ
                    method = 'fuzzy_title'
                    matched_fuzzy += 1

        # Step 2: Industry heuristic fallback
        if not occ_id and industry and industry.lower() in INDUSTRY_TO_ISCO_MAJOR:
            major = INDUSTRY_TO_ISCO_MAJOR[industry.lower()]
            if major in major_group_map:
                occ_id = major_group_map[major]
                method = 'industry_heuristic'
                matched_industry += 1

        if occ_id:
            classifications[idx] = (occ_id, method)
        else:
            unmatched += 1

    logger.info(f"  Exact title matches: {matched_exact:,}")
    logger.info(f"  Fuzzy title matches: {matched_fuzzy:,}")
    logger.info(f"  Industry heuristic: {matched_industry:,}")
    logger.info(f"  Unmatched: {unmatched:,}")
    total_classified = matched_exact + matched_fuzzy + matched_industry
    logger.info(f"  TOTAL CLASSIFIED: {total_classified:,} / {len(unclassified_titles):,} ({round(total_classified/max(len(unclassified_titles),1)*100,1)}%)")

    # ── Step 3: Apply classifications to DB ──
    logger.info("\nApplying classifications to database...")

    # We need to map CSV row indices back to DB row IDs.
    # Since we inserted rows in CSV order but skipped some (missing date/region),
    # we need a different approach: update by matching on the same conditions.
    # Simpler: Just read all unclassified DB rows ordered by id, and map sequentially
    # to the CSV unclassified rows.
    #
    # Actually the cleanest approach: update via the occupation_id column using
    # the CSV's existing occupation field + our new classification.
    # But the DB rows don't have the original job_title stored.
    #
    # Best approach: Since we can't reliably map CSV→DB rows, let's update the DB
    # by re-reading the original CSV, applying classification, and using the
    # date+location+industry combo as a matching key.
    #
    # Simplest approach that works: The GenericLoader inserted rows in CSV order,
    # and the `id` column auto-increments. Get all DB IDs ordered by id, get all
    # CSV rows ordered by original index, match position-wise (accounting for skipped rows).

    # Get all DB rows ordered by ID
    async with factory() as db:
        db_rows = (await db.execute(text("""
            SELECT id, occupation_id FROM fact_demand_vacancies_agg
            ORDER BY id
        """))).fetchall()

    # Map: for each DB row without occupation, find corresponding CSV row
    # The CSV had 36,923 rows. DB has 34,897 rows (some skipped for missing date/region).
    # Both are in insertion order. Build a mapping by tracking which CSV rows were loaded.
    jobs_df['date_parsed'] = pd.to_datetime(jobs_df['date'], errors='coerce')
    jobs_df['has_date'] = jobs_df['date_parsed'].notna()
    jobs_df['has_location'] = jobs_df['location'].notna() & (jobs_df['location'].str.strip() != '')

    # Rows that would have been loaded (same logic as the mapping: date required, location required)
    from src.ingestion.transforms import location_to_region, date_to_time_id
    loaded_mask = []
    for _, row in jobs_df.iterrows():
        loc = location_to_region(row.get('location'))
        has_date = pd.notna(row.get('date_parsed'))
        loaded_mask.append(bool(loc and has_date))

    jobs_df['was_loaded'] = loaded_mask
    loaded_df = jobs_df[jobs_df['was_loaded']].reset_index(drop=True)

    logger.info(f"  DB rows: {len(db_rows):,}, Loaded CSV rows: {len(loaded_df):,}")

    # Now we have 1:1 correspondence between db_rows (by insertion order) and loaded_df
    updates = []
    for i, (db_id, existing_occ_id) in enumerate(db_rows):
        if existing_occ_id is not None:
            continue  # already classified
        if i >= len(loaded_df):
            break
        orig_idx = loaded_df.index[i]  # This won't work since we reset_index
        # Instead, check if the original CSV index for this loaded row had a classification
        # Actually we need the original jobs_df index. Let me track it.

    # Rebuild: track original index
    loaded_indices = jobs_df.index[jobs_df['was_loaded']].tolist()

    update_count = 0
    batch = []
    async with factory() as db:
        for i, (db_id, existing_occ_id) in enumerate(db_rows):
            if existing_occ_id is not None:
                continue
            if i >= len(loaded_indices):
                break
            orig_csv_idx = loaded_indices[i]
            if orig_csv_idx in classifications:
                occ_id, method = classifications[orig_csv_idx]
                batch.append({"row_id": db_id, "occ_id": occ_id})
                update_count += 1

                if len(batch) >= 500:
                    await db.execute(
                        text("UPDATE fact_demand_vacancies_agg SET occupation_id = :occ_id WHERE id = :row_id"),
                        batch,
                    )
                    await db.commit()
                    batch = []

        if batch:
            await db.execute(
                text("UPDATE fact_demand_vacancies_agg SET occupation_id = :occ_id WHERE id = :row_id"),
                batch,
            )
            await db.commit()

    logger.info(f"  Updated {update_count:,} DB rows with new occupation_id")

    # ── Step 4: Refresh views ──
    logger.info("\nRefreshing materialized views...")
    from sqlalchemy import create_engine
    sync_engine = create_engine(settings.DATABASE_URL_SYNC, isolation_level="AUTOCOMMIT")
    with sync_engine.connect() as conn:
        for view in ['vw_demand_jobs', 'vw_gap_cube']:
            try:
                conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
                logger.info(f"  Refreshed {view}")
            except Exception as e:
                logger.warning(f"  Failed to refresh {view}: {e}")
    sync_engine.dispose()

    # ── Final stats ──
    async with factory() as db:
        new_with_occ = (await db.execute(text(
            "SELECT count(*) FROM fact_demand_vacancies_agg WHERE occupation_id IS NOT NULL"
        ))).scalar()
        total = (await db.execute(text("SELECT count(*) FROM fact_demand_vacancies_agg"))).scalar()

    elapsed = time.time() - t0
    logger.info(f"\n{'='*60}")
    logger.info(f"CLASSIFICATION COMPLETE in {elapsed:.0f}s")
    logger.info(f"  Before: 13,299 / 34,897 (38.1%)")
    logger.info(f"  After:  {new_with_occ:,} / {total:,} ({round(new_with_occ/total*100,1)}%)")
    logger.info(f"  New classifications: {update_count:,}")
    logger.info(f"  Methods: exact={matched_exact:,}, fuzzy={matched_fuzzy:,}, industry={matched_industry:,}")
    logger.info(f"{'='*60}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
