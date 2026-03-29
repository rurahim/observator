"""
Seed supply-side data from refined_data/ into the database.

Usage:
    cd observator-backend
    uv run python scripts/seed_supply_data.py

Phases:
    A: Update institutions (geospatial, website, license)
    B: Load programs (855 from 20 universities)
    C: Load enrollment actual counts (2011-2017)
    D: Load enrollment timeline (2002-2025)
    E: Load graduates actual (UAEU 2018-2024, gov/private by specialty)
    F: Load graduates by institution (2017-2024, percentages)
"""
import csv
import os
import re
import sys
from pathlib import Path

# Allow running from scripts/ directory
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
from sqlalchemy import text
from src.dependencies import get_engine
from sqlalchemy.ext.asyncio import AsyncSession

REFINED = str(Path(__file__).resolve().parents[2] / "refined_data")

# ── Helpers ──

def csv_rows(filepath: str):
    """Yield dicts from a CSV file."""
    if not os.path.exists(filepath):
        print(f"  SKIP (not found): {filepath}")
        return
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {k: (v.strip() if v else None) for k, v in row.items()}

def safe_int(v):
    if not v:
        return None
    v = str(v).replace(",", "").replace("%", "").strip()
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None

def safe_float(v):
    if not v:
        return None
    v = str(v).replace(",", "").replace("%", "").strip()
    try:
        return float(v)
    except (ValueError, TypeError):
        return None

def parse_year(v):
    """Extract first 4-digit year from strings like '2012/2013', '2012-2013', '2012'."""
    if not v:
        return None
    m = re.search(r"(\d{4})", str(v))
    return int(m.group(1)) if m else None

EMIRATE_MAP = {
    "abu dhabi": "AUH", "أبوظبي": "AUH", "أبو ظبي": "AUH",
    "dubai": "DXB", "دبي": "DXB",
    "sharjah": "SHJ", "الشارقة": "SHJ",
    "ajman": "AJM", "عجمان": "AJM",
    "ras al-khaimah": "RAK", "ras al khaimah": "RAK", "رأس الخيمة": "RAK",
    "fujairah": "FUJ", "الفجيرة": "FUJ",
    "umm al-quwain": "UAQ", "umm al quwain": "UAQ", "أم القيوين": "UAQ",
}

def map_emirate(v):
    if not v:
        return None
    return EMIRATE_MAP.get(v.strip().lower(), None)

def norm_gender(v):
    if not v:
        return None
    v = v.strip().lower()
    if v in ("male", "males", "m", "ذكور", "ذكر"):
        return "M"
    if v in ("female", "females", "f", "إناث", "أنثى"):
        return "F"
    return None


async def main():
    engine = get_engine()

    async with AsyncSession(engine) as db:
        # ── Phase A: Update Institutions ──
        print("\n=== Phase A: Update Institutions ===")
        # Load geospatial data
        geo_count = 0
        for row in csv_rows(f"{REFINED}/01_institutions/he_institutions_geospatial.csv"):
            name = row.get("Institution", "").strip()
            lat = safe_float(row.get("Latitude"))
            lng = safe_float(row.get("Longitude"))
            if name and lat and lng:
                await db.execute(text("""
                    UPDATE dim_institution
                    SET latitude = :lat, longitude = :lng
                    WHERE UPPER(TRIM(name_en)) = UPPER(TRIM(:name))
                """), {"name": name, "lat": lat, "lng": lng})
                geo_count += 1

        # Load detailed institution data (website, license)
        detail_count = 0
        for row in csv_rows(f"{REFINED}/01_institutions/he_institutions_detailed.csv"):
            name = row.get("institution_name_en", "").strip()
            name_ar = row.get("institution_name_ar")
            website = row.get("website")
            emirate = row.get("emirate_en")
            if name:
                # Try update first, insert if not found
                result = await db.execute(text("""
                    UPDATE dim_institution
                    SET name_ar = COALESCE(name_ar, :name_ar),
                        website = COALESCE(website, :website),
                        license_status = 'Active'
                    WHERE UPPER(TRIM(name_en)) = UPPER(TRIM(:name))
                """), {"name": name, "name_ar": name_ar, "website": website})
                if result.rowcount == 0:
                    # Insert new institution
                    await db.execute(text("""
                        INSERT INTO dim_institution (name_en, name_ar, emirate, website, license_status)
                        VALUES (:name, :name_ar, :emirate, :website, 'Active')
                        ON CONFLICT (name_en) DO NOTHING
                    """), {"name": name, "name_ar": name_ar, "emirate": emirate, "website": website})
                detail_count += 1

        await db.commit()
        print(f"  Updated {geo_count} with geospatial, {detail_count} with details")

        # ── Phase B: Load Programs ──
        print("\n=== Phase B: Load Programs ===")
        prog_count = 0
        for row in csv_rows(f"{REFINED}/02_programs/all_university_programs.csv"):
            uni_name = row.get("university_name", "").strip()
            prog_name = row.get("program_name", "").strip()
            degree = row.get("degree_level")
            college = row.get("college")
            spec = row.get("specialization")
            source = row.get("source", "web_scrape")
            if not prog_name:
                continue

            # Resolve institution_id
            inst_row = (await db.execute(text(
                "SELECT institution_id FROM dim_institution WHERE UPPER(TRIM(name_en)) LIKE :pat LIMIT 1"
            ), {"pat": f"%{uni_name.upper()[:30]}%"})).fetchone()
            inst_id = inst_row[0] if inst_row else None

            await db.execute(text("""
                INSERT INTO dim_program (program_name, degree_level, specialization, college, institution_id, source)
                VALUES (:pname, :degree, :spec, :college, :inst_id, :source)
                ON CONFLICT (program_name, institution_id, degree_level) DO NOTHING
            """), {
                "pname": prog_name, "degree": degree, "spec": spec,
                "college": college, "inst_id": inst_id, "source": source,
            })
            prog_count += 1

        await db.commit()
        print(f"  Loaded {prog_count} programs")

        # ── Phase C: Load Enrollment Actual Counts ──
        print("\n=== Phase C: Enrollment (Actual Counts) ===")

        # C1: By emirate/sector/gender (2012-2016)
        c1 = 0
        for row in csv_rows(f"{REFINED}/03_enrollment/he_students_by_emirate_sector_gender.csv"):
            year = parse_year(row.get("Year"))
            emirate = row.get("Emirate_En", "").strip()
            region = map_emirate(emirate)
            sector = (row.get("Institution_Sector_En") or "").strip().lower().replace("  ", "")
            gender = norm_gender(row.get("Gender_En"))
            val = safe_int(row.get("Value"))
            if year and val:
                await db.execute(text("""
                    INSERT INTO fact_program_enrollment
                    (year, region_code, sector, gender, enrollment_count, is_estimated, data_type, source)
                    VALUES (:yr, :rc, :sector, :gender, :val, false, 'actual', 'bayanat_emirate_sector')
                """), {"yr": year, "rc": region, "sector": sector, "gender": gender, "val": val})
                c1 += 1
        print(f"  C1 by emirate/sector/gender: {c1} rows")

        # C2: Gov students by specialty (2011-2017)
        c2 = 0
        for row in csv_rows(f"{REFINED}/03_enrollment/he_gov_students_by_specialty.csv"):
            year = parse_year(row.get("Year"))
            spec = row.get("Specialists_En", "").strip()
            nationality = row.get("Nationality_En", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            gender = norm_gender(row.get("Gender_En"))
            val = safe_int(row.get("Value"))
            if year and val and spec:
                await db.execute(text("""
                    INSERT INTO fact_program_enrollment
                    (year, sector, gender, nationality, specialization, enrollment_count, is_estimated, data_type, source)
                    VALUES (:yr, 'government', :gender, :nat, :spec, :val, false, 'actual', 'bayanat_gov_specialty')
                """), {"yr": year, "gender": gender, "nat": nationality, "spec": spec, "val": val})
                c2 += 1
        print(f"  C2 gov by specialty: {c2} rows")

        # C3: Private students by specialty
        c3 = 0
        for row in csv_rows(f"{REFINED}/03_enrollment/he_private_students_by_specialty.csv"):
            year = parse_year(row.get("Year"))
            spec = row.get("Specialists_En", "").strip()
            nationality = row.get("Nationality_En", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            gender = norm_gender(row.get("Gender_En"))
            val = safe_int(row.get("Value"))
            if year and val and spec:
                await db.execute(text("""
                    INSERT INTO fact_program_enrollment
                    (year, sector, gender, nationality, specialization, enrollment_count, is_estimated, data_type, source)
                    VALUES (:yr, 'private', :gender, :nat, :spec, :val, false, 'actual', 'bayanat_private_specialty')
                """), {"yr": year, "gender": gender, "nat": nationality, "spec": spec, "val": val})
                c3 += 1
        print(f"  C3 private by specialty: {c3} rows")

        await db.commit()

        # ── Phase D: Enrollment Timeline ──
        print("\n=== Phase D: Enrollment Timeline ===")
        d_count = 0
        for row in csv_rows(f"{REFINED}/03_enrollment/uae_he_total_enrollment_timeline.csv"):
            year = parse_year(row.get("year"))
            total = safe_int(row.get("total_students"))
            dtype = row.get("data_type", "estimated")
            source = row.get("source", "unknown")
            is_est = dtype in ("estimated", "mixed")
            if year and total:
                await db.execute(text("""
                    INSERT INTO fact_program_enrollment
                    (year, enrollment_count, is_estimated, data_type, source)
                    VALUES (:yr, :val, :est, :dtype, :src)
                """), {"yr": year, "val": total, "est": is_est, "dtype": dtype, "src": source})
                d_count += 1
        await db.commit()
        print(f"  Timeline: {d_count} rows")

        # ── Phase E: Graduates Actual ──
        print("\n=== Phase E: Graduates (Actual) ===")

        # E1: UAEU graduates 2018-2024 (actual counts)
        e1 = 0
        for row in csv_rows(f"{REFINED}/04_graduates/uaeu_graduates_2018_2024.csv"):
            year = parse_year(row.get("Year"))
            college = row.get("College_EN", "").strip()
            degree = row.get("Degree_En", "").strip()
            nationality = row.get("Nationality_En", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            gender = norm_gender(row.get("Gender_En"))
            total = safe_int(row.get("Total"))
            if year and total:
                # Resolve UAEU institution_id
                inst_row = (await db.execute(text(
                    "SELECT institution_id FROM dim_institution WHERE UPPER(name_en) LIKE '%UNITED ARAB EMIRATES UNIVERSITY%' LIMIT 1"
                ))).fetchone()
                inst_id = inst_row[0] if inst_row else None

                await db.execute(text("""
                    INSERT INTO fact_graduate_outcomes
                    (year, institution_id, region_code, college, degree_level, gender, nationality, graduate_count, is_estimated, source)
                    VALUES (:yr, :inst, 'AUH', :college, :degree, :gender, :nat, :total, false, 'bayanat_uaeu')
                """), {"yr": year, "inst": inst_id, "college": college, "degree": degree, "gender": gender, "nat": nationality, "total": total})
                e1 += 1
        print(f"  E1 UAEU graduates: {e1} rows")

        # E2: Gov graduates by specialty
        e2 = 0
        for row in csv_rows(f"{REFINED}/04_graduates/he_gov_graduates_by_specialty.csv"):
            year = parse_year(row.get("Year"))
            spec = row.get("Specialists_En", "").strip()
            nationality = row.get("Nationality_En", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            gender = norm_gender(row.get("Gender_En"))
            val = safe_int(row.get("Value"))
            if year and val:
                await db.execute(text("""
                    INSERT INTO fact_graduate_outcomes
                    (year, specialization, gender, nationality, graduate_count, is_estimated, source)
                    VALUES (:yr, :spec, :gender, :nat, :val, false, 'bayanat_gov_graduates')
                """), {"yr": year, "spec": spec, "gender": gender, "nat": nationality, "val": val})
                e2 += 1
        print(f"  E2 gov graduates: {e2} rows")

        # E3: Private graduates by specialty
        e3 = 0
        for row in csv_rows(f"{REFINED}/04_graduates/he_private_graduates_by_specialty.csv"):
            year = parse_year(row.get("Year"))
            spec = row.get("Specialists_En", "").strip()
            nationality = row.get("Nationality_En", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            gender = norm_gender(row.get("Gender_En"))
            val = safe_int(row.get("Value"))
            if year and val:
                await db.execute(text("""
                    INSERT INTO fact_graduate_outcomes
                    (year, specialization, gender, nationality, graduate_count, is_estimated, source)
                    VALUES (:yr, :spec, :gender, :nat, :val, false, 'bayanat_private_graduates')
                """), {"yr": year, "spec": spec, "gender": gender, "nat": nationality, "val": val})
                e3 += 1
        print(f"  E3 private graduates: {e3} rows")

        await db.commit()

        # ── Phase F: Graduates by Institution (percentages + STEM) ──
        print("\n=== Phase F: Graduates by Institution (Percentages) ===")
        f_count = 0
        for row in csv_rows(f"{REFINED}/04_graduates/he_graduates_by_institution.csv"):
            year = parse_year(row.get("Academic Year"))
            inst_name = row.get("Institution_Name_EN", "").strip()
            degree = row.get("Academic_Degree")
            stem = row.get("STEM_Indicator")
            nationality = row.get("Nationality_EN", "").strip().lower()
            if "non" in nationality:
                nationality = "expat"
            else:
                nationality = "citizen"
            pct_str = row.get("Graduates Percentage", "").replace("%", "").strip()
            pct = safe_float(pct_str)
            emirate = row.get("Institution_Emirate_EN")
            region = map_emirate(emirate)

            if year and inst_name:
                # Resolve institution_id
                inst_row = (await db.execute(text(
                    "SELECT institution_id FROM dim_institution WHERE UPPER(TRIM(name_en)) = UPPER(TRIM(:name)) LIMIT 1"
                ), {"name": inst_name})).fetchone()
                inst_id = inst_row[0] if inst_row else None

                await db.execute(text("""
                    INSERT INTO fact_graduate_outcomes
                    (year, institution_id, region_code, degree_level, stem_indicator, nationality, graduate_pct, is_estimated, source)
                    VALUES (:yr, :inst, :rc, :degree, :stem, :nat, :pct, false, 'bayanat_grad_by_institution')
                """), {
                    "yr": year, "inst": inst_id, "rc": region, "degree": degree,
                    "stem": stem, "nat": nationality, "pct": pct,
                })
                f_count += 1
        await db.commit()
        print(f"  By institution: {f_count} rows")

        # ── Summary ──
        enroll_total = (await db.execute(text("SELECT COUNT(*) FROM fact_program_enrollment"))).scalar()
        grad_total = (await db.execute(text("SELECT COUNT(*) FROM fact_graduate_outcomes"))).scalar()
        prog_total = (await db.execute(text("SELECT COUNT(*) FROM dim_program"))).scalar()
        inst_total = (await db.execute(text("SELECT COUNT(*) FROM dim_institution"))).scalar()

        print(f"\n{'='*60}")
        print(f"SEED COMPLETE")
        print(f"  Institutions: {inst_total}")
        print(f"  Programs: {prog_total}")
        print(f"  Enrollment rows: {enroll_total}")
        print(f"  Graduate rows: {grad_total}")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
