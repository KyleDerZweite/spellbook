"""Deck DTOs and JSON operation boundaries shared by application and HTTP callers."""

from typing import Any, NotRequired, TypedDict

from spellbook_core.mtg.models import CardDocument

type Document = dict[str, Any]


class Deck(TypedDict):
    id: str
    accountId: str
    game: str
    name: str
    description: str
    format: str
    descriptionRevision: str
    compositionRevision: str
    createdAt: str
    updatedAt: str


class CardIdentity(TypedDict):
    catalogCardId: str
    canonicalCardId: str
    name: str
    setCode: str
    imageUri: str


class DeckCard(CardIdentity):
    id: str
    deckId: str
    accountId: str
    game: str
    quantity: int
    role: str
    createdAt: str
    updatedAt: str


class OwnedPrinting(TypedDict):
    catalogCardId: str
    canonicalCardId: str
    quantity: int


class Allocation(TypedDict):
    exact: int
    alternate: int
    missing: int


class DeckSnapshot(TypedDict):
    decks: list[Deck]
    deckTotals: dict[str, int]
    deckCovers: dict[str, dict[str, str]]
    deckCards: list[DeckCard]
    availability: dict[str, Allocation]
    valueEstimates: Document | None
    valuationError: dict[str, str] | None
    ownedByCanonical: dict[str, int]
    ownedPrintings: list[OwnedPrinting]


class Change(TypedDict):
    entryId: str
    catalogCardId: str
    role: str
    quantity: int
    delta: int


class DeckAcknowledgement(TypedDict):
    requestId: str
    deckId: str
    revision: str
    changes: list[Change]
    removedEntryIds: list[str]
    categoryDecisionRevision: NotRequired[str]
    categoryEntryIds: NotRequired[list[str]]


class DeckChoice(TypedDict):
    id: str
    name: str
    format: str


class DeckChoicePage(TypedDict):
    items: list[DeckChoice]
    nextOffset: int | None
    selected: DeckChoice | None


class DeckLegality(TypedDict):
    warnings: list[dict[str, str]]
    deckDocuments: dict[str, CardDocument]
