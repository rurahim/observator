"""Seed the default admin user."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings
from src.middleware.auth import hash_password
from src.models.auth import User
from src.models.base import Base

ADMIN_EMAIL = "admin@observator.ae"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "System Administrator"


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)

    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Admin user already exists: {ADMIN_EMAIL}")
        else:
            user = User(
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                display_name=ADMIN_NAME,
                role="ADMIN",
            )
            db.add(user)
            await db.commit()
            print(f"Created admin user: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")

        # Also create analyst and executive users for testing
        for email, name, role in [
            ("analyst@observator.ae", "Data Analyst", "ANALYST"),
            ("executive@observator.ae", "Executive User", "EXECUTIVE"),
        ]:
            result = await db.execute(select(User).where(User.email == email))
            if result.scalar_one_or_none() is None:
                user = User(
                    email=email,
                    password_hash=hash_password("test123"),
                    display_name=name,
                    role=role,
                )
                db.add(user)
                await db.commit()
                print(f"Created {role} user: {email} / test123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
