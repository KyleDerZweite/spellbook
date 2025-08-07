
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from uuid import UUID

from app.database import get_async_session
from app.models.user import User
from app.models.collection import Collection, CollectionCard
from app.schemas.collection import CollectionCreate, CollectionUpdate, CollectionResponse, CollectionCardCreate, CollectionCardUpdate, CollectionCardResponse
from app.core.deps import get_current_user
from app.services.card_service import card_service
from app.models.card import CardStorageReason

router = APIRouter()

@router.post("/", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection: CollectionCreate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    db_collection = Collection(**collection.dict(), user_id=current_user.id)
    db.add(db_collection)
    await db.commit()
    await db.refresh(db_collection)
    return db_collection

@router.get("/", response_model=List[CollectionResponse])
async def get_collections(
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Collection).where(Collection.user_id == current_user.id))
    return result.scalars().all()

@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Collection).where(Collection.id == collection_id, Collection.user_id == current_user.id))
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    return collection

@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: UUID,
    collection: CollectionUpdate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Collection).where(Collection.id == collection_id, Collection.user_id == current_user.id))
    db_collection = result.scalar_one_or_none()
    if not db_collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    
    for key, value in collection.dict(exclude_unset=True).items():
        setattr(db_collection, key, value)
        
    await db.commit()
    await db.refresh(db_collection)
    return db_collection

@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Collection).where(Collection.id == collection_id, Collection.user_id == current_user.id))
    db_collection = result.scalar_one_or_none()
    if not db_collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    
    await db.delete(db_collection)
    await db.commit()

@router.post("/{collection_id}/cards", response_model=CollectionCardResponse, status_code=status.HTTP_201_CREATED)
async def add_card_to_collection(
    collection_id: UUID,
    card: CollectionCardCreate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    # Ensure the collection exists and belongs to the user
    result = await db.execute(select(Collection).where(Collection.id == collection_id, Collection.user_id == current_user.id))
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    # Ensure the card exists in the database, fetching it from Scryfall if necessary
    db_card = await card_service.get_card_details(card.card_scryfall_id, db)
    if not db_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    # Make the card permanent in our cache
    await card_service.make_card_permanent(db_card.scryfall_id, CardStorageReason.USER_COLLECTION, db, current_user.id)

    db_collection_card = CollectionCard(**card.dict(), collection_id=collection_id)
    db.add(db_collection_card)
    await db.commit()
    await db.refresh(db_collection_card)
    return db_collection_card

@router.put("/{collection_id}/cards/{card_id}", response_model=CollectionCardResponse)
async def update_card_in_collection(
    collection_id: UUID,
    card_id: UUID,
    card: CollectionCardUpdate,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(CollectionCard)
        .join(Collection)
        .where(CollectionCard.id == card_id, Collection.id == collection_id, Collection.user_id == current_user.id)
    )
    db_card = result.scalar_one_or_none()
    if not db_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found in collection")

    for key, value in card.dict(exclude_unset=True).items():
        setattr(db_card, key, value)

    await db.commit()
    await db.refresh(db_card)
    return db_card

@router.get("/{collection_id}/cards", response_model=List[CollectionCardResponse])
async def get_collection_cards(
    collection_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """Get all cards in a collection with full card details"""
    # Verify collection exists and belongs to user
    result = await db.execute(select(Collection).where(Collection.id == collection_id, Collection.user_id == current_user.id))
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    # Get collection cards with card details
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(CollectionCard)
        .options(selectinload(CollectionCard.card))
        .where(CollectionCard.collection_id == collection_id)
    )
    
    return result.scalars().all()

@router.delete("/{collection_id}/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_card_from_collection(
    collection_id: UUID,
    card_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(CollectionCard)
        .join(Collection)
        .where(CollectionCard.id == card_id, Collection.id == collection_id, Collection.user_id == current_user.id)
    )
    db_card = result.scalar_one_or_none()
    if not db_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found in collection")

    await db.delete(db_card)
    await db.commit()
