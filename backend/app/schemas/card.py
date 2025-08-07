from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, date
import uuid


class CardSetBase(BaseModel):
    code: str
    name: str
    release_date: Optional[date] = None
    card_count: Optional[int] = None
    icon_url: Optional[str] = None


class CardSetResponse(CardSetBase):
    id: uuid.UUID
    metadata: Dict[str, Any] = {}
    
    class Config:
        from_attributes = True


class CardBase(BaseModel):
    name: str
    mana_cost: Optional[str] = None
    type_line: Optional[str] = None
    oracle_text: Optional[str] = None
    power: Optional[str] = None
    toughness: Optional[str] = None
    colors: Optional[str] = None
    color_identity: Optional[str] = None
    rarity: Optional[str] = None
    flavor_text: Optional[str] = None
    artist: Optional[str] = None


class CardCreate(CardBase):
    scryfall_id: Optional[uuid.UUID] = None
    oracle_id: Optional[uuid.UUID] = None
    set_id: Optional[uuid.UUID] = None
    collector_number: Optional[str] = None
    image_uris: Optional[Dict[str, Any]] = None
    prices: Optional[Dict[str, Any]] = None
    legalities: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class CardResponse(CardBase):
    id: uuid.UUID
    scryfall_id: Optional[uuid.UUID] = None
    oracle_id: Optional[uuid.UUID] = None
    collector_number: Optional[str] = None
    image_uris: Optional[Dict[str, Any]] = None
    prices: Optional[Dict[str, Any]] = None
    legalities: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict, alias='extra_data')
    created_at: datetime
    updated_at: datetime
    set: Optional[CardSetResponse] = None
    
    class Config:
        from_attributes = True
        populate_by_name = True


class CardSearchParams(BaseModel):
    q: Optional[str] = None
    colors: Optional[str] = None
    set: Optional[str] = None
    rarity: Optional[str] = None
    type: Optional[str] = None
    page: int = 1
    per_page: int = 20


class CardSearchResponse(BaseModel):
    data: List[CardResponse]
    meta: Dict[str, Any]