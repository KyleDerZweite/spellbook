from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_session
from app.models.user import User
from app.schemas.user import UserProfile, UserUpdate, UserResponse
from app.schemas.auth import PasswordChange
from app.core.deps import get_current_user
from app.core.security import verify_password, get_password_hash

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user


@router.patch("/me", response_model=UserProfile)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    from sqlalchemy import select
    
    # Check if username is taken by another user
    if user_update.username is not None and user_update.username != current_user.username:
        existing_user = await session.execute(
            select(User).where(User.username == user_update.username)
        )
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = user_update.username
    
    # Check if email is taken by another user
    if user_update.email is not None and user_update.email != current_user.email:
        existing_user = await session.execute(
            select(User).where(User.email == user_update.email)
        )
        if existing_user.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already taken"
            )
        current_user.email = user_update.email
    
    # Update preferences
    if user_update.preferences is not None:
        current_user.preferences = user_update.preferences
    
    await session.commit()
    await session.refresh(current_user)
    
    return current_user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    # Verify current password
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    # Update password
    current_user.password_hash = get_password_hash(password_data.new_password)
    await session.commit()
    
    return


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_account(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Delete the current user's account completely.
    This will remove all user data including collections, decks, and related data.
    """
    from sqlalchemy import select, update
    from app.models.invite import Invite
    
    # Clean up invite relationships before deleting user
    # Set created_by_id to NULL for invites created by this user
    await session.execute(
        update(Invite)
        .where(Invite.created_by_id == current_user.id)
        .values(created_by_id=None)
    )
    
    # Set used_by_id to NULL for invites used by this user
    await session.execute(
        update(Invite)
        .where(Invite.used_by_id == current_user.id)
        .values(used_by_id=None)
    )
    
    # Delete the user (CASCADE will handle UserCard, Deck, and DeckCard deletion)
    await session.delete(current_user)
    await session.commit()
    
    return