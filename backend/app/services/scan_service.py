"""
Scan Service for Spellbook v2.0

Main service for processing card scans, coordinating OCR, card matching,
and collection management.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session_maker
from app.models.scan import Scan, ScanBatch, ScanStatus, ScanBatchStatus, ScanHistory
from app.models.card_index import CardIndex
from app.models.card import Card, CardStorageReason
from app.models.collection import Collection, CollectionCard
from app.services.storage_service import storage_service
from app.services.ocr_service import ocr_service
from app.services.card_service import card_service
from app.core.exceptions import ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)


class ScanService:
    """
    Main scan processing service.
    
    Handles:
    - Scan creation and management
    - Batch scan operations
    - Card matching from OCR results
    - Integration with collection management
    """
    
    def __init__(self):
        self.confidence_threshold = settings.SCAN_CONFIDENCE_THRESHOLD
        self.max_retries = 3
    
    # ==================== Batch Operations ====================
    
    async def create_batch(
        self,
        user_id: UUID,
        session: AsyncSession,
        name: Optional[str] = None,
        description: Optional[str] = None,
        auto_add_to_collection: bool = False,
        target_collection_id: Optional[UUID] = None,
        confidence_threshold: float = 0.85,
        source: str = "mobile",
        device_info: Optional[Dict] = None
    ) -> ScanBatch:
        """Create a new scan batch"""
        
        batch = ScanBatch(
            user_id=user_id,
            name=name or f"Scan {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            description=description,
            source=source,
            device_info=device_info or {},
            auto_add_to_collection=auto_add_to_collection,
            target_collection_id=target_collection_id,
            confidence_threshold=confidence_threshold,
            status=ScanBatchStatus.UPLOADING
        )
        
        session.add(batch)
        await session.commit()
        await session.refresh(batch)
        
        logger.info(f"Created scan batch {batch.id} for user {user_id}")
        return batch
    
    async def get_batch(
        self,
        batch_id: UUID,
        user_id: UUID,
        session: AsyncSession,
        include_scans: bool = False
    ) -> Optional[ScanBatch]:
        """Get a batch by ID"""
        
        query = select(ScanBatch).where(
            ScanBatch.id == batch_id,
            ScanBatch.user_id == user_id
        )
        
        if include_scans:
            query = query.options(selectinload(ScanBatch.scans))
        
        result = await session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_user_batches(
        self,
        user_id: UUID,
        session: AsyncSession,
        status: Optional[ScanBatchStatus] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[ScanBatch]:
        """Get all batches for a user"""
        
        query = select(ScanBatch).where(ScanBatch.user_id == user_id)
        
        if status:
            query = query.where(ScanBatch.status == status)
        
        query = query.order_by(ScanBatch.created_at.desc()).offset(offset).limit(limit)
        
        result = await session.execute(query)
        return list(result.scalars().all())
    
    async def finalize_batch(
        self,
        batch_id: UUID,
        user_id: UUID,
        session: AsyncSession
    ) -> ScanBatch:
        """Mark a batch as ready for processing"""
        
        batch = await self.get_batch(batch_id, user_id, session)
        if not batch:
            raise ResourceNotFoundError(f"Batch not found: {batch_id}")
        
        if batch.status != ScanBatchStatus.UPLOADING:
            raise ValidationError("Batch is not in uploading state")
        
        batch.status = ScanBatchStatus.QUEUED
        await session.commit()
        
        logger.info(f"Batch {batch_id} finalized with {batch.total_scans} scans")
        return batch
    
    async def update_batch_progress(
        self,
        batch_id: UUID,
        session: AsyncSession
    ):
        """Update batch progress based on scan statuses"""
        
        result = await session.execute(
            select(ScanBatch).where(ScanBatch.id == batch_id)
        )
        batch = result.scalar_one_or_none()
        
        if not batch:
            return
        
        # Count scans by status
        status_counts = await session.execute(
            select(
                Scan.status,
                func.count(Scan.id).label('count')
            ).where(Scan.batch_id == batch_id)
            .group_by(Scan.status)
        )
        
        counts = {row.status: row.count for row in status_counts}
        
        completed = counts.get(ScanStatus.COMPLETED, 0) + counts.get(ScanStatus.CONFIRMED, 0)
        failed = counts.get(ScanStatus.FAILED, 0)
        
        batch.completed_scans = completed
        batch.failed_scans = failed
        
        # Determine batch status
        total_processed = completed + failed + counts.get(ScanStatus.MANUAL_REVIEW, 0)
        
        if total_processed >= batch.total_scans:
            if failed == batch.total_scans:
                batch.status = ScanBatchStatus.FAILED
            elif failed > 0:
                batch.status = ScanBatchStatus.PARTIAL
            else:
                batch.status = ScanBatchStatus.COMPLETED
            batch.completed_at = datetime.utcnow()
        elif total_processed > 0:
            batch.status = ScanBatchStatus.PROCESSING
            if not batch.started_at:
                batch.started_at = datetime.utcnow()
        
        await session.commit()
    
    # ==================== Scan Operations ====================
    
    async def create_scan(
        self,
        user_id: UUID,
        image_data: bytes,
        content_type: str,
        session: AsyncSession,
        batch_id: Optional[UUID] = None
    ) -> Scan:
        """Create a new scan from uploaded image"""
        
        # Upload to storage
        original_key, thumbnail_key, metadata = await storage_service.upload_scan_image(
            file_data=image_data,
            user_id=user_id,
            batch_id=batch_id,
            content_type=content_type
        )
        
        scan = Scan(
            user_id=user_id,
            batch_id=batch_id,
            original_image_key=original_key,
            thumbnail_key=thumbnail_key,
            image_width=metadata.get('width'),
            image_height=metadata.get('height'),
            file_size=metadata.get('size'),
            mime_type=content_type,
            status=ScanStatus.PENDING
        )
        
        session.add(scan)
        
        # Update batch count if applicable
        if batch_id:
            result = await session.execute(
                select(ScanBatch).where(ScanBatch.id == batch_id)
            )
            batch = result.scalar_one_or_none()
            if batch:
                batch.total_scans += 1
        
        await session.commit()
        await session.refresh(scan)
        
        # Add history
        await self._add_scan_history(scan.id, user_id, "created", None, "pending", session)
        
        logger.info(f"Created scan {scan.id} for user {user_id}")
        return scan
    
    async def get_scan(
        self,
        scan_id: UUID,
        user_id: UUID,
        session: AsyncSession
    ) -> Optional[Scan]:
        """Get a scan by ID"""
        
        result = await session.execute(
            select(Scan).where(
                Scan.id == scan_id,
                Scan.user_id == user_id
            )
        )
        return result.scalar_one_or_none()
    
    async def get_user_scans(
        self,
        user_id: UUID,
        session: AsyncSession,
        status: Optional[ScanStatus] = None,
        batch_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Scan]:
        """Get scans for a user with optional filters"""
        
        query = select(Scan).where(Scan.user_id == user_id)
        
        if status:
            query = query.where(Scan.status == status)
        if batch_id:
            query = query.where(Scan.batch_id == batch_id)
        
        query = query.order_by(Scan.created_at.desc()).offset(offset).limit(limit)
        
        result = await session.execute(query)
        return list(result.scalars().all())
    
    async def get_pending_scans(
        self,
        user_id: UUID,
        session: AsyncSession
    ) -> List[Scan]:
        """Get all scans needing review"""
        
        result = await session.execute(
            select(Scan).where(
                Scan.user_id == user_id,
                Scan.status.in_([ScanStatus.MANUAL_REVIEW, ScanStatus.PENDING])
            ).order_by(Scan.created_at.desc())
        )
        return list(result.scalars().all())
    
    # ==================== Processing ====================
    
    async def process_scan(
        self,
        scan_id: UUID,
        session: AsyncSession
    ) -> Scan:
        """
        Process a single scan - extract text and match to card.
        
        This is typically called by Celery workers.
        """
        
        result = await session.execute(
            select(Scan).where(Scan.id == scan_id)
        )
        scan = result.scalar_one_or_none()
        
        if not scan:
            raise ResourceNotFoundError(f"Scan not found: {scan_id}")
        
        if scan.status not in [ScanStatus.PENDING, ScanStatus.FAILED]:
            logger.info(f"Scan {scan_id} already processed, skipping")
            return scan
        
        old_status = scan.status.value
        scan.mark_processing()
        await session.commit()
        
        start_time = datetime.utcnow()
        
        try:
            # Download image
            image_data = await storage_service.download_image(scan.original_image_key)
            
            # Detect card bounds
            bounds = await ocr_service.detect_card_bounds(image_data)
            if bounds:
                scan.bounding_box = bounds
            
            # Extract text via OCR
            ocr_result = await ocr_service.extract_card_text(image_data)
            
            scan.extracted_text = ocr_result.get('raw_text')
            scan.detected_name = ocr_service.clean_card_name(ocr_result.get('name'))
            
            set_code, collector_num = ocr_service.extract_set_info(
                ocr_result.get('set_code') or ocr_result.get('collector_number')
            )
            scan.detected_set_code = set_code
            scan.detected_collector_number = collector_num
            
            # Match to cards in database
            detected_cards = await self._match_cards(
                name=scan.detected_name,
                set_code=scan.detected_set_code,
                collector_number=scan.detected_collector_number,
                raw_text=scan.extracted_text,
                session=session
            )
            
            processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            scan.processing_time_ms = processing_time
            
            if detected_cards:
                best_match = detected_cards[0]
                scan.mark_completed(
                    best_match_id=best_match['scryfall_id'],
                    confidence=best_match['confidence'],
                    detected_cards=detected_cards[:5]  # Store top 5 matches
                )
                
                # Auto-add to collection if configured
                if scan.batch_id:
                    batch_result = await session.execute(
                        select(ScanBatch).where(ScanBatch.id == scan.batch_id)
                    )
                    batch = batch_result.scalar_one_or_none()
                    
                    if (batch and batch.auto_add_to_collection and 
                        best_match['confidence'] >= batch.confidence_threshold):
                        await self._auto_add_to_collection(scan, batch, session)
            else:
                scan.mark_failed("No matching cards found")
            
            await session.commit()
            await self._add_scan_history(
                scan.id, scan.user_id, "processed", 
                old_status, scan.status.value, session,
                details={'processing_time_ms': processing_time}
            )
            
            # Update batch progress
            if scan.batch_id:
                await self.update_batch_progress(scan.batch_id, session)
            
            logger.info(f"Processed scan {scan_id}: status={scan.status.value}, "
                       f"match={scan.detected_name}, confidence={scan.best_match_confidence}")
            
        except Exception as e:
            scan.mark_failed(str(e))
            await session.commit()
            logger.error(f"Failed to process scan {scan_id}: {e}")
            raise
        
        return scan
    
    async def _match_cards(
        self,
        name: Optional[str],
        set_code: Optional[str],
        collector_number: Optional[str],
        raw_text: Optional[str],
        session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """Match extracted text to cards in the database"""
        
        matches = []
        
        if not name and not raw_text:
            return matches
        
        # Build search query
        query = select(CardIndex)
        conditions = []
        
        if name:
            # Fuzzy name matching using trigram similarity (if available)
            # Fall back to ILIKE for basic matching
            conditions.append(CardIndex.name.ilike(f"%{name}%"))
        
        if set_code:
            conditions.append(CardIndex.set_code == set_code.upper())
        
        if collector_number:
            conditions.append(CardIndex.collector_number == collector_number)
        
        if conditions:
            query = query.where(or_(*conditions))
        
        query = query.limit(10)
        
        result = await session.execute(query)
        cards = result.scalars().all()
        
        # Calculate confidence scores
        for card in cards:
            confidence = self._calculate_match_confidence(
                card=card,
                detected_name=name,
                detected_set=set_code,
                detected_num=collector_number
            )
            
            matches.append({
                'scryfall_id': card.scryfall_id,
                'oracle_id': card.oracle_id,
                'name': card.name,
                'set_code': card.set_code,
                'collector_number': card.collector_number,
                'confidence': confidence,
                'rarity': card.rarity
            })
        
        # Sort by confidence
        matches.sort(key=lambda x: x['confidence'], reverse=True)
        
        return matches
    
    def _calculate_match_confidence(
        self,
        card: CardIndex,
        detected_name: Optional[str],
        detected_set: Optional[str],
        detected_num: Optional[str]
    ) -> float:
        """Calculate confidence score for a card match"""
        
        score = 0.0
        weights = {'name': 0.6, 'set': 0.25, 'number': 0.15}
        
        # Name matching
        if detected_name and card.name:
            name_lower = detected_name.lower()
            card_name_lower = card.name.lower()
            
            if name_lower == card_name_lower:
                score += weights['name']
            elif name_lower in card_name_lower or card_name_lower in name_lower:
                # Partial match
                similarity = len(name_lower) / max(len(card_name_lower), 1)
                score += weights['name'] * similarity * 0.8
        
        # Set matching
        if detected_set and card.set_code:
            if detected_set.upper() == card.set_code.upper():
                score += weights['set']
        
        # Collector number matching
        if detected_num and card.collector_number:
            if detected_num == card.collector_number:
                score += weights['number']
        
        return min(score, 1.0)
    
    # ==================== Confirmation & Collection ====================
    
    async def confirm_scan(
        self,
        scan_id: UUID,
        user_id: UUID,
        card_scryfall_id: UUID,
        session: AsyncSession,
        add_to_collection: bool = False,
        collection_id: Optional[UUID] = None,
        quantity: int = 1,
        condition: Optional[str] = None
    ) -> Scan:
        """Confirm a scan result and optionally add to collection"""
        
        scan = await self.get_scan(scan_id, user_id, session)
        if not scan:
            raise ResourceNotFoundError(f"Scan not found: {scan_id}")
        
        old_status = scan.status.value
        scan.confirm(card_scryfall_id)
        
        if add_to_collection:
            await self._add_to_collection(
                scan=scan,
                card_scryfall_id=card_scryfall_id,
                collection_id=collection_id,
                user_id=user_id,
                quantity=quantity,
                condition=condition,
                session=session
            )
        
        await session.commit()
        await self._add_scan_history(
            scan.id, user_id, "confirmed",
            old_status, "confirmed", session,
            details={'card_scryfall_id': str(card_scryfall_id)}
        )
        
        logger.info(f"Confirmed scan {scan_id} with card {card_scryfall_id}")
        return scan
    
    async def reject_scan(
        self,
        scan_id: UUID,
        user_id: UUID,
        session: AsyncSession,
        reason: Optional[str] = None
    ) -> Scan:
        """Reject a scan result"""
        
        scan = await self.get_scan(scan_id, user_id, session)
        if not scan:
            raise ResourceNotFoundError(f"Scan not found: {scan_id}")
        
        old_status = scan.status.value
        scan.status = ScanStatus.REJECTED
        scan.error_message = reason
        
        await session.commit()
        await self._add_scan_history(
            scan.id, user_id, "rejected",
            old_status, "rejected", session,
            details={'reason': reason}
        )
        
        logger.info(f"Rejected scan {scan_id}")
        return scan
    
    async def _add_to_collection(
        self,
        scan: Scan,
        card_scryfall_id: UUID,
        collection_id: Optional[UUID],
        user_id: UUID,
        quantity: int,
        condition: Optional[str],
        session: AsyncSession
    ):
        """Add a scanned card to a collection"""
        
        # Find or create default collection
        if not collection_id:
            result = await session.execute(
                select(Collection).where(
                    Collection.user_id == user_id,
                    Collection.name == "Default Collection"
                )
            )
            collection = result.scalar_one_or_none()
            
            if not collection:
                collection = Collection(
                    user_id=user_id,
                    name="Default Collection",
                    description="Cards added from scans"
                )
                session.add(collection)
                await session.flush()
            
            collection_id = collection.id
        
        # Ensure card exists in our cache
        card = await card_service.get_card_details(card_scryfall_id, session)
        if card:
            await card_service.make_card_permanent(
                card_scryfall_id, CardStorageReason.USER_COLLECTION, session, user_id
            )
        
        # Add to collection
        collection_card = CollectionCard(
            collection_id=collection_id,
            card_scryfall_id=card_scryfall_id,
            quantity=quantity,
            condition=condition
        )
        session.add(collection_card)
        
        scan.added_to_collection = True
        scan.collection_card_id = collection_card.id
    
    async def _auto_add_to_collection(
        self,
        scan: Scan,
        batch: ScanBatch,
        session: AsyncSession
    ):
        """Automatically add a high-confidence scan to collection"""
        
        if not scan.best_match_scryfall_id:
            return
        
        await self._add_to_collection(
            scan=scan,
            card_scryfall_id=scan.best_match_scryfall_id,
            collection_id=batch.target_collection_id,
            user_id=scan.user_id,
            quantity=1,
            condition=None,
            session=session
        )
        
        scan.status = ScanStatus.CONFIRMED
        scan.confirmed_card_id = scan.best_match_scryfall_id
        scan.confirmed_at = datetime.utcnow()
    
    # ==================== Statistics ====================
    
    async def get_user_scan_stats(
        self,
        user_id: UUID,
        session: AsyncSession
    ) -> Dict[str, Any]:
        """Get scan statistics for a user"""
        
        # Count by status
        status_result = await session.execute(
            select(
                Scan.status,
                func.count(Scan.id).label('count')
            ).where(Scan.user_id == user_id)
            .group_by(Scan.status)
        )
        
        status_counts = {row.status.value: row.count for row in status_result}
        
        # Average confidence and processing time
        avg_result = await session.execute(
            select(
                func.avg(Scan.best_match_confidence).label('avg_confidence'),
                func.avg(Scan.processing_time_ms).label('avg_processing_time')
            ).where(
                Scan.user_id == user_id,
                Scan.status.in_([ScanStatus.COMPLETED, ScanStatus.CONFIRMED])
            )
        )
        avg_row = avg_result.one()
        
        # Cards added to collection
        added_count = await session.execute(
            select(func.count(Scan.id)).where(
                Scan.user_id == user_id,
                Scan.added_to_collection == True
            )
        )
        
        return {
            'total_scans': sum(status_counts.values()),
            'pending_scans': status_counts.get('pending', 0),
            'completed_scans': status_counts.get('completed', 0) + status_counts.get('confirmed', 0),
            'failed_scans': status_counts.get('failed', 0),
            'manual_review_scans': status_counts.get('manual_review', 0),
            'average_confidence': round(avg_row.avg_confidence, 3) if avg_row.avg_confidence else None,
            'average_processing_time_ms': int(avg_row.avg_processing_time) if avg_row.avg_processing_time else None,
            'cards_added_to_collection': added_count.scalar() or 0
        }
    
    # ==================== Helpers ====================
    
    async def _add_scan_history(
        self,
        scan_id: UUID,
        user_id: UUID,
        action: str,
        old_status: Optional[str],
        new_status: str,
        session: AsyncSession,
        details: Optional[Dict] = None
    ):
        """Add an entry to scan history"""
        
        history = ScanHistory(
            scan_id=scan_id,
            user_id=user_id,
            action=action,
            old_status=old_status,
            new_status=new_status,
            details=details or {}
        )
        session.add(history)
        await session.commit()
    
    async def delete_scan(
        self,
        scan_id: UUID,
        user_id: UUID,
        session: AsyncSession
    ) -> bool:
        """Delete a scan and its images"""
        
        scan = await self.get_scan(scan_id, user_id, session)
        if not scan:
            return False
        
        # Delete images from storage
        await storage_service.delete_scan_images(
            scan.original_image_key,
            scan.thumbnail_key,
            scan.processed_image_key
        )
        
        # Delete scan record
        await session.delete(scan)
        await session.commit()
        
        logger.info(f"Deleted scan {scan_id}")
        return True


# Global service instance
scan_service = ScanService()
