"""
Card Details Service for Spellbook

This service handles on-demand fetching of card details from the Scryfall API,
caching strategies, and permanent storage for user collections.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session_maker
from app.models.card import Card, CardStorageReason
from app.models.card_index import CardIndex
from app.core.exceptions import ExternalServiceError, ResourceNotFoundError

logger = logging.getLogger(__name__)


class ScryfallRateLimiter:
    """Simple rate limiter for Scryfall API requests"""
    
    def __init__(self, requests_per_second: int = 10):
        self.requests_per_second = requests_per_second
        self.min_interval = 1.0 / requests_per_second
        self.last_request_time = 0.0
    
    async def wait_if_needed(self):
        """Wait if necessary to respect rate limits"""
        current_time = datetime.utcnow().timestamp()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            wait_time = self.min_interval - time_since_last
            logger.debug(f"Rate limiting: waiting {wait_time:.2f} seconds")
            await asyncio.sleep(wait_time)
        
        self.last_request_time = datetime.utcnow().timestamp()


class CardDetailsService:
    """Service for fetching and caching card details"""
    
    def __init__(self):
        self.rate_limiter = ScryfallRateLimiter(settings.SCRYFALL_RATE_LIMIT)
        self.scryfall_base_url = settings.SCRYFALL_API_BASE
    
    async def get_card_details(
        self, 
        scryfall_id: UUID, 
        session: AsyncSession,
        force_refresh: bool = False
    ) -> Optional[Card]:
        """
        Get full card details, fetching from API if not cached locally.
        
        Args:
            scryfall_id: Scryfall UUID of the card
            session: Database session
            force_refresh: Force fetch from API even if cached
            
        Returns:
            Card object with full details, or None if not found
        """
        # Check if we already have the full details cached
        if not force_refresh:
            cached_card = await self._get_cached_card(scryfall_id, session)
            if cached_card:
                await self._update_access_time(cached_card, session)
                return cached_card
        
        # Check if card exists in index
        index_card = await self._get_index_card(scryfall_id, session)
        if not index_card:
            logger.warning(f"Card not found in index: {scryfall_id}")
            raise ResourceNotFoundError(f"Card not found: {scryfall_id}")
        
        # Fetch from Scryfall API
        try:
            card_data = await self._fetch_from_scryfall(scryfall_id)
            if not card_data:
                raise ResourceNotFoundError(f"Card not found in Scryfall API: {scryfall_id}")
            
            # Store in database as temporary cache
            full_card = await self._store_card_details(card_data, session)
            logger.info(f"Fetched and cached card details: {full_card.name}")
            
            return full_card
            
        except Exception as e:
            logger.error(f"Failed to fetch card details for {scryfall_id}: {e}")
            raise ExternalServiceError(f"Failed to fetch card from Scryfall: {str(e)}")
    
    async def make_card_permanent(
        self, 
        scryfall_id: UUID, 
        reason: CardStorageReason,
        session: AsyncSession
    ) -> bool:
        """
        Mark a card as permanent storage (never deleted by cleanup).
        
        Args:
            scryfall_id: Scryfall UUID of the card
            reason: Reason for permanent storage
            session: Database session
            
        Returns:
            True if successful, False if card not found
        """
        card = await self._get_cached_card(scryfall_id, session)
        if not card:
            # Card not in cache, fetch it first
            card = await self.get_card_details(scryfall_id, session)
            if not card:
                return False
        
        card.make_permanent(reason)
        await session.commit()
        
        logger.info(f"Made card permanent: {card.name} (reason: {reason.value})")
        return True
    
    async def search_cards_with_details(
        self,
        query_params: Dict[str, Any],
        session: AsyncSession,
        limit: int = 20,
        offset: int = 0
    ) -> List[Card]:
        """
        Search cards and return with full details, fetching from API as needed.
        
        Args:
            query_params: Search parameters
            session: Database session
            limit: Maximum number of results
            offset: Offset for pagination
            
        Returns:
            List of Card objects with full details
        """
        # Search the card index first
        logger.info(f"Searching card index with params: {query_params}")
        index_results = await self._search_card_index(query_params, session, limit, offset)
        logger.info(f"Found {len(index_results)} cards in index")
        
        # Get full details for each result
        detailed_cards = []
        for index_card in index_results:
            try:
                full_card = await self.get_card_details(index_card.scryfall_id, session)
                if full_card:
                    detailed_cards.append(full_card)
            except Exception as e:
                logger.warning(f"Failed to get details for card {index_card.name}: {e}")
                # Continue with other cards rather than failing the entire search
                continue
        
        return detailed_cards
    
    async def cleanup_expired_cache(
        self, 
        session: AsyncSession,
        days: int = 30
    ) -> int:
        """
        Remove expired cards from the cache (keeping permanent cards).
        
        Args:
            session: Database session
            days: Number of days after which cached cards expire
            
        Returns:
            Number of cards removed
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Find expired cache entries
        result = await session.execute(
            select(Card).where(
                Card.permanent == False,
                Card.storage_reason == CardStorageReason.SEARCH_CACHE.value,
                Card.cached_at < cutoff_date
            )
        )
        expired_cards = result.scalars().all()
        
        # Delete expired cards
        for card in expired_cards:
            await session.delete(card)
        
        await session.commit()
        
        logger.info(f"Cleaned up {len(expired_cards)} expired cached cards")
        return len(expired_cards)
    
    # Private methods
    
    async def _get_cached_card(self, scryfall_id: UUID, session: AsyncSession) -> Optional[Card]:
        """Get card from local cache if available"""
        result = await session.execute(
            select(Card)
            .options(selectinload(Card.set))
            .where(Card.scryfall_id == scryfall_id)
        )
        return result.scalar_one_or_none()
    
    async def _get_index_card(self, scryfall_id: UUID, session: AsyncSession) -> Optional[CardIndex]:
        """Get card from index"""
        result = await session.execute(
            select(CardIndex).where(CardIndex.scryfall_id == scryfall_id)
        )
        return result.scalar_one_or_none()
    
    async def _update_access_time(self, card: Card, session: AsyncSession):
        """Update last accessed timestamp"""
        card.update_access_time()
        await session.commit()
    
    async def _fetch_from_scryfall(self, scryfall_id: UUID) -> Optional[Dict[str, Any]]:
        """Fetch card data from Scryfall API"""
        await self.rate_limiter.wait_if_needed()
        
        url = f"{self.scryfall_base_url}/cards/{scryfall_id}"
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise
            except httpx.RequestError as e:
                logger.error(f"HTTP request failed: {e}")
                raise
    
    async def _store_card_details(
        self, 
        card_data: Dict[str, Any], 
        session: AsyncSession
    ) -> Card:
        """Store fetched card data in the database"""
        # Create Card object from API data
        card = Card(
            scryfall_id=UUID(card_data['id']),
            oracle_id=UUID(card_data.get('oracle_id')) if card_data.get('oracle_id') else None,
            name=card_data['name'],
            mana_cost=card_data.get('mana_cost'),
            type_line=card_data.get('type_line'),
            oracle_text=card_data.get('oracle_text'),
            power=card_data.get('power'),
            toughness=card_data.get('toughness'),
            colors=",".join(card_data.get('colors', [])) if card_data.get('colors') else None,
            color_identity=",".join(card_data.get('color_identity', [])) if card_data.get('color_identity') else None,
            rarity=card_data.get('rarity'),
            flavor_text=card_data.get('flavor_text'),
            artist=card_data.get('artist'),
            image_uris=card_data.get('image_uris', {}),
            prices=card_data.get('prices', {}),
            legalities=card_data.get('legalities', {}),
            collector_number=card_data.get('collector_number'),
            extra_data=card_data,  # Store complete API response
            storage_reason=CardStorageReason.SEARCH_CACHE.value,
            permanent=False,
            cached_at=datetime.utcnow(),
            last_accessed=datetime.utcnow()
        )
        
        # Handle set relationship
        if card_data.get('set'):
            set_code = card_data['set'].upper()
            # Look up set_id from the set_code if needed
            # For now, we'll store set info in extra_data
            card.extra_data['set_info'] = {
                'code': set_code,
                'name': card_data.get('set_name', set_code)
            }
        
        session.add(card)
        await session.commit()
        await session.refresh(card)
        
        return card
    
    async def _search_card_index(
        self,
        query_params: Dict[str, Any],
        session: AsyncSession,
        limit: int,
        offset: int
    ) -> List[CardIndex]:
        """Search the card index with the given parameters"""
        query = select(CardIndex)
        conditions = []
        
        # Text search
        if query_params.get('q'):
            from sqlalchemy import or_
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
            from sqlalchemy import and_
            query = query.where(and_(*conditions))
        
        # Apply pagination and ordering
        query = query.offset(offset).limit(limit).order_by(CardIndex.name)
        
        result = await session.execute(query)
        return result.scalars().all()


# Global service instance
card_service = CardDetailsService()