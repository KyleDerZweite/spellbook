from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, Numeric, Date, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
import enum


class CardCondition(enum.Enum):
    MINT = "mint"
    NEAR_MINT = "near_mint"
    LIGHTLY_PLAYED = "lightly_played"
    MODERATELY_PLAYED = "moderately_played"
    HEAVILY_PLAYED = "heavily_played"
    DAMAGED = "damaged"


class CardLanguage(enum.Enum):
    EN = "en"
    JA = "ja"
    FR = "fr"
    DE = "de"
    IT = "it"
    ES = "es"
    PT = "pt"
    RU = "ru"
    KO = "ko"
    ZH_CN = "zh-CN"
    ZH_TW = "zh-TW"


class UserCard(Base):
    __tablename__ = "user_cards"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(UUID(as_uuid=True), ForeignKey("cards.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    foil_quantity = Column(Integer, nullable=False, default=0)
    condition = Column(String(20), nullable=False, default="near_mint")
    language = Column(String(10), nullable=False, default="en")
    purchase_price = Column(Numeric(10, 2), nullable=True)
    purchase_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(ARRAY(Text), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Constraints
    __table_args__ = (
        CheckConstraint("quantity > 0", name="check_quantity_positive"),
        CheckConstraint("foil_quantity >= 0", name="check_foil_quantity_non_negative"),
    )
    
    # Relationships
    user = relationship("User", lazy="select")
    card = relationship("Card", back_populates="user_cards", lazy="select")
    
    def __repr__(self):
        return f"<UserCard(id={self.id}, user_id={self.user_id}, card_id={self.card_id}, quantity={self.quantity})>"


class Deck(Base):
    __tablename__ = "decks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    format = Column(String(50), nullable=True, index=True)
    colors = Column(String(10), nullable=True)
    is_public = Column(Boolean, default=False, nullable=False, index=True)
    tags = Column(ARRAY(Text), nullable=True)
    metadata = Column(JSONB, default={}, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", lazy="select")
    deck_cards = relationship("DeckCard", back_populates="deck", lazy="select", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Deck(id={self.id}, name={self.name}, user_id={self.user_id})>"


class DeckCard(Base):
    __tablename__ = "deck_cards"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deck_id = Column(UUID(as_uuid=True), ForeignKey("decks.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(UUID(as_uuid=True), ForeignKey("cards.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    is_commander = Column(Boolean, default=False, nullable=False)
    is_sideboard = Column(Boolean, default=False, nullable=False)
    is_maybeboard = Column(Boolean, default=False, nullable=False)
    category = Column(String(50), nullable=True)
    
    # Constraints
    __table_args__ = (
        CheckConstraint("quantity > 0", name="check_deck_card_quantity_positive"),
    )
    
    # Relationships
    deck = relationship("Deck", back_populates="deck_cards", lazy="select")
    card = relationship("Card", back_populates="deck_cards", lazy="select")
    
    def __repr__(self):
        return f"<DeckCard(id={self.id}, deck_id={self.deck_id}, card_id={self.card_id}, quantity={self.quantity})>"