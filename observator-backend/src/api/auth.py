from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import get_db
from src.middleware.auth import create_access_token, get_current_user, hash_password, verify_password
from src.middleware.audit import log_action
from src.models.auth import User
from src.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, UserOut

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=LoginResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account and return a JWT token."""
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        display_name=request.display_name,
        role="ANALYST",
    )
    db.add(user)
    await db.flush()

    token = create_access_token(str(user.user_id), user.role)
    await log_action(db, user_id=user.user_id, action="register")
    await db.commit()

    return LoginResponse(
        token=token,
        role=user.role,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(str(user.user_id), user.role)

    await log_action(db, user_id=user.user_id, action="login")

    return LoginResponse(
        token=token,
        role=user.role,
        user=UserOut.model_validate(user),
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await log_action(db, user_id=user.user_id, action="logout")
    return {"ok": True}
