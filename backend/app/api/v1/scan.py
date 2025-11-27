"""
Scan API Endpoints for Spellbook v2.0

REST API for card scanning operations.
"""

import logging
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models.user import User
from app.models.scan import ScanStatus, ScanBatchStatus
from app.schemas.scan import (
    ScanBatchCreate, ScanBatchUpdate, ScanBatchResponse, ScanBatchDetail,
    ScanResponse, ScanDetail, ScanConfirm, ScanReject,
    BatchConfirm, BatchReject, ScanStats, ProcessingQueueStatus
)
from app.core.deps import get_current_user
from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.services.scan_service import scan_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== Batch Endpoints ====================

@router.post("/batches", response_model=ScanBatchResponse, status_code=status.HTTP_201_CREATED)
async def create_scan_batch(
    batch_data: ScanBatchCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new scan batch for grouping multiple card scans.
    
    Typically used when starting a scanning session on the mobile app.
    """
    batch = await scan_service.create_batch(
        user_id=current_user.id,
        session=session,
        name=batch_data.name,
        description=batch_data.description,
        auto_add_to_collection=batch_data.auto_add_to_collection,
        target_collection_id=batch_data.target_collection_id,
        confidence_threshold=batch_data.confidence_threshold,
        source="api"
    )
    
    return batch


@router.get("/batches", response_model=List[ScanBatchResponse])
async def list_scan_batches(
    status: Optional[ScanBatchStatus] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    List all scan batches for the current user.
    """
    offset = (page - 1) * per_page
    batches = await scan_service.get_user_batches(
        user_id=current_user.id,
        session=session,
        status=status,
        limit=per_page,
        offset=offset
    )
    
    return batches


@router.get("/batches/{batch_id}", response_model=ScanBatchDetail)
async def get_scan_batch(
    batch_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get details of a specific scan batch including all scans.
    """
    batch = await scan_service.get_batch(
        batch_id=batch_id,
        user_id=current_user.id,
        session=session,
        include_scans=True
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Calculate progress
    progress = 0.0
    if batch.total_scans > 0:
        progress = (batch.completed_scans + batch.failed_scans) / batch.total_scans * 100
    
    # Convert scans to response format with URLs
    scan_responses = []
    for scan in batch.scans:
        scan_response = await _scan_to_response(scan)
        scan_responses.append(scan_response)
    
    return ScanBatchDetail(
        **{k: v for k, v in batch.__dict__.items() if not k.startswith('_')},
        scans=scan_responses,
        progress_percent=progress
    )


@router.post("/batches/{batch_id}/finalize", response_model=ScanBatchResponse)
async def finalize_scan_batch(
    batch_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Mark a batch as complete and queue it for processing.
    
    Call this after all images have been uploaded to the batch.
    """
    try:
        batch = await scan_service.finalize_batch(
            batch_id=batch_id,
            user_id=current_user.id,
            session=session
        )
        
        # Queue batch for processing
        from app.tasks.scan_tasks import process_batch
        process_batch.delay(str(batch_id))
        
        return batch
        
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Batch not found")
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan_batch(
    batch_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a scan batch and all associated scans and images.
    """
    batch = await scan_service.get_batch(
        batch_id=batch_id,
        user_id=current_user.id,
        session=session,
        include_scans=True
    )
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Delete all scans in batch
    for scan in batch.scans:
        await scan_service.delete_scan(scan.id, current_user.id, session)
    
    # Delete batch
    await session.delete(batch)
    await session.commit()


# ==================== Scan Endpoints ====================

@router.post("/upload", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def upload_scan(
    file: UploadFile = File(..., description="Card image to scan"),
    batch_id: Optional[UUID] = Form(None, description="Batch to add scan to"),
    auto_process: bool = Form(True, description="Automatically process the scan"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a card image for scanning.
    
    Accepts JPEG, PNG, or WebP images. The image will be processed
    to identify the card using OCR and image matching.
    """
    # Validate file type
    content_type = file.content_type
    if content_type not in ['image/jpeg', 'image/png', 'image/webp']:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Supported: JPEG, PNG, WebP"
        )
    
    # Read file data
    image_data = await file.read()
    
    # Check file size (10MB max)
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Create scan
    scan = await scan_service.create_scan(
        user_id=current_user.id,
        image_data=image_data,
        content_type=content_type,
        session=session,
        batch_id=batch_id
    )
    
    # Queue for processing if requested
    if auto_process:
        from app.tasks.scan_tasks import process_scan
        process_scan.delay(str(scan.id))
    
    return await _scan_to_response(scan)


@router.post("/upload-batch", response_model=List[ScanResponse], status_code=status.HTTP_201_CREATED)
async def upload_batch_scans(
    files: List[UploadFile] = File(..., description="Multiple card images to scan"),
    batch_id: Optional[UUID] = Form(None, description="Batch to add scans to"),
    auto_process: bool = Form(True, description="Automatically process scans"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Upload multiple card images at once.
    
    Limited to 50 images per request. For larger batches, create a batch
    and upload images individually.
    """
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 files per request")
    
    # Create batch if not provided
    if not batch_id:
        batch = await scan_service.create_batch(
            user_id=current_user.id,
            session=session,
            name=f"Batch upload {len(files)} cards",
            source="api_batch"
        )
        batch_id = batch.id
    
    scans = []
    errors = []
    
    for file in files:
        try:
            content_type = file.content_type
            if content_type not in ['image/jpeg', 'image/png', 'image/webp']:
                errors.append({"file": file.filename, "error": "Invalid file type"})
                continue
            
            image_data = await file.read()
            if len(image_data) > 10 * 1024 * 1024:
                errors.append({"file": file.filename, "error": "File too large"})
                continue
            
            scan = await scan_service.create_scan(
                user_id=current_user.id,
                image_data=image_data,
                content_type=content_type,
                session=session,
                batch_id=batch_id
            )
            scans.append(scan)
            
        except Exception as e:
            errors.append({"file": file.filename, "error": str(e)})
    
    # Queue for processing
    if auto_process and scans:
        from app.tasks.scan_tasks import process_batch
        process_batch.delay(str(batch_id))
    
    # Log errors if any
    if errors:
        logger.warning(f"Batch upload errors: {errors}")
    
    return [await _scan_to_response(s) for s in scans]


@router.get("/scans", response_model=List[ScanResponse])
async def list_scans(
    status: Optional[ScanStatus] = Query(None, description="Filter by status"),
    batch_id: Optional[UUID] = Query(None, description="Filter by batch"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    List scans for the current user with optional filters.
    """
    offset = (page - 1) * per_page
    scans = await scan_service.get_user_scans(
        user_id=current_user.id,
        session=session,
        status=status,
        batch_id=batch_id,
        limit=per_page,
        offset=offset
    )
    
    return [await _scan_to_response(s) for s in scans]


@router.get("/scans/pending", response_model=List[ScanResponse])
async def list_pending_scans(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get all scans that need manual review.
    """
    scans = await scan_service.get_pending_scans(
        user_id=current_user.id,
        session=session
    )
    
    return [await _scan_to_response(s) for s in scans]


@router.get("/scans/{scan_id}", response_model=ScanDetail)
async def get_scan(
    scan_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get details of a specific scan including all detection results.
    """
    scan = await scan_service.get_scan(
        scan_id=scan_id,
        user_id=current_user.id,
        session=session
    )
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return await _scan_to_detail(scan)


@router.post("/scans/{scan_id}/confirm", response_model=ScanResponse)
async def confirm_scan(
    scan_id: UUID,
    confirm_data: ScanConfirm,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Confirm a scan result and optionally add to collection.
    """
    try:
        scan = await scan_service.confirm_scan(
            scan_id=scan_id,
            user_id=current_user.id,
            card_scryfall_id=confirm_data.card_scryfall_id,
            session=session,
            add_to_collection=confirm_data.add_to_collection,
            collection_id=confirm_data.collection_id,
            quantity=confirm_data.quantity,
            condition=confirm_data.condition
        )
        
        return await _scan_to_response(scan)
        
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Scan not found")


@router.post("/scans/{scan_id}/reject", response_model=ScanResponse)
async def reject_scan(
    scan_id: UUID,
    reject_data: ScanReject,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Reject a scan result.
    """
    try:
        scan = await scan_service.reject_scan(
            scan_id=scan_id,
            user_id=current_user.id,
            session=session,
            reason=reject_data.reason
        )
        
        return await _scan_to_response(scan)
        
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Scan not found")


@router.post("/scans/{scan_id}/reprocess", response_model=ScanResponse)
async def reprocess_scan(
    scan_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Reprocess a failed or rejected scan.
    """
    scan = await scan_service.get_scan(
        scan_id=scan_id,
        user_id=current_user.id,
        session=session
    )
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Reset status
    from app.models.scan import ScanStatus as ModelScanStatus
    scan.status = ModelScanStatus.PENDING
    await session.commit()
    
    # Queue for reprocessing
    from app.tasks.scan_tasks import process_scan
    process_scan.delay(str(scan_id))
    
    return await _scan_to_response(scan)


@router.delete("/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a scan and its associated images.
    """
    success = await scan_service.delete_scan(
        scan_id=scan_id,
        user_id=current_user.id,
        session=session
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Scan not found")


# ==================== Bulk Operations ====================

@router.post("/scans/confirm-batch", response_model=dict)
async def confirm_multiple_scans(
    confirm_data: BatchConfirm,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Confirm multiple scans at once (using their best matches).
    """
    confirmed = 0
    errors = []
    
    for scan_id in confirm_data.scan_ids:
        try:
            scan = await scan_service.get_scan(scan_id, current_user.id, session)
            if scan and scan.best_match_scryfall_id:
                await scan_service.confirm_scan(
                    scan_id=scan_id,
                    user_id=current_user.id,
                    card_scryfall_id=scan.best_match_scryfall_id,
                    session=session,
                    add_to_collection=confirm_data.add_to_collection,
                    collection_id=confirm_data.collection_id
                )
                confirmed += 1
            else:
                errors.append({"scan_id": str(scan_id), "error": "No match available"})
        except Exception as e:
            errors.append({"scan_id": str(scan_id), "error": str(e)})
    
    return {"confirmed": confirmed, "errors": errors}


@router.post("/scans/reject-batch", response_model=dict)
async def reject_multiple_scans(
    reject_data: BatchReject,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Reject multiple scans at once.
    """
    rejected = 0
    errors = []
    
    for scan_id in reject_data.scan_ids:
        try:
            await scan_service.reject_scan(
                scan_id=scan_id,
                user_id=current_user.id,
                session=session,
                reason=reject_data.reason
            )
            rejected += 1
        except Exception as e:
            errors.append({"scan_id": str(scan_id), "error": str(e)})
    
    return {"rejected": rejected, "errors": errors}


# ==================== Statistics ====================

@router.get("/stats", response_model=ScanStats)
async def get_scan_stats(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get scanning statistics for the current user.
    """
    stats = await scan_service.get_user_scan_stats(
        user_id=current_user.id,
        session=session
    )
    
    return ScanStats(**stats)


@router.get("/queue-status", response_model=ProcessingQueueStatus)
async def get_queue_status(
    current_user: User = Depends(get_current_user)
):
    """
    Get the current status of the processing queue.
    """
    from app.tasks.scan_tasks import get_queue_stats
    
    try:
        stats = get_queue_stats.delay().get(timeout=5)
        
        return ProcessingQueueStatus(
            queue_length=stats.get("pending", 0) + stats.get("processing", 0),
            active_workers=1,  # TODO: Get actual worker count
            estimated_wait_seconds=stats.get("pending", 0) * 2  # Rough estimate
        )
    except Exception:
        return ProcessingQueueStatus(queue_length=0, active_workers=0)


# ==================== Helpers ====================

async def _scan_to_response(scan) -> ScanResponse:
    """Convert Scan model to response with presigned URLs"""
    
    # Generate URLs
    thumbnail_url = None
    original_url = None
    
    if scan.thumbnail_key:
        try:
            thumbnail_url = await storage_service.get_presigned_url(scan.thumbnail_key)
        except Exception:
            pass
    
    if scan.original_image_key:
        try:
            original_url = await storage_service.get_presigned_url(scan.original_image_key)
        except Exception:
            pass
    
    # Convert detected cards
    detected_cards = []
    if scan.detected_cards:
        for dc in scan.detected_cards:
            detected_cards.append({
                "scryfall_id": dc.get("scryfall_id"),
                "name": dc.get("name"),
                "set_code": dc.get("set_code"),
                "collector_number": dc.get("collector_number"),
                "confidence": dc.get("confidence", 0),
                "image_uri": None
            })
    
    return ScanResponse(
        id=scan.id,
        batch_id=scan.batch_id,
        user_id=scan.user_id,
        status=ScanStatus(scan.status.value),
        thumbnail_url=thumbnail_url,
        original_url=original_url,
        image_width=scan.image_width,
        image_height=scan.image_height,
        detected_name=scan.detected_name,
        detected_set_code=scan.detected_set_code,
        best_match_scryfall_id=scan.best_match_scryfall_id,
        best_match_confidence=scan.best_match_confidence,
        detected_cards=detected_cards,
        bounding_box=scan.bounding_box,
        confirmed_card_id=scan.confirmed_card_id,
        added_to_collection=scan.added_to_collection,
        processing_time_ms=scan.processing_time_ms,
        created_at=scan.created_at,
        processed_at=scan.processed_at,
        confirmed_at=scan.confirmed_at,
        error_message=scan.error_message
    )


async def _scan_to_detail(scan) -> ScanDetail:
    """Convert Scan model to detailed response"""
    
    base_response = await _scan_to_response(scan)
    
    # Get card details if available
    best_match_card = None
    confirmed_card = None
    
    if scan.best_match_scryfall_id:
        # TODO: Fetch card details
        pass
    
    if scan.confirmed_card_id:
        # TODO: Fetch confirmed card details
        pass
    
    return ScanDetail(
        **base_response.model_dump(),
        extracted_text=scan.extracted_text,
        best_match_card=best_match_card,
        confirmed_card=confirmed_card
    )
