#!/usr/bin/env python3
"""
Fast Scryfall Card Import Script with orjson optimization
=========================================================

Optimized for speed with orjson, simpler error handling, and efficient batch processing.
Designed to quickly import all 500k+ cards from Scryfall's all-cards JSON file.

Usage:
    python import_cards_fast.py [--clear-first] [--dry-run]
"""

import asyncio
import argparse
import logging
import sys
import time
import signal
from pathlib import Path
from typing import Dict, Any, List, Optional
from uuid import UUID

# Fast JSON parser - prioritize orjson
try:
    import orjson
    JSON_PARSER = 'orjson (fast)'
    def load_json_file(file_path: Path) -> List[Dict[str, Any]]:
        with open(file_path, 'rb') as f:
            return orjson.loads(f.read())
except ImportError:
    import json
    JSON_PARSER = 'json (standard)'
    def load_json_file(file_path: Path) -> List[Dict[str, Any]]:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)

# Add backend to path
backend_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(backend_dir))

try:
    from app.database import async_session_maker
    from app.models.card_index import CardIndex
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError
except ImportError as e:
    print(f"❌ Failed to import: {e}")
    print("Make sure you're in the backend directory with virtual environment activated")
    sys.exit(1)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class FastCardImporter:
    def __init__(self, batch_size: int = 2000, dry_run: bool = False):
        self.batch_size = batch_size
        self.dry_run = dry_run
        self.shutdown = False
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        logger.warning("🛑 Shutdown requested...")
        self.shutdown = True
    
    async def validate_database(self) -> bool:
        """Quick database connectivity check"""
        try:
            async with async_session_maker() as session:
                await session.execute(text("SELECT 1"))
                return True
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            return False
    
    def find_cards_file(self) -> Path:
        """Find the all-cards JSON file"""
        search_paths = [
            Path("../scryfall"),
            Path("./scryfall"), 
            Path("../../scryfall")
        ]
        
        for search_dir in search_paths:
            if search_dir.exists():
                files = list(search_dir.glob("all-cards-*.json"))
                if files:
                    latest = max(files, key=lambda f: f.stat().st_mtime)
                    logger.info(f"📁 Found: {latest} ({latest.stat().st_size / (1024**3):.2f} GB)")
                    return latest
        
        raise FileNotFoundError("No all-cards-*.json file found in scryfall directories")
    
    def process_card(self, card: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a single card with minimal validation"""
        try:
            # Skip if missing essentials
            if not card.get('id') or not card.get('name'):
                return None
            
            # Skip non-game cards
            layout = card.get('layout', '').lower()
            if layout in ['token', 'double_faced_token', 'art_series', 'minigame']:
                return None
            
            # Extract image URL
            image_url = None
            if 'image_uris' in card and 'small' in card['image_uris']:
                image_url = card['image_uris']['small']
            elif 'card_faces' in card and card['card_faces']:
                face = card['card_faces'][0]
                if 'image_uris' in face and 'small' in face['image_uris']:
                    image_url = face['image_uris']['small']
            
            # Handle colors array
            colors = card.get('colors', [])
            if isinstance(colors, list):
                colors = ''.join(colors) if colors else None
            
            return {
                'scryfall_id': card['id'],
                'oracle_id': card.get('oracle_id'),
                'name': card['name'][:255],
                'set_code': card.get('set', '')[:10],
                'collector_number': card.get('collector_number', '')[:20],
                'mana_cost': card.get('mana_cost', '')[:50],
                'cmc': card.get('cmc'),
                'type_line': card.get('type_line', '')[:255],
                'colors': colors[:10] if colors else None,
                'rarity': card.get('rarity', '')[:20],
                'image_url_small': image_url[:500] if image_url else None
            }
            
        except Exception:
            return None  # Skip problematic cards
    
    async def insert_batch(self, batch: List[Dict[str, Any]]) -> int:
        """Insert batch efficiently"""
        if not batch or self.dry_run:
            return len(batch) if self.dry_run else 0
        
        async with async_session_maker() as session:
            try:
                # Convert to proper types
                valid_cards = []
                for card in batch:
                    try:
                        record = {
                            'scryfall_id': UUID(card['scryfall_id']),
                            'oracle_id': UUID(card['oracle_id']) if card.get('oracle_id') else None,
                            'name': card['name'],
                            'set_code': card.get('set_code'),
                            'collector_number': card.get('collector_number'),
                            'mana_cost': card.get('mana_cost'),
                            'cmc': card.get('cmc'),
                            'type_line': card.get('type_line'),
                            'colors': card.get('colors'),
                            'rarity': card.get('rarity'),
                            'image_url_small': card.get('image_url_small')
                        }
                        valid_cards.append(record)
                    except (ValueError, TypeError):
                        continue  # Skip invalid UUIDs
                
                if valid_cards:
                    stmt = insert(CardIndex.__table__).values(valid_cards)
                    stmt = stmt.on_conflict_do_nothing(index_elements=['scryfall_id'])
                    await session.execute(stmt)
                    await session.commit()
                
                return len(valid_cards)
                
            except Exception as e:
                await session.rollback()
                logger.debug(f"Batch insert error: {e}")
                return 0
    
    async def clear_index(self) -> None:
        """Clear existing card index"""
        if self.dry_run:
            logger.info("🧹 [DRY RUN] Would clear existing index")
            return
        
        logger.info("🧹 Clearing existing card index...")
        async with async_session_maker() as session:
            await session.execute(text("TRUNCATE TABLE cards_index RESTART IDENTITY CASCADE"))
            await session.commit()
    
    async def get_final_count(self) -> int:
        """Get final card count"""
        try:
            async with async_session_maker() as session:
                result = await session.execute(text("SELECT COUNT(*) FROM cards_index"))
                return result.scalar() or 0
        except Exception:
            return 0
    
    async def import_cards(self, clear_first: bool = False) -> None:
        """Main import process - optimized for speed"""
        logger.info("🚀 Fast Card Import Starting")
        logger.info(f"⚡ Using: {JSON_PARSER}")
        
        # Validate environment
        if not await self.validate_database():
            raise Exception("Database validation failed")
        
        # Find and load file
        cards_file = self.find_cards_file()
        
        if clear_first:
            await self.clear_index()
        
        # Load and parse JSON (fast with orjson)
        logger.info("📖 Loading JSON file...")
        start_time = time.time()
        
        try:
            cards_data = load_json_file(cards_file)
        except Exception as e:
            logger.error(f"❌ Failed to load JSON: {e}")
            raise
        
        load_time = time.time() - start_time
        total_cards = len(cards_data)
        logger.info(f"✅ Loaded {total_cards:,} cards in {load_time:.1f}s")
        
        # Process cards in batches
        logger.info("⚡ Processing cards...")
        processed = 0
        inserted = 0
        skipped = 0
        batch = []
        
        process_start = time.time()
        
        for i, card_data in enumerate(cards_data):
            if self.shutdown:
                logger.info("🛑 Shutdown requested")
                break
            
            processed_card = self.process_card(card_data)
            if processed_card:
                batch.append(processed_card)
            else:
                skipped += 1
            
            processed += 1
            
            # Insert when batch is full
            if len(batch) >= self.batch_size:
                batch_inserted = await self.insert_batch(batch)
                inserted += batch_inserted
                batch = []
                
                # Progress every 50k cards
                if processed % 50000 == 0:
                    elapsed = time.time() - process_start
                    rate = processed / elapsed
                    logger.info(f"⚡ Progress: {processed:,}/{total_cards:,} processed | "
                               f"{inserted:,} inserted | {skipped:,} skipped | "
                               f"{rate:.0f} cards/sec")
        
        # Insert remaining batch
        if batch:
            batch_inserted = await self.insert_batch(batch)
            inserted += batch_inserted
        
        # Final statistics
        total_time = time.time() - start_time
        final_count = await self.get_final_count()
        
        logger.info("=" * 50)
        logger.info("🎉 IMPORT COMPLETED")
        logger.info("=" * 50)
        logger.info(f"📊 Processed: {processed:,} cards")
        logger.info(f"✅ Inserted: {inserted:,} cards")
        logger.info(f"⏭️  Skipped: {skipped:,} cards")
        logger.info(f"⏱️  Total Time: {total_time:.1f} seconds")
        logger.info(f"🏃 Rate: {processed / total_time:.0f} cards/sec")
        logger.info(f"🔍 Final Count: {final_count:,} cards")
        logger.info(f"⚡ Parser: {JSON_PARSER}")
        
        if self.dry_run:
            logger.info("🧪 DRY RUN - No data actually inserted")

async def main():
    parser = argparse.ArgumentParser(description="Fast Scryfall Card Import")
    parser.add_argument('--clear-first', action='store_true', help='Clear existing index first')
    parser.add_argument('--dry-run', action='store_true', help='Test mode - no data insertion')
    parser.add_argument('--batch-size', type=int, default=2000, help='Batch size (default: 2000)')
    
    args = parser.parse_args()
    
    importer = FastCardImporter(batch_size=args.batch_size, dry_run=args.dry_run)
    
    try:
        await importer.import_cards(clear_first=args.clear_first)
        logger.info("🎉 Success! Your database is ready for card searches!")
    except Exception as e:
        logger.error(f"❌ Import failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())