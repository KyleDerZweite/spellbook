"""
Zitadel JWKS-based JWT validation for FastAPI.

Features:
- JWKS-based token validation (cached, no network calls per request)
- User dataclass with role extraction from Zitadel claims
- Dependencies for protected endpoints
- Role-based access control (ADMIN, MEMBER)
"""

import time
from dataclasses import dataclass
from typing import Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Security scheme for Swagger UI
bearer_scheme = HTTPBearer(auto_error=False)

# JWKS cache
_jwks_cache: dict = {}
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour

# Zitadel configuration
ZITADEL_DOMAIN = "auth.kylehub.dev"
ZITADEL_ISSUER = f"https://{ZITADEL_DOMAIN}"
ZITADEL_JWKS_URL = f"https://{ZITADEL_DOMAIN}/.well-known/jwks.json"


@dataclass
class User:
    """Authenticated user extracted from Zitadel JWT."""

    id: str
    email: str
    name: str
    roles: list[str]

    def has_role(self, role: str) -> bool:
        return role in self.roles

    @property
    def is_admin(self) -> bool:
        return self.has_role("ADMIN")


async def fetch_jwks() -> dict:
    """Fetch JWKS from Zitadel (cached)."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(ZITADEL_JWKS_URL)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        return _jwks_cache


def get_signing_key(token: str, jwks: dict):
    """Get the signing key for the token from JWKS."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unable to find signing key",
    )


def extract_roles(claims: dict) -> list[str]:
    """Extract role keys from Zitadel token claims."""
    roles_obj = claims.get("urn:zitadel:iam:org:project:roles", {})
    if isinstance(roles_obj, dict):
        return list(roles_obj.keys())
    return []


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> User:
    """
    Dependency to get the current authenticated user from Zitadel token.

    Usage:
        @router.get("/protected")
        async def protected(user: User = Depends(get_current_user)):
            return {"user": user.email}
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        # Fetch JWKS and get signing key
        jwks = await fetch_jwks()
        signing_key = get_signing_key(token, jwks)

        # Decode and verify token
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=ZITADEL_ISSUER,
            options={"verify_aud": False},  # Zitadel uses project-based audience
        )

        return User(
            id=claims.get("sub", ""),
            email=claims.get("email", ""),
            name=claims.get("name", claims.get("preferred_username", "")),
            roles=extract_roles(claims),
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """
    Dependency that requires the user to have ADMIN role.

    Usage:
        @router.delete("/resource/{id}")
        async def delete_resource(id: str, user: User = Depends(require_admin)):
            ...
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def require_member(user: User = Depends(get_current_user)) -> User:
    """
    Dependency that requires the user to have at least MEMBER role.

    Usage:
        @router.post("/resource")
        async def create_resource(user: User = Depends(require_member)):
            ...
    """
    if not user.has_role("MEMBER") and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member access required",
        )
    return user


def require_role(role: str):
    """
    Factory for creating role-specific dependencies.

    Usage:
        @router.get("/managers-only")
        async def managers_only(user: User = Depends(require_role("MANAGER"))):
            ...
    """

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if not user.has_role(role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{role} role required",
            )
        return user

    return dependency
