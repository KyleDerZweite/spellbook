from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
import uuid
from .card import CardResponse


class UserCardBase(BaseModel):
    quantity: int = 1
    foil_quantity: int = 0
    condition: str = "near_mint"
    language: str = "en"
    purchase_price: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    
    @validator('quantity')
    def quantity_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v
    
    @validator('foil_quantity')
    def foil_quantity_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Foil quantity must be non-negative')
        return v


class UserCardCreate(UserCardBase):
    card_id: uuid.UUID


class UserCardUpdate(BaseModel):
    quantity: Optional[int] = None
    foil_quantity: Optional[int] = None
    condition: Optional[str] = None
    language: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class UserCardResponse(UserCardBase):
    id: uuid.UUID
    user_id: uuid.UUID
    card: CardResponse
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CollectionStats(BaseModel):
    total_cards: int
    unique_cards: int
    total_value: Decimal
    sets_collected: int
    rarity_breakdown: Dict[str, int]
    color_breakdown: Dict[str, int]


class DeckBase(BaseModel):
    name: str
    description: Optional[str] = None
    format: Optional[str] = None
    colors: Optional[str] = None
    is_public: bool = False
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class DeckCreate(DeckBase):
    pass


class DeckUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    format: Optional[str] = None
    colors: Optional[str] = None
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class DeckCardBase(BaseModel):
    quantity: int = 1
    is_commander: bool = False
    is_sideboard: bool = False
    is_maybeboard: bool = False
    category: Optional[str] = None


class DeckCardCreate(DeckCardBase):
    card_id: uuid.UUID


class DeckCardResponse(DeckCardBase):
    id: uuid.UUID
    deck_id: uuid.UUID
    card: CardResponse
    
    class Config:
        from_attributes = True


class DeckResponse(DeckBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    cards: Optional[List[DeckCardResponse]] = None
    
    class Config:
        from_attributes = True


class DeckListResponse(BaseModel):
    id: uuid.UUID
    name: str
    format: Optional[str] = None
    colors: Optional[str] = None
    tags: Optional[List[str]] = None
    card_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True