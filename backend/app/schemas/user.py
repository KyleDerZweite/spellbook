from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime
import uuid


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None


class UserCreate(UserBase):
    email: EmailStr
    username: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    preferences: Optional[Dict[str, Any]] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    is_admin: bool
    preferences: Dict[str, Any]
    created_at: datetime
    last_login_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserProfile(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    preferences: Dict[str, Any]
    created_at: datetime
    
    class Config:
        from_attributes = True