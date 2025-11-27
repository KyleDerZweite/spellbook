"""
Scan Models for Spellbook v2.0

These models handle card scanning jobs, including batch scanning from mobile devices.
"""

import enum
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class ScanStatus(enum.Enum):
    """Status of a scan job"""
    PENDING = "pending"          # Uploaded, waiting to be processed
    PROCESSING = "processing"    # Currently being analyzed
    COMPLETED = "completed"      # Successfully identified
    FAILED = "failed"           # Could not process image
    MANUAL_REVIEW = "manual_review"  # Low confidence, needs human review
    CONFIRMED = "confirmed"     # User confirmed the result
    REJECTED = "rejected"       # User rejected the result


class ScanBatchStatus(enum.Enum):
    """Status of a batch scan job"""
    UPLOADING = "uploading"     # Still receiving images
    QUEUED = "queued"           # All images received, waiting for processing
    PROCESSING = "processing"   # Being processed
    COMPLETED = "completed"     # All scans done
    PARTIAL = "partial"         # Some scans failed
    FAILED = "failed"           # Batch processing failed


class ScanBatch(Base):
    """
    A batch of card scans, typically from a mobile scanning session.
    Groups multiple scans together for easier management.
    """
    __tablename__ = "scan_batches"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Batch metadata
    name = Column(String(255), nullable=True)  # Optional user-provided name
    description = Column(Text, nullable=True)
    source = Column(String(50), default="mobile")  # mobile, web, import
    device_info = Column(JSONB, default={})  # Device metadata from mobile app
    
    # Status tracking
    status = Column(Enum(ScanBatchStatus), default=ScanBatchStatus.UPLOADING, nullable=False, index=True)
    total_scans = Column(Integer, default=0)
    completed_scans = Column(Integer, default=0)
    failed_scans = Column(Integer, default=0)
    
    # Settings for this batch
    auto_add_to_collection = Column(Boolean, default=False)
    target_collection_id = Column(UUID(as_uuid=True), ForeignKey("collections.id"), nullable=True)
    confidence_threshold = Column(Float, default=0.85)  # Min confidence to auto-confirm
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)  # When processing started
    completed_at = Column(DateTime(timezone=True), nullable=True)  # When processing finished
    
    # Relationships
    user = relationship("User", backref="scan_batches")
    scans = relationship("Scan", back_populates="batch", cascade="all, delete-orphan")
    target_collection = relationship("Collection", foreign_keys=[target_collection_id])
    
    def __repr__(self):
        return f"<ScanBatch(id={self.id}, user_id={self.user_id}, status={self.status.value}, total={self.total_scans})>"


class Scan(Base):
    """
    Individual card scan with image and recognition results.
    """
    __tablename__ = "scans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("scan_batches.id"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Image storage
    original_image_key = Column(String(500), nullable=False)  # S3/MinIO key for original
    processed_image_key = Column(String(500), nullable=True)  # Processed/cropped image
    thumbnail_key = Column(String(500), nullable=True)  # Thumbnail for quick preview
    
    # Image metadata
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    file_size = Column(Integer, nullable=True)  # In bytes
    mime_type = Column(String(50), nullable=True)
    
    # Status
    status = Column(Enum(ScanStatus), default=ScanStatus.PENDING, nullable=False, index=True)
    processing_attempts = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # Recognition results
    detected_cards = Column(JSONB, default=[])  # List of detected cards with confidence
    best_match_scryfall_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    best_match_confidence = Column(Float, nullable=True)
    
    # OCR results
    extracted_text = Column(Text, nullable=True)  # Raw OCR text
    detected_name = Column(String(255), nullable=True)
    detected_set_code = Column(String(20), nullable=True)
    detected_collector_number = Column(String(20), nullable=True)
    
    # Bounding box for detected card in image
    bounding_box = Column(JSONB, nullable=True)  # {x, y, width, height}
    
    # User confirmation
    confirmed_card_id = Column(UUID(as_uuid=True), ForeignKey("cards.scryfall_id"), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    added_to_collection = Column(Boolean, default=False)
    collection_card_id = Column(UUID(as_uuid=True), nullable=True)  # Link to CollectionCard if added
    
    # Processing metrics
    processing_time_ms = Column(Integer, nullable=True)  # How long processing took
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    batch = relationship("ScanBatch", back_populates="scans")
    user = relationship("User", backref="scans")
    confirmed_card = relationship("Card", foreign_keys=[confirmed_card_id])
    
    def __repr__(self):
        return f"<Scan(id={self.id}, status={self.status.value}, match={self.detected_name})>"
    
    def mark_processing(self):
        """Mark scan as being processed"""
        from datetime import datetime
        self.status = ScanStatus.PROCESSING
        self.processing_attempts += 1
        self.updated_at = datetime.utcnow()
    
    def mark_completed(self, best_match_id: uuid.UUID, confidence: float, detected_cards: list):
        """Mark scan as successfully processed"""
        from datetime import datetime
        self.status = ScanStatus.COMPLETED if confidence >= 0.85 else ScanStatus.MANUAL_REVIEW
        self.best_match_scryfall_id = best_match_id
        self.best_match_confidence = confidence
        self.detected_cards = detected_cards
        self.processed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def mark_failed(self, error: str):
        """Mark scan as failed"""
        from datetime import datetime
        self.status = ScanStatus.FAILED
        self.error_message = error
        self.updated_at = datetime.utcnow()
    
    def confirm(self, card_scryfall_id: uuid.UUID):
        """User confirms the detected card"""
        from datetime import datetime
        self.status = ScanStatus.CONFIRMED
        self.confirmed_card_id = card_scryfall_id
        self.confirmed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()


class ScanHistory(Base):
    """
    Audit log for scan operations - tracks all changes to scans.
    """
    __tablename__ = "scan_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    action = Column(String(50), nullable=False)  # created, processed, confirmed, rejected, etc.
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    details = Column(JSONB, default={})
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<ScanHistory(scan_id={self.scan_id}, action={self.action})>"
