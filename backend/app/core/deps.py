from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_async_session
from app.models.user import User
from app.core.security import verify_token
from app.services.redis_service import RedisService, get_redis_service
from typing import Optional
import uuid

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_async_session),
    redis_service: RedisService = Depends(get_redis_service)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = verify_token(credentials.credentials, "access")
    if payload is None:
        raise credentials_exception

    jti = payload.get("jti")
    if jti and await redis_service.is_blacklisted(jti):
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise credentials_exception
    
    # Get user from database
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
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