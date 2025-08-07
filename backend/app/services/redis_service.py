"""
Redis Service for Spellbook

Handles Redis operations for caching card data and search results.
"""

import json
import logging
import time
from datetime import timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID

import redis.asyncio as redis
from app.config import settings

logger = logging.getLogger(__name__)


class RedisService:
    """Service for Redis caching operations"""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.default_ttl = timedelta(days=7)  # 7 day TTL for cached cards
        self.search_ttl = timedelta(hours=1)  # 1 hour TTL for search results
    
    async def get_client(self) -> redis.Redis:
        """Get Redis client, creating it if needed"""
        if self.redis_client is None:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                health_check_interval=30
            )
        return self.redis_client
    
    async def ping(self) -> bool:
        """Test Redis connection"""
        try:
            client = await self.get_client()
            await client.ping()
            return True
        except Exception as e:
            logger.error(f"Redis ping failed: {e}")
            return False
    
    # Card detail caching
    
    async def cache_card_details(self, scryfall_id: UUID, card_data: Dict[str, Any]) -> bool:
        """Cache full card details with TTL"""
        try:
            client = await self.get_client()
            key = f"card:details:{scryfall_id}"
            
            # Serialize card data
            serialized_data = json.dumps(card_data, default=str)
            
            # Cache with TTL
            await client.setex(
                key, 
                int(self.default_ttl.total_seconds()), 
                serialized_data
            )
            
            logger.debug(f"Cached card details for {scryfall_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache card details for {scryfall_id}: {e}")
            return False
    
    async def get_cached_card_details(self, scryfall_id: UUID) -> Optional[Dict[str, Any]]:
        """Get cached card details"""
        try:
            client = await self.get_client()
            key = f"card:details:{scryfall_id}"
            
            cached_data = await client.get(key)
            if cached_data:
                # Extend TTL on access
                await client.expire(key, int(self.default_ttl.total_seconds()))
                
                card_data = json.loads(cached_data)
                logger.debug(f"Retrieved cached card details for {scryfall_id}")
                return card_data
                
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached card details for {scryfall_id}: {e}")
            return None
    
    async def invalidate_card_cache(self, scryfall_id: UUID) -> bool:
        """Remove card from cache"""
        try:
            client = await self.get_client()
            key = f"card:details:{scryfall_id}"
            
            deleted = await client.delete(key)
            if deleted:
                logger.debug(f"Invalidated cache for card {scryfall_id}")
            
            return bool(deleted)
            
        except Exception as e:
            logger.error(f"Failed to invalidate cache for {scryfall_id}: {e}")
            return False
    
    # Search result caching
    
    async def cache_search_results(
        self, 
        query_hash: str, 
        results: List[Dict[str, Any]], 
        total_count: int
    ) -> bool:
        """Cache search results with shorter TTL"""
        try:
            client = await self.get_client()
            key = f"search:results:{query_hash}"
            
            search_data = {
                "results": results,
                "total_count": total_count,
                "cached_at": str(int(time.time()))
            }
            
            serialized_data = json.dumps(search_data, default=str)
            
            # Cache with shorter TTL
            await client.setex(
                key,
                int(self.search_ttl.total_seconds()),
                serialized_data
            )
            
            logger.debug(f"Cached search results for query hash {query_hash}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cache search results for {query_hash}: {e}")
            return False
    
    async def get_cached_search_results(self, query_hash: str) -> Optional[Dict[str, Any]]:
        """Get cached search results"""
        try:
            client = await self.get_client()
            key = f"search:results:{query_hash}"
            
            cached_data = await client.get(key)
            if cached_data:
                search_data = json.loads(cached_data)
                logger.debug(f"Retrieved cached search results for query hash {query_hash}")
                return search_data
                
            return None
            
        except Exception as e:
            logger.error(f"Failed to get cached search results for {query_hash}: {e}")
            return None
    
    # Card collection status
    
    async def mark_card_in_collection(self, scryfall_id: UUID, user_id: UUID) -> bool:
        """Mark a card as being in a user's collection (prevents auto-cleanup)"""
        try:
            client = await self.get_client()
            key = f"card:permanent:{scryfall_id}"
            
            # Add user to set of users who have this card
            await client.sadd(key, str(user_id))
            
            logger.debug(f"Marked card {scryfall_id} as in collection for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to mark card {scryfall_id} in collection: {e}")
            return False
    
    async def unmark_card_in_collection(self, scryfall_id: UUID, user_id: UUID) -> bool:
        """Remove card from user's collection tracking"""
        try:
            client = await self.get_client()
            key = f"card:permanent:{scryfall_id}"
            
            # Remove user from set
            removed = await client.srem(key, str(user_id))
            
            # If no more users have this card, delete the key
            count = await client.scard(key)
            if count == 0:
                await client.delete(key)
                logger.debug(f"Removed collection tracking for card {scryfall_id}")
            
            return bool(removed)
            
        except Exception as e:
            logger.error(f"Failed to unmark card {scryfall_id} from collection: {e}")
            return False
    
    async def is_card_in_any_collection(self, scryfall_id: UUID) -> bool:
        """Check if card is in any user's collection"""
        try:
            client = await self.get_client()
            key = f"card:permanent:{scryfall_id}"
            
            count = await client.scard(key)
            return count > 0
            
        except Exception as e:
            logger.error(f"Failed to check collection status for {scryfall_id}: {e}")
            return False
    
    # Cleanup operations
    
    async def cleanup_expired_cache(self) -> int:
        """Clean up expired cache entries (Redis handles TTL automatically, but we can clean search cache)"""
        try:
            client = await self.get_client()
            
            # Clean up search cache older than TTL
            pattern = "search:results:*"
            count = 0
            
            async for key in client.scan_iter(match=pattern):
                ttl = await client.ttl(key)
                if ttl == -1:  # No expiration set
                    await client.delete(key)
                    count += 1
                elif ttl == -2:  # Key doesn't exist
                    count += 1
            
            if count > 0:
                logger.info(f"Cleaned up {count} expired search cache entries")
            
            return count
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired cache: {e}")
            return 0
    
    async def close(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.aclose()
            self.redis_client = None


# Global service instance
redis_service = RedisService()