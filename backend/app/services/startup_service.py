"""
Startup Service Manager for Spellbook

This service orchestrates the application startup process, including
automatic card index initialization from Scryfall API.
"""

import asyncio
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from app.config import settings
from app.database import check_database_health, async_session_maker
from app.services.card_data_service import card_data_service
from app.core.exceptions import SpellbookException

logger = logging.getLogger(__name__)


class StartupService:
    """Service for managing application startup tasks"""
    
    def __init__(self):
        self.startup_complete = False
        self.startup_errors = []
        self.startup_start_time = None
        self.card_index_status = None
    
    async def run_startup_sequence(self) -> Dict[str, Any]:
        """
        Run the complete application startup sequence.
        
        Returns:
            Dictionary containing startup results and status
        """
        self.startup_start_time = datetime.utcnow()
        logger.info("Starting application startup sequence")
        
        startup_results = {
            'status': 'starting',
            'started_at': self.startup_start_time.isoformat(),
            'tasks': {}
        }
        
        try:
            # 1. Check storage requirements
            logger.info("Step 1: Checking storage requirements")
            storage_check = await self._check_storage_requirements()
            startup_results['tasks']['storage_check'] = storage_check
            
            if not storage_check['success']:
                logger.error(f"Storage check failed: {storage_check['message']}")
                self.startup_errors.append(storage_check['message'])
                # Continue anyway - warn but don't fail startup
            
            # 2. Check database connectivity
            logger.info("Step 2: Checking database connectivity")
            db_check = await self._check_database_connectivity()
            startup_results['tasks']['database_check'] = db_check
            
            if not db_check['success']:
                logger.error(f"Database check failed: {db_check['message']}")
                self.startup_errors.append(db_check['message'])
                startup_results['status'] = 'failed'
                startup_results['errors'] = self.startup_errors
                return startup_results
            
            # 2.5. Ensure all database tables exist
            logger.info("Step 2.5: Ensuring database tables exist")
            tables_check = await self._ensure_database_tables()
            startup_results['tasks']['tables_check'] = tables_check
            
            if not tables_check['success']:
                logger.error(f"Table creation failed: {tables_check['message']}")
                self.startup_errors.append(tables_check['message'])
                # Don't fail startup - some tables may be optional
            
            # 3. Initialize card index
            logger.info("Step 3: Initializing card index")
            index_init = await self._initialize_card_index()
            startup_results['tasks']['card_index_init'] = index_init
            self.card_index_status = index_init
            
            if not index_init['success']:
                logger.error(f"Card index initialization failed: {index_init['message']}")
                self.startup_errors.append(index_init['message'])
                # Card index failure is not fatal - API can still work
            
            # 4. Preload common cards into cache
            logger.info("Step 4: Preloading common cards")
            preload_result = await self._preload_common_cards()
            startup_results['tasks']['card_preload'] = preload_result
            
            if not preload_result['success']:
                logger.warning(f"Card preloading had issues: {preload_result['message']}")
                # Not fatal - continue anyway
            
            # 5. Final health check
            logger.info("Step 5: Final system health check")
            health_check = await self._final_health_check()
            startup_results['tasks']['final_health_check'] = health_check
            
            # Calculate total startup time
            startup_duration = (datetime.utcnow() - self.startup_start_time).total_seconds()
            startup_results['duration_seconds'] = startup_duration
            
            # Determine final status
            if self.startup_errors:
                startup_results['status'] = 'completed_with_warnings'
                startup_results['warnings'] = self.startup_errors
                logger.warning(f"Startup completed with warnings in {startup_duration:.1f}s")
            else:
                startup_results['status'] = 'success'
                logger.info(f"Startup completed successfully in {startup_duration:.1f}s")
            
            self.startup_complete = True
            return startup_results
            
        except Exception as e:
            startup_duration = (datetime.utcnow() - self.startup_start_time).total_seconds()
            startup_results['duration_seconds'] = startup_duration
            startup_results['status'] = 'failed'
            startup_results['error'] = str(e)
            
            logger.error(f"Startup sequence failed after {startup_duration:.1f}s: {e}")
            return startup_results
    
    async def _check_storage_requirements(self) -> Dict[str, Any]:
        """Check if sufficient storage space is available."""
        try:
            # Check current working directory storage
            current_path = Path.cwd()
            stat = shutil.disk_usage(current_path)
            
            # Convert bytes to GB
            free_gb = stat.free / (1024 ** 3)
            total_gb = stat.total / (1024 ** 3)
            used_gb = (stat.total - stat.free) / (1024 ** 3)
            
            # Minimum required space (configurable, default 10GB)
            min_required_gb = getattr(settings, 'MIN_STORAGE_GB', 10)
            
            storage_info = {
                'free_gb': round(free_gb, 2),
                'total_gb': round(total_gb, 2),
                'used_gb': round(used_gb, 2),
                'required_gb': min_required_gb,
                'sufficient': free_gb >= min_required_gb
            }
            
            if storage_info['sufficient']:
                return {
                    'success': True,
                    'message': f"Storage check passed: {free_gb:.1f}GB available (>= {min_required_gb}GB required)",
                    'storage': storage_info
                }
            else:
                return {
                    'success': False,
                    'message': f"Insufficient storage: {free_gb:.1f}GB available, {min_required_gb}GB required",
                    'storage': storage_info
                }
                
        except Exception as e:
            logger.error(f"Storage check failed: {e}")
            return {
                'success': False,
                'message': f"Storage check failed: {str(e)}",
                'storage': None
            }
    
    async def _check_database_connectivity(self) -> Dict[str, Any]:
        """Check database connectivity and health."""
        try:
            db_healthy = await check_database_health()
            
            if db_healthy:
                return {
                    'success': True,
                    'message': "Database connection successful"
                }
            else:
                return {
                    'success': False,
                    'message': "Database connection failed"
                }
                
        except Exception as e:
            logger.error(f"Database connectivity check failed: {e}")
            return {
                'success': False,
                'message': f"Database check error: {str(e)}"
            }
    
    async def _ensure_database_tables(self) -> Dict[str, Any]:
        """Ensure all database tables exist, creating them if necessary."""
        try:
            from app.database import engine, Base
            # Import all models to ensure they're registered with Base
            from app.models import (
                User, Card, CardSet, CardIndex, Collection, CollectionCard,
                Invite, Scan, ScanBatch, ScanHistory
            )
            
            async with engine.begin() as conn:
                # Create all tables that don't exist
                await conn.run_sync(Base.metadata.create_all)
            
            logger.info("Database tables verified/created successfully")
            return {
                'success': True,
                'message': "All database tables verified/created"
            }
            
        except Exception as e:
            logger.error(f"Failed to ensure database tables: {e}")
            return {
                'success': False,
                'message': f"Table creation error: {str(e)}"
            }
    
    async def _initialize_card_index(self) -> Dict[str, Any]:
        """
        Initialize the card index automatically.
        
        This will:
        1. Check if the index already has cards
        2. If empty, download bulk data from Scryfall API automatically
        3. Populate the index with English cards
        
        No manual file downloads needed!
        """
        logger.info("Card index initialization started.")
        try:
            # Check if auto-init is disabled
            auto_init_enabled = getattr(settings, 'AUTO_INIT_CARD_INDEX', True)
            
            if not auto_init_enabled:
                card_count = await card_data_service.get_index_count()
                if card_count > 0:
                    return {
                        'success': True,
                        'message': f"Card index has {card_count:,} cards (auto-init disabled)",
                        'action': 'skipped',
                        'card_count': card_count
                    }
                else:
                    return {
                        'success': False,
                        'message': "Card index is empty and AUTO_INIT_CARD_INDEX is disabled",
                        'action': 'skipped',
                        'card_count': 0
                    }
            
            # Use the new card_data_service for automatic initialization
            result = await card_data_service.ensure_initialized()
            
            if result['status'] == 'success':
                return {
                    'success': True,
                    'message': f"Card index initialized: {result['inserted_cards']:,} cards in {result['duration_seconds']:.1f}s",
                    'action': 'populated',
                    'card_count': result['inserted_cards'],
                    'duration_seconds': result['duration_seconds'],
                    'data_type': result.get('data_type', 'unknown')
                }
            elif result['status'] == 'already_initialized':
                return {
                    'success': True,
                    'message': f"Card index already has {result['card_count']:,} cards",
                    'action': 'skipped',
                    'card_count': result['card_count']
                }
            else:
                return {
                    'success': False,
                    'message': f"Card index initialization failed: {result.get('error', 'Unknown error')}",
                    'action': 'failed',
                    'error': result.get('error')
                }
                
        except Exception as e:
            logger.error(f"An exception occurred during card index initialization: {e}", exc_info=True)
            return {
                'success': False,
                'message': f"Card index initialization error: {str(e)}",
                'action': 'failed',
                'error': str(e)
            }
    
    async def _final_health_check(self) -> Dict[str, Any]:
        """Perform final health check after initialization."""
        try:
            # Check database
            db_healthy = await check_database_health()
            
            # Check card index using new service
            index_status = await card_data_service.get_status()
            card_count = index_status['total_cards']
            
            health_status = {
                'database_healthy': db_healthy,
                'card_index_count': card_count,
                'card_index_ready': index_status['is_initialized'],
                'english_cards': index_status['english_cards']
            }
            
            all_healthy = db_healthy and index_status['is_initialized']
            
            return {
                'success': all_healthy,
                'message': f"Health check: DB {'OK' if db_healthy else 'FAIL'}, Index {card_count:,} cards ({index_status['english_cards']:,} English)",
                'health': health_status
            }
            
        except Exception as e:
            logger.error(f"Final health check failed: {e}")
            return {
                'success': False,
                'message': f"Health check error: {str(e)}",
                'health': None
            }
    
    async def _preload_common_cards(self) -> Dict[str, Any]:
        """
        Preload common/popular cards into the database cache.
        This includes basic lands, popular commanders, and format staples.
        """
        try:
            from app.services.card_service import card_service
            from sqlalchemy import select
            from app.models.card_index import CardIndex
            
            # List of common card names to preload (basic lands + popular cards)
            common_card_names = [
                # Basic Lands (all 5)
                'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
                # Snow basics
                'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
                'Snow-Covered Mountain', 'Snow-Covered Forest',
                # Wastes
                'Wastes',
                # Popular commander staples
                'Sol Ring', 'Command Tower', 'Arcane Signet', 'Lightning Greaves',
                'Swiftfoot Boots', 'Thought Vessel', 'Fellwar Stone',
                # Popular removal
                'Swords to Plowshares', 'Path to Exile', 'Counterspell',
                'Beast Within', 'Chaos Warp', 'Generous Gift',
                # Draw spells
                'Brainstorm', 'Ponder', 'Preordain',
            ]
            
            preloaded_count = 0
            failed_count = 0
            
            async with async_session_maker() as session:
                for card_name in common_card_names:
                    try:
                        # Find the card in the index by exact name match
                        result = await session.execute(
                            select(CardIndex)
                            .where(CardIndex.name == card_name)
                            .limit(1)
                        )
                        index_card = result.scalar_one_or_none()
                        
                        if index_card:
                            # Preload the card details into cache
                            await card_service.get_card_details(index_card.scryfall_id, session)
                            preloaded_count += 1
                            logger.debug(f"Preloaded card: {card_name}")
                        else:
                            logger.debug(f"Card not found in index: {card_name}")
                            
                    except Exception as e:
                        failed_count += 1
                        logger.debug(f"Failed to preload {card_name}: {e}")
                        continue
            
            logger.info(f"Preloaded {preloaded_count} common cards ({failed_count} failed)")
            
            return {
                'success': True,
                'message': f"Preloaded {preloaded_count} common cards",
                'preloaded_count': preloaded_count,
                'failed_count': failed_count
            }
            
        except Exception as e:
            logger.error(f"Card preloading failed: {e}")
            return {
                'success': False,
                'message': f"Card preloading error: {str(e)}",
                'preloaded_count': 0,
                'failed_count': 0
            }
    
    def get_startup_status(self) -> Dict[str, Any]:
        """Get current startup status information."""
        if not self.startup_start_time:
            return {
                'status': 'not_started',
                'startup_complete': False
            }
        
        duration = (datetime.utcnow() - self.startup_start_time).total_seconds()
        
        return {
            'status': 'completed' if self.startup_complete else 'in_progress',
            'startup_complete': self.startup_complete,
            'started_at': self.startup_start_time.isoformat(),
            'duration_seconds': duration,
            'errors': self.startup_errors,
            'card_index_status': self.card_index_status
        }
    
    def is_ready(self) -> bool:
        """Check if the application is ready to serve requests."""
        return self.startup_complete and len([e for e in self.startup_errors if 'storage' not in e.lower()]) == 0


# Global service instance
startup_service = StartupService()