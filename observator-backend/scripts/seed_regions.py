"""Seed 7 UAE emirates into dim_region."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings

REGIONS = [
    ("AUH", "Abu Dhabi", "\u0623\u0628\u0648\u0638\u0628\u064a"),
    ("DXB", "Dubai", "\u062f\u0628\u064a"),
    ("SHJ", "Sharjah", "\u0627\u0644\u0634\u0627\u0631\u0642\u0629"),
    ("AJM", "Ajman", "\u0639\u062c\u0645\u0627\u0646"),
    ("RAK", "Ras Al Khaimah", "\u0631\u0623\u0633 \u0627\u0644\u062e\u064a\u0645\u0629"),
    ("FUJ", "Fujairah", "\u0627\u0644\u0641\u062c\u064a\u0631\u0629"),
    ("UAQ", "Umm Al Quwain", "\u0623\u0645 \u0627\u0644\u0642\u064a\u0648\u064a\u0646"),
]


def main():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    with engine.begin() as conn:
        for code, name_en, name_ar in REGIONS:
            conn.execute(
                text("""
                    INSERT INTO dim_region (region_code, emirate, emirate_ar)
                    VALUES (:code, :name_en, :name_ar)
                    ON CONFLICT (region_code) DO UPDATE SET emirate = :name_en, emirate_ar = :name_ar
                """),
                {"code": code, "name_en": name_en, "name_ar": name_ar},
            )
        count = conn.execute(text("SELECT count(*) FROM dim_region")).scalar()
    print(f"Seeded {count} regions")


if __name__ == "__main__":
    main()
