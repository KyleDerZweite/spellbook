import ipaddress
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database import get_async_session
from app.models.user import User

logger = logging.getLogger(__name__)

# Basic security scheme for OpenAPI docs (just tells swagger to send a bearer token if needed for mobile)
from fastapi.security import HTTPBearer
security = HTTPBearer(auto_error=False)


def get_pagination_params(page: int = 1, per_page: int = 20) -> tuple[int, int]:
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = settings.DEFAULT_PAGE_SIZE
    if per_page > settings.MAX_PAGE_SIZE:
        per_page = settings.MAX_PAGE_SIZE
    
    offset = (page - 1) * per_page
    return offset, per_page


def _is_trusted_proxy(client_ip: str) -> bool:
    """Check if the request originated from a trusted proxy CIDR."""
    if not settings.ENFORCE_TRUSTED_PROXY:
        return True
        
    if not client_ip:
        return False
        
    try:
        ip = ipaddress.ip_address(client_ip)
        trusted_cidrs = [
            ipaddress.ip_network(cidr.strip()) 
            for cidr in settings.TRUSTED_PROXY_CIDRS.split(",") 
            if cidr.strip()
        ]
        
        for cidr in trusted_cidrs:
            if ip in cidr:
                return True
        return False
    except ValueError as e:
        logger.error(f"Invalid IP address or CIDR configuration: {e}")
        return False


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    # Optional token just in case we need mobile API keys later
    token: Optional[str] = Depends(security)
) -> User:
    """
    Authenticate the user via Identity-Aware Proxy (IAP) headers.
    If the user doesn't exist in the database, provision them automatically.
    """
    client_ip = request.client.host if request.client else ""
    
    if not _is_trusted_proxy(client_ip):
        logger.warning(f"Rejected request from untrusted IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct access not allowed. Please use the proxy."
        )

    # IAP Auth Header (Usually Remote-User or Remote-Email)
    remote_user = request.headers.get(settings.AUTH_HEADER)
    remote_email = request.headers.get(settings.AUTH_EMAIL_HEADER)
    
    # Fallback to token if IAP header isn't present (e.g. for mobile app API keys in the future)
    if not remote_user and not remote_email:
        # TODO: Implement API Key verification for mobile if token is present
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing identity headers from proxy."
        )
    
    # Prefer email for identity, fallback to user
    identity = remote_email or remote_user
    username = remote_user or remote_email.split('@')[0] if remote_email else "unknown"
    
    # Fetch user from DB
    result = await db.execute(select(User).where(User.email == identity))
    user = result.scalar_one_or_none()
    
    if not user:
        # Auto-provision new user
        logger.info(f"Auto-provisioning new user from proxy header: {identity}")
        
        # Check if they should be admin (e.g. if they match the configured admin email)
        is_admin = identity == settings.ADMIN_EMAIL
        
        user = User(
            email=identity,
            username=username,
            is_active=True,
            is_admin=is_admin,
            preferences={}
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
        
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that returns the current active user."""
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
