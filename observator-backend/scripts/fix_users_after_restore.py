"""Fix database after restoring from backup — schema fixes + password resets.

Run this after pg_restore to fix schema mismatches between the backup and current code.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings
import bcrypt

e = create_engine(settings.DATABASE_URL_SYNC)

with e.begin() as c:
    # 1. Fix users.preferences column (missing in old backups)
    c.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT"))
    print("users.preferences column ensured")

    # 2. Fix dataset_registry.uploaded_by type (backup has UUID FK, code uses TEXT)
    c.execute(text("ALTER TABLE dataset_registry DROP CONSTRAINT IF EXISTS dataset_registry_uploaded_by_fkey"))
    c.execute(text("ALTER TABLE dataset_registry ALTER COLUMN uploaded_by TYPE TEXT USING uploaded_by::TEXT"))
    print("dataset_registry.uploaded_by fixed to TEXT")

    # 3. Fix dataset_registry.created_at default (backup lacks DEFAULT)
    c.execute(text("ALTER TABLE dataset_registry ALTER COLUMN created_at SET DEFAULT now()"))
    print("dataset_registry.created_at default set")

    # 4. Reset admin password
    pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
    c.execute(text("UPDATE users SET password_hash = :h WHERE email = 'admin@observator.ae'"),
              {"h": pw_hash})
    print("admin@observator.ae password reset")

    # 5. Reset test user passwords
    for email in ["analyst@observator.ae", "executive@observator.ae", "test@observator.ae"]:
        test_hash = bcrypt.hashpw(b"test123", bcrypt.gensalt()).decode()
        r = c.execute(text("UPDATE users SET password_hash = :h WHERE email = :e"),
                      {"h": test_hash, "e": email})
        if r.rowcount:
            print(f"{email} password reset")

e.dispose()
print("All fixes applied")
