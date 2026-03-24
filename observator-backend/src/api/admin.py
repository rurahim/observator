"""Admin endpoints — user management, audit logs, data sources."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import hash_password
from src.middleware.audit import log_action
from src.middleware.rbac import require_permission
from src.models.auth import User
from src.models.audit import AuditLog
from src.schemas.admin import AuditLogOut, DataSourceOut, UserCreate, UserOut, UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- User Management ---

@router.get("/users", response_model=list[UserOut])
async def list_users(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.post("/users", response_model=UserOut)
async def create_user(
    body: UserCreate,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    # Check for duplicate email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if body.role not in ("EXECUTIVE", "ANALYST", "ADMIN"):
        raise HTTPException(status_code=400, detail="Invalid role")

    new_user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
    )
    db.add(new_user)
    await db.flush()

    await log_action(db, user_id=user.user_id, action="create_user", resource_type="user", resource_id=str(new_user.user_id))

    return new_user


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's role or status (admin only)."""
    result = await db.execute(select(User).where(User.user_id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.display_name is not None:
        target.display_name = body.display_name
    if body.role is not None:
        if body.role not in ("EXECUTIVE", "ANALYST", "ADMIN"):
            raise HTTPException(status_code=400, detail="Invalid role")
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active

    await db.flush()
    await log_action(db, user_id=user.user_id, action="update_user", resource_type="user", resource_id=str(target.user_id))

    return target


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user (admin only). Does not hard-delete."""
    result = await db.execute(select(User).where(User.user_id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if str(target.user_id) == str(user.user_id):
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    target.is_active = False
    await db.flush()
    await log_action(db, user_id=user.user_id, action="deactivate_user", resource_type="user", resource_id=str(target.user_id))

    return {"ok": True}


# --- Audit Logs ---

@router.get("/audit", response_model=list[AuditLogOut])
async def list_audit_logs(
    limit: int = 50,
    action: str | None = None,
    user_filter: str | None = None,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Get audit logs (admin only)."""
    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if action:
        query = query.where(AuditLog.action == action)
    if user_filter:
        query = query.where(AuditLog.user_id == user_filter)

    query = query.limit(min(limit, 500))
    result = await db.execute(query)
    return result.scalars().all()


# --- Data Sources ---

@router.get("/datasources", response_model=list[DataSourceOut])
async def list_data_sources(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """List all dataset sources and their status (admin only)."""
    # Try dataset_registry table; fall back to summary from fact tables
    try:
        result = await db.execute(text("""
            SELECT dataset_id, filename, source_type, status, row_count, created_at, last_refreshed_at
            FROM dataset_registry
            ORDER BY created_at DESC
        """))
        rows = result.fetchall()
        return [
            DataSourceOut(
                dataset_id=r[0], filename=r[1], source_type=r[2],
                status=r[3], row_count=r[4], created_at=r[5],
                last_refreshed_at=r[6] if len(r) > 6 else None,
            )
            for r in rows
        ]
    except Exception:
        # Fallback: build datasource list from fact tables
        sources = []
        for tbl, name, stype in [
            ("fact_supply_talent_agg", "FCSC Labor Force", "fcsc_sdmx"),
            ("fact_demand_vacancies_agg", "UAE Job Postings", "rdata_jobs"),
            ("fact_ai_exposure_occupation", "AI Exposure Scores", "ai_impact"),
            ("fact_supply_graduates", "Graduate Data", "he_data"),
            ("dim_occupation", "ESCO Occupations", "esco"),
            ("dim_skill", "ESCO Skills", "esco"),
        ]:
            try:
                count = (await db.execute(text(f"SELECT count(*) FROM {tbl}"))).scalar()
                sources.append(DataSourceOut(
                    dataset_id=tbl, filename=name, source_type=stype,
                    status="ready" if count > 0 else "empty", row_count=count,
                ))
            except Exception:
                pass
        return sources


@router.post("/datasources/refresh")
async def refresh_all_views(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Refresh all materialized views (admin only)."""
    views = [
        "vw_supply_talent", "vw_demand_jobs", "vw_supply_education",
        "vw_ai_impact", "vw_gap_cube", "vw_forecast_demand",
    ]
    results = {}
    for view in views:
        try:
            await db.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
            count = (await db.execute(text(f"SELECT count(*) FROM {view}"))).scalar()
            results[view] = {"status": "refreshed", "rows": count}
        except Exception as e:
            results[view] = {"status": "error", "error": str(e)}
    await db.commit()

    await log_action(db, user_id=user.user_id, action="refresh_views", resource_type="system")

    return {"views": results}


@router.post("/datasources/{source_id}/refresh")
async def refresh_single_source(
    source_id: str,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger refresh for a specific data source (admin only)."""
    # Map source types to views they affect
    source_views = {
        "fcsc_sdmx": ["vw_supply_talent", "vw_gap_cube"],
        "rdata_jobs": ["vw_demand_jobs", "vw_gap_cube"],
        "ai_impact": ["vw_ai_impact", "vw_gap_cube"],
        "he_data": ["vw_supply_education"],
        "esco": ["vw_ai_impact", "vw_gap_cube"],
    }

    views_to_refresh = source_views.get(source_id, [])
    if not views_to_refresh:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source_id}")

    results = {}
    for view in views_to_refresh:
        try:
            await db.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
            count = (await db.execute(text(f"SELECT count(*) FROM {view}"))).scalar()
            results[view] = {"status": "refreshed", "rows": count}
        except Exception as e:
            results[view] = {"status": "error", "error": str(e)}
    await db.commit()

    await log_action(
        db, user_id=user.user_id, action="refresh_source",
        resource_type="datasource", resource_id=source_id,
    )

    return {"source": source_id, "views": results}


@router.post("/fetch-jsearch")
async def fetch_jsearch(
    max_pages: int = 1,
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger JSearch API job fetch (requires admin role)."""
    try:
        from src.ingestion.loaders.jsearch_api import JSearchLoader
        loader = JSearchLoader(db)
        result = await loader.fetch_and_load(max_pages=max_pages)
        return {"status": "ok", "result": result}
    except ImportError:
        return {"status": "error", "detail": "JSearch loader not available"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


@router.post("/fetch-salaries")
async def fetch_salaries(
    user=require_permission("*"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Glassdoor salary fetch (requires admin role)."""
    try:
        from src.ingestion.loaders.glassdoor_salary import GlassdoorSalaryLoader
        loader = GlassdoorSalaryLoader(db)
        result = await loader.fetch_and_load()
        return {"status": "ok", "result": result}
    except ImportError:
        return {"status": "error", "detail": "Glassdoor loader not available"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}
