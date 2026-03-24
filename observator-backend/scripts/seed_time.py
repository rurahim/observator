"""Seed dim_time with dates from 2015-01-01 to 2035-12-31."""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from src.config import settings


def main():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    start = date(2015, 1, 1)
    end = date(2035, 12, 31)
    rows = []
    d = start
    while d <= end:
        rows.append({
            "date": d,
            "week": d.isocalendar()[1],
            "month": d.month,
            "quarter": (d.month - 1) // 3 + 1,
            "year": d.year,
            "month_label": d.strftime("%Y-%m"),
        })
        d += timedelta(days=1)

    with engine.begin() as conn:
        # Batch insert with ON CONFLICT skip
        for i in range(0, len(rows), 1000):
            batch = rows[i : i + 1000]
            conn.execute(
                text("""
                    INSERT INTO dim_time (date, week, month, quarter, year, month_label)
                    VALUES (:date, :week, :month, :quarter, :year, :month_label)
                    ON CONFLICT (date) DO NOTHING
                """),
                batch,
            )
        count = conn.execute(text("SELECT count(*) FROM dim_time")).scalar()
    print(f"Seeded {count} time rows ({start} to {end})")


if __name__ == "__main__":
    main()
