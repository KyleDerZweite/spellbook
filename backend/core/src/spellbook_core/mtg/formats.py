"""Central MTG format list shared across Catalog search and Reference decks."""

from typing import Literal

type MtgFormat = Literal[
    "standard",
    "pioneer",
    "modern",
    "legacy",
    "vintage",
    "commander",
    "pauper",
    "brawl",
]

MTG_FORMATS: tuple[MtgFormat, ...] = (
    "standard",
    "pioneer",
    "modern",
    "legacy",
    "vintage",
    "commander",
    "pauper",
    "brawl",
)
