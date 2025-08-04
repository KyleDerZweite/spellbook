from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID


class InviteCreate(BaseModel):
    """Schema for creating a new invite"""
    email: Optional[EmailStr] = Field(None, description="Optional: restrict invite to specific email")
    max_uses: int = Field(1, ge=1, le=100, description="Maximum number of times this invite can be used")
    expires_at: Optional[datetime] = Field(None, description="Optional: when the invite expires")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes about the invite")


class InviteUpdate(BaseModel):
    """Schema for updating an invite"""
    status: Optional[str] = Field(None, description="Update invite status (revoked, etc.)")
    notes: Optional[str] = Field(None, max_length=500, description="Update notes")


class InviteResponse(BaseModel):
    """Schema for invite response"""
    id: UUID
    code: str
    email: Optional[str]
    created_by_id: UUID
    used_by_id: Optional[UUID]
    status: str
    max_uses: int
    uses_count: int
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    used_at: Optional[datetime]
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class InviteListResponse(BaseModel):
    """Schema for paginated invite list"""
    invites: list[InviteResponse]
    total: int
    page: int
    size: int
    has_next: bool


class InviteValidation(BaseModel):
    """Schema for validating an invite"""
    code: str = Field(..., min_length=1, max_length=32, description="Invite code to validate")
    email: Optional[EmailStr] = Field(None, description="Email to check against invite restrictions")


class InviteValidationResponse(BaseModel):
    """Schema for invite validation response"""
    valid: bool
    code: str
    email_restricted: bool
    expires_at: Optional[datetime]
    uses_remaining: int
    error: Optional[str] = None