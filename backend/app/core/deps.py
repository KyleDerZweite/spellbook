"""
Authentication dependencies for FastAPI endpoints.

This module re-exports Zitadel-based auth dependencies for use in API routes.
"""

from fastapi import Depends, HTTPException, status

# Import Zitadel auth as primary auth mechanism
from app.core.zitadel_auth import (
    User,
    get_current_user,
    require_admin,
    require_member,
    require_role,
    bearer_scheme as security,
)

# Re-export for backwards compatibility
__all__ = [
    "User",
    "get_current_user", 
    "require_admin",
    "require_member",
    "require_role",
    "security",
    "get_current_active_user",
    "get_current_admin_user",
    "get_pagination_params",
]


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that returns the current active user (all Zitadel users are active)."""
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that requires the user to have ADMIN role."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def get_pagination_params(page: int = 1, per_page: int = 20) -> tuple[int, int]:
    from app.config import settings
    
    # Validate pagination parameters
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = settings.DEFAULT_PAGE_SIZE
    if per_page > settings.MAX_PAGE_SIZE:
        per_page = settings.MAX_PAGE_SIZE
    
    offset = (page - 1) * per_page
    return offset, per_page