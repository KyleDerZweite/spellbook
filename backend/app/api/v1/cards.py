from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from app.database import get_async_session
from app.models.card import Card, CardSet
from app.models.card_index import CardIndex
from app.schemas.card import CardResponse, CardSearchResponse, CardSetResponse, UniqueCardSearchResponse, CardResponseWithVersions
from app.core.deps import get_pagination_params
from app.services.card_service import card_service
from app.core.exceptions import ResourceNotFoundError, ExternalServiceError
from typing import Optional, List
from uuid import UUID
import math
import logging

logger = logging.getLogger(__name__)

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
    """
    Search cards using the card index and fetch details on-demand.
    
    This endpoint first searches the lightweight card index for matching names,
    then fetches full details from the cache or Scryfall API as needed.
    """
    offset, limit = get_pagination_params(page, per_page)
    
    # Build query parameters for the service
    query_params = {}
    if q:
        query_params['q'] = q
    if colors:
        query_params['colors'] = colors
    if set_code:
        query_params['set_code'] = set_code
    if rarity:
        query_params['rarity'] = rarity
    if type_line:
        query_params['type_line'] = type_line
    
    try:
        # First, get count from card index for pagination
        total = await _get_search_count(query_params, session)
        
        # Get cards with full details via the service
        cards = await card_service.search_cards_with_details(
            query_params=query_params,
            session=session,
            limit=per_page,
            offset=offset
        )
        
        # Calculate metadata
        total_pages = math.ceil(total / per_page) if per_page > 0 else 1
        
        logger.info(f"Card search: query={q}, results={len(cards)}, total={total}")
        
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
        
    except ExternalServiceError as e:
        logger.error(f"External service error during search: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Card data service temporarily unavailable"
        )
    except Exception as e:
        logger.error(f"Unexpected error during search: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed"
        )


async def _get_search_count(query_params: dict, session: AsyncSession) -> int:
    """Get total count of search results from card index"""
    query = select(func.count(CardIndex.scryfall_id))
    conditions = []
    
    # Text search
    if query_params.get('q'):
        search_term = query_params['q']
        text_conditions = [
            CardIndex.name.ilike(f"%{search_term}%"),
            CardIndex.type_line.ilike(f"%{search_term}%")
        ]
        conditions.append(or_(*text_conditions))
    
    # Color filter
    if query_params.get('colors'):
        colors = query_params['colors']
        conditions.append(CardIndex.colors.like(f"%{colors}%"))
    
    # Set filter
    if query_params.get('set_code'):
        conditions.append(CardIndex.set_code == query_params['set_code'].upper())
    
    # Rarity filter
    if query_params.get('rarity'):
        conditions.append(CardIndex.rarity == query_params['rarity'].lower())
    
    # Type filter
    if query_params.get('type_line'):
        conditions.append(CardIndex.type_line.ilike(f"%{query_params['type_line']}%"))
    
    # Apply conditions
    if conditions:
        query = query.where(and_(*conditions))
    
    result = await session.execute(query)
    return result.scalar() or 0




@router.get("/search-unique")
async def search_unique_cards(
    q: Optional[str] = Query(None, description="Search query (name, type, oracle text)"),
    colors: Optional[str] = Query(None, description="Color filter (e.g., 'WU' for white/blue)"),
    set_code: Optional[str] = Query(None, alias="set", description="Set code filter"),
    rarity: Optional[str] = Query(None, description="Rarity filter"),
    type_line: Optional[str] = Query(None, alias="type", description="Type line filter"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Results per page"),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Search for unique cards (grouped by oracle_id) with version counts.
    
    This endpoint returns one representative version of each unique card along with 
    the total number of versions/printings available.
    """
    offset = (page - 1) * per_page
    
    # Build conditions for the search
    conditions = [CardIndex.oracle_id.is_not(None)]
    
    if q:
        search_term = q
        text_conditions = [
            CardIndex.name.ilike(f"%{search_term}%"),
            CardIndex.type_line.ilike(f"%{search_term}%")
        ]
        conditions.append(or_(*text_conditions))
    
    if colors:
        conditions.append(CardIndex.colors.like(f"%{colors}%"))
    
    if set_code:
        conditions.append(CardIndex.set_code == set_code.upper())
    
    if rarity:
        conditions.append(CardIndex.rarity == rarity.lower())
    
    if type_line:
        conditions.append(CardIndex.type_line.ilike(f"%{type_line}%"))
    
    try:
        # First, get unique oracle_ids with version counts directly from the index
        # This is the key fix - query the database for grouping, not in-memory
        unique_query = (
            select(
                CardIndex.oracle_id,
                func.count(CardIndex.scryfall_id).label('version_count'),
                func.min(CardIndex.name).label('card_name'),
            )
            .where(and_(*conditions))
            .group_by(CardIndex.oracle_id)
            .order_by(func.min(CardIndex.name))
        )
        
        # Get total count for pagination
        count_subquery = unique_query.subquery()
        total_count_result = await session.execute(
            select(func.count()).select_from(count_subquery)
        )
        total_unique = total_count_result.scalar() or 0
        
        # Get paginated results
        paginated_query = unique_query.offset(offset).limit(per_page)
        result = await session.execute(paginated_query)
        oracle_results = result.all()
        
        logger.info(f"Unique search found {total_unique} unique oracle_ids, fetching details for {len(oracle_results)}")
        
        # Collect all scryfall_ids we need to fetch
        oracle_to_scryfall = {}
        scryfall_ids_to_fetch = []
        version_counts = {}
        
        for oracle_row in oracle_results:
            oracle_id = oracle_row.oracle_id
            version_counts[oracle_id] = oracle_row.version_count
            
            # Get a representative scryfall_id for this oracle_id
            rep_result = await session.execute(
                select(CardIndex.scryfall_id)
                .where(CardIndex.oracle_id == oracle_id)
                .limit(1)
            )
            representative_scryfall_id = rep_result.scalar_one_or_none()
            
            if representative_scryfall_id:
                oracle_to_scryfall[oracle_id] = representative_scryfall_id
                scryfall_ids_to_fetch.append(representative_scryfall_id)
        
        # Batch fetch all cards at once for better performance
        cards_map = await card_service.get_cards_batch(scryfall_ids_to_fetch, session)
        
        # Build results
        unique_cards = []
        for oracle_row in oracle_results:
            oracle_id = oracle_row.oracle_id
            scryfall_id = oracle_to_scryfall.get(oracle_id)
            
            if not scryfall_id or scryfall_id not in cards_map:
                continue
                
            full_card = cards_map[scryfall_id]
            version_count = version_counts[oracle_id]
            
            card_dict = {
                "id": str(full_card.id),
                "scryfall_id": str(full_card.scryfall_id) if full_card.scryfall_id else None,
                "oracle_id": str(full_card.oracle_id) if full_card.oracle_id else None,
                "name": full_card.name,
                "mana_cost": full_card.mana_cost,
                "type_line": full_card.type_line,
                "oracle_text": full_card.oracle_text,
                "power": full_card.power,
                "toughness": full_card.toughness,
                "colors": full_card.colors,
                "color_identity": full_card.color_identity,
                "rarity": full_card.rarity,
                "flavor_text": full_card.flavor_text,
                "artist": full_card.artist,
                "collector_number": full_card.collector_number,
                "image_uris": full_card.image_uris or {},
                "prices": full_card.prices or {},
                "legalities": full_card.legalities or {},
                "metadata": full_card.extra_data or {},
                "created_at": full_card.created_at.isoformat() if full_card.created_at else None,
                "updated_at": full_card.updated_at.isoformat() if full_card.updated_at else None,
                "set": None,
                "version_count": version_count
            }
            unique_cards.append(card_dict)
        
        total_pages = math.ceil(total_unique / per_page) if per_page > 0 else 1
        
        logger.info(f"Unique card search: query={q}, total_unique={total_unique}, results={len(unique_cards)}")
        
        return {
            "data": unique_cards,
            "meta": {
                "total": total_unique,
                "page": page,
                "per_page": per_page,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
        
    except ExternalServiceError as e:
        logger.error(f"External service error during unique search: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Card data service temporarily unavailable"
        )
    except Exception as e:
        logger.error(f"Unexpected error during unique search: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.get("/oracle/{oracle_id}/versions", response_model=List[CardResponse])
async def get_card_versions(
    oracle_id: str,
    session: AsyncSession = Depends(get_async_session)
):
    """
    Get all versions/printings of a card by oracle_id.
    
    Returns all different printings and editions of the specified card,
    sorted by release date and set.
    """
    try:
        # Validate oracle_id format
        try:
            oracle_uuid = UUID(oracle_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid oracle ID format"
            )
        
        # Get all versions of the card
        versions = await card_service.get_card_versions(oracle_uuid, session)
        
        if not versions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No versions found for this oracle ID"
            )
        
        logger.info(f"Retrieved {len(versions)} versions for oracle_id: {oracle_id}")
        return versions
        
    except HTTPException:
        raise
    except ExternalServiceError as e:
        logger.error(f"External service error fetching versions for {oracle_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Card data service temporarily unavailable"
        )
    except Exception as e:
        logger.error(f"Unexpected error fetching versions for {oracle_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch card versions"
        )


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


@router.get("/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: str,
    session: AsyncSession = Depends(get_async_session)
):
    """
    Get a specific card by ID (either Spellbook ID or Scryfall ID).
    
    This endpoint fetches full card details, using cache if available,
    or retrieving from Scryfall API if needed.
    """
    try:
        # Try to parse as UUID (Scryfall ID)
        try:
            scryfall_id = UUID(card_id)
            # Get card details via service (with on-demand fetching)
            card = await card_service.get_card_details(scryfall_id, session)
            if not card:
                raise ResourceNotFoundError(f"Card not found: {card_id}")
            return card
            
        except ValueError:
            # Not a valid UUID, try as our internal ID
            query = select(Card).options(selectinload(Card.set)).where(Card.id == card_id)
            result = await session.execute(query)
            card = result.scalar_one_or_none()
            
            if not card:
                raise ResourceNotFoundError(f"Card not found: {card_id}")
            
            # Update access time for cached cards
            card.update_access_time()
            await session.commit()
            
            return card
            
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found"
        )
    except ExternalServiceError as e:
        logger.error(f"External service error fetching card {card_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Card data service temporarily unavailable"
        )