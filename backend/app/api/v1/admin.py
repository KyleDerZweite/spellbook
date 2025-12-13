from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, cast, String
from typing import List, Optional
from pydantic import BaseModel, Field
from app.database import get_async_session
from app.models.user import User, UserStatus
from app.core.deps import get_current_admin_user
from app.core.security import get_password_hash
from app.config import settings
import uuid
from datetime import datetime

router = APIRouter(tags=["admin"])


# Pydantic models for admin API  
class AdminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    status: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    suspension_reason: Optional[str] = None
    suspended_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        
    @classmethod
    def from_user(cls, user: User):
        return cls(
            id=str(user.id),
            username=user.username,
            email=user.email,
            status=user.status,
            is_admin=user.is_admin,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            suspension_reason=user.suspension_reason,
            suspended_at=user.suspended_at
        )


class UpdateUserStatusRequest(BaseModel):
    status: str = Field(..., description="New user status: pending, approved, rejected, suspended")


class SuspendUserRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Reason for suspension", max_length=500)


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., description="New password for the user", min_length=8)


class SystemSettingsResponse(BaseModel):
    registration_mode: str


class UpdateSystemSettingsRequest(BaseModel):
    registration_mode: str = Field(..., description="Registration mode: OPEN, INVITE_ONLY, ADMIN_APPROVAL")


@router.get("/users", response_model=List[AdminUserResponse])
async def get_all_users(
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Get all users in the system.
    Only accessible by admin users.
    """
    try:
        # Get all users ordered by created_at desc
        result = await session.execute(
            select(User).order_by(User.created_at.desc())
        )
        users = result.scalars().all()
        
        return [AdminUserResponse.from_user(user) for user in users]
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in get_all_users: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get users: {str(e)}"
        )


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    status_update: UpdateUserStatusRequest,
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Update a user's status.
    Only accessible by admin users.
    """
    # Validate user_id format
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    # Validate status
    valid_statuses = [s.value for s in UserStatus]
    if status_update.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    # Convert string status to enum
    new_status = UserStatus(status_update.status)
    
    # Get the user
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from changing their own status
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own user status"
        )
    
    # Update user status
    old_status = user.status
    user.status = new_status
    
    # If approving user, make sure they're active
    if new_status == UserStatus.APPROVED:
        user.is_active = True
    # If rejecting or suspending, make them inactive
    elif new_status in [UserStatus.REJECTED, UserStatus.SUSPENDED]:
        user.is_active = False
    
    await session.commit()
    await session.refresh(user)
    
    return {
        "message": f"User status updated from {old_status.value} to {new_status.value}",
        "user": AdminUserResponse.from_user(user)
    }


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_system_settings(
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Get current system settings.
    Only accessible by admin users.
    """
    return SystemSettingsResponse(
        registration_mode=settings.REGISTRATION_MODE
    )


@router.patch("/settings")
async def update_system_settings(
    settings_update: UpdateSystemSettingsRequest,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Update system settings.
    Only accessible by admin users.
    
    Note: This updates the runtime configuration.
    For persistent changes, update environment variables or config files.
    """
    # Validate registration mode
    valid_modes = ['OPEN', 'INVITE_ONLY', 'ADMIN_APPROVAL']
    if settings_update.registration_mode not in valid_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid registration mode. Must be one of: {', '.join(valid_modes)}"
        )
    
    # Update runtime setting
    old_mode = settings.REGISTRATION_MODE
    settings.REGISTRATION_MODE = settings_update.registration_mode
    
    return {
        "message": f"Registration mode updated from {old_mode} to {settings_update.registration_mode}",
        "settings": SystemSettingsResponse(
            registration_mode=settings.REGISTRATION_MODE
        )
    }


@router.get("/stats")
async def get_admin_stats(
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Get administrative statistics.
    Only accessible by admin users.
    """
    try:
        # Get user counts by status
        total_users_result = await session.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar()
        
        pending_users_result = await session.execute(
            select(func.count(User.id)).where(cast(User.status, String) == 'PENDING')
        )
        pending_users = pending_users_result.scalar()
        
        approved_users_result = await session.execute(
            select(func.count(User.id)).where(cast(User.status, String) == 'APPROVED')
        )
        approved_users = approved_users_result.scalar()
        
        suspended_users_result = await session.execute(
            select(func.count(User.id)).where(cast(User.status, String) == 'SUSPENDED')
        )
        suspended_users = suspended_users_result.scalar()
        
        admin_users_result = await session.execute(
            select(func.count(User.id)).where(User.is_admin == True)
        )
        admin_users = admin_users_result.scalar()
        
        return {
            "total_users": total_users,
            "pending_users": pending_users,
            "approved_users": approved_users,
            "suspended_users": suspended_users,
            "admin_users": admin_users,
            "registration_mode": settings.REGISTRATION_MODE
        }
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in get_admin_stats: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get stats: {str(e)}"
        )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Delete a user account completely.
    Only accessible by admin users.
    """
    # Validate user_id format
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    # Get the user to delete
    result = await session.execute(select(User).where(User.id == user_uuid))
    user_to_delete = result.scalar_one_or_none()
    
    if not user_to_delete:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if user_to_delete.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    try:
        from app.models.invite import Invite
        
        # Clean up invite relationships before deleting user
        # Set created_by_id to NULL for invites created by this user
        await session.execute(
            update(Invite)
            .where(Invite.created_by_id == user_to_delete.id)
            .values(created_by_id=None)
        )
        
        # Set used_by_id to NULL for invites used by this user
        await session.execute(
            update(Invite)
            .where(Invite.used_by_id == user_to_delete.id)
            .values(used_by_id=None)
        )
        
        # Store username for response
        deleted_username = user_to_delete.username
        
        # Delete the user (CASCADE will handle UserCard, Deck, and DeckCard deletion)
        await session.delete(user_to_delete)
        await session.commit()
        
        return {
            "message": f"User {deleted_username} has been permanently deleted",
            "deleted_user_id": user_id
        }
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error deleting user {user_id}: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}"
        )


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    suspend_request: SuspendUserRequest,
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Suspend a user account with an optional reason.
    Only accessible by admin users.
    """
    # Validate user_id format
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    # Get the user
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from suspending themselves
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot suspend your own account"
        )
    
    # Prevent suspending other admins
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot suspend admin accounts"
        )
    
    # Suspend the user
    user.status = UserStatus.SUSPENDED
    user.is_active = False
    user.suspension_reason = suspend_request.reason
    user.suspended_at = datetime.utcnow()
    user.suspended_by_id = current_admin.id
    
    await session.commit()
    await session.refresh(user)
    
    return {
        "message": f"User {user.username} has been suspended",
        "user": AdminUserResponse.from_user(user)
    }


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Remove suspension from a user account.
    Only accessible by admin users.
    """
    # Validate user_id format
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    # Get the user
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.status != UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not suspended"
        )
    
    # Unsuspend the user
    user.status = UserStatus.APPROVED
    user.is_active = True
    user.suspension_reason = None
    user.suspended_at = None
    user.suspended_by_id = None
    
    await session.commit()
    await session.refresh(user)
    
    return {
        "message": f"User {user.username} has been unsuspended",
        "user": AdminUserResponse.from_user(user)
    }


@router.patch("/users/{user_id}/password")
async def change_user_password(
    user_id: str,
    password_request: ChangePasswordRequest,
    current_admin: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Change a user's password.
    Only accessible by admin users.
    """
    # Validate user_id format
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    # Get the user
    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update the password
    user.password_hash = get_password_hash(password_request.new_password)
    
    await session.commit()
    await session.refresh(user)
    
    return {
        "message": f"Password changed for user {user.username}",
        "user": AdminUserResponse.from_user(user)
    }