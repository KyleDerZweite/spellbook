from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, TYPE_CHECKING
from datetime import datetime, date
import uuid

if TYPE_CHECKING:
    from app.models.card import Card


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


class CardResponseWithVersions(CardResponse):
    version_count: int
    
    @classmethod
    def from_card_with_versions(cls, card: "Card", version_count: int):
        """Create CardResponseWithVersions from a Card object with version count"""
        return cls(
            id=card.id,
            scryfall_id=card.scryfall_id,
            oracle_id=card.oracle_id,
            name=card.name,
            mana_cost=card.mana_cost,
            type_line=card.type_line,
            oracle_text=card.oracle_text,
            power=card.power,
            toughness=card.toughness,
            colors=card.colors,
            color_identity=card.color_identity,
            rarity=card.rarity,
            flavor_text=card.flavor_text,
            artist=card.artist,
            collector_number=card.collector_number,
            image_uris=card.image_uris,
            prices=card.prices,
            legalities=card.legalities,
            metadata=card.extra_data,
            created_at=card.created_at,
            updated_at=card.updated_at,
            set=card.set,
            version_count=version_count
        )


class CardSearchResponse(BaseModel):
    data: List[CardResponse]
    meta: Dict[str, Any]


class UniqueCardSearchResponse(BaseModel):
    data: List[CardResponseWithVersions]
    meta: Dict[str, Any]