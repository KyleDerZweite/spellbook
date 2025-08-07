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
        # Get regular search results first  
        cards = await card_service.search_cards_with_details(
            query_params=query_params,
            session=session,
            limit=per_page * 3,  # Get more to ensure deduplication works
            offset=0  # Always start from 0 for deduplication
        )
        
        # Group by oracle_id to deduplicate
        oracle_groups = {}
        for card in cards:
            oracle_id = str(card.oracle_id) if card.oracle_id else f"no-oracle-{card.id}"
            if oracle_id not in oracle_groups:
                oracle_groups[oracle_id] = []
            oracle_groups[oracle_id].append(card)
        
        # Convert to list and paginate
        unique_results = []
        for oracle_id, card_versions in oracle_groups.items():
            representative_card = card_versions[0]  # Take first as representative
            
            # Calculate actual version count from database for this oracle_id
            if representative_card.oracle_id:
                # Query the card index to get actual count
                from sqlalchemy import select, func
                from app.models.card_index import CardIndex
                
                count_result = await session.execute(
                    select(func.count(CardIndex.scryfall_id))
                    .where(CardIndex.oracle_id == representative_card.oracle_id)
                )
                actual_version_count = count_result.scalar() or 1
            else:
                actual_version_count = 1
            
            card_dict = {
                "id": str(representative_card.id),
                "scryfall_id": str(representative_card.scryfall_id) if representative_card.scryfall_id else None,
                "oracle_id": str(representative_card.oracle_id) if representative_card.oracle_id else None,
                "name": representative_card.name,
                "mana_cost": representative_card.mana_cost,
                "type_line": representative_card.type_line,
                "oracle_text": representative_card.oracle_text,
                "power": representative_card.power,
                "toughness": representative_card.toughness,
                "colors": representative_card.colors,
                "color_identity": representative_card.color_identity,
                "rarity": representative_card.rarity,
                "flavor_text": representative_card.flavor_text,
                "artist": representative_card.artist,
                "collector_number": representative_card.collector_number,
                "image_uris": representative_card.image_uris or {},
                "prices": representative_card.prices or {},
                "legalities": representative_card.legalities or {},
                "metadata": representative_card.extra_data or {},
                "created_at": representative_card.created_at.isoformat() if representative_card.created_at else None,
                "updated_at": representative_card.updated_at.isoformat() if representative_card.updated_at else None,
                "set": None,
                "version_count": actual_version_count
            }
            unique_results.append(card_dict)
        
        # Apply pagination to unique results
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_results = unique_results[start_idx:end_idx]
        
        total_unique = len(unique_results)
        total_pages = math.ceil(total_unique / per_page) if per_page > 0 else 1
        
        logger.info(f"Unique card search: query={q}, total_unique={total_unique}, results={len(paginated_results)}")
        
        return {
            "data": paginated_results,
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