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
    assembled: bool
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


class AvailabilityRequirement(TypedDict):
    id: str
    catalogCardId: str
    canonicalCardId: str
    quantity: int


class AssembledDeckRequirement(AvailabilityRequirement):
    deckId: str
    deckName: str


class AssembledDeckShare(TypedDict):
    deckId: str
    deckName: str
    quantity: int


class DeckCard(CardIdentity):
    backFaceName: NotRequired[str]
    backFaceImageUri: NotRequired[str]
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
    free: int
    inOtherDecks: int
    conflict: int
    ownedCanonical: int
    assembledRequired: int
    sharedWith: list[AssembledDeckShare]


class DeckSnapshot(TypedDict):
    relatedTokens: Document
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
