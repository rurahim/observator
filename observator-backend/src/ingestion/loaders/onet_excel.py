"""O*NET loader — loads occupations, skills, and occupation↔skill mappings with weights."""
import logging
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Map O*NET file prefixes to skill_type values
FILE_SKILL_TYPE = {
    "onet_skills": "skill",
    "onet_abilities": "ability",
    "onet_knowledge": "knowledge",
    "onet_technology_skills": "technology",
    "onet_work_activities": "work_activity",
}
# Note: onet_work_styles uses DR/WI scales (not IM/LV), so excluded from scored loading

# O*NET importance scale midpoint; scores >= this are classified "essential"
ONET_ESSENTIAL_IMPORTANCE_THRESHOLD = 3.0


@dataclass
class LoadResult:
    rows_loaded: int = 0
    rows_skipped: int = 0
    errors: list[str] = field(default_factory=list)
    target_table: str | None = None


class ONetExcelLoader:
    """Load O*NET data into dim_occupation, dim_skill, and fact_occupation_skills.

    Handles 3 types of O*NET files:
    1. onet_occupations.csv → dim_occupation (SOC codes + titles)
    2. onet_skills/abilities/knowledge/etc.csv → dim_skill + fact_occupation_skills
    3. onet_technology_skills.csv → dim_skill + fact_occupation_skills (different format)
    """

    async def load_all(self, onet_dir: str, db: AsyncSession) -> dict[str, LoadResult]:
        """Load all O*NET CSV files from a directory.

        Order: occupations first, then skills, then mappings.
        """
        onet_path = Path(onet_dir)
        results: dict[str, LoadResult] = {}

        # Step 1: Load occupations (must be first — skills reference them)
        occ_file = onet_path / "onet_occupations.csv"
        if occ_file.exists():
            logger.info("Loading O*NET occupations...")
            results["occupations"] = await self._load_occupations(occ_file, db)

        # Step 2: Load alternate titles (enriches occupation matching)
        alt_file = onet_path / "onet_alternate_titles.csv"
        if alt_file.exists():
            logger.info("Loading O*NET alternate titles...")
            results["alternate_titles"] = await self._load_alternate_titles(alt_file, db)

        # Step 3: Load skill-type files
        for filename, skill_type in FILE_SKILL_TYPE.items():
            csv_file = onet_path / f"{filename}.csv"
            if csv_file.exists():
                logger.info("Loading O*NET %s...", filename)
                results[filename] = await self._load_scored_skills(csv_file, db, skill_type)

        # Step 4: Load job zones (reference only, no DB target yet)
        jz_file = onet_path / "onet_job_zones.csv"
        if jz_file.exists():
            logger.info("Loading O*NET job zones...")
            results["job_zones"] = await self._load_job_zones(jz_file, db)

        total_loaded = sum(r.rows_loaded for r in results.values())
        total_errors = sum(len(r.errors) for r in results.values())
        logger.info("O*NET load complete: %d rows loaded, %d errors", total_loaded, total_errors)
        return results

    async def load(self, file_path: str, db: AsyncSession) -> LoadResult:
        """Load a single O*NET file (auto-detects type)."""
        fname = Path(file_path).stem.lower()

        if fname == "onet_occupations":
            return await self._load_occupations(file_path, db)
        elif fname == "onet_alternate_titles":
            return await self._load_alternate_titles(file_path, db)
        elif fname == "onet_job_zones":
            return await self._load_job_zones(file_path, db)
        elif fname == "onet_technology_skills":
            return await self._load_scored_skills(file_path, db, "technology")
        elif fname in FILE_SKILL_TYPE:
            return await self._load_scored_skills(file_path, db, FILE_SKILL_TYPE[fname])
        else:
            return LoadResult(errors=[f"Unknown O*NET file type: {fname}"])

    # ── Occupations ──────────────────────────────────────────────────

    async def _load_occupations(self, file_path: str | Path, db: AsyncSession) -> LoadResult:
        """Load onet_occupations.csv → dim_occupation with SOC codes (batch)."""
        result = LoadResult(target_table="dim_occupation")
        df = self._read_csv(file_path, result)
        if df is None:
            return result

        try:
            # Bulk-fetch existing SOC codes in one query
            existing_rows = (await db.execute(
                text("SELECT code_soc FROM dim_occupation WHERE code_soc IS NOT NULL")
            )).all()
            existing_socs: set[str] = {r[0] for r in existing_rows}

            # Build batch of new occupations
            new_rows = []
            for _, row in df.iterrows():
                soc = str(row.get("O*NET-SOC Code", "")).strip()
                title = str(row.get("Title", "")).strip()
                if not soc or not title:
                    result.rows_skipped += 1
                    continue
                if soc in existing_socs:
                    result.rows_skipped += 1
                    continue
                new_rows.append({"soc": soc, "title": title})
                existing_socs.add(soc)  # prevent duplicates within file

            # Batch insert
            if new_rows:
                await db.execute(
                    text("INSERT INTO dim_occupation (code_soc, title_en) VALUES (:soc, :title)"),
                    new_rows,
                )
                result.rows_loaded = len(new_rows)

            await db.commit()
        except Exception as exc:
            await db.rollback()
            result.errors.append(f"Transaction aborted: {exc}")
            logger.exception("O*NET occupation load failed for %s", file_path)

        return result

    # ── Alternate Titles ─────────────────────────────────────────────

    async def _load_alternate_titles(self, file_path: str | Path, db: AsyncSession) -> LoadResult:
        """Load onet_alternate_titles.csv → dim_occupation.synonyms array."""
        result = LoadResult(target_table="dim_occupation")
        df = self._read_csv(file_path, result)
        if df is None:
            return result

        try:
            # Group alternate titles by SOC code
            grouped = df.groupby("O*NET-SOC Code")["Alternate Title"].apply(list).to_dict()

            for soc_raw, titles in grouped.items():
                soc = str(soc_raw).strip()
                clean_titles = [str(t).strip() for t in titles if pd.notna(t)][:20]
                if not clean_titles:
                    continue

                await db.execute(
                    text("""
                        UPDATE dim_occupation SET synonyms = :titles::text[]
                        WHERE code_soc = :soc AND synonyms IS NULL
                    """),
                    {"soc": soc, "titles": clean_titles},
                )
                result.rows_loaded += 1

            await db.commit()
        except Exception as exc:
            await db.rollback()
            result.errors.append(f"Transaction aborted: {exc}")
            logger.exception("O*NET alternate titles load failed for %s", file_path)

        return result

    # ── Scored Skills (skills, abilities, knowledge, work activities, work styles) ───

    async def _load_scored_skills(
        self, file_path: str | Path, db: AsyncSession, skill_type: str
    ) -> LoadResult:
        """Load O*NET scored element files → dim_skill + fact_occupation_skills.

        Extracts:
        - Unique skills → dim_skill (with onet_element_id)
        - Occupation↔Skill mappings → fact_occupation_skills (with importance + level)
        """
        result = LoadResult(target_table="fact_occupation_skills")
        df = self._read_csv(file_path, result)
        if df is None:
            return result

        # Technology skills have a different format (no Scale ID/Element ID)
        if skill_type == "technology":
            return await self._load_technology_skills(df, db, result)

        try:
            # Filter to only IM (importance) and LV (level) scales
            full_count = len(df)
            df = df[df["Scale ID"].isin(["IM", "LV"])].copy()
            dropped = full_count - len(df)
            if dropped:
                logger.debug("Filtered out %d rows with non-IM/LV Scale IDs", dropped)

            if df.empty:
                result.errors.append("No IM/LV rows found after filtering")
                return result

            # Pivot: one row per (SOC, Element) with importance and level columns
            pivot = df.pivot_table(
                index=["O*NET-SOC Code", "Element ID", "Element Name"],
                columns="Scale ID",
                values="Data Value",
                aggfunc="first",
            ).reset_index()
            pivot.columns.name = None

            # Guard: ensure IM and LV columns exist
            if "IM" not in pivot.columns:
                pivot["IM"] = None
            if "LV" not in pivot.columns:
                pivot["LV"] = None

            # ── Step 1: Batch-fetch existing skills, insert new ones ──
            existing_skills = (await db.execute(
                text("SELECT skill_id, onet_element_id, label_en FROM dim_skill WHERE taxonomy = 'ONET'")
            )).all()
            # Build caches: element_id → skill_id, label → skill_id
            skill_by_eid: dict[str, int] = {}
            skill_by_label: dict[str, int] = {}
            for row in existing_skills:
                if row[1]:  # onet_element_id
                    skill_by_eid[row[1]] = row[0]
                if row[2]:  # label_en
                    skill_by_label[row[2]] = row[0]

            unique_elements = df[["Element ID", "Element Name"]].drop_duplicates()
            skill_id_cache: dict[str, int] = {}
            new_skills = []

            for _, elem_row in unique_elements.iterrows():
                element_id = str(elem_row["Element ID"]).strip()
                element_name = str(elem_row["Element Name"]).strip()
                if not element_id or not element_name:
                    continue

                # Check cache first
                sid = skill_by_eid.get(element_id) or skill_by_label.get(element_name)
                if sid:
                    skill_id_cache[element_id] = sid
                    # Update element_id if it was matched by label only
                    if element_id not in skill_by_eid:
                        await db.execute(
                            text("UPDATE dim_skill SET onet_element_id = :eid WHERE skill_id = :sid AND onet_element_id IS NULL"),
                            {"eid": element_id, "sid": sid},
                        )
                else:
                    new_skills.append({
                        "label": element_name, "stype": skill_type,
                        "eid": element_id,
                    })

            # Batch insert new skills and collect their IDs
            for skill_params in new_skills:
                res = await db.execute(
                    text("""
                        INSERT INTO dim_skill (label_en, skill_type, taxonomy, onet_element_id)
                        VALUES (:label, :stype, 'ONET', :eid)
                        RETURNING skill_id
                    """),
                    skill_params,
                )
                skill_id_cache[skill_params["eid"]] = res.scalar_one()

            await db.flush()

            # ── Step 2: Batch-fetch occupation IDs for SOC codes ──
            existing_occs = (await db.execute(
                text("SELECT code_soc, occupation_id FROM dim_occupation WHERE code_soc IS NOT NULL")
            )).all()
            occ_id_cache: dict[str, int] = {r[0]: r[1] for r in existing_occs}

            # ── Step 3: Build mapping rows in bulk, then batch insert ──
            mapping_rows = []
            for row in pivot.itertuples(index=False):
                soc = str(row[0]).strip()  # O*NET-SOC Code
                element_id = str(row[1]).strip()  # Element ID

                occ_id = occ_id_cache.get(soc)
                skill_id = skill_id_cache.get(element_id)
                if not occ_id or not skill_id:
                    result.rows_skipped += 1
                    continue

                importance = float(row[3]) if pd.notna(row[3]) else None  # IM column
                level = float(row[4]) if pd.notna(row[4]) else None  # LV column

                relation = "essential" if importance and importance >= ONET_ESSENTIAL_IMPORTANCE_THRESHOLD else "optional"

                mapping_rows.append({
                    "oid": occ_id, "sid": skill_id, "rel": relation,
                    "imp": importance, "lvl": level,
                })

            # Batch upsert all mappings
            if mapping_rows:
                await db.execute(
                    text("""
                        INSERT INTO fact_occupation_skills (occupation_id, skill_id, relation_type, importance, level, source)
                        VALUES (:oid, :sid, :rel, :imp, :lvl, 'ONET')
                        ON CONFLICT ON CONSTRAINT uq_occ_skill_source DO UPDATE
                        SET importance = EXCLUDED.importance, level = EXCLUDED.level, relation_type = EXCLUDED.relation_type
                    """),
                    mapping_rows,
                )
                result.rows_loaded = len(mapping_rows)

            await db.commit()
        except Exception as exc:
            await db.rollback()
            result.errors.append(f"Transaction aborted: {exc}")
            logger.exception("O*NET scored skills load failed for %s", file_path)

        return result

    # ── Technology Skills (different format) ─────────────────────────

    async def _load_technology_skills(
        self, df: pd.DataFrame, db: AsyncSession, result: LoadResult
    ) -> LoadResult:
        """Load onet_technology_skills.csv — no importance scores; Hot Technology → essential."""
        try:
            # Batch-fetch existing skills and occupations
            existing_skills = (await db.execute(
                text("SELECT skill_id, label_en FROM dim_skill WHERE taxonomy = 'ONET' AND skill_type = 'technology'")
            )).all()
            skill_by_label: dict[str, int] = {r[1]: r[0] for r in existing_skills}

            existing_occs = (await db.execute(
                text("SELECT code_soc, occupation_id FROM dim_occupation WHERE code_soc IS NOT NULL")
            )).all()
            occ_id_cache: dict[str, int] = {r[0]: r[1] for r in existing_occs}

            # Build unique commodity titles and insert new skills
            unique_commodities = df["Commodity Title"].dropna().unique()
            for commodity in unique_commodities:
                label = str(commodity).strip()
                if label and label not in skill_by_label:
                    res = await db.execute(
                        text("""
                            INSERT INTO dim_skill (label_en, skill_type, taxonomy)
                            VALUES (:label, 'technology', 'ONET')
                            RETURNING skill_id
                        """),
                        {"label": label},
                    )
                    skill_by_label[label] = res.scalar_one()

            await db.flush()

            # Build mapping rows in bulk
            mapping_rows = []
            seen_pairs: set[tuple[int, int]] = set()

            for row in df.itertuples(index=False):
                soc = str(row[0]).strip()  # O*NET-SOC Code
                commodity = str(row[4]).strip() if pd.notna(row[4]) else ""  # Commodity Title
                hot = str(row[5]).strip().upper() == "Y" if pd.notna(row[5]) else False  # Hot Technology

                if not soc or not commodity:
                    result.rows_skipped += 1
                    continue

                occ_id = occ_id_cache.get(soc)
                skill_id = skill_by_label.get(commodity)
                if not occ_id or not skill_id:
                    result.rows_skipped += 1
                    continue

                # Deduplicate within file (same occupation can list same commodity multiple times)
                pair = (occ_id, skill_id)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)

                relation = "essential" if hot else "optional"
                mapping_rows.append({"oid": occ_id, "sid": skill_id, "rel": relation})

            if mapping_rows:
                await db.execute(
                    text("""
                        INSERT INTO fact_occupation_skills (occupation_id, skill_id, relation_type, source)
                        VALUES (:oid, :sid, :rel, 'ONET')
                        ON CONFLICT ON CONSTRAINT uq_occ_skill_source DO NOTHING
                    """),
                    mapping_rows,
                )
                result.rows_loaded = len(mapping_rows)

            await db.commit()
        except Exception as exc:
            await db.rollback()
            result.errors.append(f"Transaction aborted: {exc}")
            logger.exception("O*NET technology skills load failed")

        return result

    # ── Job Zones ────────────────────────────────────────────────────

    async def _load_job_zones(self, file_path: str | Path, db: AsyncSession) -> LoadResult:
        """Load onet_job_zones.csv — education/experience level per occupation."""
        result = LoadResult(target_table="dim_occupation")
        df = self._read_csv(file_path, result)
        if df is None:
            return result

        result.rows_skipped = len(df)
        logger.info("Job zones file has %d rows (stored for reference, no DB target yet)", len(df))
        return result

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _read_csv(file_path: str | Path, result: LoadResult) -> pd.DataFrame | None:
        """Read CSV with error handling and explicit dtypes."""
        try:
            df = pd.read_csv(
                str(file_path),
                encoding="utf-8",
                dtype={"O*NET-SOC Code": str, "Element ID": str, "Scale ID": str},
            )
            if len(df) == 0:
                result.errors.append("Empty file")
                return None
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except FileNotFoundError:
            result.errors.append(f"File not found: {file_path}")
            logger.error("O*NET file not found: %s", file_path)
            return None
        except Exception as e:
            result.errors.append(f"Parse error: {type(e).__name__}: {e}")
            logger.exception("O*NET CSV parse failed for %s", file_path)
            return None
