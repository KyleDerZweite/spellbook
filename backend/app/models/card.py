from sqlalchemy import Column, String, Text, Integer, Date, DateTime, ForeignKey, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
import enum


class CardStorageReason(enum.Enum):
    """Reasons why a card's full details are stored locally"""
    SEARCH_CACHE = "search_cache"        # Temporarily cached from search results
    USER_COLLECTION = "user_collection"  # Added to user's collection (permanent)
    DECK_USAGE = "deck_usage"            # Used in user's deck (permanent)
    ADMIN_IMPORT = "admin_import"        # Bulk imported by admin (permanent)


class CardSet(Base):
    __tablename__ = "card_sets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    release_date = Column(Date, nullable=True)
    card_count = Column(Integer, nullable=True)
    icon_url = Column(String(500), nullable=True)
    extra_data = Column(JSONB, default={}, nullable=False)
    
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
    extra_data = Column(JSONB, default={}, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Card caching and storage management
    storage_reason = Column(String(20), default=CardStorageReason.SEARCH_CACHE.value, nullable=False, index=True)
    permanent = Column(Boolean, default=False, nullable=False, index=True)
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_accessed = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    set = relationship("CardSet", back_populates="cards", lazy="select")
    user_cards = relationship("UserCard", back_populates="card", lazy="select")
    deck_cards = relationship("DeckCard", back_populates="card", lazy="select")
    
    def make_permanent(self, reason: CardStorageReason) -> None:
        """Mark this card as permanent storage for the given reason"""
        from datetime import datetime
        self.storage_reason = reason.value
        self.permanent = True
        self.last_accessed = datetime.utcnow()
    
    def update_access_time(self) -> None:
        """Update the last accessed timestamp"""
        from datetime import datetime
        self.last_accessed = datetime.utcnow()
    
    def is_cache_expired(self, days: int = 30) -> bool:
        """Check if cached card has expired (only applies to search cache)"""
        if self.permanent or self.storage_reason != CardStorageReason.SEARCH_CACHE.value:
            return False
        
        from datetime import datetime, timedelta
        expiry_date = self.cached_at + timedelta(days=days)
        return datetime.utcnow() > expiry_date
    
    def __repr__(self):
        return f"<Card(id={self.id}, name={self.name}, storage={self.storage_reason}, permanent={self.permanent})>"