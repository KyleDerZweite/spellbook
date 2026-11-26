"""Reference deck ingestion and DeckSource abstractions for the catalog worker."""

from worker.reference_decks.base import (
    MTG_FORMATS,
    VALID_ROLES,
    DeckSource,
    NormalizedDeckCard,
    NormalizedReferenceDeck,
    RawDeckCard,
    RawReferenceDeck,
    parse_decklist_text,
)
from worker.reference_decks.local_dec import LocalDecDeckSource
from worker.reference_decks.mtggoldfish import MTGGoldfishDeckSource
from worker.reference_decks.publisher import ReferenceDeckPublisher
from worker.reference_decks.sync import (
    AVAILABLE_REFERENCE_DECK_SOURCES,
    build_deck_source,
    sync_reference_decks,
)

__all__ = [
    "AVAILABLE_REFERENCE_DECK_SOURCES",
    "MTG_FORMATS",
    "VALID_ROLES",
    "DeckSource",
    "LocalDecDeckSource",
    "MTGGoldfishDeckSource",
    "NormalizedDeckCard",
    "NormalizedReferenceDeck",
    "RawDeckCard",
    "RawReferenceDeck",
    "ReferenceDeckPublisher",
    "build_deck_source",
    "parse_decklist_text",
    "sync_reference_decks",
]
