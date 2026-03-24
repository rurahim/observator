"""Seed 21 ISIC Rev.4 sectors into dim_sector."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings

SECTORS = [
    ("A", "Agriculture, forestry and fishing"),
    ("B", "Mining and quarrying"),
    ("C", "Manufacturing"),
    ("D", "Electricity, gas, steam and air conditioning supply"),
    ("E", "Water supply; sewerage, waste management"),
    ("F", "Construction"),
    ("G", "Wholesale and retail trade"),
    ("H", "Transportation and storage"),
    ("I", "Accommodation and food service activities"),
    ("J", "Information and communication"),
    ("K", "Financial and insurance activities"),
    ("L", "Real estate activities"),
    ("M", "Professional, scientific and technical activities"),
    ("N", "Administrative and support service activities"),
    ("O", "Public administration and defence"),
    ("P", "Education"),
    ("Q", "Human health and social work activities"),
    ("R", "Arts, entertainment and recreation"),
    ("S", "Other service activities"),
    ("T", "Activities of households as employers"),
    ("U", "Activities of extraterritorial organisations"),
]


def main():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    with engine.begin() as conn:
        for code, label in SECTORS:
            conn.execute(
                text("""
                    INSERT INTO dim_sector (code_isic, label_en)
                    VALUES (:code, :label)
                    ON CONFLICT DO NOTHING
                """),
                {"code": code, "label": label},
            )
        count = conn.execute(text("SELECT count(*) FROM dim_sector")).scalar()
    print(f"Seeded {count} sectors")


if __name__ == "__main__":
    main()
