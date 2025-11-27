"""
Scan Schemas for Spellbook v2.0

Pydantic schemas for scan request/response validation.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum


class ScanStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    MANUAL_REVIEW = "manual_review"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class ScanBatchStatus(str, Enum):
    UPLOADING = "uploading"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


# ============== Bounding Box ==============

class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


# ============== Detected Card ==============

class DetectedCard(BaseModel):
    """A card detected in a scan with confidence score"""
    scryfall_id: UUID
    name: str
    set_code: str
    collector_number: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    image_uri: Optional[str] = None


# ============== Scan Batch ==============

class ScanBatchCreate(BaseModel):
    """Request to create a new scan batch"""
    name: Optional[str] = None
    description: Optional[str] = None
    auto_add_to_collection: bool = False
    target_collection_id: Optional[UUID] = None
    confidence_threshold: float = Field(default=0.85, ge=0.0, le=1.0)


class ScanBatchUpdate(BaseModel):
    """Update a scan batch"""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ScanBatchStatus] = None
    auto_add_to_collection: Optional[bool] = None
    target_collection_id: Optional[UUID] = None


class ScanBatchResponse(BaseModel):
    """Scan batch response"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    description: Optional[str] = None
    source: str
    status: ScanBatchStatus
    total_scans: int
    completed_scans: int
    failed_scans: int
    auto_add_to_collection: bool
    target_collection_id: Optional[UUID] = None
    confidence_threshold: float
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ScanBatchDetail(ScanBatchResponse):
    """Detailed batch response with scans"""
    scans: List["ScanResponse"] = []
    progress_percent: float = 0.0


# ============== Single Scan ==============

class ScanUpload(BaseModel):
    """Metadata for a single scan upload"""
    batch_id: Optional[UUID] = None
    auto_add_to_collection: bool = False
    target_collection_id: Optional[UUID] = None


class ScanResponse(BaseModel):
    """Single scan response"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    batch_id: Optional[UUID] = None
    user_id: UUID
    status: ScanStatus
    
    # Image info
    thumbnail_url: Optional[str] = None
    original_url: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    
    # Recognition results
    detected_name: Optional[str] = None
    detected_set_code: Optional[str] = None
    best_match_scryfall_id: Optional[UUID] = None
    best_match_confidence: Optional[float] = None
    detected_cards: List[DetectedCard] = []
    bounding_box: Optional[BoundingBox] = None
    
    # User actions
    confirmed_card_id: Optional[UUID] = None
    added_to_collection: bool = False
    
    # Timing
    processing_time_ms: Optional[int] = None
    created_at: datetime
    processed_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    
    # Error info
    error_message: Optional[str] = None


class ScanDetail(ScanResponse):
    """Detailed scan with full card info"""
    extracted_text: Optional[str] = None
    confirmed_card: Optional[Dict[str, Any]] = None
    best_match_card: Optional[Dict[str, Any]] = None


class ScanConfirm(BaseModel):
    """Request to confirm a scan result"""
    card_scryfall_id: UUID
    add_to_collection: bool = False
    collection_id: Optional[UUID] = None
    quantity: int = Field(default=1, ge=1)
    condition: Optional[str] = None


class ScanReject(BaseModel):
    """Request to reject a scan result"""
    reason: Optional[str] = None


# ============== Batch Operations ==============

class BatchConfirm(BaseModel):
    """Confirm multiple scans at once"""
    scan_ids: List[UUID]
    add_to_collection: bool = False
    collection_id: Optional[UUID] = None


class BatchReject(BaseModel):
    """Reject multiple scans at once"""
    scan_ids: List[UUID]
    reason: Optional[str] = None


# ============== Processing Stats ==============

class ScanStats(BaseModel):
    """Statistics for a user's scans"""
    total_scans: int = 0
    pending_scans: int = 0
    completed_scans: int = 0
    failed_scans: int = 0
    manual_review_scans: int = 0
    average_confidence: Optional[float] = None
    average_processing_time_ms: Optional[int] = None
    cards_added_to_collection: int = 0


class ProcessingQueueStatus(BaseModel):
    """Status of the processing queue"""
    queue_length: int = 0
    active_workers: int = 0
    estimated_wait_seconds: Optional[int] = None


# Update forward references
ScanBatchDetail.model_rebuild()
