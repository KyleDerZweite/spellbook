from sqlalchemy import Column, String, Integer, Index
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class CardIndex(Base):
    """
    Lightweight card index for fast search functionality.
    
    This table contains essential card information that ships with the application
    and enables fast name-based searches. Full card details are fetched on-demand
    from the Scryfall API and cached in the main cards table.
    """
    __tablename__ = "cards_index"
    
    # Core identification
    scryfall_id = Column(UUID(as_uuid=True), primary_key=True)
    oracle_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    # Language - important for filtering to English-only results
    lang = Column(String(5), nullable=True, index=True, default='en')
    
    # Essential search fields
    name = Column(String(255), nullable=False, index=True)
    set_code = Column(String(10), nullable=True, index=True)
    collector_number = Column(String(20), nullable=True)
    
    # Basic game data
    mana_cost = Column(String(50), nullable=True)
    cmc = Column(Integer, nullable=True, index=True)
    type_line = Column(String(255), nullable=True, index=True)
    colors = Column(String(10), nullable=True, index=True)
    rarity = Column(String(20), nullable=True, index=True)
    
    # Visual
    image_url_small = Column(String(500), nullable=True)
    
    def __repr__(self):
        return f"<CardIndex(scryfall_id={self.scryfall_id}, name={self.name}, set={self.set_code})>"


# Create basic indexes for search performance
# Advanced full-text search indexes can be added later via SQL scripts
Index('idx_cards_index_composite_search', CardIndex.name, CardIndex.type_line, CardIndex.colors)