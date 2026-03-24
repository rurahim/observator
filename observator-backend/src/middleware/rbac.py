from fastapi import Depends, HTTPException, status

from src.middleware.auth import get_current_user
from src.models.auth import User

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "EXECUTIVE": {"read_dashboard", "chat", "export"},
    "ANALYST": {"read_dashboard", "chat", "export", "build_dashboard", "upload_file", "review_mappings"},
    "ADMIN": {"*"},
}


def require_permission(permission: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        allowed = ROLE_PERMISSIONS.get(user.role, set())
        if "*" not in allowed and permission not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' lacks permission '{permission}'",
            )
        return user

    return Depends(_check)
