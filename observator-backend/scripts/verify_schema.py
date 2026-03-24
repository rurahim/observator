"""Quick schema verification for production."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, inspect, text
from src.config import settings

e = create_engine(settings.DATABASE_URL_SYNC)
inspector = inspect(e)

tables = sorted(inspector.get_table_names())
print(f"Tables in DB: {len(tables)}")
for t in tables:
    cols = len(inspector.get_columns(t))
    print(f"  {t}: {cols} columns")

print()
print("Unique indexes:")
for t in ["dim_occupation", "dim_skill", "fact_occupation_skills", "crosswalk_soc_isco"]:
    try:
        indexes = inspector.get_indexes(t)
        for idx in indexes:
            if idx.get("unique"):
                print(f"  {t}: {idx['name']} ({idx['column_names']})")
    except Exception:
        pass

print()
print("Critical checks:")
for t in ["notifications", "pipeline_runs", "pipeline_step_logs"]:
    ok = inspector.has_table(t)
    print(f"  {t}: {'OK' if ok else 'MISSING'}")

try:
    with e.connect() as c:
        r = c.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' AND column_name='preferences'")).fetchone()
        print(f"  users.preferences: {r[1] if r else 'MISSING'}")
except Exception as ex:
    print(f"  users.preferences: error - {ex}")

e.dispose()
