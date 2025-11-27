
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

redis_service = RedisService(settings.REDIS_URL)

async def get_redis_service() -> RedisService:
    if not redis_service.client:
        await redis_service.connect()
    return redis_service
