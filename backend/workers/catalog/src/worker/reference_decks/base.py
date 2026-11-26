"""Core DeckSource protocol, shared format list, and decklist parser."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

# Central format list aligned with Catalog search legalities.
MTG_FORMATS: tuple[str, ...] = (
    "standard",
    "pioneer",
    "modern",
    "legacy",
    "vintage",
    "commander",
    "pauper",
    "brawl",
)

VALID_ROLES: frozenset[str] = frozenset({"main", "sideboard", "commander", "companion"})

_SECTION_HEADERS: dict[str, str] = {
    "deck": "main",
    "main": "main",
    "mainboard": "main",
    "maindeck": "main",
    "sideboard": "sideboard",
    "commander": "commander",
    "companion": "companion",
}

_METADATA_RE = re.compile(r"^(?://|#)\s*([A-Za-z][A-Za-z0-9_-]{0,31})\s*:\s*(.+?)\s*$")
_CARD_LINE_RE = re.compile(r"^(?:(SB)\s*:\s*)?(\d{1,4})\s*[xX]?\s+(.+?)\s*$")
_SET_SUFFIX_RE = re.compile(r"\s+\([A-Za-z0-9]{2,6}\)(?:\s+[A-Za-z0-9★-]+)?\s*$")
_BRACKET_SET_RE = re.compile(r"\s+\[[A-Za-z0-9]{2,6}\]\s*$")


@dataclass(frozen=True)
class RawDeckCard:
    name: str
    quantity: int
    role: str


@dataclass(frozen=True)
class RawReferenceDeck:
    source: str
    external_id: str
    name: str
    format: str
    cards: tuple[RawDeckCard, ...]
    archetype: str | None = None
    source_url: str | None = None
    meta_share: float | None = None
    source_updated_at: datetime | None = None


@dataclass(frozen=True)
class NormalizedDeckCard:
    oracle_id: str
    card_name: str
    quantity: int
    role: str


@dataclass(frozen=True)
class NormalizedReferenceDeck:
    source: str
    external_id: str
    name: str
    format: str
    cards: tuple[NormalizedDeckCard, ...]
    archetype: str | None = None
    source_url: str | None = None
    meta_share: float | None = None
    source_updated_at: datetime | None = None


class DeckSource(Protocol):
    source_id: str

    def supported_formats(self) -> frozenset[str]: ...

    def fetch_decks(self, formats: Sequence[str]) -> list[RawReferenceDeck]: ...


def parse_decklist_text(
    text: str,
    *,
    blank_line_starts_sideboard: bool = False,
) -> tuple[dict[str, str], tuple[RawDeckCard, ...]]:
    """Parse .dec / MTGO / Arena plain-text decklist into metadata and aggregated cards."""
    metadata: dict[str, str] = {}
    counts: dict[tuple[str, str], int] = {}
    role = "main"
    seen_main_cards = False
    explicit_sideboard = False

    for raw_line in text.lstrip("\ufeff").splitlines():
        line = raw_line.strip()
        if not line:
            if (
                blank_line_starts_sideboard
                and role == "main"
                and seen_main_cards
                and not explicit_sideboard
            ):
                role = "sideboard"
            continue

        if line.startswith("//") or line.startswith("#"):
            meta_match = _METADATA_RE.match(line)
            if meta_match:
                metadata[meta_match.group(1).lower()] = meta_match.group(2).strip()
            continue

        section_key = line.rstrip(":").strip().lower()
        if section_key in _SECTION_HEADERS:
            role = _SECTION_HEADERS[section_key]
            if role == "sideboard":
                explicit_sideboard = True
            continue

        card_match = _CARD_LINE_RE.match(line)
        if not card_match:
            continue

        sb_prefix, qty_text, card_name = card_match.groups()
        quantity = int(qty_text)
        if quantity < 1 or quantity > 1000:
            continue

        cleaned_name = _SET_SUFFIX_RE.sub("", card_name)
        cleaned_name = _BRACKET_SET_RE.sub("", cleaned_name).strip()
        if not cleaned_name:
            continue

        card_role = "sideboard" if sb_prefix else role
        if card_role == "main":
            seen_main_cards = True
        key = (cleaned_name, card_role)
        counts[key] = min(1000, counts.get(key, 0) + quantity)

    cards = tuple(
        RawDeckCard(name=name, quantity=qty, role=card_role)
        for (name, card_role), qty in counts.items()
    )
    return metadata, cards
