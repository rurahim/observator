"""
Observator — Seed REAL cleaned data from _master_tables into PostgreSQL.
Replaces random dummy data with actual UAE labour market data.

Usage:
  # Inside Docker:
  docker exec -it observator-backend python scripts/seed_real_data.py

  # Local (with .env configured):
  python scripts/seed_real_data.py

Data source: Observator_Data_GDrive/_master_tables/ (628 CSVs, 713K+ rows)
"""
import asyncio
import csv
import os
import re
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

csv.field_size_limit(10**7)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from src.config import settings

# ── Data directory ──────────────────────────────────────────────
DATA_DIR = os.environ.get(
    "DATA_DIR",
    str(Path(__file__).resolve().parent.parent.parent / "Observator_Data_GDrive" / "_master_tables"),
)


# ── Helpers ─────────────────────────────────────────────────────
def csv_rows(folder: str, filename: str) -> tuple[list[dict], list[str]]:
    path = os.path.join(DATA_DIR, folder, filename)
    if not os.path.exists(path):
        print(f"  SKIP (not found): {path}")
        return [], []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader), reader.fieldnames or []


def csv_rows_path(filepath: str) -> tuple[list[dict], list[str]]:
    if not os.path.exists(filepath):
        print(f"  SKIP (not found): {filepath}")
        return [], []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader), reader.fieldnames or []


async def batch_insert(db, sql: str, rows: list[dict], batch_size: int = 500):
    for i in range(0, len(rows), batch_size):
        for row in rows[i : i + batch_size]:
            await db.execute(text(sql), row)
        await db.commit()


async def count_table(db, table: str) -> int:
    result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
    return result.scalar() or 0


# ── Emirate region code mapping ─────────────────────────────────
EMIRATE_RC = {
    "Abu Dhabi": "AUH", "Dubai": "DXB", "Sharjah": "SHJ",
    "Ajman": "AJM", "Ras Al Khaimah": "RAK", "Ras al-Khaimah": "RAK",
    "Fujairah": "FUJ", "Umm Al Quwain": "UAQ",
    "Abu Dhabi Emirate": "AUH", "Sharjah Emirate": "SHJ", "Al Ain": "AUH",
}

# ── ISCO major group mapping (Bayanat Occupation_EN values) ─────
BAYANAT_ISCO_MAP = {
    "1-Managers": "1",
    "2-Professionals": "2",
    "3-Technicians and associate professionals": "3",
    "4-Clerical support workers": "4",
    "5-Service and sales workers": "5",
    "6-Skilled agricultural": "6",  # truncated in CSV
    "7-Craft and related trades workers": "7",
    "8-Plant and machine operators": "8",  # truncated in CSV
    "9-Elementary occupations": "9",
    "X-NA": None,
}


def resolve_bayanat_isco(occupation_en: str) -> str | None:
    """Map Bayanat Occupation_EN to ISCO major group code."""
    occ = occupation_en.strip().strip('"')
    # Direct match
    if occ in BAYANAT_ISCO_MAP:
        return BAYANAT_ISCO_MAP[occ]
    # Prefix match (handles truncated values)
    for key, val in BAYANAT_ISCO_MAP.items():
        if occ.startswith(key[:5]):
            return val
    # Try first character if it's a digit
    if occ and occ[0].isdigit():
        return occ[0]
    return None


# ── Fuzzy matching: LinkedIn job title → ESCO 4-digit occupation ──
from src.ingestion.esco_matcher import EscoMatcher, tokenize  # noqa: E402


# ── Main seed function ──────────────────────────────────────────
async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:

        # ════════════════════════════════════════════════════════
        # STEP 1: ESCO Occupations -> dim_occupation
        # ════════════════════════════════════════════════════════
        print("\n[1/13] ESCO Occupations -> dim_occupation")
        rows, _ = csv_rows("4_taxonomy_esco", "esco_occupations.csv")
        if rows:
            await db.execute(text("TRUNCATE dim_occupation CASCADE"))
            await db.commit()

            inserts = []
            for r in rows:
                isco = r.get("isco_group", "")
                # Extract ISCO code from URI format if needed
                if "/" in isco:
                    isco = isco.split("/")[-1].lstrip("C")
                inserts.append({
                    "isco": isco[:10] or None,
                    "esco": r.get("esco_uri", "")[:200],
                    "en": r.get("occupation_en", "")[:300],
                    "ar": r.get("occupation_ar", "")[:300],
                    "major": isco[:1] if isco else None,
                })

            await batch_insert(db, """
                INSERT INTO dim_occupation (code_isco, code_esco, title_en, title_ar, isco_major_group)
                VALUES (:isco, :esco, :en, :ar, :major)
            """, inserts)
            print(f"  OK {len(inserts)} occupations (EN+AR bilingual)")

        # ════════════════════════════════════════════════════════
        # STEP 2: ESCO Skills -> dim_skill
        # ════════════════════════════════════════════════════════
        print("\n[2/13] ESCO Skills -> dim_skill")
        rows, _ = csv_rows("4_taxonomy_esco", "esco_skills.csv")
        if rows:
            await db.execute(text("TRUNCATE dim_skill CASCADE"))
            await db.commit()

            inserts = []
            for r in rows:
                inserts.append({
                    "uri": r.get("esco_uri", "")[:300],
                    "en": r.get("skill_en", "")[:300],
                    "ar": r.get("skill_ar", "")[:300],
                    "type": r.get("skill_type", "")[:20],
                })

            await batch_insert(db, """
                INSERT INTO dim_skill (uri_esco, label_en, label_ar, skill_type, taxonomy)
                VALUES (:uri, :en, :ar, :type, 'ESCO')
            """, inserts)
            print(f"  OK {len(inserts)} skills (EN+AR bilingual)")

        # ════════════════════════════════════════════════════════
        # STEP 3: Institutions -> dim_institution
        # ════════════════════════════════════════════════════════
        print("\n[3/13] UAE Institutions -> dim_institution")
        rows, _ = csv_rows("2_supply_education", "uae_he_institutions_master.csv")
        if rows:
            await db.execute(text("TRUNCATE dim_institution CASCADE"))
            await db.commit()

            inserts = []
            for r in rows:
                inserts.append({
                    "en": r.get("institution_en", "")[:300],
                    "ar": r.get("institution_ar", "")[:300],
                    "emirate": r.get("emirate_en", "")[:50] or None,
                    "type": r.get("sector_en", "")[:50] or None,
                })

            await batch_insert(db, """
                INSERT INTO dim_institution (name_en, name_ar, emirate, institution_type)
                VALUES (:en, :ar, :emirate, :type)
            """, inserts)
            print(f"  OK {len(inserts)} institutions")

        # ════════════════════════════════════════════════════════
        # STEP 4: Crosswalk SOC↔ISCO -> crosswalk_soc_isco
        # ════════════════════════════════════════════════════════
        print("\n[4/13] SOC-ISCO Crosswalk -> crosswalk_soc_isco")
        rows, _ = csv_rows("7_crosswalks", "bls_isco08_to_soc2010_crosswalk.csv")
        if rows:
            await db.execute(text("TRUNCATE crosswalk_soc_isco"))
            await db.commit()

            inserts = []
            for r in rows:
                soc = r.get("soc2010_code", "").strip()
                isco = r.get("isco08_code", "").strip()
                if soc and isco:
                    inserts.append({
                        "soc": soc[:10], "soc_t": r.get("soc2010_title", "")[:300],
                        "isco": isco[:10], "isco_t": r.get("isco08_title", "")[:300],
                        "match": (r.get("part_flag", "") or "exact")[:20],
                    })

            await batch_insert(db, """
                INSERT INTO crosswalk_soc_isco (soc_code, soc_title, isco_code, isco_title, match_type)
                VALUES (:soc, :soc_t, :isco, :isco_t, :match)
                ON CONFLICT (soc_code, isco_code) DO NOTHING
            """, inserts)
            print(f"  OK {len(inserts)} crosswalk rows")

        # ════════════════════════════════════════════════════════
        # STEP 5: Occupation-Skill Map -> fact_occupation_skills
        # ════════════════════════════════════════════════════════
        print("\n[5/13] ESCO Occupation-Skill Map -> fact_occupation_skills")
        rows, _ = csv_rows("4_taxonomy_esco", "esco_occupation_skill_map.csv")
        if rows:
            await db.execute(text("TRUNCATE fact_occupation_skills"))
            await db.commit()

            # Build URI -> ID maps
            occ_q = await db.execute(text("SELECT occupation_id, code_esco FROM dim_occupation WHERE code_esco IS NOT NULL"))
            occ_map = {r.code_esco: r.occupation_id for r in occ_q.fetchall()}

            skill_q = await db.execute(text("SELECT skill_id, uri_esco FROM dim_skill WHERE uri_esco IS NOT NULL"))
            skill_map = {r.uri_esco: r.skill_id for r in skill_q.fetchall()}

            inserts = []
            for r in rows:
                oid = occ_map.get(r.get("occupation_uri", ""))
                sid = skill_map.get(r.get("skill_uri", ""))
                if oid and sid:
                    inserts.append({
                        "oid": oid, "sid": sid,
                        "rel": r.get("relation_type", "")[:20],
                    })

            await batch_insert(db, """
                INSERT INTO fact_occupation_skills (occupation_id, skill_id, relation_type, source)
                VALUES (:oid, :sid, :rel, 'ESCO')
            """, inserts)
            print(f"  OK {len(inserts)} occupation-skill relations")

        # ════════════════════════════════════════════════════════
        # STEP 6: AI Impact -> fact_ai_exposure_occupation
        # ════════════════════════════════════════════════════════
        print("\n[6/13] AI Impact (AIOE) -> fact_ai_exposure_occupation")
        rows, _ = csv_rows("6_ai_impact", "aioe_occupation_scores.csv")
        if rows:
            await db.execute(text("TRUNCATE fact_ai_exposure_occupation"))
            await db.commit()

            # Build SOC -> ISCO -> occ_id chain
            xwalk_q = await db.execute(text("SELECT soc_code, isco_code FROM crosswalk_soc_isco"))
            soc_isco = {r.soc_code: r.isco_code for r in xwalk_q.fetchall()}

            occ_q = await db.execute(text("SELECT occupation_id, code_isco FROM dim_occupation WHERE code_isco IS NOT NULL"))
            isco_occ = {}
            for r in occ_q.fetchall():
                isco_occ[r.code_isco] = r.occupation_id

            inserts = []
            scores = []
            for r in rows:
                try:
                    aioe = float(r.get("AIOE", 0))
                except (ValueError, TypeError):
                    continue
                scores.append(aioe)

            # Min-max normalize
            if scores:
                mn, mx = min(scores), max(scores)
                rng = mx - mn if mx != mn else 1

            for r in rows:
                soc = r.get("SOC Code", "").strip()
                try:
                    aioe = float(r.get("AIOE", 0))
                except (ValueError, TypeError):
                    continue

                # Resolve SOC -> ISCO -> occupation_id
                isco = soc_isco.get(soc, "")
                oid = isco_occ.get(isco)
                if not oid and isco:
                    oid = isco_occ.get(isco[:3])
                if not oid and isco:
                    oid = isco_occ.get(isco[:2])

                if oid:
                    inserts.append({
                        "oid": oid,
                        "z": aioe,
                        "pct": round((aioe - mn) / rng * 100, 2),
                        "src": "AIOE", "ver": "2023",
                    })

            await batch_insert(db, """
                INSERT INTO fact_ai_exposure_occupation
                (occupation_id, exposure_z, exposure_0_100, source, version)
                VALUES (:oid, :z, :pct, :src, :ver)
            """, inserts)
            print(f"  OK {len(inserts)} AI exposure scores")

        # Also load Frey-Osborne and OpenAI GPTs
        for fname, soc_col, val_col, src, ver in [
            ("FreyOsborne_Automation_Probability_702_Occupations.csv", "_ - code", "prob", "FreyOsborne", "2013"),
            ("OpenAI_GPTs_are_GPTs_LLM_Exposure_1016_Occupations.csv", "O*NET-SOC Code", "dv_rating_beta", "GPTs_are_GPTs", "2023"),
        ]:
            ai_folder = os.path.join(DATA_DIR, "..", "3_TAXONOMY__Skills_Occupations", "3d_AI_Impact__Full_Dataset_Collection")
            fpath = os.path.join(ai_folder, fname)
            if os.path.exists(fpath):
                with open(fpath, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    ai_rows = list(reader)

                inserts2 = []
                for r in ai_rows:
                    soc = r.get(soc_col, "").strip()
                    try:
                        val = float(r.get(val_col, 0))
                    except (ValueError, TypeError):
                        continue

                    isco = soc_isco.get(soc, soc_isco.get(soc.split(".")[0], ""))
                    oid = isco_occ.get(isco) if isco else None
                    if not oid and isco:
                        oid = isco_occ.get(isco[:3])

                    if oid:
                        params = {"oid": oid, "src": src, "ver": ver}
                        if src == "FreyOsborne":
                            params["auto"] = val
                            params["pct"] = round(val * 100, 2)
                        else:
                            params["llm"] = val
                            params["pct"] = round(val * 100, 2)
                            params["auto"] = None

                        inserts2.append(params)

                if src == "FreyOsborne":
                    await batch_insert(db, """
                        INSERT INTO fact_ai_exposure_occupation
                        (occupation_id, automation_probability, exposure_0_100, source, version)
                        VALUES (:oid, :auto, :pct, :src, :ver)
                    """, inserts2)
                else:
                    await batch_insert(db, """
                        INSERT INTO fact_ai_exposure_occupation
                        (occupation_id, llm_exposure, exposure_0_100, source, version)
                        VALUES (:oid, :llm, :pct, :src, :ver)
                    """, inserts2)

                print(f"  OK {len(inserts2)} {src} scores")

        # ════════════════════════════════════════════════════════
        # STEP 7: LinkedIn Jobs -> fact_demand_vacancies_agg
        #   Now with FUZZY MATCHING to 4-digit ESCO occupations
        # ════════════════════════════════════════════════════════
        print("\n[7/13] LinkedIn UAE Jobs -> fact_demand_vacancies_agg (fuzzy-matched)")
        rows, _ = csv_rows("3_demand_jobs", "linkedin_uae_job_postings_2024_2025.csv")

        # Build ESCO occupation index grouped by major group (for fuzzy matching)
        all_occ_q = await db.execute(text(
            "SELECT occupation_id, title_en, isco_major_group FROM dim_occupation "
            "WHERE isco_major_group IS NOT NULL AND title_en IS NOT NULL"
        ))
        matcher = EscoMatcher()
        esco_by_group_raw: dict[str, list[tuple[int, str, set[str]]]] = defaultdict(list)
        all_esco_combined: list[tuple[int, str, set[str]]] = []
        oid_to_mg: dict[int, str] = {}

        for r in all_occ_q.fetchall():
            tokens = tokenize(r.title_en)
            entry = (r.occupation_id, r.title_en, tokens)
            esco_by_group_raw[r.isco_major_group].append(entry)
            all_esco_combined.append(entry)
            oid_to_mg[r.occupation_id] = r.isco_major_group

        # Register each major group + the __ALL__ group in the matcher
        for mg, occs in esco_by_group_raw.items():
            matcher.add_group(mg, occs)
        matcher.add_group("__ALL__", all_esco_combined)
        print(f"  ESCO matcher: {len(all_esco_combined)} occupations indexed, {len(esco_by_group_raw)} major groups")

        # Map LinkedIn occupation labels to ISCO major group codes
        isco_text = {
            "1-Manager": "1", "2-Professional": "2",
            "3-Technicians and Associate Professional": "3",
            "4-Clerical Support Worker": "4",
            "5-Service and Sales Worker": "5",
            "6-Skilled Agricultural, Forestry and Fishery Worker": "6",
            "7-Craft and Related Trades Worker": "7",
            "8-Plant and Machine Operators, and Assembler": "8",
            "9-Elementary Occupation": "9",
            "0-Armed Forces Occupations": "0",
        }

        # Track demand distribution per major group (for Step 8 supply disaggregation)
        demand_distribution: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))

        if rows:
            await db.execute(text("TRUNCATE fact_demand_vacancies_agg"))
            await db.commit()

            # Time lookup
            time_q = await db.execute(text("SELECT time_id, date FROM dim_time"))
            date_time = {str(r.date): r.time_id for r in time_q.fetchall()}

            inserts = []
            skipped = 0
            matched = 0
            matched_no_label = 0
            unmatched = 0
            for r in rows:
                tid = date_time.get(r.get("date", ""))
                if not tid:
                    skipped += 1
                    continue

                location = r.get("location", "")
                rc = EMIRATE_RC.get(location, "DXB")
                exp = r.get("experience", "")

                # Get ISCO major group from the occupation label
                occ_label = r.get("occupation", "").strip()
                mg = isco_text.get(occ_label)
                job_title = r.get("job_title", "").strip()

                oid = None
                if job_title:
                    if mg:
                        # Has major group label — match within that group
                        oid = matcher.match(job_title, mg)
                    else:
                        # No major group label (62% of data!) — match across ALL ESCO occupations
                        oid = matcher.match(job_title, "__ALL__")

                if oid:
                    matched += 1
                    resolved_mg = mg or oid_to_mg.get(oid, "")
                    if resolved_mg:
                        demand_distribution[resolved_mg][oid] += 1
                    if not mg:
                        matched_no_label += 1
                else:
                    unmatched += 1

                inserts.append({
                    "tid": tid, "rc": rc, "oid": oid,
                    "exp": exp[:20] if exp else None,
                })

            await batch_insert(db, """
                INSERT INTO fact_demand_vacancies_agg
                (time_id, region_code, occupation_id, experience_band, demand_count, source, created_at)
                VALUES (:tid, :rc, :oid, :exp, 1, 'LinkedIn', NOW())
            """, inserts)
            unique_matched = len(set(v for d in demand_distribution.values() for v in d.keys()))
            print(f"  OK {len(inserts)} demand rows")
            print(f"    {matched} fuzzy-matched to {unique_matched} unique occupations")
            print(f"    {matched_no_label} matched without occupation label (cross-group)")
            print(f"    {unmatched} unmatched, {skipped} skipped")
            for mg in sorted(demand_distribution.keys()):
                top3 = sorted(demand_distribution[mg].items(), key=lambda x: -x[1])[:3]
                print(f"    ISCO {mg}: {len(demand_distribution[mg])} occupations")

        # ════════════════════════════════════════════════════════
        # STEP 8: Bayanat Occupation -> PRIMARY Supply
        #   PROPORTIONAL DISTRIBUTION using LinkedIn demand weights
        #   Instead of mapping all workers to 1 random occupation per group,
        #   we distribute headcounts across 4-digit occupations based on
        #   how LinkedIn demand is distributed within each ISCO major group.
        # ════════════════════════════════════════════════════════
        print("\n[8/13] Bayanat Occupation -> fact_supply_talent_agg (PROPORTIONAL DISTRIBUTION)")
        await db.execute(text("TRUNCATE fact_supply_talent_agg"))
        await db.commit()

        # Build weight vectors from LinkedIn demand distribution
        # {major_group: [(occupation_id, weight), ...]} where weights sum to 1.0
        weight_vectors: dict[str, list[tuple[int, float]]] = {}
        for mg, occ_counts in demand_distribution.items():
            total = sum(occ_counts.values())
            if total > 0:
                # Sort by count descending, take top 50 to avoid noise from single-job occupations
                sorted_occs = sorted(occ_counts.items(), key=lambda x: -x[1])
                # Filter: only include occupations with at least 0.5% of group demand
                threshold = max(1, total * 0.005)
                filtered = [(oid, cnt) for oid, cnt in sorted_occs if cnt >= threshold]
                if not filtered:
                    filtered = sorted_occs[:20]
                filtered_total = sum(cnt for _, cnt in filtered)
                weight_vectors[mg] = [(oid, cnt / filtered_total) for oid, cnt in filtered]

        # Fallback: for groups with no LinkedIn data, use first occupation
        occ_major_q = await db.execute(text(
            "SELECT occupation_id, isco_major_group FROM dim_occupation WHERE isco_major_group IS NOT NULL"
        ))
        occ_by_isco_major = {}
        for r in occ_major_q.fetchall():
            if r.isco_major_group not in occ_by_isco_major:
                occ_by_isco_major[r.isco_major_group] = r.occupation_id

        # Time lookup
        time_q = await db.execute(text("SELECT time_id, year FROM dim_time WHERE month = 1"))
        year_time = {r.year: r.time_id for r in time_q.fetchall()}

        # Log weight vector stats
        for mg in sorted(weight_vectors.keys()):
            wv = weight_vectors[mg]
            print(f"    ISCO {mg}: distributing across {len(wv)} occupations (top weight: {wv[0][1]:.1%})")

        bayanat_occ_path = os.path.join(
            DATA_DIR, "8_bayanat_employment",
            "employment_by_occupation_in_private_sector_data_set.csv"
        )
        byn_rows, _ = csv_rows_path(bayanat_occ_path)
        if byn_rows:
            inserts = []
            skipped = 0
            distributed = 0
            for r in byn_rows:
                year_str = r.get("Year", "")
                try:
                    yr = int(str(year_str)[:4])
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                count_str = r.get("E_MOHRE_Count", "0")
                try:
                    count = int(count_str)
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                if yr < 2010 or count <= 0:
                    skipped += 1
                    continue

                tid = year_time.get(yr)
                if not tid:
                    skipped += 1
                    continue

                occ_en = r.get("Occupation_EN", "")
                isco_mg = resolve_bayanat_isco(occ_en)
                if not isco_mg:
                    skipped += 1
                    continue

                emirate = r.get("Emirate_EN", "")
                rc = EMIRATE_RC.get(emirate, "AUH")
                gender = (r.get("Gender_EN", "") or "").strip() or None
                age = (r.get("Age_Class_En", "") or "").strip() or None

                # PROPORTIONAL DISTRIBUTION: split this headcount across 4-digit occupations
                wv = weight_vectors.get(isco_mg)
                if wv:
                    remainder = count
                    for i, (oid, weight) in enumerate(wv):
                        if i == len(wv) - 1:
                            # Last occupation gets the remainder to avoid rounding loss
                            portion = remainder
                        else:
                            portion = round(count * weight)
                            remainder -= portion

                        if portion <= 0:
                            continue

                        inserts.append({
                            "tid": tid, "rc": rc, "oid": oid,
                            "gender": gender[:10] if gender else None,
                            "age": age[:20] if age else None,
                            "supply": portion,
                            "source": "Bayanat_MOHRE",
                        })
                    distributed += 1
                else:
                    # Fallback: no LinkedIn data for this major group
                    oid = occ_by_isco_major.get(isco_mg)
                    if oid:
                        inserts.append({
                            "tid": tid, "rc": rc, "oid": oid,
                            "gender": gender[:10] if gender else None,
                            "age": age[:20] if age else None,
                            "supply": count,
                            "source": "Bayanat_MOHRE",
                        })
                    else:
                        skipped += 1

            await batch_insert(db, """
                INSERT INTO fact_supply_talent_agg
                (time_id, region_code, occupation_id, gender, age_group, supply_count, source, created_at)
                VALUES (:tid, :rc, :oid, :gender, :age, :supply, :source, NOW())
            """, inserts)
            print(f"  OK {len(inserts)} supply rows ({distributed} distributed across 4-digit occupations, {skipped} skipped)")
        else:
            print("  SKIP: Bayanat occupation file not found")

        # ════════════════════════════════════════════════════════
        # STEP 9: Bayanat Sector -> Enriches Supply with sector_id
        # ════════════════════════════════════════════════════════
        print("\n[9/13] Bayanat Economic Sector -> fact_supply_talent_agg (sector-linked)")

        # Build sector lookup
        sector_q = await db.execute(text("SELECT sector_id, label_en FROM dim_sector"))
        sector_map = {}
        for r in sector_q.fetchall():
            sector_map[r.label_en.lower().strip()] = r.sector_id

        # Also insert missing sectors from Bayanat Activity_EN values
        bayanat_activities = [
            "Agriculture", "Business activities", "Construction", "Education",
            "Electricity", "Extraterritorial organizations", "Financial intermediation",
            "Fishing", "Health and social work", "Hotels and restaurants",
            "Manufacturing", "Mining and quarrying", "Private households",
            "Public administration", "Social and personal services",
            "Trade and repair services", "Transport",
        ]
        for act in bayanat_activities:
            if act.lower().strip() not in sector_map:
                res = await db.execute(text("""
                    INSERT INTO dim_sector (label_en, label_ar)
                    VALUES (:en, :en)
                    RETURNING sector_id
                """), {"en": act})
                row = res.fetchone()
                if row:
                    sector_map[act.lower().strip()] = row.sector_id
                    await db.commit()
        # Re-fetch to get all sectors
        sector_q2 = await db.execute(text("SELECT sector_id, label_en FROM dim_sector"))
        sector_map = {r.label_en.lower().strip(): r.sector_id for r in sector_q2.fetchall()}

        bayanat_sector_path = os.path.join(
            DATA_DIR, "8_bayanat_employment",
            "employment_by_economic_sector_in_private_sector_data_set.csv"
        )
        byn_rows, _ = csv_rows_path(bayanat_sector_path)
        if byn_rows:
            inserts = []
            skipped = 0

            # Bayanat sector file has Skill_EN which maps to ISCO skill levels
            skill_isco_map = {
                "Professional Worker": "2",
                "Skilled Worker": "7",
                "Limited Skilled Worker": "9",
            }

            for r in byn_rows:
                year_str = r.get("Year", "")
                try:
                    yr = int(str(year_str)[:4])
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                count_str = r.get("E_MOHRE_Count", "0")
                try:
                    count = int(count_str)
                except (ValueError, TypeError):
                    skipped += 1
                    continue

                if yr < 2010 or count <= 0:
                    skipped += 1
                    continue

                tid = year_time.get(yr)
                if not tid:
                    skipped += 1
                    continue

                # Map Activity_EN -> sector_id
                activity = r.get("Activity_EN", "").strip().strip('"')
                sid = sector_map.get(activity.lower())
                if not sid:
                    skipped += 1
                    continue

                # Map Skill_EN -> approximate ISCO major group
                skill_en = r.get("Skill_EN", "").strip()
                isco_mg = skill_isco_map.get(skill_en)

                emirate = r.get("Emirate_EN", "")
                rc = EMIRATE_RC.get(emirate, "AUH")
                gender = (r.get("Gender_EN", "") or "").strip() or None
                age = (r.get("Age_Class_EN", r.get("Age_Class_Ar", "")) or "").strip() or None

                # Use proportional distribution if available
                wv = weight_vectors.get(isco_mg) if isco_mg else None
                if wv:
                    remainder = count
                    for i, (oid, weight) in enumerate(wv):
                        portion = remainder if i == len(wv) - 1 else round(count * weight)
                        remainder -= portion
                        if portion <= 0:
                            continue
                        inserts.append({
                            "tid": tid, "rc": rc, "oid": oid, "sid": sid,
                            "gender": gender[:10] if gender else None,
                            "age": age[:20] if age else None,
                            "supply": portion,
                            "source": "Bayanat_Activity",
                        })
                else:
                    oid = occ_by_isco_major.get(isco_mg) if isco_mg else None
                    inserts.append({
                        "tid": tid, "rc": rc, "oid": oid, "sid": sid,
                        "gender": gender[:10] if gender else None,
                        "age": age[:20] if age else None,
                        "supply": count,
                        "source": "Bayanat_Activity",
                    })

            await batch_insert(db, """
                INSERT INTO fact_supply_talent_agg
                (time_id, region_code, occupation_id, sector_id, gender, age_group, supply_count, source, created_at)
                VALUES (:tid, :rc, :oid, :sid, :gender, :age, :supply, :source, NOW())
            """, inserts)
            print(f"  OK {len(inserts)} Bayanat sector rows ({skipped} skipped)")
        else:
            print("  SKIP: Bayanat sector file not found")

        # ════════════════════════════════════════════════════════
        # STEP 10: FCSC -> Macro Context (trends, not gap calc)
        # ════════════════════════════════════════════════════════
        print("\n[10/13] FCSC Employment -> fact_supply_talent_agg (macro context)")
        fcsc_rows, _ = csv_rows("1_supply_workforce", "fcsc_employment_master.csv")
        if fcsc_rows:
            inserts = []
            for r in fcsc_rows:
                year = r.get("year", "")
                try:
                    yr = int(year)
                except (ValueError, TypeError):
                    continue

                tid = year_time.get(yr)
                if not tid:
                    continue

                try:
                    pct = float(r.get("pct", 0))
                    # FCSC data is percentage of total workforce (~6M UAE workers)
                    UAE_WORKFORCE = 6_000_000
                    supply = int(pct / 100 * UAE_WORKFORCE) if pct > 1 else int(pct * UAE_WORKFORCE)
                except (ValueError, TypeError):
                    continue

                dim_type = r.get("dimension_type", "")
                dim_value = r.get("dimension_value", "")

                inserts.append({
                    "tid": tid, "rc": "AUH",
                    "gender": r.get("gender", "")[:10] or None,
                    "nationality": r.get("nationality", "")[:20] or None,
                    "age": dim_value[:20] if dim_type == "age_group" else None,
                    "edu": dim_value[:50] if dim_type == "education_level" else None,
                    "wage": dim_value[:20] if dim_type == "wage_band" else None,
                    "supply": supply, "source": "FCSC",
                })

            await batch_insert(db, """
                INSERT INTO fact_supply_talent_agg
                (time_id, region_code, gender, nationality, age_group, education_level, wage_band, supply_count, source, created_at)
                VALUES (:tid, :rc, :gender, :nationality, :age, :edu, :wage, :supply, :source, NOW())
            """, inserts)
            print(f"  OK {len(inserts)} FCSC employment rows")

        # Also load FCSC labour force + unemployment
        for fname, source_tag in [
            ("fcsc_labour_force_master.csv", "FCSC_LF"),
            ("fcsc_unemployment_master.csv", "FCSC_UNEMP"),
        ]:
            extra_rows, _ = csv_rows("1_supply_workforce", fname)
            if extra_rows:
                extra_inserts = []
                for r in extra_rows:
                    try:
                        yr = int(r.get("year", 0))
                        val = float(r.get("value_pct", 0))
                    except (ValueError, TypeError):
                        continue

                    tid = year_time.get(yr)
                    if not tid:
                        continue

                    dim_type = r.get("dimension_type", "")
                    dim_value = r.get("dimension_value", "")

                    # Convert percentage to estimated headcount
                    UAE_WORKFORCE = 6_000_000
                    supply_count = int(val / 100 * UAE_WORKFORCE) if val > 1 else int(val * UAE_WORKFORCE)
                    if supply_count <= 0:
                        continue

                    extra_inserts.append({
                        "tid": tid, "rc": "AUH",
                        "gender": r.get("gender", "")[:10] or None,
                        "nationality": r.get("nationality", "")[:20] or None,
                        "age": dim_value[:20] if dim_type == "age_group" else None,
                        "edu": dim_value[:50] if dim_type == "education_level" else None,
                        "supply": supply_count, "source": source_tag,
                    })

                await batch_insert(db, """
                    INSERT INTO fact_supply_talent_agg
                    (time_id, region_code, gender, nationality, age_group, education_level, supply_count, source, created_at)
                    VALUES (:tid, :rc, :gender, :nationality, :age, :edu, :supply, :source, NOW())
                """, extra_inserts)
                print(f"  OK {len(extra_inserts)} {source_tag} rows")

        # ════════════════════════════════════════════════════════
        # STEP 11: O*NET Skills + Knowledge -> fact_occupation_skills
        # ════════════════════════════════════════════════════════
        print("\n[11/13] O*NET Skills + Knowledge -> fact_occupation_skills")

        # Build SOC -> ISCO -> occupation_id chain
        xwalk_q = await db.execute(text("SELECT soc_code, isco_code FROM crosswalk_soc_isco"))
        soc_isco = {r.soc_code: r.isco_code for r in xwalk_q.fetchall()}

        occ_q = await db.execute(text("SELECT occupation_id, code_isco FROM dim_occupation WHERE code_isco IS NOT NULL"))
        isco_occ = {}
        for r in occ_q.fetchall():
            isco_occ[r.code_isco] = r.occupation_id

        # Build skill label -> skill_id map (for matching O*NET skill names to ESCO skills)
        skill_label_q = await db.execute(text("SELECT skill_id, label_en FROM dim_skill"))
        skill_label_map = {r.label_en.lower().strip(): r.skill_id for r in skill_label_q.fetchall()}

        def resolve_soc_to_occ_id(soc_code: str) -> int | None:
            """Resolve O*NET SOC code -> ISCO -> occupation_id with fallbacks."""
            soc = soc_code.strip()
            # Try exact SOC match
            isco = soc_isco.get(soc)
            if not isco:
                # Try without decimal (e.g., "11-1011.00" -> "11-1011")
                isco = soc_isco.get(soc.split(".")[0])
            if not isco:
                return None

            oid = isco_occ.get(isco)
            if not oid:
                oid = isco_occ.get(isco[:3])
            if not oid:
                oid = isco_occ.get(isco[:2])
            return oid

        onet_loaded = 0

        for onet_file, source_tag in [
            ("onet_skills.csv", "O*NET_Skills"),
            ("onet_knowledge.csv", "O*NET_Knowledge"),
        ]:
            onet_rows, _ = csv_rows("5_taxonomy_onet", onet_file)
            if not onet_rows:
                continue

            # Filter to Importance scale (scale_id = IM) only
            inserts = []
            seen = set()  # Avoid duplicate (occupation_id, skill_name) pairs
            for r in onet_rows:
                scale_id = r.get("Scale ID", "")
                if scale_id != "IM":
                    continue

                soc = r.get("O*NET-SOC Code", "")
                oid = resolve_soc_to_occ_id(soc)
                if not oid:
                    continue

                element_name = r.get("Element Name", "").strip()
                if not element_name:
                    continue

                # Try to match to existing ESCO skill by name
                sid = skill_label_map.get(element_name.lower())

                # If no match, create a new skill entry
                if not sid:
                    # Insert new skill and cache it
                    res = await db.execute(text("""
                        INSERT INTO dim_skill (label_en, skill_type, taxonomy)
                        VALUES (:en, :type, :tax)
                        RETURNING skill_id
                    """), {
                        "en": element_name[:300],
                        "type": "knowledge" if "Knowledge" in source_tag else "skill",
                        "tax": "O*NET",
                    })
                    new_row = res.fetchone()
                    if new_row:
                        sid = new_row.skill_id
                        skill_label_map[element_name.lower()] = sid
                        await db.commit()

                if not sid:
                    continue

                key = (oid, sid)
                if key in seen:
                    continue
                seen.add(key)

                try:
                    importance = float(r.get("Data Value", 0))
                except (ValueError, TypeError):
                    importance = 0

                inserts.append({
                    "oid": oid, "sid": sid,
                    "rel": "essential" if importance >= 3.5 else "optional",
                    "src": source_tag,
                })

            await batch_insert(db, """
                INSERT INTO fact_occupation_skills (occupation_id, skill_id, relation_type, source)
                VALUES (:oid, :sid, :rel, :src)
                ON CONFLICT DO NOTHING
            """, inserts)
            onet_loaded += len(inserts)
            print(f"  OK {len(inserts)} {source_tag} mappings")

        # Load O*NET technology skills (hot technologies)
        tech_rows, _ = csv_rows("5_taxonomy_onet", "onet_technology_skills.csv")
        if tech_rows:
            inserts = []
            seen = set()
            for r in tech_rows:
                soc = r.get("O*NET-SOC Code", "")
                oid = resolve_soc_to_occ_id(soc)
                if not oid:
                    continue

                # Use "Example" column as the technology name
                tech_name = r.get("Example", r.get("Commodity Title", "")).strip()
                if not tech_name:
                    continue

                sid = skill_label_map.get(tech_name.lower())
                if not sid:
                    res = await db.execute(text("""
                        INSERT INTO dim_skill (label_en, skill_type, taxonomy)
                        VALUES (:en, 'technology', 'O*NET')
                        RETURNING skill_id
                    """), {"en": tech_name[:300]})
                    new_row = res.fetchone()
                    if new_row:
                        sid = new_row.skill_id
                        skill_label_map[tech_name.lower()] = sid
                        await db.commit()

                if not sid:
                    continue

                key = (oid, sid)
                if key in seen:
                    continue
                seen.add(key)

                hot = r.get("Hot Technology", "").strip()
                inserts.append({
                    "oid": oid, "sid": sid,
                    "rel": "essential" if hot == "Y" else "optional",
                    "src": "O*NET_Tech",
                })

            await batch_insert(db, """
                INSERT INTO fact_occupation_skills (occupation_id, skill_id, relation_type, source)
                VALUES (:oid, :sid, :rel, :src)
                ON CONFLICT DO NOTHING
            """, inserts)
            onet_loaded += len(inserts)
            print(f"  OK {len(inserts)} O*NET technology skill mappings")

        print(f"  TOTAL O*NET: {onet_loaded} skill/knowledge/tech mappings loaded")

        # ════════════════════════════════════════════════════════
        # STEP 12: Graduate Pipeline -> fact_supply_graduates
        # ════════════════════════════════════════════════════════
        print("\n[12/13] Graduate Pipeline -> fact_supply_graduates")
        await db.execute(text("TRUNCATE fact_supply_graduates"))
        await db.commit()

        # Build institution name -> ID map
        inst_q = await db.execute(text("SELECT institution_id, name_en FROM dim_institution"))
        inst_map = {r.name_en.upper().strip(): r.institution_id for r in inst_q.fetchall()}

        # Build discipline label -> ID map
        disc_q = await db.execute(text("SELECT discipline_id, label_en FROM dim_discipline"))
        disc_map = {r.label_en.lower().strip(): r.discipline_id for r in disc_q.fetchall()}

        grad_total = 0

        # 12a: number_of_graduates_since_2018.csv (best file — has institution, emirate, degree, STEM)
        grad_rows, _ = csv_rows("10_bayanat_education", "number_of_graduates_since_2018.csv")
        if grad_rows:
            inserts = []
            for r in grad_rows:
                ay = r.get("Academic Year", "")
                try:
                    yr = int(ay.split("-")[0]) if "-" in ay else int(ay[:4])
                except (ValueError, TypeError):
                    continue

                pct_str = r.get("Graduates Percentage", "0")
                try:
                    pct = float(pct_str.replace("%", ""))
                except (ValueError, TypeError):
                    continue

                # Estimate actual count: we know UAE has ~60K HE graduates/year
                # Each row is a percentage of total graduates for that year
                YEARLY_GRADS = 60_000
                count = max(1, int(pct / 100 * YEARLY_GRADS))

                inst_name = r.get("Institution_Name_EN", "").strip()
                iid = inst_map.get(inst_name.upper()) if inst_name else None

                emirate = r.get("Institution_Emirate_EN", "")
                rc = EMIRATE_RC.get(emirate, "AUH")

                nationality = r.get("Nationality_EN", "")[:20] or None
                degree = r.get("Academic_Degree", "")[:50] or None
                stem = r.get("STEM_Indicator", "")

                inserts.append({
                    "yr": yr, "iid": iid, "rc": rc,
                    "nat": nationality,
                    "count": count,
                    "src": "Bayanat_Graduates",
                })

            await batch_insert(db, """
                INSERT INTO fact_supply_graduates
                (year, institution_id, region_code, nationality, expected_graduates_count, source, created_at)
                VALUES (:yr, :iid, :rc, :nat, :count, :src, NOW())
            """, inserts)
            grad_total += len(inserts)
            print(f"  OK {len(inserts)} graduate rows (since 2018)")

        # 12b: graduates_by_academic_division.csv (has division = discipline proxy)
        div_rows, _ = csv_rows("10_bayanat_education", "graduates_by_academic_division.csv")
        if div_rows:
            inserts = []
            for r in div_rows:
                ay = r.get("year", "")
                try:
                    yr = int(ay.split("-")[0]) if "-" in ay else int(ay[:4])
                except (ValueError, TypeError):
                    continue

                count_str = r.get("Count", "0")
                try:
                    count = int(float(count_str))
                except (ValueError, TypeError):
                    continue

                if count <= 0:
                    continue

                division = r.get("Division", "").strip()
                did = disc_map.get(division.lower()) if division else None

                # If discipline doesn't exist, try to create it
                if not did and division:
                    res = await db.execute(text("""
                        INSERT INTO dim_discipline (label_en, label_ar)
                        VALUES (:en, :en)
                        RETURNING discipline_id
                    """), {"en": division[:200]})
                    new_row = res.fetchone()
                    if new_row:
                        did = new_row.discipline_id
                        disc_map[division.lower()] = did
                        await db.commit()

                inserts.append({
                    "yr": yr, "did": did, "rc": "AUH",
                    "count": count,
                    "src": "Bayanat_Division",
                })

            await batch_insert(db, """
                INSERT INTO fact_supply_graduates
                (year, discipline_id, region_code, expected_graduates_count, source, created_at)
                VALUES (:yr, :did, :rc, :count, :src, NOW())
            """, inserts)
            grad_total += len(inserts)
            print(f"  OK {len(inserts)} graduate division rows")

        # 12c: higher_education_enrollment_by_academic_specialization.csv
        enroll_rows, _ = csv_rows("10_bayanat_education", "higher_education_enrollment_by_academic_specialization.csv")
        if enroll_rows:
            inserts = []
            for r in enroll_rows:
                ay = r.get("Academic Year", "")
                try:
                    yr = int(str(ay)[:4])
                except (ValueError, TypeError):
                    continue

                spec = r.get("Specialization Name", "").strip()
                if not spec:
                    continue

                did = disc_map.get(spec.lower())
                if not did:
                    res = await db.execute(text("""
                        INSERT INTO dim_discipline (label_en, label_ar)
                        VALUES (:en, :en)
                        RETURNING discipline_id
                    """), {"en": spec[:200]})
                    new_row = res.fetchone()
                    if new_row:
                        did = new_row.discipline_id
                        disc_map[spec.lower()] = did
                        await db.commit()

                gender = r.get("Gender", "")[:10] or None
                pct_str = r.get("Students Percentage", "0")
                try:
                    pct = float(pct_str.replace("%", ""))
                except (ValueError, TypeError):
                    continue

                # Estimate count from percentage (UAE HE enrollment ~130K)
                HE_ENROLLMENT = 130_000
                count = max(1, int(pct / 100 * HE_ENROLLMENT))

                inserts.append({
                    "yr": yr, "did": did, "rc": "AUH",
                    "gender": gender,
                    "count": count,
                    "src": "Bayanat_Enrollment",
                })

            await batch_insert(db, """
                INSERT INTO fact_supply_graduates
                (year, discipline_id, region_code, gender, expected_graduates_count, source, created_at)
                VALUES (:yr, :did, :rc, :gender, :count, :src, NOW())
            """, inserts)
            grad_total += len(inserts)
            print(f"  OK {len(inserts)} enrollment specialization rows")

        print(f"  TOTAL Graduates: {grad_total} rows loaded")

        # ════════════════════════════════════════════════════════
        # STEP 13: Refresh Materialized Views
        # ════════════════════════════════════════════════════════
        print("\n[13/13] Refreshing materialized views...")

    # Views need sync connection for DDL
    from sqlalchemy import create_engine
    sync_engine = create_engine(settings.DATABASE_URL_SYNC)

    views = [
        "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
        "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    ]

    # First create views if they don't exist
    sql_path = os.path.join(os.path.dirname(__file__), "create_views.sql")
    if os.path.exists(sql_path):
        with open(sql_path, "r") as f:
            sql = f.read()
        with sync_engine.connect() as conn:
            # Drop and recreate views whose schema has changed
            for vname in ["vw_gap_cube", "vw_supply_talent", "vw_supply_education"]:
                try:
                    conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {vname} CASCADE"))
                    conn.commit()
                except Exception:
                    conn.rollback()

            for stmt in sql.split(";"):
                # Strip leading comment lines before checking
                lines = stmt.strip().splitlines()
                cleaned = "\n".join(
                    l for l in lines if not l.strip().startswith("--")
                ).strip()
                if cleaned:
                    try:
                        conn.execute(text(stmt.strip()))
                        conn.commit()
                    except Exception as e:
                        conn.rollback()
                        if "already exists" not in str(e):
                            print(f"  View warning: {e}")

    # Refresh all views
    with sync_engine.connect() as conn:
        for view in views:
            try:
                conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
                conn.commit()
                count = conn.execute(text(f"SELECT COUNT(*) FROM {view}")).scalar()
                print(f"  OK {view}: {count:,} rows")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL {view}: {e}")

    sync_engine.dispose()
    await engine.dispose()

    # ── Final Summary ──
    print("\n" + "=" * 60)
    print("REAL DATA SEEDING COMPLETE")
    print("=" * 60)
    engine2 = create_async_engine(settings.DATABASE_URL, echo=False)
    factory2 = async_sessionmaker(engine2, expire_on_commit=False)
    async with factory2() as db:
        tables = [
            "dim_occupation", "dim_skill", "dim_institution", "dim_sector",
            "dim_region", "dim_time", "dim_discipline", "crosswalk_soc_isco",
            "fact_occupation_skills", "fact_ai_exposure_occupation",
            "fact_demand_vacancies_agg", "fact_supply_talent_agg",
            "fact_supply_graduates",
        ]
        for t in tables:
            try:
                c = await count_table(db, t)
                print(f"  {t:40s} {c:>10,} rows")
            except Exception:
                print(f"  {t:40s} (not yet created)")
    await engine2.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
