
import redis.asyncio as redis
import json
from typing import Optional, Dict, Any
from uuid import UUID
from app.config import settings

class RedisService:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.client = None
        self.card_cache_ttl = 3600  # 1 hour cache for card details

    async def connect(self):
        self.client = redis.from_url(self.redis_url, encoding="utf-8", decode_responses=True)
        try:
            await self.client.ping()
            print("Successfully connected to Redis.")
        except redis.exceptions.ConnectionError as e:
            print(f"Failed to connect to Redis: {e}")
            self.client = None

    async def disconnect(self):
        if self.client:
            await self.client.close()
            self.client = None
            print("Disconnected from Redis.")

    async def add_to_blacklist(self, jti: str, exp: int):
        if self.client:
            await self.client.setex(f"blacklist:{jti}", exp, "blacklisted")

    async def is_blacklisted(self, jti: str) -> bool:
        if self.client:
            return await self.client.get(f"blacklist:{jti}") is not None
        return False

    async def get_cached_card_details(self, scryfall_id: UUID) -> Optional[Dict[str, Any]]:
        """Get cached card details from Redis"""
        if not self.client:
            return None
        try:
            cached = await self.client.get(f"card:{scryfall_id}")
            if cached:
                return json.loads(cached)
        except Exception as e:
            print(f"Redis get_cached_card_details error: {e}")
        return None

    async def cache_card_details(self, scryfall_id: UUID, card_data: Dict[str, Any]) -> bool:
        """Cache card details in Redis"""
        if not self.client:
            return False
        try:
            await self.client.setex(
                f"card:{scryfall_id}",
                self.card_cache_ttl,
                json.dumps(card_data, default=str)
            )
            return True
        except Exception as e:
            print(f"Redis cache_card_details error: {e}")
        return False

    async def mark_card_in_collection(self, scryfall_id: UUID, user_id: UUID) -> bool:
        """Mark a card as being in a user's collection for tracking purposes"""
        if not self.client:
            return False
        try:
            # Add card to user's collection set
            await self.client.sadd(f"user:{user_id}:collection", str(scryfall_id))
            # Also track which users have this card (for potential future features)
            await self.client.sadd(f"card:{scryfall_id}:users", str(user_id))
            return True
        except Exception as e:
            print(f"Redis mark_card_in_collection error: {e}")
        return False

    async def unmark_card_from_collection(self, scryfall_id: UUID, user_id: UUID) -> bool:
        """Remove a card from a user's collection tracking"""
        if not self.client:
            return False
        try:
            await self.client.srem(f"user:{user_id}:collection", str(scryfall_id))
            await self.client.srem(f"card:{scryfall_id}:users", str(user_id))
            return True
        except Exception as e:
            print(f"Redis unmark_card_from_collection error: {e}")
        return False

    async def is_card_in_collection(self, scryfall_id: UUID, user_id: UUID) -> bool:
        """Check if a card is in a user's collection"""
        if not self.client:
            return False
        try:
            return await self.client.sismember(f"user:{user_id}:collection", str(scryfall_id))
        except Exception as e:
            print(f"Redis is_card_in_collection error: {e}")
        return False

redis_service = RedisService(settings.REDIS_URL)

async def get_redis_service() -> RedisService:
    if not redis_service.client:
        await redis_service.connect()
    return redis_service
