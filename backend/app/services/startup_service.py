"""
Startup Service Manager for Spellbook

This service orchestrates the application startup process, including
card index initialization and system health checks.
"""

import asyncio
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from app.config import settings
from app.database import check_database_health, async_session_maker
from app.services.scryfall_bulk_service import scryfall_bulk_service
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
            
            # 4. Final health check
            logger.info("Step 4: Final system health check")
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
        """Initialize the card index if needed."""
        logger.info("Card index initialization started.")
        try:
            # Only force refresh if explicitly configured
            force_refresh = getattr(settings, 'FORCE_CARD_INDEX_REFRESH', False)
            
            logger.info(f"Force refresh is set to {force_refresh}.")

            result = await scryfall_bulk_service.download_and_populate_index(
                force_refresh=force_refresh,
                batch_size=getattr(settings, 'CARD_INDEX_BATCH_SIZE', 1000)
            )
            
            if result['status'] == 'success':
                logger.info(f"Card index successfully populated with {result['inserted_cards']} cards.")
                return {
                    'success': True,
                    'message': f"Card index initialized: {result['inserted_cards']:,} cards in {result['duration_seconds']:.1f}s",
                    'action': 'populated',
                    'card_count': result['inserted_cards'],
                    'duration_seconds': result['duration_seconds']
                }
            elif result['status'] == 'skipped':
                logger.info("Card index population was skipped.")
                return {
                    'success': True,
                    'message': result['reason'],
                    'action': 'skipped',
                    'card_count': result.get('existing_cards', 0)
                }
            else:
                logger.error(f"Card index initialization failed: {result.get('error')}")
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
            
            # Check card index
            card_count = await scryfall_bulk_service.get_card_index_count()
            
            health_status = {
                'database_healthy': db_healthy,
                'card_index_count': card_count,
                'card_index_ready': card_count > 0
            }
            
            all_healthy = db_healthy and card_count > 0
            
            return {
                'success': all_healthy,
                'message': f"Health check: DB {'OK' if db_healthy else 'FAIL'}, Index {card_count:,} cards",
                'health': health_status
            }
            
        except Exception as e:
            logger.error(f"Final health check failed: {e}")
            return {
                'success': False,
                'message': f"Health check error: {str(e)}",
                'health': None
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