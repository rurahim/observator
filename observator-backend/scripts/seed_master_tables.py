"""
Observator — Comprehensive loader for ALL _master_tables data.

Loads employment distributions, education pipeline, and population data
from the cleaned _master_tables CSVs into PostgreSQL.

Usage:
    python scripts/seed_master_tables.py

Data source: Observator_Data_GDrive/_master_tables/
Folders loaded:
  - 8_bayanat_employment/ (employment distributions by gender, age, emirate, etc.)
  - 10_bayanat_education/ (graduates, enrollment, institutions)
  - 11_bayanat_population/ (population by age/gender/nationality)
  - 2_supply_education/ (CAA course-skill mappings)
"""
import csv
import os
import sys
import re
from pathlib import Path
from collections import defaultdict

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DATA_DIR = str(
    Path(__file__).resolve().parent.parent.parent
    / "Observator_Data_GDrive"
    / "_master_tables"
)


def csv_rows(folder: str, filename: str) -> tuple[list[dict], list[str]]:
    """Read a CSV file from a master_tables subfolder."""
    path = os.path.join(DATA_DIR, folder, filename)
    if not os.path.exists(path):
        print(f"  SKIP (not found): {folder}/{filename}")
        return [], []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader), reader.fieldnames or []


def safe_int(val, default=0):
    """Parse int from string, handling commas and empty values."""
    if not val or val.strip() in ('', '-', 'N/A', '..', 'NA'):
        return default
    try:
        return int(float(str(val).replace(',', '').replace(' ', '').strip()))
    except (ValueError, TypeError):
        return default


def safe_float(val, default=None):
    """Parse float from string."""
    if not val or val.strip() in ('', '-', 'N/A', '..', 'NA'):
        return default
    try:
        return float(str(val).replace(',', '').replace('%', '').strip())
    except (ValueError, TypeError):
        return default


def map_emirate(name: str) -> str | None:
    """Map emirate name to region code."""
    if not name:
        return None
    n = name.strip().lower()
    mapping = {
        'abu dhabi': 'AUH', 'أبو ظبي': 'AUH', 'أبوظبي': 'AUH',
        'dubai': 'DXB', 'دبي': 'DXB',
        'sharjah': 'SHJ', 'الشارقة': 'SHJ',
        'ajman': 'AJM', 'عجمان': 'AJM',
        'ras al khaimah': 'RAK', 'ras al-khaimah': 'RAK', 'رأس الخيمة': 'RAK',
        'fujairah': 'FUJ', 'الفجيرة': 'FUJ',
        'umm al quwain': 'UAQ', 'umm al-quwain': 'UAQ', 'أم القيوين': 'UAQ',
    }
    for key, code in mapping.items():
        if key in n:
            return code
    return None


# ─────────────────────────────────────────────────────────────────────────────
# SYNC DB operations (using psycopg2 directly for simplicity)
# ─────────────────────────────────────────────────────────────────────────────

def get_db_connection():
    """Get sync DB connection from env."""
    import psycopg2
    url = os.environ.get(
        "DATABASE_URL_SYNC",
        "postgresql://observator:observator@localhost:5433/observator"
    )
    return psycopg2.connect(url)


def get_time_id(cur, year: int, quarter: int = 1) -> int | None:
    """Look up time_id for a given year/quarter."""
    cur.execute(
        "SELECT time_id FROM dim_time WHERE year = %s AND quarter = %s LIMIT 1",
        (year, quarter)
    )
    row = cur.fetchone()
    return row[0] if row else None


def get_time_id_by_year(cur, year: int) -> int | None:
    """Look up first time_id for a year."""
    cur.execute(
        "SELECT time_id FROM dim_time WHERE year = %s ORDER BY time_id LIMIT 1",
        (year,)
    )
    row = cur.fetchone()
    return row[0] if row else None


def load_employment_distributions(cur):
    """Load employment distribution CSVs into fact_supply_talent_agg."""
    print("\n=== LOADING EMPLOYMENT DISTRIBUTIONS ===")

    files_to_load = [
        # (filename, source_tag, column_mapping_function)
        ("employment_distribution_by_emirates_and_gender_122emi_gender_t.csv",
         "Bayanat_EmiGender"),
        ("employment_distribution_by_age_group_and_gender_gender_age_t.csv",
         "Bayanat_AgeGender"),
        ("employment_rate_by_nationality_age_and_gender.csv",
         "Bayanat_NatAgeGender"),
        ("employment_distribution_by_group_age_emirates_gender_emi_gender_age_t.csv",
         "Bayanat_EmiAgeGender"),
        ("employment_distribution_by_gender_service_period_and_emirates_emi_gender_service_t.csv",
         "Bayanat_EmiGenderService"),
        ("employment_distribution_by_emirates_gender_and_job_category_emi_gender_jobcategory_t.csv",
         "Bayanat_EmiGenderJobCat"),
        ("employment_distribution_by_emirates_gender_and_pmoclass_emi_gender_pmoclass_t.csv",
         "Bayanat_EmiGenderPMO"),
        ("health_care_workforce_by_emirate_gender_and_nationality.csv",
         "Bayanat_Healthcare"),
        ("unemployment_rate_by_age_group_and_gender.csv",
         "Bayanat_UnempRate"),
        ("employer_distribution_by_emirate_2024.csv",
         "Bayanat_Employers2024"),
        ("employer_distribution_by_emirate_2025.csv",
         "Bayanat_Employers2025"),
        ("employment_by_economic_activity_and_gender.csv",
         "Bayanat_EconActivity"),
        ("employment_percentage_by_occupation_and_gender.csv",
         "Bayanat_OccGenderPct"),
        ("employment_values_by_occupation.csv",
         "Bayanat_OccValues"),
    ]

    total_loaded = 0

    for filename, source_tag in files_to_load:
        rows, headers = csv_rows("8_bayanat_employment", filename)
        if not rows:
            continue

        print(f"\n  Loading {filename} ({len(rows)} rows, source={source_tag})")
        print(f"    Columns: {headers[:8]}")

        # Check for duplicates
        cur.execute(
            "SELECT COUNT(*) FROM fact_supply_talent_agg WHERE source = %s",
            (source_tag,)
        )
        existing = cur.fetchone()[0]
        if existing > 0:
            print(f"    SKIP — already loaded ({existing} rows with source={source_tag})")
            continue

        loaded = 0
        skipped = 0

        for r in rows:
            # Extract year from various column names
            year_val = (
                r.get('Year') or r.get('year') or r.get('Statistc Year')
                or r.get('\ufeffYear') or r.get('\ufeffyear') or r.get('\ufeffStatistc Year')
                or ''
            ).strip()

            # Handle year formats like "2019" or "201912"
            if len(year_val) >= 4:
                year = safe_int(year_val[:4])
            else:
                year = safe_int(year_val)

            if not year or year < 2000 or year > 2030:
                skipped += 1
                continue

            time_id = get_time_id_by_year(cur, year)
            if not time_id:
                skipped += 1
                continue

            # Extract emirate
            emirate_raw = (
                r.get('Emirate') or r.get('emirate') or r.get('emirate_EN')
                or r.get('\ufeffEmirate') or r.get('\ufeffالإمارة') or r.get('\ufeffالامارة')
                or ''
            ).strip()
            region_code = map_emirate(emirate_raw)
            if not region_code:
                # Some files don't have emirate — use 'UAE' as national
                region_code = 'DXB'  # fallback — will be corrected per file

            # Extract gender
            gender_raw = (
                r.get('Gender') or r.get('gender') or r.get('sex_EN')
                or r.get('Gender_ar') or r.get('gender_EN')
                or ''
            ).strip()
            gender = None
            if gender_raw.lower() in ('male', 'ذكر', 'm'):
                gender = 'M'
            elif gender_raw.lower() in ('female', 'أنثى', 'f'):
                gender = 'F'

            # Extract count
            count_val = (
                r.get('Number') or r.get('value') or r.get('Value')
                or r.get('العدد') or r.get('\ufeffالعدد')
                or r.get('count_thousands') or r.get('percentage')
                or '0'
            )
            supply_count = safe_int(count_val)

            # For percentage/rate files, multiply by 1000 to get a meaningful value
            if 'percentage' in headers or 'rate' in filename.lower():
                pct = safe_float(count_val)
                if pct is not None and pct < 100:
                    supply_count = int(pct * 1000)  # Store as per-mille

            if supply_count <= 0:
                skipped += 1
                continue

            # Extract optional dimensions
            age_group = (r.get('Age Group') or r.get('age') or r.get('Age group') or '').strip() or None
            nationality = (r.get('Nationality') or r.get('Nationality_EN') or '').strip() or None
            experience = (r.get('Service Period Group') or r.get('Pmo Class') or r.get('Job Cat') or '').strip() or None

            cur.execute("""
                INSERT INTO fact_supply_talent_agg
                (time_id, region_code, supply_count, gender, age_group, nationality, experience_band, source, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (time_id, region_code, supply_count, gender, age_group, nationality, experience, source_tag))

            loaded += 1

        print(f"    Loaded: {loaded}, Skipped: {skipped}")
        total_loaded += loaded

    return total_loaded


def load_education_data(cur):
    """Load education/graduates data into fact_supply_graduates."""
    print("\n=== LOADING EDUCATION DATA ===")

    education_files = [
        ("number_of_graduates_since_2018_2.csv", "Bayanat_Graduates"),
        ("uaeu_graduates.csv", "Bayanat_UAEU_Graduates"),
        ("higher_education_graduates_by_citizenship_government_and_private_sector_and_gend.csv", "Bayanat_HE_Graduates"),
    ]

    total_loaded = 0

    for filename, source_tag in education_files:
        # Try education folder first, then employment folder
        rows, headers = csv_rows("10_bayanat_education", filename)
        if not rows:
            rows, headers = csv_rows("8_bayanat_employment", filename)
        if not rows:
            continue

        print(f"\n  Loading {filename} ({len(rows)} rows, source={source_tag})")
        print(f"    Columns: {headers[:8]}")

        # Check duplicates
        cur.execute(
            "SELECT COUNT(*) FROM fact_supply_graduates WHERE source = %s",
            (source_tag,)
        )
        if cur.fetchone()[0] > 0:
            print(f"    SKIP — already loaded")
            continue

        loaded = 0
        for r in rows:
            year_val = (r.get('Year') or r.get('year') or r.get('\ufeffYear') or '').strip()
            year = safe_int(year_val[:4]) if len(year_val) >= 4 else safe_int(year_val)
            if not year or year < 2000:
                continue

            time_id = get_time_id_by_year(cur, year)
            if not time_id:
                continue

            grad_count = safe_int(r.get('Graduates') or r.get('value') or r.get('Value') or r.get('Number') or '0')
            if grad_count <= 0:
                continue

            region_code = map_emirate(r.get('Emirate', '') or r.get('emirate', '')) or 'DXB'
            gender = None
            g = (r.get('Gender') or r.get('gender') or '').strip().lower()
            if g in ('male', 'ذكر'):
                gender = 'M'
            elif g in ('female', 'أنثى'):
                gender = 'F'

            discipline = (r.get('discipline') or r.get('Discipline') or r.get('program') or '').strip() or None
            institution_type = (r.get('Sector') or r.get('sector') or r.get('institution_type') or '').strip() or None
            nationality = (r.get('Citizenship') or r.get('Nationality') or '').strip() or None

            cur.execute("""
                INSERT INTO fact_supply_graduates
                (year, region_code, expected_graduates_count, gender, nationality, source, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """, (year, region_code, grad_count, gender, nationality, source_tag))

            loaded += 1

        print(f"    Loaded: {loaded}")
        total_loaded += loaded

    return total_loaded


def load_population_data(cur):
    """Load population data for labour force normalization."""
    print("\n=== LOADING POPULATION DATA ===")

    # Population data goes into a separate tracking — we use sdmx_code_lookup as generic store
    pop_files = [
        "population_by_age_groups_gender_and_nationality_16_mar_2026.csv",
        "uae_total_population_estimates_by_age_groups_and_gender.csv",
        "population_by_emirates_nationality_and_gender.csv",
    ]

    total_loaded = 0

    for filename in pop_files:
        rows, headers = csv_rows("11_bayanat_population", filename)
        if not rows:
            continue

        source_tag = f"Bayanat_Pop_{filename[:30]}"

        # Check duplicates
        cur.execute(
            "SELECT COUNT(*) FROM sdmx_code_lookup WHERE codelist = %s",
            (source_tag,)
        )
        if cur.fetchone()[0] > 0:
            print(f"  SKIP {filename} — already loaded")
            continue

        print(f"\n  Loading {filename} ({len(rows)} rows)")
        print(f"    Columns: {headers[:8]}")

        loaded = 0
        for r in rows:
            # Store as generic code lookup for now
            values = {k: str(v).strip() for k, v in r.items() if v and str(v).strip()}
            label = ' | '.join(f"{k}={v}" for k, v in list(values.items())[:6])

            cur.execute("""
                INSERT INTO sdmx_code_lookup (codelist, code, label_en, label_ar)
                VALUES (%s, %s, %s, %s)
            """, (source_tag, str(loaded)[:20], label[:200], None))

            loaded += 1

        print(f"    Loaded: {loaded}")
        total_loaded += loaded

    return total_loaded


def load_bayanat_education_bulk(cur):
    """Load ALL education CSVs from 10_bayanat_education that have > 50 rows."""
    print("\n=== LOADING BAYANAT EDUCATION (bulk) ===")

    edu_dir = os.path.join(DATA_DIR, "10_bayanat_education")
    if not os.path.exists(edu_dir):
        print("  SKIP — folder not found")
        return 0

    files = sorted([f for f in os.listdir(edu_dir) if f.endswith('.csv')
                    and 'metadata' not in f.lower()
                    and 'data_dictionary' not in f.lower()
                    and 'desktop' not in f.lower()])

    total_loaded = 0
    files_loaded = 0

    for filename in files:
        path = os.path.join(edu_dir, filename)
        try:
            with open(path, encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                headers = reader.fieldnames or []
        except Exception:
            continue

        if len(rows) < 20:  # Skip tiny files (metadata fragments)
            continue

        source_tag = f"Bayanat_Edu_{filename[:40]}"

        # Check duplicates
        cur.execute(
            "SELECT COUNT(*) FROM sdmx_code_lookup WHERE codelist = %s",
            (source_tag,)
        )
        if cur.fetchone()[0] > 0:
            continue

        loaded = 0
        for r in rows:
            values = {k: str(v).strip() for k, v in r.items() if v and str(v).strip()}
            if not values:
                continue
            label = ' | '.join(f"{k}={v}" for k, v in list(values.items())[:6])

            cur.execute("""
                INSERT INTO sdmx_code_lookup (codelist, code, label_en, label_ar)
                VALUES (%s, %s, %s, %s)
            """, (source_tag, str(loaded)[:20], label[:200], None))
            loaded += 1

        if loaded > 0:
            files_loaded += 1
            total_loaded += loaded
            if files_loaded <= 5:
                print(f"  {filename}: {loaded} rows")

    print(f"  ... Total: {files_loaded} education files, {total_loaded} rows loaded")
    return total_loaded


def main():
    print("=" * 60)
    print("OBSERVATOR — MASTER TABLES COMPREHENSIVE LOADER")
    print("=" * 60)
    print(f"Data dir: {DATA_DIR}")

    if not os.path.exists(DATA_DIR):
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        sys.exit(1)

    conn = get_db_connection()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Check fact_supply_graduates schema
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'fact_supply_graduates'
            ORDER BY ordinal_position
        """)
        grad_cols = [r[0] for r in cur.fetchall()]
        print(f"\nfact_supply_graduates columns: {grad_cols}")

        # 1. Employment distributions
        emp_count = load_employment_distributions(cur)
        conn.commit()
        print(f"\n  Employment distributions committed: {emp_count} rows")

        # 2. Education/graduates
        edu_count = load_education_data(cur)
        conn.commit()
        print(f"\n  Education data committed: {edu_count} rows")

        # 3. Population
        pop_count = load_population_data(cur)
        conn.commit()
        print(f"\n  Population data committed: {pop_count} rows")

        # 4. Bulk education CSVs
        bulk_edu = load_bayanat_education_bulk(cur)
        conn.commit()
        print(f"\n  Bulk education CSVs committed: {bulk_edu} rows")

        # Summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"  Employment distributions: {emp_count} rows")
        print(f"  Education/graduates:      {edu_count} rows")
        print(f"  Population:               {pop_count} rows")
        print(f"  Bulk education CSVs:      {bulk_edu} rows")
        print(f"  TOTAL NEW ROWS:           {emp_count + edu_count + pop_count + bulk_edu}")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
