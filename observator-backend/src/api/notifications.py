"""Notification system — create, list, and manage user notifications."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.rbac import require_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# Ensure notifications table exists
_TABLE_CREATED = False


async def _ensure_tables(db: AsyncSession):
    global _TABLE_CREATED
    if _TABLE_CREATED:
        return
    try:
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata JSONB DEFAULT '{}'::jsonb,
                read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT now()
            )
        """))
        await db.commit()
        _TABLE_CREATED = True
    except Exception as e:
        logger.warning(f"Notification table creation warning: {e}")
        _TABLE_CREATED = True


async def create_notification(
    db: AsyncSession,
    title: str,
    message: str,
    type: str,
    metadata: Optional[dict] = None,
    user_id: Optional[str] = None,
):
    """Insert a notification. user_id=None means broadcast to all users."""
    await _ensure_tables(db)
    await db.execute(
        text("""INSERT INTO notifications (user_id, type, title, message, metadata)
                VALUES (:user_id, :type, :title, :message, :metadata)"""),
        {
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
            "metadata": json.dumps(metadata or {}),
        },
    )
    await db.commit()


@router.get("")
async def list_notifications(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """List unread notifications for the current user (user-specific + broadcasts).

    Returns up to 50 notifications sorted by newest first.
    """
    await _ensure_tables(db)
    uid = str(user.user_id)
    rows = (await db.execute(
        text("""SELECT id, user_id, type, title, message, metadata, read, created_at
                FROM notifications
                WHERE read = FALSE
                  AND (user_id = :uid OR user_id IS NULL)
                ORDER BY created_at DESC
                LIMIT 50"""),
        {"uid": uid},
    )).fetchall()

    return [
        {
            "id": r[0],
            "user_id": r[1],
            "type": r[2],
            "title": r[3],
            "message": r[4],
            "metadata": r[5] if isinstance(r[5], dict) else json.loads(r[5] or "{}"),
            "read": r[6],
            "created_at": str(r[7]) if r[7] else None,
        }
        for r in rows
    ]


@router.get("/count")
async def unread_count(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Return the count of unread notifications for the current user."""
    await _ensure_tables(db)
    uid = str(user.user_id)
    count = (await db.execute(
        text("""SELECT COUNT(*) FROM notifications
                WHERE read = FALSE
                  AND (user_id = :uid OR user_id IS NULL)"""),
        {"uid": uid},
    )).scalar()

    return {"unread": count or 0}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read."""
    await _ensure_tables(db)
    uid = str(user.user_id)
    result = await db.execute(
        text("""UPDATE notifications SET read = TRUE
                WHERE id = :nid
                  AND (user_id = :uid OR user_id IS NULL)"""),
        {"nid": notification_id, "uid": uid},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, f"Notification {notification_id} not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    await _ensure_tables(db)
    uid = str(user.user_id)
    result = await db.execute(
        text("""UPDATE notifications SET read = TRUE
                WHERE read = FALSE
                  AND (user_id = :uid OR user_id IS NULL)"""),
        {"uid": uid},
    )
    await db.commit()
    return {"ok": True, "marked": result.rowcount}
