
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from .card import CardResponse

class CollectionCardBase(BaseModel):
    card_scryfall_id: UUID
    quantity: int = 1
    condition: Optional[str] = None

class CollectionCardCreate(CollectionCardBase):
    pass

class CollectionCardUpdate(BaseModel):
    quantity: Optional[int] = None
    condition: Optional[str] = None

class CollectionCardResponse(CollectionCardBase):
    id: UUID
    card: CardResponse

    class Config:
        orm_mode = True

class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None

class CollectionCreate(CollectionBase):
    pass

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CollectionResponse(CollectionBase):
    id: UUID
    user_id: UUID
    cards: List[CollectionCardResponse] = []

    class Config:
        orm_mode = True
