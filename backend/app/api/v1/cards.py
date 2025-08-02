from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from app.database import get_async_session
from app.models.card import Card, CardSet
from app.schemas.card import CardResponse, CardSearchResponse, CardSetResponse
from app.core.deps import get_pagination_params
from typing import Optional, List
import math

router = APIRouter()


@router.get("/search", response_model=CardSearchResponse)
async def search_cards(
    q: Optional[str] = Query(None, description="Search query (name, type, oracle text)"),
    colors: Optional[str] = Query(None, description="Color filter (e.g., 'WU' for white/blue)"),
    set_code: Optional[str] = Query(None, alias="set", description="Set code filter"),
    rarity: Optional[str] = Query(None, description="Rarity filter"),
    type_line: Optional[str] = Query(None, alias="type", description="Type line filter"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Results per page"),
    session: AsyncSession = Depends(get_async_session)
):
    offset, limit = get_pagination_params(page, per_page)
    
    # Build query
    query = select(Card).options(selectinload(Card.set))
    conditions = []
    
    # Text search
    if q:
        search_conditions = [
            Card.name.ilike(f"%{q}%"),
            Card.type_line.ilike(f"%{q}%"),
            Card.oracle_text.ilike(f"%{q}%")
        ]
        conditions.append(or_(*search_conditions))
    
    # Color filter
    if colors:
        # Simple color matching - can be enhanced later
        conditions.append(Card.colors.like(f"%{colors}%"))
    
    # Set filter
    if set_code:
        set_subquery = select(CardSet.id).where(CardSet.code == set_code.upper())
        conditions.append(Card.set_id.in_(set_subquery))
    
    # Rarity filter
    if rarity:
        conditions.append(Card.rarity == rarity.lower())
    
    # Type filter
    if type_line:
        conditions.append(Card.type_line.ilike(f"%{type_line}%"))
    
    # Apply conditions
    if conditions:
        query = query.where(and_(*conditions))
    
    # Get total count
    count_query = select(func.count(Card.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    
    total_result = await session.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination and execute
    query = query.offset(offset).limit(limit).order_by(Card.name)
    result = await session.execute(query)
    cards = result.scalars().all()
    
    # Calculate metadata
    total_pages = math.ceil(total / per_page) if per_page > 0 else 1
    
    return CardSearchResponse(
        data=cards,
        meta={
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    )


@router.get("/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: str,
    session: AsyncSession = Depends(get_async_session)
):
    query = select(Card).options(selectinload(Card.set)).where(Card.id == card_id)
    result = await session.execute(query)
    card = result.scalar_one_or_none()
    
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found"
        )
    
    return card


@router.get("/sets", response_model=List[CardSetResponse])
async def get_sets(
    session: AsyncSession = Depends(get_async_session)
):
    query = select(CardSet).order_by(CardSet.release_date.desc())
    result = await session.execute(query)
    sets = result.scalars().all()
    
    return sets


@router.get("/sets/{set_code}", response_model=CardSetResponse)
async def get_set(
    set_code: str,
    session: AsyncSession = Depends(get_async_session)
):
    query = select(CardSet).where(CardSet.code == set_code.upper())
    result = await session.execute(query)
    card_set = result.scalar_one_or_none()
    
    if not card_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Set not found"
        )
    
    return card_set