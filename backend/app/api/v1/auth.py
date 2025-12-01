from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from app.database import get_async_session, handle_database_operation
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, Token, TokenRefresh, TokenResponse, PasswordChange
from app.schemas.user import UserResponse
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_token
from app.core.deps import get_current_user, security
from app.core.exceptions import (
    AuthenticationError,
    ValidationError,
    ConflictError,
    ResourceNotFoundError
)
from app.services.redis_service import RedisService, get_redis_service
from app.config import settings
from datetime import timedelta, datetime
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/register", 
    response_model=UserResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Create a new user account with email, username, and password",
    responses={
        201: {"description": "User successfully created"},
        409: {"description": "Email or username already exists"},
        422: {"description": "Validation error"}
    }
)
async def register_user(
    user_data: UserRegister,
    session: AsyncSession = Depends(get_async_session)
):
    from app.models.invite import Invite, InviteStatus
    from app.models.user import UserStatus
    
    try:
        # Check registration mode
        if settings.REGISTRATION_MODE == "INVITE_ONLY":
            if not user_data.invite_code:
                raise ValidationError("Invite code is required for registration")
            
            # Validate invite code
            invite_result = await session.execute(
                select(Invite).where(Invite.code == user_data.invite_code)
            )
            invite = invite_result.scalar_one_or_none()
            
            if not invite or not invite.is_valid():
                raise ValidationError("Invalid or expired invite code")
            
            if not invite.can_be_used_by_email(user_data.email):
                raise ValidationError("This invite is restricted to a different email address")
        
        # Check if email already exists
        result = await session.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            raise ConflictError("Email already registered")
        
        # Check if username already exists
        result = await session.execute(select(User).where(User.username == user_data.username))
        if result.scalar_one_or_none():
            raise ConflictError("Username already taken")
        
        # Determine user status based on registration mode
        user_status = UserStatus.APPROVED.value
        if settings.REGISTRATION_MODE == "ADMIN_APPROVAL":
            user_status = UserStatus.PENDING.value
        
        # Create new user
        password_hash = get_password_hash(user_data.password)
        user = User(
            email=user_data.email,
            username=user_data.username,
            password_hash=password_hash,
            status=user_status,
            is_active=(user_status == UserStatus.APPROVED.value)
        )
        
        session.add(user)
        
        # Mark invite as used if applicable
        if user_data.invite_code and settings.REGISTRATION_MODE == "INVITE_ONLY":
            invite.mark_as_used(user.id)
            session.add(invite)
        
        await session.commit()
        await session.refresh(user)
        
        logger.info(f"User registered successfully: {user.username} ({user.email})")
        
    except IntegrityError as e:
        await session.rollback()
        logger.error(f"Database integrity error during registration: {e}")
        raise ConflictError("User with this email or username already exists")
    except SQLAlchemyError as e:
        await session.rollback()
        logger.error(f"Database error during registration: {e}")
        raise
    
    return user


@router.post(
    "/login", 
    response_model=Token,
    summary="User login",
    description="Authenticate user and return access and refresh tokens",
    responses={
        200: {"description": "Login successful, tokens returned"},
        401: {"description": "Invalid credentials"},
        400: {"description": "Inactive user account"}
    }
)
async def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_async_session)
):
    try:
        # Try to find user by email or username
        result = await session.execute(
            select(User).where(
                (User.email == form_data.username) | (User.username == form_data.username)
            )
        )
        user = result.scalar_one_or_none()
        
        if not user or not verify_password(form_data.password, user.password_hash):
            logger.warning(f"Failed login attempt for: {form_data.username}")
            raise AuthenticationError("Incorrect email/username or password")
        
        if not user.is_active:
            logger.warning(f"Inactive user login attempt: {user.username}")
            raise AuthenticationError("Inactive user account")
        
        # Check user status
        from app.models.user import UserStatus
        if user.status == UserStatus.PENDING.value:
            raise AuthenticationError("Account is pending admin approval")
        elif user.status == UserStatus.REJECTED.value:
            raise AuthenticationError("Account has been rejected")
        elif user.status == UserStatus.SUSPENDED.value:
            raise AuthenticationError("Account has been suspended")
        
        # Create tokens
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        logger.info(f"User logged in successfully: {user.username}")
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
        
    except SQLAlchemyError as e:
        logger.error(f"Database error during login: {e}")
        raise


@router.post("/refresh", response_model=Token)
async def refresh_token(
    token_data: TokenRefresh,
    session: AsyncSession = Depends(get_async_session),
    redis_service: RedisService = Depends(get_redis_service)
):
    payload = verify_token(token_data.refresh_token, "refresh")
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    jti = payload.get("jti")
    if jti and await redis_service.is_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify user still exists and is active
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Blacklist the old refresh token
    exp = payload.get("exp")
    if jti and exp:
        await redis_service.add_to_blacklist(jti, exp - int(datetime.utcnow().timestamp()))

    # Create new tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_user(
    current_user: User = Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security),
    redis_service: RedisService = Depends(get_redis_service)
):
    payload = verify_token(token.credentials)
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            await redis_service.add_to_blacklist(jti, exp - int(datetime.utcnow().timestamp()))
    return
