"""
Scan Processing Celery Tasks for Spellbook v2.0

Background tasks for processing card scans.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID

from celery import shared_task, group, chain
from sqlalchemy import select

from app.celery_app import celery_app
from app.database import async_session_maker
from app.models.scan import Scan, ScanBatch, ScanStatus, ScanBatchStatus
from app.services.scan_service import scan_service

logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper to run async code in Celery tasks"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True
)
def process_scan(self, scan_id: str):
    """
    Process a single scan.
    
    Args:
        scan_id: UUID of the scan to process
    """
    logger.info(f"Processing scan: {scan_id}")
    
    async def _process():
        async with async_session_maker() as session:
            try:
                scan = await scan_service.process_scan(UUID(scan_id), session)
                return {
                    "scan_id": str(scan.id),
                    "status": scan.status.value,
                    "detected_name": scan.detected_name,
                    "confidence": scan.best_match_confidence
                }
            except Exception as e:
                logger.error(f"Failed to process scan {scan_id}: {e}")
                raise
    
    return run_async(_process())


@celery_app.task(bind=True)
def process_batch(self, batch_id: str):
    """
    Process all pending scans in a batch.
    
    Args:
        batch_id: UUID of the batch to process
    """
    logger.info(f"Processing batch: {batch_id}")
    
    async def _process():
        async with async_session_maker() as session:
            # Get batch
            result = await session.execute(
                select(ScanBatch).where(ScanBatch.id == UUID(batch_id))
            )
            batch = result.scalar_one_or_none()
            
            if not batch:
                logger.error(f"Batch not found: {batch_id}")
                return {"error": "Batch not found"}
            
            # Update batch status
            batch.status = ScanBatchStatus.PROCESSING
            batch.started_at = datetime.utcnow()
            await session.commit()
            
            # Get all pending scans in batch
            scans_result = await session.execute(
                select(Scan).where(
                    Scan.batch_id == UUID(batch_id),
                    Scan.status == ScanStatus.PENDING
                )
            )
            scans = scans_result.scalars().all()
            
            return {
                "batch_id": batch_id,
                "scan_count": len(scans),
                "scan_ids": [str(s.id) for s in scans]
            }
    
    result = run_async(_process())
    
    # Create a group of tasks to process all scans
    if result.get("scan_ids"):
        scan_tasks = group(
            process_scan.s(scan_id) for scan_id in result["scan_ids"]
        )
        # Execute and wait for all scans to complete
        scan_results = scan_tasks.apply_async()
        
        # After all scans complete, finalize the batch
        finalize_batch.delay(batch_id)
    
    return result


@celery_app.task(bind=True)
def finalize_batch(self, batch_id: str):
    """
    Finalize batch processing after all scans complete.
    
    Args:
        batch_id: UUID of the batch to finalize
    """
    logger.info(f"Finalizing batch: {batch_id}")
    
    async def _finalize():
        async with async_session_maker() as session:
            await scan_service.update_batch_progress(UUID(batch_id), session)
            
            result = await session.execute(
                select(ScanBatch).where(ScanBatch.id == UUID(batch_id))
            )
            batch = result.scalar_one_or_none()
            
            if batch:
                return {
                    "batch_id": str(batch.id),
                    "status": batch.status.value,
                    "completed_scans": batch.completed_scans,
                    "failed_scans": batch.failed_scans,
                    "total_scans": batch.total_scans
                }
            return {"error": "Batch not found"}
    
    return run_async(_finalize())


@celery_app.task
def process_pending_scans():
    """
    Find and process all pending scans across all users.
    Typically called by a scheduler.
    """
    logger.info("Processing all pending scans")
    
    async def _process_pending():
        async with async_session_maker() as session:
            # Get pending scans
            result = await session.execute(
                select(Scan).where(Scan.status == ScanStatus.PENDING).limit(100)
            )
            scans = result.scalars().all()
            
            return [str(s.id) for s in scans]
    
    scan_ids = run_async(_process_pending())
    
    if scan_ids:
        # Process scans in parallel
        scan_tasks = group(process_scan.s(scan_id) for scan_id in scan_ids)
        scan_tasks.apply_async()
    
    return {"queued_scans": len(scan_ids)}


@celery_app.task
def cleanup_old_scans(days: int = 30):
    """
    Clean up old rejected/failed scans and their images.
    
    Args:
        days: Delete scans older than this many days
    """
    logger.info(f"Cleaning up scans older than {days} days")
    
    async def _cleanup():
        from app.services.storage_service import storage_service
        
        cutoff = datetime.utcnow() - timedelta(days=days)
        deleted_count = 0
        
        async with async_session_maker() as session:
            # Get old rejected/failed scans
            result = await session.execute(
                select(Scan).where(
                    Scan.status.in_([ScanStatus.REJECTED, ScanStatus.FAILED]),
                    Scan.created_at < cutoff
                ).limit(100)
            )
            scans = result.scalars().all()
            
            for scan in scans:
                try:
                    # Delete images
                    await storage_service.delete_scan_images(
                        scan.original_image_key,
                        scan.thumbnail_key,
                        scan.processed_image_key
                    )
                    
                    # Delete scan record
                    await session.delete(scan)
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"Failed to delete scan {scan.id}: {e}")
            
            await session.commit()
        
        return {"deleted_scans": deleted_count}
    
    return run_async(_cleanup())


@celery_app.task
def retry_failed_scans(max_retries: int = 3):
    """
    Retry processing failed scans that haven't exceeded retry limit.
    """
    logger.info("Retrying failed scans")
    
    async def _retry():
        async with async_session_maker() as session:
            result = await session.execute(
                select(Scan).where(
                    Scan.status == ScanStatus.FAILED,
                    Scan.processing_attempts < max_retries
                ).limit(50)
            )
            scans = result.scalars().all()
            
            # Reset status to pending for retry
            for scan in scans:
                scan.status = ScanStatus.PENDING
            
            await session.commit()
            
            return [str(s.id) for s in scans]
    
    scan_ids = run_async(_retry())
    
    if scan_ids:
        scan_tasks = group(process_scan.s(scan_id) for scan_id in scan_ids)
        scan_tasks.apply_async()
    
    return {"retried_scans": len(scan_ids)}


@celery_app.task
def get_queue_stats():
    """
    Get statistics about the processing queue.
    """
    async def _stats():
        async with async_session_maker() as session:
            from sqlalchemy import func
            
            result = await session.execute(
                select(
                    Scan.status,
                    func.count(Scan.id).label("count")
                ).group_by(Scan.status)
            )
            
            stats = {row.status.value: row.count for row in result}
            
            return {
                "pending": stats.get("pending", 0),
                "processing": stats.get("processing", 0),
                "completed": stats.get("completed", 0),
                "failed": stats.get("failed", 0),
                "manual_review": stats.get("manual_review", 0)
            }
    
    return run_async(_stats())
