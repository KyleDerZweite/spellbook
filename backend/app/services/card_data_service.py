"""
Card Data Service for Spellbook

This service provides a unified interface for card data that:
1. Auto-initializes the card index on first startup (downloads from Scryfall API)
2. Uses the local index for fast searches
3. Falls back to live Scryfall API for individual card lookups
4. Keeps the index updated periodically (optional)

The goal is to make this completely automatic - no manual file downloads needed.
"""

import asyncio
import logging
import tempfile
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, case
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import async_session_maker
from app.models.card_index import CardIndex
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)


# Configuration defaults
DEFAULT_MIN_CARDS_FOR_VALID_INDEX = 10000  # Minimum cards to consider index valid
DEFAULT_INDEX_REFRESH_DAYS = 30  # Re-download bulk data after this many days
DEFAULT_BATCH_SIZE = 2000  # Cards per insert batch


class CardDataService:
    """
    Unified card data service that handles:
    - Automatic first-time initialization
    - Local index searches
    - Live API fallback
    """
    
    def __init__(self):
        self.scryfall_base_url = getattr(settings, 'SCRYFALL_API_BASE', 'https://api.scryfall.com')
        self.bulk_data_url = f"{self.scryfall_base_url}/bulk-data"
        self._initialization_lock = asyncio.Lock()
        self._is_initializing = False
        self._last_init_check = None
    
    # =========================================================================
    # Auto-Initialization
    # =========================================================================
    
    async def ensure_initialized(self) -> Dict[str, Any]:
        """
        Ensure the card index is initialized. Downloads from Scryfall if needed.
        This is safe to call multiple times - it will only initialize once.
        
        Returns:
            Status dictionary with initialization results
        """
        async with self._initialization_lock:
            # Check if we already have a valid index
            card_count = await self.get_index_count()
            min_cards = getattr(settings, 'MIN_CARDS_FOR_VALID_INDEX', DEFAULT_MIN_CARDS_FOR_VALID_INDEX)
            
            if card_count >= min_cards:
                logger.info(f"Card index already initialized with {card_count:,} cards")
                return {
                    'status': 'already_initialized',
                    'card_count': card_count
                }
            
            # Need to initialize
            logger.info(f"Card index needs initialization (found {card_count} cards, need {min_cards})")
            return await self._download_and_populate()
    
    async def _download_and_populate(self) -> Dict[str, Any]:
        """Download bulk data from Scryfall and populate the index."""
        self._is_initializing = True
        start_time = datetime.utcnow()
        
        try:
            logger.info("🚀 Starting automatic card index initialization...")
            
            # Get bulk data info from Scryfall
            bulk_info = await self._get_bulk_data_info()
            
            # Find the "default_cards" type - English cards only, one per printing
            # This is the best for a search index (not all-cards which has translations)
            default_cards = None
            oracle_cards = None
            
            for data_type in bulk_info.get('data', []):
                if data_type.get('type') == 'default_cards':
                    default_cards = data_type
                elif data_type.get('type') == 'oracle_cards':
                    oracle_cards = data_type
            
            # Prefer default_cards (English, all printings), fallback to oracle_cards
            bulk_data = default_cards or oracle_cards
            
            if not bulk_data:
                raise ExternalServiceError("No suitable bulk data found from Scryfall API")
            
            download_url = bulk_data.get('download_uri')
            data_type = bulk_data.get('type')
            file_size = bulk_data.get('size', 0)
            
            logger.info(f"📥 Downloading {data_type} from Scryfall...")
            logger.info(f"   Size: ~{file_size / (1024*1024):.1f} MB")
            
            # Download to temp file
            temp_file = await self._download_bulk_file(download_url)
            
            try:
                # Clear existing index
                await self._clear_index()
                
                # Process and insert cards
                processed, inserted = await self._process_bulk_file(temp_file)
                
                duration = (datetime.utcnow() - start_time).total_seconds()
                
                logger.info(f"✅ Card index initialized successfully!")
                logger.info(f"   Processed: {processed:,} cards")
                logger.info(f"   Inserted: {inserted:,} cards")
                logger.info(f"   Duration: {duration:.1f} seconds")
                
                return {
                    'status': 'success',
                    'data_type': data_type,
                    'processed_cards': processed,
                    'inserted_cards': inserted,
                    'duration_seconds': duration
                }
                
            finally:
                # Clean up temp file
                if temp_file.exists():
                    temp_file.unlink()
                    
        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.error(f"❌ Card index initialization failed: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'duration_seconds': duration
            }
        finally:
            self._is_initializing = False
    
    async def _get_bulk_data_info(self) -> Dict[str, Any]:
        """Get available bulk data types from Scryfall."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(self.bulk_data_url)
            response.raise_for_status()
            return response.json()
    
    async def _download_bulk_file(self, url: str) -> Path:
        """Download bulk data file to a temp location."""
        temp_path = Path(tempfile.mktemp(suffix='.json'))
        
        async with httpx.AsyncClient(timeout=600.0) as client:  # 10 min timeout
            async with client.stream('GET', url) as response:
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                last_log = 0
                
                with temp_path.open('wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=1024*1024):  # 1MB chunks
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        # Log progress every 50MB
                        if downloaded - last_log >= 50 * 1024 * 1024:
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                logger.info(f"   Download progress: {percent:.0f}%")
                            last_log = downloaded
        
        logger.info(f"   Download complete: {temp_path.stat().st_size / (1024*1024):.1f} MB")
        return temp_path
    
    async def _process_bulk_file(self, file_path: Path) -> Tuple[int, int]:
        """Process a bulk JSON file and insert cards into the index."""
        logger.info("📦 Processing bulk data file...")
        
        processed = 0
        inserted = 0
        batch = []
        batch_size = getattr(settings, 'CARD_INDEX_BATCH_SIZE', DEFAULT_BATCH_SIZE)
        
        with file_path.open('r', encoding='utf-8') as f:
            cards_data = json.load(f)
        
        logger.info(f"   Loaded {len(cards_data):,} cards from file")
        
        for card in cards_data:
            processed += 1
            
            # Process card into index format
            index_entry = self._process_card(card)
            if index_entry:
                batch.append(index_entry)
            
            # Insert batch
            if len(batch) >= batch_size:
                count = await self._insert_batch(batch)
                inserted += count
                batch = []
                
                if processed % 50000 == 0:
                    logger.info(f"   Progress: {processed:,} processed, {inserted:,} inserted")
        
        # Final batch
        if batch:
            count = await self._insert_batch(batch)
            inserted += count
        
        return processed, inserted
    
    def _process_card(self, card: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a single card into index format. Returns None to skip."""
        # Skip tokens, art series, etc.
        layout = card.get('layout', '').lower()
        if layout in ['token', 'double_faced_token', 'art_series', 'emblem']:
            return None
        
        # Skip non-game cards
        set_type = card.get('set_type', '')
        if set_type in ['memorabilia', 'token', 'minigame']:
            return None
        
        # Must have essential fields
        if not card.get('id') or not card.get('name'):
            return None
        
        # Extract image URL
        image_url = None
        if 'image_uris' in card and 'small' in card['image_uris']:
            image_url = card['image_uris']['small']
        elif 'card_faces' in card and card['card_faces']:
            face = card['card_faces'][0]
            if 'image_uris' in face:
                image_url = face['image_uris'].get('small')
        
        # Handle colors
        colors = card.get('colors', [])
        colors_str = ''.join(colors) if isinstance(colors, list) and colors else None
        
        return {
            'scryfall_id': card['id'],
            'oracle_id': card.get('oracle_id'),
            'name': card['name'][:255],
            'lang': card.get('lang', 'en')[:5],
            'set_code': card.get('set', '')[:10].upper(),
            'collector_number': card.get('collector_number', '')[:20],
            'mana_cost': card.get('mana_cost', '')[:50] if card.get('mana_cost') else None,
            'cmc': int(card.get('cmc', 0)) if card.get('cmc') is not None else None,
            'type_line': card.get('type_line', '')[:255] if card.get('type_line') else None,
            'colors': colors_str[:10] if colors_str else None,
            'rarity': card.get('rarity', '')[:20].lower() if card.get('rarity') else None,
            'image_url_small': image_url[:500] if image_url else None
        }
    
    async def _insert_batch(self, batch: List[Dict[str, Any]]) -> int:
        """Insert a batch of cards into the index."""
        if not batch:
            return 0
        
        async with async_session_maker() as session:
            try:
                records = []
                for entry in batch:
                    try:
                        records.append({
                            'scryfall_id': UUID(entry['scryfall_id']),
                            'oracle_id': UUID(entry['oracle_id']) if entry.get('oracle_id') else None,
                            'name': entry['name'],
                            'lang': entry.get('lang', 'en'),
                            'set_code': entry.get('set_code'),
                            'collector_number': entry.get('collector_number'),
                            'mana_cost': entry.get('mana_cost'),
                            'cmc': entry.get('cmc'),
                            'type_line': entry.get('type_line'),
                            'colors': entry.get('colors'),
                            'rarity': entry.get('rarity'),
                            'image_url_small': entry.get('image_url_small')
                        })
                    except (ValueError, TypeError):
                        continue
                
                if records:
                    stmt = insert(CardIndex.__table__).values(records)
                    stmt = stmt.on_conflict_do_nothing(index_elements=['scryfall_id'])
                    await session.execute(stmt)
                    await session.commit()
                
                return len(records)
                
            except Exception as e:
                await session.rollback()
                logger.warning(f"Batch insert error: {e}")
                return 0
    
    async def _clear_index(self) -> None:
        """Clear the card index."""
        logger.info("🧹 Clearing existing card index...")
        async with async_session_maker() as session:
            await session.execute(text("TRUNCATE TABLE cards_index"))
            await session.commit()
    
    # =========================================================================
    # Index Queries
    # =========================================================================
    
    async def get_index_count(self) -> int:
        """Get the number of cards in the index."""
        async with async_session_maker() as session:
            result = await session.execute(select(func.count(CardIndex.scryfall_id)))
            return result.scalar() or 0
    
    async def get_english_card_count(self) -> int:
        """Get count of English cards only."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(func.count(CardIndex.scryfall_id))
                .where(CardIndex.lang == 'en')
            )
            return result.scalar() or 0
    
    async def search_index(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        english_only: bool = True
    ) -> List[CardIndex]:
        """
        Search the card index.
        
        Args:
            query: Search query (card name)
            limit: Max results
            offset: Pagination offset
            english_only: Only return English cards (default True)
        
        Returns:
            List of CardIndex entries
        """
        async with async_session_maker() as session:
            stmt = select(CardIndex).where(
                CardIndex.name.ilike(f"%{query}%")
            )
            
            if english_only:
                stmt = stmt.where(CardIndex.lang == 'en')
            
            stmt = stmt.order_by(CardIndex.name).offset(offset).limit(limit)
            
            result = await session.execute(stmt)
            return result.scalars().all()
    
    async def search_unique_cards(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Search for unique cards (one per oracle_id) - English only.
        Returns oracle_id, representative card, and version count.
        """
        async with async_session_maker() as session:
            # Get unique oracle_ids matching query with version counts
            stmt = (
                select(
                    CardIndex.oracle_id,
                    func.count(CardIndex.scryfall_id).label('version_count'),
                    func.min(CardIndex.name).label('card_name')
                )
                .where(
                    CardIndex.oracle_id.is_not(None),
                    CardIndex.lang == 'en',
                    CardIndex.name.ilike(f"%{query}%")
                )
                .group_by(CardIndex.oracle_id)
                .order_by(func.min(CardIndex.name))
                .offset(offset)
                .limit(limit)
            )
            
            result = await session.execute(stmt)
            return [
                {
                    'oracle_id': row.oracle_id,
                    'version_count': row.version_count,
                    'card_name': row.card_name
                }
                for row in result.fetchall()
            ]
    
    async def get_card_by_scryfall_id(
        self, 
        scryfall_id: str
    ) -> Optional[CardIndex]:
        """Get a specific card from the index."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(CardIndex).where(CardIndex.scryfall_id == UUID(scryfall_id))
            )
            return result.scalar_one_or_none()
    
    # =========================================================================
    # Status & Health
    # =========================================================================
    
    def is_initializing(self) -> bool:
        """Check if initialization is in progress."""
        return self._is_initializing
    
    async def get_status(self) -> Dict[str, Any]:
        """Get current service status."""
        card_count = await self.get_index_count()
        english_count = await self.get_english_card_count()
        min_cards = getattr(settings, 'MIN_CARDS_FOR_VALID_INDEX', DEFAULT_MIN_CARDS_FOR_VALID_INDEX)
        
        return {
            'total_cards': card_count,
            'english_cards': english_count,
            'is_initialized': card_count >= min_cards,
            'is_initializing': self._is_initializing,
            'min_cards_required': min_cards
        }


# Global service instance
card_data_service = CardDataService()
