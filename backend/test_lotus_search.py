#!/usr/bin/env python3
"""
Test script for searching "Lotus" cards and adding to collection
"""

import asyncio
import logging
import sys
from uuid import uuid4

# Add the app to the path
sys.path.insert(0, '/home/kyle/CodingProjects/spellbook/backend')

from app.database import async_session_maker
from app.services.card_service import card_service
from app.services.redis_service import redis_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_lotus_search():
    """Test searching for Lotus cards"""
    logger.info("=== Testing Lotus Card Search ===")
    
    try:
        # Test Redis connection first
        redis_connected = await redis_service.ping()
        logger.info(f"Redis connection: {'✅ Connected' if redis_connected else '❌ Failed'}")
        
        async with async_session_maker() as session:
            # Search for cards with "Lotus" in the name
            query_params = {'q': 'Lotus'}
            
            logger.info("Searching for cards with 'Lotus' in the name...")
            
            cards = await card_service.search_cards_with_details(
                query_params=query_params,
                session=session,
                limit=5,  # Limit to 5 for testing
                offset=0
            )
            
            logger.info(f"Found {len(cards)} Lotus cards:")
            
            for i, card in enumerate(cards, 1):
                logger.info(f"{i}. {card.name} ({card.rarity}) - {card.scryfall_id}")
                if card.mana_cost:
                    logger.info(f"   Mana Cost: {card.mana_cost}")
                if card.type_line:
                    logger.info(f"   Type: {card.type_line}")
                logger.info("   ---")
            
            return cards
            
    except Exception as e:
        logger.error(f"Test failed: {e}")
        return []

async def test_collection_workflow():
    """Test the complete workflow: search -> add to collection"""
    logger.info("\n=== Testing Collection Workflow ===")
    
    try:
        async with async_session_maker() as session:
            # 1. Search for Lotus cards
            query_params = {'q': 'Lotus'}
            cards = await card_service.search_cards_with_details(
                query_params=query_params,
                session=session,
                limit=2,  # Just test with 2 cards
                offset=0
            )
            
            if not cards:
                logger.warning("No Lotus cards found for collection test")
                return
            
            test_card = cards[0]
            logger.info(f"Testing with card: {test_card.name}")
            
            # 2. Simulate making it permanent (as if added to collection)
            fake_user_id = uuid4()
            logger.info(f"Marking card as permanent for user: {fake_user_id}")
            
            from app.models.card import CardStorageReason
            success = await card_service.make_card_permanent(
                scryfall_id=test_card.scryfall_id,
                reason=CardStorageReason.USER_COLLECTION,
                session=session,
                user_id=fake_user_id
            )
            
            logger.info(f"Card made permanent: {'✅ Success' if success else '❌ Failed'}")
            
            # 3. Test Redis collection tracking
            is_in_collection = await redis_service.is_card_in_any_collection(test_card.scryfall_id)
            logger.info(f"Card tracked in Redis: {'✅ Yes' if is_in_collection else '❌ No'}")
            
            # 4. Test caching by searching again
            logger.info("Searching again to test caching...")
            cached_cards = await card_service.search_cards_with_details(
                query_params=query_params,
                session=session,
                limit=2,
                offset=0
            )
            
            logger.info(f"Second search returned {len(cached_cards)} cards (should be faster due to caching)")
            
    except Exception as e:
        logger.error(f"Collection workflow test failed: {e}")

async def main():
    """Run all tests"""
    logger.info("🚀 Starting Spellbook Card System Tests")
    
    # Test basic search
    cards = await test_lotus_search()
    
    if cards:
        # Test collection workflow
        await test_collection_workflow()
    else:
        logger.warning("Skipping collection test due to search failure")
    
    logger.info("✅ Tests completed!")

if __name__ == "__main__":
    asyncio.run(main())