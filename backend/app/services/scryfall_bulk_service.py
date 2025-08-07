"""
Scryfall Bulk Data Service for Spellbook

This service handles downloading and processing Scryfall bulk card data
for populating the card index during application startup.
"""

import asyncio
import logging
import tempfile
import gzip
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.config import settings
from app.database import async_session_maker
from app.models.card_index import CardIndex
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)


class ScryfallBulkService:
    """Service for downloading and processing Scryfall bulk card data"""
    
    def __init__(self):
        self.scryfall_base_url = settings.SCRYFALL_API_BASE
        self.bulk_data_url = f"{self.scryfall_base_url}/bulk-data"
        self.client_timeout = 300.0  # 5 minutes for bulk downloads
    
    async def get_bulk_data_info(self) -> Dict[str, Any]:
        """
        Get information about available bulk data downloads from Scryfall.
        
        Returns:
            Dictionary containing bulk data information
        """
        logger.info("Fetching Scryfall bulk data information")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(self.bulk_data_url)
                response.raise_for_status()
                
                bulk_info = response.json()
                logger.info(f"Found {len(bulk_info.get('data', []))} bulk data types available")
                
                return bulk_info
                
            except httpx.RequestError as e:
                logger.error(f"Failed to fetch bulk data info: {e}")
                raise ExternalServiceError(f"Cannot connect to Scryfall API: {str(e)}")
            except httpx.HTTPStatusError as e:
                logger.error(f"Scryfall API error: {e.response.status_code}")
                raise ExternalServiceError(f"Scryfall API returned error: {e.response.status_code}")
    
    async def download_oracle_cards(self, download_path: Optional[Path] = None) -> Path:
        """
        Download the oracle cards bulk data file from Scryfall.
        
        Args:
            download_path: Optional path to save the file, otherwise uses temp file
            
        Returns:
            Path to the downloaded file
        """
        # Get bulk data information
        bulk_info = await self.get_bulk_data_info()
        
        # Find oracle cards data
        oracle_data = None
        for data_type in bulk_info.get('data', []):
            if data_type.get('type') == 'oracle_cards':
                oracle_data = data_type
                break
        
        if not oracle_data:
            raise ExternalServiceError("Oracle cards bulk data not found in Scryfall API")
        
        download_url = oracle_data.get('download_uri')
        if not download_url:
            raise ExternalServiceError("Oracle cards download URL not found")
        
        # Prepare download path
        if download_path is None:
            download_path = Path(tempfile.mktemp(suffix='.json'))
        
        logger.info(f"Downloading oracle cards from: {download_url}")
        logger.info(f"File size: ~{oracle_data.get('size', 'unknown')} bytes")
        
        # Download the file
        async with httpx.AsyncClient(timeout=self.client_timeout) as client:
            try:
                with download_path.open('wb') as f:
                    async with client.stream('GET', download_url) as response:
                        response.raise_for_status()
                        
                        total_size = int(response.headers.get('content-length', 0))
                        downloaded = 0
                        
                        async for chunk in response.aiter_bytes():
                            f.write(chunk)
                            downloaded += len(chunk)
                            
                            # Log progress every 50MB
                            if downloaded % (50 * 1024 * 1024) == 0:
                                if total_size > 0:
                                    percent = (downloaded / total_size) * 100
                                    logger.info(f"Download progress: {percent:.1f}% ({downloaded:,} bytes)")
                                else:
                                    logger.info(f"Downloaded: {downloaded:,} bytes")
                
                logger.info(f"Successfully downloaded oracle cards to: {download_path}")
                logger.info(f"Final file size: {download_path.stat().st_size:,} bytes")
                
                return download_path
                
            except httpx.RequestError as e:
                logger.error(f"Failed to download oracle cards: {e}")
                raise ExternalServiceError(f"Download failed: {str(e)}")
            except httpx.HTTPStatusError as e:
                logger.error(f"Download failed with status: {e.response.status_code}")
                raise ExternalServiceError(f"Download failed: HTTP {e.response.status_code}")
    
    def process_card_for_index(self, card_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process a single card from Scryfall data into card index format.
        
        Args:
            card_data: Raw card data from Scryfall
            
        Returns:
            Processed card data for index, or None if card should be skipped
        """
        # Skip tokens, test cards, and funny sets, but keep digital cards
        if (card_data.get('layout') in ['token', 'emblem', 'scheme', 'planar'] or
            card_data.get('set_type') in ['memorabilia', 'token', 'funny']):
            return None
        
        # Skip cards without proper IDs
        if not card_data.get('id') or not card_data.get('name'):
            return None
        
        try:
            # Extract colors - handle both single cards and multi-face cards
            colors = card_data.get('colors', [])
            if isinstance(colors, list):
                colors_str = ','.join(sorted(colors)) if colors else None
            else:
                colors_str = None
            
            # Get CMC (converted mana cost)
            cmc = card_data.get('cmc')
            if cmc is not None:
                cmc = int(float(cmc))  # Convert to int, handling float values
            
            # Get image URL
            image_url_small = None
            image_uris = card_data.get('image_uris', {})
            if image_uris and 'small' in image_uris:
                image_url_small = image_uris['small']
            
            # Create card index entry
            index_entry = {
                'scryfall_id': card_data['id'],
                'oracle_id': card_data.get('oracle_id'),
                'name': card_data['name'],
                'set_code': card_data.get('set', '').upper(),
                'collector_number': card_data.get('collector_number'),
                'mana_cost': card_data.get('mana_cost'),
                'cmc': cmc,
                'type_line': card_data.get('type_line'),
                'colors': colors_str,
                'rarity': card_data.get('rarity', '').lower(),
                'image_url_small': image_url_small
            }
            
            return index_entry
            
        except Exception as e:
            logger.warning(f"Failed to process card '{card_data.get('name', 'unknown')}': {e}")
            return None
    
    async def process_oracle_cards_file(
        self, 
        file_path: Path, 
        batch_size: int = 1000
    ) -> Tuple[int, int]:
        """
        Process oracle cards file and insert into card index.
        
        Args:
            file_path: Path to the oracle cards JSON file
            batch_size: Number of cards to insert per batch
            
        Returns:
            Tuple of (processed_count, inserted_count)
        """
        logger.info(f"Processing oracle cards file: {file_path}")
        
        processed_count = 0
        inserted_count = 0
        batch = []
        
        try:
            # Open and process the JSON file (Scryfall bulk data is a JSON array)
            logger.info("Loading JSON array from Scryfall bulk data file...")
            with file_path.open('r', encoding='utf-8') as f:
                cards_data = json.load(f)
            
            logger.info(f"Loaded {len(cards_data):,} cards from JSON file")
            
            # Process each card in the array
            for card_data in cards_data:
                try:
                    processed_count += 1
                    
                    # Process card for index
                    index_entry = self.process_card_for_index(card_data)
                    if index_entry:
                        batch.append(index_entry)
                    
                    # Insert batch when full
                    if len(batch) >= batch_size:
                        inserted = await self._insert_card_batch(batch)
                        inserted_count += inserted
                        batch = []
                        
                        # Log progress
                        if processed_count % 10000 == 0:
                            logger.info(f"Processed {processed_count:,} cards, inserted {inserted_count:,}")
                
                except Exception as e:
                    logger.warning(f"Error processing card {processed_count}: {e}")
                    continue
                
                # Insert remaining batch
                if batch:
                    inserted = await self._insert_card_batch(batch)
                    inserted_count += inserted
            
            logger.info(f"Processing complete: {processed_count:,} cards processed, {inserted_count:,} inserted")
            return processed_count, inserted_count
            
        except Exception as e:
            logger.error(f"Failed to process oracle cards file: {e}")
            raise ExternalServiceError(f"File processing failed: {str(e)}")
    
    async def _insert_card_batch(self, batch: List[Dict[str, Any]]) -> int:
        """Insert a batch of card index entries into the database using UPSERT for better performance."""
        if not batch:
            return 0
        
        async with async_session_maker() as session:
            try:
                # Use PostgreSQL's ON CONFLICT for efficient upsert
                from sqlalchemy.dialects.postgresql import insert
                
                # Prepare data for upsert
                card_data = []
                for entry in batch:
                    try:
                        card_record = {
                            'scryfall_id': UUID(entry['scryfall_id']),
                            'oracle_id': UUID(entry['oracle_id']) if entry.get('oracle_id') else None,
                            'name': entry['name'],
                            'set_code': entry.get('set_code'),
                            'collector_number': entry.get('collector_number'),
                            'mana_cost': entry.get('mana_cost'),
                            'cmc': entry.get('cmc'),
                            'type_line': entry.get('type_line'),
                            'colors': entry.get('colors'),
                            'rarity': entry.get('rarity'),
                            'image_url_small': entry.get('image_url_small')
                        }
                        card_data.append(card_record)
                    except ValueError as e:
                        logger.warning(f"Invalid UUID in card data: {e}")
                        continue
                
                if not card_data:
                    return 0
                
                # Perform bulk upsert
                stmt = insert(CardIndex.__table__).values(card_data)
                stmt = stmt.on_conflict_do_nothing(index_elements=['scryfall_id'])
                
                result = await session.execute(stmt)
                await session.commit()
                
                # Return number of successful inserts (approximation since PostgreSQL doesn't return exact count for ON CONFLICT DO NOTHING)
                return len(card_data)
                
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to insert card batch: {e}")
                return 0
    
    async def get_card_index_count(self) -> int:
        """Get the current number of cards in the index."""
        async with async_session_maker() as session:
            result = await session.execute(select(func.count(CardIndex.scryfall_id)))
            return result.scalar() or 0
    
    async def clear_card_index(self) -> None:
        """Clear all existing card index entries."""
        logger.info("Clearing existing card index")
        
        async with async_session_maker() as session:
            await session.execute(text("DELETE FROM cards_index"))
            await session.commit()
            
        logger.info("Card index cleared")
    
    async def download_and_populate_index(
        self, 
        force_refresh: bool = False,
        batch_size: int = 1000
    ) -> Dict[str, Any]:
        """
        Load Scryfall bulk data and populate the card index.
        
        Args:
            force_refresh: Force refresh even if index already exists
            batch_size: Number of cards to insert per batch
            
        Returns:
            Dictionary with operation results
        """
        start_time = datetime.utcnow()
        
        try:
            # Check existing index
            existing_count = await self.get_card_index_count()
            
            if existing_count > 0 and not force_refresh:
                logger.info(f"Card index already exists with {existing_count:,} cards")
                return {
                    'status': 'skipped',
                    'reason': 'index_exists',
                    'existing_cards': existing_count,
                    'duration_seconds': 0
                }
            
            if force_refresh and existing_count > 0:
                await self.clear_card_index()
            
            # Use local all-cards file if available, otherwise download
            all_cards_file = Path("/home/kyle/CodingProjects/spellbook/scryfall/all-cards-20250802092258.json")
            
            if all_cards_file.exists():
                logger.info(f"Using local all-cards file: {all_cards_file}")
                processed_count, inserted_count = await self.process_oracle_cards_file(
                    all_cards_file, batch_size
                )
            else:
                # Fallback to downloading oracle cards
                logger.info("Local file not found, downloading oracle cards from API")
                temp_file = await self.download_oracle_cards()
                
                try:
                    processed_count, inserted_count = await self.process_oracle_cards_file(
                        temp_file, batch_size
                    )
                finally:
                    # Clean up temp file
                    if temp_file.exists():
                        temp_file.unlink()
                        logger.debug(f"Cleaned up temporary file: {temp_file}")
                
            # Calculate duration
            duration = (datetime.utcnow() - start_time).total_seconds()
            
            logger.info(f"Card index population complete in {duration:.1f} seconds")
            logger.info(f"Final index size: {inserted_count:,} cards")
            
            return {
                'status': 'success',
                'processed_cards': processed_count,
                'inserted_cards': inserted_count,
                'duration_seconds': duration,
                'cards_per_second': inserted_count / duration if duration > 0 else 0
            }
                
        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.error(f"Failed to populate card index: {e}")
            
            return {
                'status': 'error',
                'error': str(e),
                'duration_seconds': duration
            }


# Global service instance
scryfall_bulk_service = ScryfallBulkService()