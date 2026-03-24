"""Generic config-driven CSV-to-DB loader.

Replaces all 8 hardcoded loaders with a single engine that uses
SourceMapping configs from mapping_registry.py.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.ingestion.mapping_registry import SourceMapping
from src.ingestion.transforms import TRANSFORMS

logger = logging.getLogger(__name__)


@dataclass
class LoadResult:
    rows_loaded: int = 0
    rows_skipped: int = 0
    errors: list[str] = field(default_factory=list)
    target_table: str | None = None
    cleaning_log: dict | None = None


class GenericLoader:
    """Single loader that handles any SourceMapping config."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._context: dict = {}

    async def build_context(self):
        """Build lookup maps needed by transforms."""
        # time_map: {date_obj: time_id}
        rows = (await self.db.execute(text("SELECT time_id, date FROM dim_time"))).fetchall()
        self._context["time_map"] = {r[1]: r[0] for r in rows}

        # sector_map: {isic_code: sector_id}
        rows = (await self.db.execute(text("SELECT sector_id, code_isic FROM dim_sector WHERE code_isic IS NOT NULL"))).fetchall()
        self._context["sector_map"] = {r[1]: r[0] for r in rows}

        # occ_major_map: {major_group_digit: occupation_id} — first occupation per major group
        rows = (await self.db.execute(
            text("SELECT DISTINCT ON (isco_major_group) occupation_id, isco_major_group FROM dim_occupation WHERE isco_major_group IS NOT NULL ORDER BY isco_major_group, occupation_id")
        )).fetchall()
        self._context["occ_major_map"] = {r[1]: r[0] for r in rows}

        # esco_occ_map: {uri: occupation_id}
        rows = (await self.db.execute(
            text("SELECT occupation_id, code_esco FROM dim_occupation WHERE code_esco IS NOT NULL")
        )).fetchall()
        self._context["esco_occ_map"] = {r[1]: r[0] for r in rows}

        # esco_skill_map: {uri: skill_id}
        rows = (await self.db.execute(
            text("SELECT skill_id, uri_esco FROM dim_skill WHERE uri_esco IS NOT NULL")
        )).fetchall()
        self._context["esco_skill_map"] = {r[1]: r[0] for r in rows}

        # crosswalk: {soc_code: occupation_id}
        # ESCO stores code_isco as e.g. "2654.1.7"; crosswalk has 4-digit "2654"
        # Match on the 4-digit prefix of code_isco
        try:
            rows = (await self.db.execute(text("""
                SELECT c.soc_code, o.occupation_id
                FROM crosswalk_soc_isco c
                JOIN dim_occupation o ON SPLIT_PART(o.code_isco, '.', 1) = c.isco_code
                WHERE o.code_isco IS NOT NULL
            """))).fetchall()
            self._context["crosswalk"] = {r[0]: r[1] for r in rows}
        except Exception:
            self._context["crosswalk"] = {}

    async def load(self, mapping: SourceMapping, file_path: str | Path) -> LoadResult:
        """Load a CSV file using the given SourceMapping config."""
        result = LoadResult(target_table=mapping.target_table)
        cleaning_log = {"skipped_rows": [], "unmapped": {}, "summary": {}}

        # Build context if not done
        if not self._context:
            await self.build_context()

        # Read CSV
        fp = Path(file_path)
        if not fp.exists():
            result.errors.append(f"File not found: {fp}")
            return result

        try:
            df = pd.read_csv(
                fp, encoding=mapping.encoding, low_memory=False,
                on_bad_lines="skip", dtype=str,
            )
        except UnicodeDecodeError:
            try:
                df = pd.read_csv(fp, encoding="latin-1", low_memory=False, on_bad_lines="skip", dtype=str)
            except Exception as e:
                result.errors.append(f"Failed to read CSV: {e}")
                return result

        # Strip BOM from column names
        df.columns = [c.strip().lstrip("\ufeff") for c in df.columns]
        csv_cols = set(df.columns)

        logger.info(f"Loading {mapping.source_id}: {len(df)} rows from {fp.name}")

        # Prepare batch
        db_rows = []
        for idx, row in df.iterrows():
            db_row = dict(mapping.static_columns)  # start with static cols

            skip = False
            for cm in mapping.columns:
                raw_val = row.get(cm.source_col)
                if pd.isna(raw_val):
                    raw_val = None

                if cm.transform and cm.transform in TRANSFORMS:
                    val = TRANSFORMS[cm.transform](raw_val, self._context)
                elif cm.transform:
                    logger.warning(f"Unknown transform: {cm.transform}")
                    val = raw_val
                else:
                    val = raw_val

                if val is None and cm.default is not None:
                    val = cm.default

                if val is None and cm.required:
                    skip = True
                    cleaning_log["skipped_rows"].append(
                        {"row": int(idx), "reason": f"missing required: {cm.source_col}→{cm.target_col}"}
                    )
                    break

                db_row[cm.target_col] = val

            if skip:
                result.rows_skipped += 1
                continue

            # Apply row-level post-transform (e.g. FCSC dimension routing)
            if mapping.row_transform:
                db_row = mapping.row_transform(db_row)
                if db_row is None:
                    result.rows_skipped += 1
                    continue

            # Strip intermediate columns (prefixed with _)
            db_row = {k: v for k, v in db_row.items() if not k.startswith("_")}

            db_rows.append(db_row)

        if not db_rows:
            result.errors.append("No valid rows after transform")
            cleaning_log["summary"] = {"total_csv_rows": len(df), "valid_rows": 0}
            result.cleaning_log = cleaning_log
            return result

        # Auto-add created_at for tables that need it (TimestampMixin)
        from datetime import datetime
        _TIMESTAMP_TABLES = {
            "fact_demand_vacancies_agg", "fact_supply_talent_agg",
            "fact_supply_graduates", "fact_forecast",
        }
        if mapping.target_table in _TIMESTAMP_TABLES:
            now = datetime.utcnow()  # naive UTC — matches TIMESTAMP WITHOUT TIME ZONE
            for row_data in db_rows:
                if "created_at" not in row_data:
                    row_data["created_at"] = now

        # Normalize all rows to have the same set of columns (union of all keys)
        all_keys = set()
        for row_data in db_rows:
            all_keys.update(row_data.keys())
        for row_data in db_rows:
            for k in all_keys:
                if k not in row_data:
                    row_data[k] = None

        # Batch INSERT
        cols = sorted(all_keys)  # deterministic column order
        col_str = ", ".join(cols)
        param_str = ", ".join(f":{c}" for c in cols)

        if mapping.dedup_strategy == "skip" and mapping.unique_keys:
            conflict_cols = ", ".join(mapping.unique_keys)
            sql = f"INSERT INTO {mapping.target_table} ({col_str}) VALUES ({param_str}) ON CONFLICT ({conflict_cols}) DO NOTHING"
        elif mapping.dedup_strategy == "skip":
            sql = f"INSERT INTO {mapping.target_table} ({col_str}) VALUES ({param_str}) ON CONFLICT DO NOTHING"
        else:
            sql = f"INSERT INTO {mapping.target_table} ({col_str}) VALUES ({param_str})"

        batch_size = mapping.batch_size
        loaded = 0
        for i in range(0, len(db_rows), batch_size):
            batch = db_rows[i:i + batch_size]
            try:
                await self.db.execute(text(sql), batch)
                await self.db.commit()
                loaded += len(batch)
            except Exception as e:
                await self.db.rollback()
                err_msg = str(e)[:200]
                result.errors.append(f"Batch {i // batch_size}: {err_msg}")
                logger.error(f"Batch insert error at row {i}: {err_msg}")
                # Try row-by-row for this batch
                for row_data in batch:
                    try:
                        await self.db.execute(text(sql), row_data)
                        await self.db.commit()
                        loaded += 1
                    except Exception:
                        await self.db.rollback()
                        result.rows_skipped += 1

        result.rows_loaded = loaded
        cleaning_log["summary"] = {
            "total_csv_rows": len(df),
            "valid_rows": len(db_rows),
            "loaded": loaded,
            "skipped": result.rows_skipped,
        }
        result.cleaning_log = cleaning_log

        logger.info(f"Loaded {loaded}/{len(df)} rows into {mapping.target_table} from {mapping.source_id}")
        return result


class DimLoader:
    """Specialized loader for dimension tables that need INSERT ... ON CONFLICT UPDATE."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def load_dim(
        self,
        mapping: SourceMapping,
        file_path: str | Path,
        conflict_col: str,
        update_cols: list[str],
    ) -> LoadResult:
        """Load dimension table with upsert logic."""
        result = LoadResult(target_table=mapping.target_table)
        fp = Path(file_path)

        try:
            df = pd.read_csv(fp, encoding=mapping.encoding, low_memory=False, on_bad_lines="skip", dtype=str)
        except UnicodeDecodeError:
            df = pd.read_csv(fp, encoding="latin-1", low_memory=False, on_bad_lines="skip", dtype=str)

        df.columns = [c.strip().lstrip("\ufeff") for c in df.columns]

        db_rows = []
        for _, row in df.iterrows():
            db_row = dict(mapping.static_columns)
            skip = False
            for cm in mapping.columns:
                raw_val = row.get(cm.source_col)
                if pd.isna(raw_val):
                    raw_val = None
                if cm.transform and cm.transform in TRANSFORMS:
                    val = TRANSFORMS[cm.transform](raw_val, {})
                else:
                    val = raw_val
                if val is None and cm.default is not None:
                    val = cm.default
                if val is None and cm.required:
                    skip = True
                    break
                db_row[cm.target_col] = val
            if not skip:
                db_rows.append(db_row)

        if not db_rows:
            return result

        cols = list(db_rows[0].keys())
        col_str = ", ".join(cols)
        param_str = ", ".join(f":{c}" for c in cols)
        update_str = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols if c in cols)

        if update_str:
            sql = f"INSERT INTO {mapping.target_table} ({col_str}) VALUES ({param_str}) ON CONFLICT ({conflict_col}) DO UPDATE SET {update_str}"
        else:
            sql = f"INSERT INTO {mapping.target_table} ({col_str}) VALUES ({param_str}) ON CONFLICT ({conflict_col}) DO NOTHING"

        for i in range(0, len(db_rows), mapping.batch_size):
            batch = db_rows[i:i + mapping.batch_size]
            try:
                await self.db.execute(text(sql), batch)
                await self.db.commit()
                result.rows_loaded += len(batch)
            except Exception as e:
                await self.db.rollback()
                result.errors.append(str(e)[:200])
                # Row-by-row fallback
                for row_data in batch:
                    try:
                        await self.db.execute(text(sql), row_data)
                        await self.db.commit()
                        result.rows_loaded += 1
                    except Exception:
                        await self.db.rollback()
                        result.rows_skipped += 1

        logger.info(f"Loaded {result.rows_loaded} into {mapping.target_table} (dim upsert)")
        return result
