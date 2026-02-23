
import enum
from sqlalchemy import Column, String, Boolean, DateTime, func, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


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
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    status = Column(Enum(UserStatus), default=UserStatus.APPROVED, nullable=False)
    
    # Suspension details
    suspension_reason = Column(String(500), nullable=True)
    suspended_at = Column(DateTime(timezone=True), nullable=True)
    suspended_by_id = Column(UUID(as_uuid=True), nullable=True)
    
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    preferences = Column(JSONB, default={}, nullable=False)

    __table_args__ = ({'extend_existing': True})
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, email={self.email})>"
