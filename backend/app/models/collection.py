
from sqlalchemy import Column, String, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import uuid

class Collection(Base):
    __tablename__ = "collections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    user = relationship("User", back_populates="collections")
    cards = relationship("CollectionCard", back_populates="collection", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint('user_id', 'name', name='_user_collection_name_uc'),)

    def __repr__(self):
        return f"<Collection(id={self.id}, name='{self.name}', user_id={self.user_id})>"

class CollectionCard(Base):
    __tablename__ = "collection_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collection_id = Column(UUID(as_uuid=True), ForeignKey("collections.id"), nullable=False)
    card_scryfall_id = Column(UUID(as_uuid=True), ForeignKey("cards.scryfall_id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    condition = Column(String(50), nullable=True)

    collection = relationship("Collection", back_populates="cards")
    card = relationship("Card", back_populates="collection_cards")

    def __repr__(self):
        return f"<CollectionCard(id={self.id}, collection_id={self.collection_id}, card_scryfall_id={self.card_scryfall_id}, quantity={self.quantity})>"
