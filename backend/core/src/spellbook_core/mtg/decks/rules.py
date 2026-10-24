"""Exact-first ownership allocation, legality warnings and Arena export formatting."""

import re
from collections.abc import Sequence

from spellbook_core.db import database_integer
from spellbook_core.mtg.decks.common import aggregate_quantity
from spellbook_core.mtg.decks.models import Allocation, DeckCard, OwnedPrinting
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import js_trim


def canonical_quantities(cards: Sequence[OwnedPrinting]) -> dict[str, int]:
    result: dict[str, int] = {}
    for card in cards:
        key = card["canonicalCardId"]
        result[key] = database_integer(result.get(key, 0) + aggregate_quantity(card["quantity"]))
    return result


def allocate_deck_availability(
    cards: Sequence[DeckCard], inventory: Sequence[OwnedPrinting]
) -> dict[str, Allocation]:
    remaining: dict[str, OwnedPrinting] = {}
    for card in inventory:
        printing = card["catalogCardId"]
        previous = remaining.get(printing)
        quantity = (previous["quantity"] if previous else 0) + card["quantity"]
        remaining[printing] = {**card, "quantity": quantity}
    ordered = sorted(cards, key=lambda card: card["id"])
    result: dict[str, Allocation] = {}
    for card in ordered:
        owned = remaining.get(card["catalogCardId"])
        exact = min(card["quantity"], owned["quantity"] if owned else 0)
        if owned:
            owned["quantity"] -= exact
        result[card["id"]] = Allocation(exact=exact, alternate=0, missing=card["quantity"] - exact)
    for card in ordered:
        allocation = result[card["id"]]
        for owned in remaining.values():
            if not allocation["missing"]:
                break
            if owned["canonicalCardId"] != card["canonicalCardId"]:
                continue
            alternate = min(allocation["missing"], owned["quantity"])
            owned["quantity"] -= alternate
            allocation["alternate"] += alternate
            allocation["missing"] -= alternate
    return result


def legality_warnings(
    lines: Sequence[tuple[int, str, CardDocument]], format: str = ""
) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    normalized = js_trim(format).lower()
    constructed = normalized in {"standard", "pioneer", "modern", "legacy", "vintage", "pauper"}

    def count(roles: tuple[str, ...]) -> int:
        return sum(quantity for quantity, role, _ in lines if role in roles)

    if constructed and count(("main",)) < 60:
        warnings.append(dict(code="main_under_60", message="Main deck has fewer than 60 cards."))
    if constructed and count(("sideboard", "companion")) > 15:
        warnings.append(
            dict(code="sideboard_over_15", message="Sideboard has more than 15 cards.")
        )
    included = (
        ("main", "commander") if normalized == "commander" else ("main", "sideboard", "companion")
    )
    copies: dict[str, tuple[CardDocument, int]] = {}
    for quantity, role, card in lines:
        if role in included:
            key = card["oracle_id"] or card["name"].lower()
            previous, total = copies.get(key, (card, 0))
            copies[key] = previous, total + quantity
    for card, quantity in copies.values():
        legality = card.get("legalities", {}).get(normalized)
        basic = "Basic" in card["type_line"] or card["name"].lower() in {
            "plains",
            "island",
            "swamp",
            "mountain",
            "forest",
            "wastes",
        }
        unlimited = re.search("deck can have any number of cards named", card["oracle_text"], re.I)
        limit = 1 if legality == "restricted" or normalized == "commander" else 4
        if match := re.search(
            "deck can have up to (seven|nine) cards named", card["oracle_text"], re.I
        ):
            limit = 7 if match[1].lower() == "seven" else 9
        if (
            (constructed or normalized == "commander")
            and not basic
            and not unlimited
            and quantity > limit
        ):
            code = (
                "restricted_copies"
                if legality == "restricted"
                else ("commander_singleton" if normalized == "commander" else "too_many_copies")
            )
            warnings.append(
                dict(
                    code=code,
                    message=f"{card['name']} exceeds the {limit}-copy limit in {format}.",
                    cardName=card["name"],
                )
            )
    checked: set[str] = set()
    for _, role, card in lines:
        if role == "maybeboard" or card["oracle_id"] in checked:
            continue
        checked.add(card["oracle_id"])
        legality = card.get("legalities", {}).get(normalized)
        if normalized and legality and legality not in ("legal", "restricted"):
            warnings.append(
                dict(
                    code="format_illegal",
                    message=f"{card['name']} is {legality} in {format}.",
                    cardName=card["name"],
                )
            )
    if normalized == "commander":
        if count(("main", "commander")) != 100:
            warnings.append(
                dict(
                    code="commander_size",
                    message=(
                        "Commander main deck and commanders should contain exactly 100 cards."
                    ),
                )
            )
        if count(("commander",)) not in (1, 2):
            warnings.append(
                dict(
                    code="commander_count",
                    message="Commander decks should have 1 or 2 commander cards.",
                )
            )
    return warnings


def format_arena_decklist(cards: Sequence[DeckCard], documents: dict[str, CardDocument]) -> str:
    chunks: list[str] = []
    for label, role in (
        ("Deck", "main"),
        ("Sideboard", "sideboard"),
        ("Commander", "commander"),
        ("Companion", "companion"),
    ):
        selected = [card for card in cards if card["role"] == role]
        if role != "main" and not selected:
            continue
        lines = [label]
        for card in selected:
            set_code = js_trim(card["setCode"])
            number = (
                js_trim(documents[card["catalogCardId"]]["collector_number"]) if documents else ""
            )
            suffix = f" ({set_code.upper()})" if set_code else ""
            if set_code and number:
                suffix += " " + number
            lines.append(f"{card['quantity']} {card['name']}{suffix}")
        chunks.append("\n".join(lines))
    return "\n\n".join(chunks) + "\n"
