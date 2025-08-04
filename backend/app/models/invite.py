from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
import enum
from datetime import datetime, timedelta
import secrets


class InviteStatus(enum.Enum):
    PENDING = "pending"     # Invite sent, not yet used
    USED = "used"          # Invite has been used to register
    EXPIRED = "expired"    # Invite has expired
    REVOKED = "revoked"    # Invite has been revoked by admin


class Invite(Base):
    __tablename__ = "invites"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)  # Optional: restrict to specific email
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    used_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    
    status = Column(String(20), default=InviteStatus.PENDING.value, nullable=False, index=True)
    max_uses = Column(Integer, default=1, nullable=False)  # How many times this invite can be used
    uses_count = Column(Integer, default=0, nullable=False)  # How many times it has been used
    
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Optional expiration
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)  # When it was first used
    
    notes = Column(String(500), nullable=True)  # Optional notes about the invite
    
    # Relationships
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="select")
    used_by = relationship("User", foreign_keys=[used_by_id], lazy="select")
    
    def __repr__(self):
        return f"<Invite(id={self.id}, code={self.code}, status={self.status})>"
    
    @classmethod
    def generate_code(cls) -> str:
        """Generate a secure random invite code"""
        return secrets.token_urlsafe(24)  # 32 characters when base64 encoded
    
    def is_valid(self) -> bool:
        """Check if the invite is valid for use"""
        if self.status != InviteStatus.PENDING.value:
            return False
        
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        
        if self.uses_count >= self.max_uses:
            return False
        
        return True
    
    def is_expired(self) -> bool:
        """Check if the invite has expired"""
        return self.expires_at and datetime.utcnow() > self.expires_at
    
    def can_be_used_by_email(self, email: str) -> bool:
        """Check if the invite can be used by this email address"""
        if not self.email:  # No email restriction
            return True
        return self.email.lower() == email.lower()
    
    def mark_as_used(self, user_id: UUID):
        """Mark the invite as used by a user"""
        self.uses_count += 1
        if not self.used_by_id:  # First use
            self.used_by_id = user_id
            self.used_at = datetime.utcnow()
        
        if self.uses_count >= self.max_uses:
            self.status = InviteStatus.USED.value
        
        self.updated_at = datetime.utcnow()