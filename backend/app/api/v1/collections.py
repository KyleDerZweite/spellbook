from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from app.database import get_async_session
from app.models.user import User
from app.models.card import Card, CardStorageReason
from app.models.collection import UserCard, Deck, DeckCard
from app.schemas.collection import (
    UserCardCreate, UserCardUpdate, UserCardResponse,
    CollectionStats, DeckCreate, DeckUpdate, DeckResponse,
    DeckListResponse, DeckCardCreate, DeckCardResponse
)
from app.core.deps import get_current_user, get_pagination_params
from app.services.card_service import card_service
from app.core.exceptions import ResourceNotFoundError, ExternalServiceError
from app.config import settings
from typing import Optional, List
from uuid import UUID
import uuid
import math
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/mine", response_model=List[UserCardResponse])
async def get_user_collection(
    card_name: Optional[str] = Query(None, description="Filter by card name"),
    set_code: Optional[str] = Query(None, alias="set", description="Filter by set"),
    colors: Optional[str] = Query(None, description="Filter by colors"),
    tags: Optional[str] = Query(None, description="Filter by tags"),
    sort: str = Query("name", description="Sort by: name, date_added, price"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    offset, limit = get_pagination_params(page, per_page)
    
    # Build query
    query = select(UserCard).options(
        selectinload(UserCard.card).selectinload(Card.set)
    ).where(UserCard.user_id == current_user.id)
    
    conditions = []
    
    # Filter by card name
    if card_name:
        query = query.join(Card).where(Card.name.ilike(f"%{card_name}%"))
    
    # Filter by set
    if set_code:
        from app.models.card import CardSet
        query = query.join(Card).join(CardSet).where(CardSet.code == set_code.upper())
    
    # Filter by colors
    if colors:
        query = query.join(Card).where(Card.colors.like(f"%{colors}%"))
    
    # Filter by tags
    if tags:
        conditions.append(UserCard.tags.any(tags))
    
    # Apply conditions
    if conditions:
        query = query.where(and_(*conditions))
    
    # Apply sorting
    if sort == "name":
        query = query.join(Card).order_by(Card.name)
    elif sort == "date_added":
        query = query.order_by(UserCard.created_at.desc())
    elif sort == "price":
        # This would need price calculation logic
        query = query.order_by(UserCard.purchase_price.desc().nullslast())
    
    # Apply pagination
    query = query.offset(offset).limit(limit)
    
    result = await session.execute(query)
    user_cards = result.scalars().all()
    
    return user_cards


@router.post("/mine/cards", response_model=UserCardResponse, status_code=status.HTTP_201_CREATED)
async def add_card_to_collection(
    card_data: UserCardCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Add a card to the user's collection.
    
    This endpoint handles both internal card IDs and Scryfall IDs, automatically
    fetching card details if needed and marking them as permanent storage.
    """
    # Handle both internal card IDs and Scryfall IDs
    card = None
    scryfall_id = None
    
    try:
        # Try to parse as UUID (could be Scryfall ID)
        scryfall_id = UUID(str(card_data.card_id))
        
        # Check if it's a Scryfall ID by trying to get card details
        try:
            card = await card_service.get_card_details(scryfall_id, session)
            if card and settings.PERMANENT_ON_COLLECTION_ADD:
                # Make card permanent since it's being added to collection
                await card_service.make_card_permanent(
                    scryfall_id, 
                    CardStorageReason.USER_COLLECTION,
                    session
                )
        except ResourceNotFoundError:
            # Not a valid Scryfall ID, try as internal ID
            card_result = await session.execute(select(Card).where(Card.id == card_data.card_id))
            card = card_result.scalar_one_or_none()
            
    except ValueError:
        # Not a UUID at all, treat as internal ID
        card_result = await session.execute(select(Card).where(Card.id == card_data.card_id))
        card = card_result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found"
        )
    
    # Check if user already has this card with same condition/language
    existing_result = await session.execute(
        select(UserCard).where(
            and_(
                UserCard.user_id == current_user.id,
                UserCard.card_id == card.id,  # Use the found card's ID
                UserCard.condition == card_data.condition,
                UserCard.language == card_data.language
            )
        )
    )
    existing_card = existing_result.scalar_one_or_none()
    
    if existing_card:
        # Update existing entry
        existing_card.quantity += card_data.quantity
        existing_card.foil_quantity += card_data.foil_quantity
        if card_data.purchase_price:
            existing_card.purchase_price = card_data.purchase_price
        if card_data.purchase_date:
            existing_card.purchase_date = card_data.purchase_date
        if card_data.notes:
            existing_card.notes = card_data.notes
        if card_data.tags:
            existing_card.tags = card_data.tags
        
        await session.commit()
        await session.refresh(existing_card)
        
        # Load relationships
        await session.refresh(existing_card, ["card"])
        logger.info(f"Updated collection entry for {card.name} (user: {current_user.username})")
        return existing_card
    else:
        # Create new entry with the actual card ID
        card_data_dict = card_data.dict()
        card_data_dict['card_id'] = card.id  # Ensure we use the actual card ID
        
        user_card = UserCard(
            user_id=current_user.id,
            **card_data_dict
        )
        
        session.add(user_card)
        await session.commit()
        await session.refresh(user_card)
        
        # Load relationships
        await session.refresh(user_card, ["card"])
        logger.info(f"Added {card.name} to collection (user: {current_user.username})")
        return user_card


@router.patch("/mine/cards/{entry_id}", response_model=UserCardResponse)
async def update_collection_entry(
    entry_id: uuid.UUID,
    card_update: UserCardUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    # Get user's card entry
    result = await session.execute(
        select(UserCard).where(
            and_(
                UserCard.id == entry_id,
                UserCard.user_id == current_user.id
            )
        )
    )
    user_card = result.scalar_one_or_none()
    
    if not user_card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection entry not found"
        )
    
    # Update fields
    update_data = card_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_card, field, value)
    
    await session.commit()
    await session.refresh(user_card)
    
    # Load relationships
    await session.refresh(user_card, ["card"])
    return user_card


@router.delete("/mine/cards/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_collection(
    entry_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    # Get user's card entry
    result = await session.execute(
        select(UserCard).where(
            and_(
                UserCard.id == entry_id,
                UserCard.user_id == current_user.id
            )
        )
    )
    user_card = result.scalar_one_or_none()
    
    if not user_card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection entry not found"
        )
    
    await session.delete(user_card)
    await session.commit()
    
    return


@router.get("/mine/stats", response_model=CollectionStats)
async def get_collection_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    # This is a simplified version - in production you might use a materialized view
    
    # Total and unique cards
    card_stats = await session.execute(
        select(
            func.sum(UserCard.quantity + UserCard.foil_quantity).label("total_cards"),
            func.count(func.distinct(UserCard.card_id)).label("unique_cards")
        ).where(UserCard.user_id == current_user.id)
    )
    total_cards, unique_cards = card_stats.first()
    
    # TODO: Implement proper stats calculation
    # This would involve joins with cards table for rarity/color breakdowns
    # and price calculations
    
    return CollectionStats(
        total_cards=total_cards or 0,
        unique_cards=unique_cards or 0,
        total_value=0,  # TODO: Calculate from current prices
        sets_collected=0,  # TODO: Count distinct sets
        rarity_breakdown={},  # TODO: Group by rarity
        color_breakdown={}  # TODO: Group by colors
    )