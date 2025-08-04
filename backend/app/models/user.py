from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid
import enum


class UserStatus(enum.Enum):
    PENDING = "pending"      # Waiting for admin approval
    APPROVED = "approved"    # Approved and active
    REJECTED = "rejected"    # Application rejected
    SUSPENDED = "suspended"  # Account suspended


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), default=UserStatus.APPROVED.value, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    preferences = Column(JSONB, default={}, nullable=False)
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, email={self.email})>"