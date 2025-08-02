from sqlalchemy import Column, String, Text, Integer, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class CardSet(Base):
    __tablename__ = "card_sets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    release_date = Column(Date, nullable=True)
    card_count = Column(Integer, nullable=True)
    icon_url = Column(String(500), nullable=True)
    metadata = Column(JSONB, default={}, nullable=False)
    
    # Relationships
    cards = relationship("Card", back_populates="set", lazy="select")
    
    def __repr__(self):
        return f"<CardSet(id={self.id}, code={self.code}, name={self.name})>"


class Card(Base):
    __tablename__ = "cards"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scryfall_id = Column(UUID(as_uuid=True), unique=True, nullable=True, index=True)
    oracle_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    set_id = Column(UUID(as_uuid=True), ForeignKey("card_sets.id"), nullable=True, index=True)
    collector_number = Column(String(20), nullable=True)
    mana_cost = Column(String(50), nullable=True)
    type_line = Column(String(255), nullable=True, index=True)
    oracle_text = Column(Text, nullable=True)
    power = Column(String(10), nullable=True)
    toughness = Column(String(10), nullable=True)
    colors = Column(String(10), nullable=True, index=True)
    color_identity = Column(String(10), nullable=True)
    rarity = Column(String(20), nullable=True, index=True)
    flavor_text = Column(Text, nullable=True)
    artist = Column(String(255), nullable=True)
    image_uris = Column(JSONB, nullable=True)
    prices = Column(JSONB, nullable=True)
    legalities = Column(JSONB, nullable=True)
    metadata = Column(JSONB, default={}, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    set = relationship("CardSet", back_populates="cards", lazy="select")
    user_cards = relationship("UserCard", back_populates="card", lazy="select")
    deck_cards = relationship("DeckCard", back_populates="card", lazy="select")
    
    def __repr__(self):
        return f"<Card(id={self.id}, name={self.name}, set_id={self.set_id})>"