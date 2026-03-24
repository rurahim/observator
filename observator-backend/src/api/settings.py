"""User settings/preferences endpoints."""
import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import get_current_user
from src.models.auth import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])


class UserPreferences(BaseModel):
    data_mode: str = "offline"  # offline, live
    forecast_enabled: bool = False
    forecast_horizon: int = 12
    forecast_model: str = "auto"
    citation_style: str = "inline"  # inline, footnote, endnote
    email_alerts: bool = True
    critical_threshold: int = 20
    auto_refresh: bool = True
    refresh_interval: int = 2  # hours
    cohort_threshold: int = 10


@router.get("", response_model=UserPreferences)
async def get_settings(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's preferences."""
    result = await db.execute(select(User).where(User.user_id == user.user_id))
    db_user = result.scalar_one_or_none()
    if not db_user or not db_user.preferences:
        return UserPreferences()

    try:
        prefs = json.loads(db_user.preferences)
        return UserPreferences(**prefs)
    except (json.JSONDecodeError, TypeError):
        return UserPreferences()


@router.put("", response_model=UserPreferences)
async def update_settings(
    body: UserPreferences,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's preferences."""
    result = await db.execute(select(User).where(User.user_id == user.user_id))
    db_user = result.scalar_one_or_none()
    if db_user:
        db_user.preferences = json.dumps(body.model_dump())
        await db.commit()

    return body
