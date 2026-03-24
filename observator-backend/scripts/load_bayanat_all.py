"""Load ALL Bayanat data — education (394 files), population (91), employment (126), economic (11), SCAD (133).

Uses heuristic column detection to handle heterogeneous schemas.
Loads into: fact_education_stats, fact_population_stats, fact_wage_hours, fact_supply_talent_agg.
"""
import asyncio
import glob
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings
from src.ingestion.transforms import (
    emirate_to_region_code, gender_normalize, nationality_normalize,
    year_to_time_id, to_int, to_float,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent
_CANDIDATES = [
    _SCRIPT_ROOT / "_master_tables",
    Path("/app/_master_tables"),
    Path("_master_tables"),
]
BASE = next((p for p in _CANDIDATES if p.exists()), _CANDIDATES[0])


def safe_read(path, nrows=None):
    for enc in ['utf-8', 'latin-1', 'cp1252']:
        try:
            return pd.read_csv(path, encoding=enc, low_memory=False, on_bad_lines='skip',
                             nrows=nrows, dtype=str)
        except:
            continue
    return pd.DataFrame()


def clean_cols(df):
    df.columns = [c.strip().lstrip('\ufeff') for c in df.columns]
    return df


async def build_time_map(db):
    rows = (await db.execute(text("SELECT time_id, date FROM dim_time"))).fetchall()
    return {r[1]: r[0] for r in rows}


async def batch_insert(db, table, rows, batch_size=1000):
    """Insert rows into table, return count loaded."""
    if not rows:
        return 0
    now = datetime.utcnow()
    # Add created_at for timestamped tables
    for r in rows:
        if 'created_at' not in r:
            r['created_at'] = now

    # Normalize columns
    all_keys = set()
    for r in rows:
        all_keys.update(r.keys())
    for r in rows:
        for k in all_keys:
            if k not in r:
                r[k] = None

    cols = sorted(all_keys)
    col_str = ", ".join(cols)
    param_str = ", ".join(f":{c}" for c in cols)
    sql = f"INSERT INTO {table} ({col_str}) VALUES ({param_str})"

    loaded = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            await db.execute(text(sql), batch)
            await db.commit()
            loaded += len(batch)
        except Exception as e:
            await db.rollback()
            if i == 0:
                logger.warning(f"  Batch error in {table}: {str(e)[:150]}")
    return loaded


async def load_education_files(factory, time_map):
    """Load 394 Bayanat education files → fact_education_stats."""
    files = sorted(glob.glob(str(BASE / "10_bayanat_education/*.csv")))
    logger.info(f"Loading {len(files)} Bayanat education files...")

    total_loaded = 0
    skipped_files = 0

    for f in files:
        bn = os.path.basename(f).lower()
        if 'metadata' in bn or 'data_dictionary' in bn or 'desktop.ini' in bn:
            continue

        df = safe_read(f)
        if df.empty or len(df) < 1:
            skipped_files += 1
            continue
        df = clean_cols(df)
        cols_lower = {c.lower(): c for c in df.columns}

        # Detect year column
        year_col = None
        for candidate in ['year', 'year_en', 'date', 'academic_year']:
            if candidate in cols_lower:
                year_col = cols_lower[candidate]
                break

        # Detect value column
        value_col = None
        for candidate in ['total', 'value', 'count', 'number', 'students', 'graduates', 'teachers']:
            if candidate in cols_lower:
                value_col = cols_lower[candidate]
                break
        # If no named value column, use the last numeric-looking column
        if not value_col:
            for c in reversed(df.columns):
                if df[c].str.replace(',', '').str.replace('.', '').str.isnumeric().any():
                    value_col = c
                    break

        if not value_col:
            skipped_files += 1
            continue

        # Detect category from filename
        if 'student' in bn:
            category = 'students'
        elif 'graduate' in bn:
            category = 'graduates'
        elif 'teacher' in bn:
            category = 'teachers'
        elif 'enrollment' in bn or 'enrol' in bn:
            category = 'enrollment'
        elif 'school' in bn or 'classroom' in bn:
            category = 'infrastructure'
        elif 'adult' in bn:
            category = 'adult_education'
        else:
            category = 'other'

        # Detect level
        if 'higher' in bn or 'university' in bn or 'college' in bn:
            level = 'higher'
        elif 'secondary' in bn:
            level = 'secondary'
        elif 'primary' in bn:
            level = 'primary'
        elif 'kindergarten' in bn or 'kg' in bn:
            level = 'kindergarten'
        else:
            level = 'all'

        # Detect sector
        sector = None
        if 'government' in bn or 'governmental' in bn:
            sector = 'government'
        elif 'private' in bn:
            sector = 'private'

        # Detect optional columns
        gender_col = cols_lower.get('gender') or cols_lower.get('gender_en')
        emirate_col = cols_lower.get('emirate') or cols_lower.get('emirate_en') or cols_lower.get('zone')
        nationality_col = cols_lower.get('nationality') or cols_lower.get('citizenship')

        rows = []
        ctx = {"time_map": time_map}
        for _, row in df.iterrows():
            year_val = row.get(year_col) if year_col else None
            time_id = year_to_time_id(year_val, ctx) if year_val else None

            val = to_int(row.get(value_col), None)
            if val == 0 and str(row.get(value_col, '')).strip() in ('', '0', '-', 'nan'):
                continue

            region = emirate_to_region_code(row.get(emirate_col), None) if emirate_col else None
            gender = gender_normalize(row.get(gender_col), None) if gender_col else None
            nat = nationality_normalize(row.get(nationality_col), None) if nationality_col else None

            rows.append({
                "time_id": time_id,
                "region_code": region,
                "category": category,
                "level": level,
                "gender": gender,
                "nationality": nat,
                "sector": sector,
                "count": val,
                "source": os.path.basename(f),
            })

        if rows:
            async with factory() as db:
                loaded = await batch_insert(db, "fact_education_stats", rows)
                total_loaded += loaded

    logger.info(f"  Education: {total_loaded:,} rows loaded from {len(files) - skipped_files} files ({skipped_files} skipped)")
    return total_loaded


async def load_population_files(factory, time_map):
    """Load 91 Bayanat population files → fact_population_stats."""
    files = sorted(glob.glob(str(BASE / "11_bayanat_population/*.csv")))
    logger.info(f"Loading {len(files)} Bayanat population files...")

    total_loaded = 0
    skipped = 0

    for f in files:
        bn = os.path.basename(f).lower()
        if 'desktop.ini' in bn:
            continue

        df = safe_read(f)
        if df.empty:
            skipped += 1
            continue
        df = clean_cols(df)
        cols_lower = {c.lower(): c for c in df.columns}

        # Detect year
        year_col = None
        for candidate in ['year', 'year_en', 'date']:
            if candidate in cols_lower:
                year_col = cols_lower[candidate]
                break

        # Detect emirate
        emirate_col = cols_lower.get('emirate') or cols_lower.get('emirate_en') or cols_lower.get('region')

        # Detect category from filename
        if 'growth' in bn:
            category = 'growth_rate'
        elif 'birth' in bn:
            category = 'birth'
        elif 'death' in bn:
            category = 'death'
        elif 'age' in bn:
            category = 'age_distribution'
        elif 'census' in bn:
            category = 'census'
        else:
            category = 'estimate'

        # Try to find value columns — population files often have Males/Females/Total columns
        ctx = {"time_map": time_map}
        rows = []

        # Strategy: iterate over all numeric-looking columns as value sources
        for _, row in df.iterrows():
            time_id = year_to_time_id(row.get(year_col), ctx) if year_col else None
            region = emirate_to_region_code(row.get(emirate_col), None) if emirate_col else None
            age_group = str(row.get(cols_lower.get('age_group', cols_lower.get('age', '')), '')).strip() or None
            citizenship = None
            if 'citizen' in cols_lower:
                citizenship = nationality_normalize(row.get(cols_lower['citizen']), None)
            elif 'citizenship' in cols_lower:
                citizenship = nationality_normalize(row.get(cols_lower['citizenship']), None)

            # Get value from known columns
            for val_col_name in ['total', 'value', 'males', 'females', 'population', 'count']:
                if val_col_name in cols_lower:
                    val = to_int(row.get(cols_lower[val_col_name]), None)
                    if val and val > 0:
                        gender = None
                        if val_col_name == 'males':
                            gender = 'M'
                        elif val_col_name == 'females':
                            gender = 'F'
                        rows.append({
                            "time_id": time_id,
                            "region_code": region,
                            "citizenship": citizenship,
                            "age_group": age_group,
                            "gender": gender,
                            "population_count": val,
                            "category": category,
                            "source": os.path.basename(f),
                        })
                        break  # only take first matching value column per row

        if rows:
            async with factory() as db:
                loaded = await batch_insert(db, "fact_population_stats", rows)
                total_loaded += loaded

    logger.info(f"  Population: {total_loaded:,} rows loaded ({skipped} files skipped)")
    return total_loaded


async def load_remaining_employment(factory, time_map):
    """Load remaining 126 Bayanat employment files not already loaded."""
    already_loaded = {
        "employment_by_occupation_in_private_sector_data_set.csv",
        "employment_by_occupation_in_private_sector_meta_data.csv",
    }
    files = sorted(glob.glob(str(BASE / "8_bayanat_employment/*.csv")))
    files = [f for f in files if os.path.basename(f) not in already_loaded and 'desktop.ini' not in f]
    logger.info(f"Loading {len(files)} remaining Bayanat employment files...")

    total_loaded = 0
    wage_loaded = 0

    for f in files:
        bn = os.path.basename(f).lower()
        df = safe_read(f)
        if df.empty:
            continue
        df = clean_cols(df)
        cols_lower = {c.lower(): c for c in df.columns}

        ctx = {"time_map": time_map}

        # Detect if this is a wage/hours file
        is_wage = 'wage' in bn or 'earning' in bn or 'hours' in bn

        if is_wage:
            # Load into fact_wage_hours
            rows = []
            year_col = cols_lower.get('year') or cols_lower.get('year_en')
            for _, row in df.iterrows():
                time_id = year_to_time_id(row.get(year_col), ctx) if year_col else None
                # Try to extract dimension info from columns
                dim_type = None
                dim_value = None
                for c in df.columns:
                    cl = c.lower()
                    if cl in ('economic activity group_en', 'economic_activity'):
                        dim_type = 'economic_activity'
                        dim_value = str(row.get(c, '')).strip()
                    elif cl in ('educational status_en', 'education'):
                        dim_type = 'education'
                        dim_value = str(row.get(c, '')).strip()
                    elif cl == 'description_en':
                        dim_type = 'occupation'
                        dim_value = str(row.get(c, '')).strip()

                val = to_float(row.get(cols_lower.get('value', cols_lower.get('total', ''))), None)
                if val is not None:
                    rows.append({
                        "time_id": time_id,
                        "dimension_type": dim_type,
                        "dimension_value": dim_value,
                        "wages_monthly": val if 'wage' in bn or 'earning' in bn else None,
                        "hours_normal": val if 'hours' in bn else None,
                        "source": os.path.basename(f),
                    })
            if rows:
                async with factory() as db:
                    loaded = await batch_insert(db, "fact_wage_hours", rows)
                    wage_loaded += loaded
        else:
            # Load into fact_supply_talent_agg (employment distribution data)
            year_col = cols_lower.get('year') or cols_lower.get('year_en')
            emirate_col = cols_lower.get('emirate') or cols_lower.get('emirate_en')
            gender_col = cols_lower.get('gender') or cols_lower.get('gender_en')

            # Find value column
            value_col = None
            for candidate in ['percentage', 'value', 'count', 'total', 'number']:
                for c in df.columns:
                    if candidate in c.lower():
                        value_col = c
                        break
                if value_col:
                    break

            if not value_col or not year_col:
                continue

            rows = []
            for _, row in df.iterrows():
                time_id = year_to_time_id(row.get(year_col), ctx) if year_col else None
                if not time_id:
                    continue
                region = emirate_to_region_code(row.get(emirate_col), None) if emirate_col else None
                gender = gender_normalize(row.get(gender_col), None) if gender_col else None
                val = to_int(row.get(value_col), None)

                rows.append({
                    "time_id": time_id,
                    "region_code": region or "AUH",
                    "gender": gender,
                    "supply_count": val,
                    "source": "bayanat_" + bn[:30],
                })

            if rows:
                async with factory() as db:
                    loaded = await batch_insert(db, "fact_supply_talent_agg", rows)
                    total_loaded += loaded

    logger.info(f"  Employment: {total_loaded:,} supply rows + {wage_loaded:,} wage rows loaded")
    return total_loaded + wage_loaded


async def load_scad(factory, time_map):
    """Load 133 SCAD Abu Dhabi files → various fact tables."""
    files = sorted(glob.glob(str(BASE / "14_scad_abu_dhabi/*.csv")))
    logger.info(f"Loading {len(files)} SCAD Abu Dhabi files...")

    total_loaded = 0
    for f in files:
        bn = os.path.basename(f).lower()
        if 'desktop.ini' in bn:
            continue

        df = safe_read(f)
        if df.empty or len(df) < 1:
            continue
        df = clean_cols(df)
        cols_lower = {c.lower(): c for c in df.columns}
        ctx = {"time_map": time_map}

        year_col = cols_lower.get('year') or cols_lower.get('year_en') or cols_lower.get('date')

        # Find any numeric value column
        value_col = None
        for c in df.columns:
            if df[c].str.replace(',', '').str.replace('.', '').str.replace('-', '').str.isnumeric().any():
                if c.lower() not in ('year', 'year_en', 'date'):
                    value_col = c
                    break

        if not value_col or not year_col:
            continue

        # Detect target table
        if 'education' in bn or 'student' in bn or 'teacher' in bn or 'school' in bn:
            target = 'fact_education_stats'
        elif 'population' in bn or 'census' in bn or 'age' in bn:
            target = 'fact_population_stats'
        else:
            target = 'fact_supply_talent_agg'

        rows = []
        for _, row in df.iterrows():
            time_id = year_to_time_id(row.get(year_col), ctx)
            if not time_id:
                continue
            val = to_int(row.get(value_col), None)
            if not val or val == 0:
                continue

            if target == 'fact_education_stats':
                rows.append({
                    "time_id": time_id, "region_code": "AUH",
                    "category": "other", "level": "all",
                    "count": val, "source": "scad_" + bn[:30],
                })
            elif target == 'fact_population_stats':
                rows.append({
                    "time_id": time_id, "region_code": "AUH",
                    "population_count": val, "category": "census",
                    "source": "scad_" + bn[:30],
                })
            else:
                rows.append({
                    "time_id": time_id, "region_code": "AUH",
                    "supply_count": val, "source": "scad_" + bn[:30],
                })

        if rows:
            async with factory() as db:
                loaded = await batch_insert(db, target, rows)
                total_loaded += loaded

    logger.info(f"  SCAD: {total_loaded:,} rows loaded")
    return total_loaded


async def main():
    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # Build time map once
    async with factory() as db:
        time_map = await build_time_map(db)
    logger.info(f"Time map: {len(time_map)} entries")

    t0 = time.time()

    edu = await load_education_files(factory, time_map)
    pop = await load_population_files(factory, time_map)
    emp = await load_remaining_employment(factory, time_map)
    scad = await load_scad(factory, time_map)

    total = edu + pop + emp + scad
    elapsed = time.time() - t0

    logger.info(f"\n{'='*60}")
    logger.info(f"ALL BAYANAT + SCAD LOADING COMPLETE in {elapsed:.0f}s")
    logger.info(f"  Education: {edu:,}")
    logger.info(f"  Population: {pop:,}")
    logger.info(f"  Employment: {emp:,}")
    logger.info(f"  SCAD: {scad:,}")
    logger.info(f"  TOTAL: {total:,}")
    logger.info(f"{'='*60}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
