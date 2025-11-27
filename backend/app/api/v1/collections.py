
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from io import StringIO

from app.database import get_async_session
from app.models.user import User
from app.models.collection import Collection, CollectionCard
from app.schemas.collection import CollectionCreate, CollectionUpdate, CollectionResponse, CollectionCardCreate, CollectionCardUpdate, CollectionCardResponse
from app.core.deps import get_current_user
from app.services.card_service import card_service
from app.services.import_export_service import import_export_service
from app.models.card import CardStorageReason

router = APIRouter()

# ==================== Collection CRUD ====================

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

# ==================== Collection Cards ====================

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

# ==================== Import/Export ====================

@router.post("/{collection_id}/import")
async def import_to_collection(
    collection_id: UUID,
    file: UploadFile = File(..., description="File to import (CSV, JSON, or text)"),
    format: Optional[str] = Form(None, description="Format hint: csv, deckbox, moxfield, arena, json"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Import cards into a collection from various file formats.
    
    Supported formats:
    - CSV (generic, Deckbox, Moxfield)
    - JSON (Spellbook native format)
    - Text (MTG Arena format)
    """
    # Verify collection exists
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == current_user.id
        )
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Read file content
    content = await file.read()
    try:
        file_content = content.decode('utf-8')
    except UnicodeDecodeError:
        file_content = content.decode('latin-1')
    
    # Determine format and import
    filename = file.filename.lower() if file.filename else ''
    
    try:
        if format == 'json' or filename.endswith('.json'):
            result = await import_export_service.import_json(
                file_content, current_user.id, collection_id, db
            )
        elif format == 'arena' or filename.endswith('.txt'):
            result = await import_export_service.import_arena(
                file_content, current_user.id, collection_id, db
            )
        else:
            result = await import_export_service.import_csv(
                file_content, current_user.id, collection_id, db, format_hint=format
            )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")


@router.get("/{collection_id}/export")
async def export_collection(
    collection_id: UUID,
    format: str = Query("csv", description="Export format: csv, json, arena"),
    include_prices: bool = Query(True, description="Include price data (CSV only)"),
    include_details: bool = Query(False, description="Include full card details (JSON only)"),
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Export a collection to various file formats.
    
    Formats:
    - csv: Standard CSV with card data
    - json: Spellbook JSON format
    - arena: MTG Arena importable format
    """
    # Verify collection exists
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == current_user.id
        )
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    try:
        if format == 'json':
            content = await import_export_service.export_json(
                collection_id, current_user.id, db, include_full_details=include_details
            )
            media_type = "application/json"
            filename = f"{collection.name.replace(' ', '_')}.json"
        elif format == 'arena':
            content = await import_export_service.export_arena(
                collection_id, current_user.id, db
            )
            media_type = "text/plain"
            filename = f"{collection.name.replace(' ', '_')}.txt"
        else:
            content = await import_export_service.export_csv(
                collection_id, current_user.id, db, include_prices=include_prices
            )
            media_type = "text/csv"
            filename = f"{collection.name.replace(' ', '_')}.csv"
        
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


# ==================== Statistics ====================

@router.get("/{collection_id}/stats")
async def get_collection_stats(
    collection_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get statistics for a collection.
    """
    # Verify collection exists
    result = await db.execute(
        select(Collection).where(
            Collection.id == collection_id,
            Collection.user_id == current_user.id
        )
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Get card counts
    from sqlalchemy.orm import selectinload
    cards_result = await db.execute(
        select(CollectionCard)
        .options(selectinload(CollectionCard.card))
        .where(CollectionCard.collection_id == collection_id)
    )
    collection_cards = cards_result.scalars().all()
    
    # Calculate stats
    total_cards = sum(cc.quantity for cc in collection_cards)
    unique_cards = len(collection_cards)
    
    # Calculate value
    total_value_usd = 0.0
    for cc in collection_cards:
        if cc.card and cc.card.prices:
            price = cc.card.prices.get('usd')
            if price:
                try:
                    total_value_usd += float(price) * cc.quantity
                except (ValueError, TypeError):
                    pass
    
    # Rarity breakdown
    rarity_counts = {}
    for cc in collection_cards:
        if cc.card:
            rarity = cc.card.rarity or 'unknown'
            rarity_counts[rarity] = rarity_counts.get(rarity, 0) + cc.quantity
    
    # Color breakdown
    color_counts = {'W': 0, 'U': 0, 'B': 0, 'R': 0, 'G': 0, 'colorless': 0, 'multicolor': 0}
    for cc in collection_cards:
        if cc.card and cc.card.colors:
            colors = cc.card.colors.split(',') if cc.card.colors else []
            if len(colors) > 1:
                color_counts['multicolor'] += cc.quantity
            elif len(colors) == 1:
                color_counts[colors[0]] = color_counts.get(colors[0], 0) + cc.quantity
            else:
                color_counts['colorless'] += cc.quantity
    
    # Set breakdown
    set_counts = {}
    for cc in collection_cards:
        if cc.card and cc.card.extra_data:
            set_code = cc.card.extra_data.get('set_info', {}).get('code', 'unknown')
            set_counts[set_code] = set_counts.get(set_code, 0) + cc.quantity
    
    return {
        'collection_id': str(collection_id),
        'collection_name': collection.name,
        'total_cards': total_cards,
        'unique_cards': unique_cards,
        'total_value_usd': round(total_value_usd, 2),
        'sets_collected': len(set_counts),
        'rarity_breakdown': rarity_counts,
        'color_breakdown': color_counts,
        'set_breakdown': set_counts
    }

