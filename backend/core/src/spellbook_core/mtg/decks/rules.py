"""Exact-first ownership allocation, legality warnings and Arena export formatting."""

import re
from collections.abc import Sequence

from spellbook_core.db import database_integer
from spellbook_core.mtg.decks.common import aggregate_quantity
from spellbook_core.mtg.decks.models import (
    Allocation,
    AvailabilityRequirement,
    DeckCard,
    OwnedPrinting,
)
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import js_trim

DECK_RULES_VERSION = "v1"
CONSTRUCTED_FORMATS = frozenset({"standard", "pioneer", "modern", "legacy", "vintage", "pauper"})
BASIC_LAND_NAMES = frozenset({"plains", "island", "swamp", "mountain", "forest", "wastes"})
_PARTNER_WITH_RE = re.compile(r"\bpartner with ([^\n(]+)", re.I)
_GENERIC_PARTNER_LINE_RE = re.compile(r"(?:^|\n)\s*partner(?:\s*\([^)]*\))?\s*(?:\n|$)", re.I)
_PARTNER_VARIANT_RE = re.compile(r"\bpartner(?:\s+with\b|\s*[\u2014\u2013-])", re.I)
_FRIENDS_FOREVER_RE = re.compile(r"\bfriends forever\b", re.I)
_CHOOSE_A_BACKGROUND_RE = re.compile(r"\bchoose a background\b", re.I)
_DOCTORS_COMPANION_RE = re.compile(r"\bdoctor['\u2019]s companion\b", re.I)
_CAN_BE_COMMANDER_RE = re.compile(r"\bcan be your commander\b", re.I)


def _card_key(card: CardDocument) -> str:
    return card["oracle_id"] or card["name"].lower()


def _front_type_line(card: CardDocument) -> str:
    return card["type_line"].split("//", 1)[0]


def _front_name(card: CardDocument) -> str:
    return card["name"].split("//", 1)[0].strip().lower()


def _has_type(type_line: str, token: str) -> bool:
    return bool(re.search(rf"\b{re.escape(token)}\b", type_line, re.I))


def _has_keyword(card: CardDocument, keyword: str) -> bool:
    return any(item.strip().lower() == keyword for item in card.get("keywords", ()))


def _is_legendary_creature(card: CardDocument) -> bool:
    front = _front_type_line(card)
    return _has_type(front, "Legendary") and _has_type(front, "Creature")


def _is_legendary_background(card: CardDocument) -> bool:
    front = _front_type_line(card)
    return _has_type(front, "Legendary") and _has_type(front, "Background")


def _is_eligible_primary_commander(card: CardDocument) -> bool:
    return _is_legendary_creature(card) or bool(
        _CAN_BE_COMMANDER_RE.search(card.get("oracle_text", ""))
    )


def _partner_with_target(card: CardDocument) -> str | None:
    match = _PARTNER_WITH_RE.search(card.get("oracle_text", ""))
    if not match:
        return None
    target = match[1].strip(" \t\r\n.,;").lower()
    return target or None


def _has_generic_partner(card: CardDocument) -> bool:
    oracle_text = card.get("oracle_text", "")
    if _GENERIC_PARTNER_LINE_RE.search(oracle_text):
        return True
    return _has_keyword(card, "partner") and not _PARTNER_VARIANT_RE.search(oracle_text)


def _has_friends_forever(card: CardDocument) -> bool:
    return _has_keyword(card, "friends forever") or bool(
        _FRIENDS_FOREVER_RE.search(card.get("oracle_text", ""))
    )


def _has_choose_a_background(card: CardDocument) -> bool:
    return _has_keyword(card, "choose a background") or bool(
        _CHOOSE_A_BACKGROUND_RE.search(card.get("oracle_text", ""))
    )


def _has_doctors_companion(card: CardDocument) -> bool:
    return (
        _has_keyword(card, "doctor's companion")
        or _has_keyword(card, "doctor\u2019s companion")
        or bool(_DOCTORS_COMPANION_RE.search(card.get("oracle_text", "")))
    )


def _is_time_lord_doctor(card: CardDocument) -> bool:
    front = _front_type_line(card)
    return (
        _is_legendary_creature(card)
        and _has_type(front, "Time Lord")
        and _has_type(front, "Doctor")
    )


def _is_background_pair(first: CardDocument, second: CardDocument) -> bool:
    return (_has_choose_a_background(first) and _is_legendary_background(second)) or (
        _has_choose_a_background(second) and _is_legendary_background(first)
    )


def _is_valid_commander_pair(first: CardDocument, second: CardDocument) -> bool:
    if _card_key(first) == _card_key(second):
        return False
    if _has_generic_partner(first) and _has_generic_partner(second):
        return True
    target_first = _partner_with_target(first)
    target_second = _partner_with_target(second)
    if (
        target_first
        and target_second
        and target_first in (second["name"].strip().lower(), _front_name(second))
        and target_second in (first["name"].strip().lower(), _front_name(first))
    ):
        return True
    if _has_friends_forever(first) and _has_friends_forever(second):
        return True
    if _is_background_pair(first, second):
        return True
    return (_has_doctors_companion(first) and _is_time_lord_doctor(second)) or (
        _has_doctors_companion(second) and _is_time_lord_doctor(first)
    )


def canonical_quantities(cards: Sequence[OwnedPrinting]) -> dict[str, int]:
    result: dict[str, int] = {}
    for card in cards:
        key = card["canonicalCardId"]
        result[key] = database_integer(result.get(key, 0) + aggregate_quantity(card["quantity"]))
    return result


def allocate_deck_availability(
    cards: Sequence[AvailabilityRequirement], inventory: Sequence[OwnedPrinting]
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
    constructed = normalized in CONSTRUCTED_FORMATS

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
            key = _card_key(card)
            previous, total = copies.get(key, (card, 0))
            copies[key] = previous, total + quantity
    for card, quantity in copies.values():
        legality = card.get("legalities", {}).get(normalized)
        basic = "Basic" in card["type_line"] or card["name"].lower() in BASIC_LAND_NAMES
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
        key = _card_key(card)
        if role == "maybeboard" or key in checked:
            continue
        checked.add(key)
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
        commander_entries = [
            (quantity, card)
            for quantity, role, card in lines
            if role == "commander" and quantity > 0
        ]
        commander_count = sum(quantity for quantity, _ in commander_entries)
        if commander_count not in (1, 2):
            warnings.append(
                dict(
                    code="commander_count",
                    message="Commander decks should have 1 or 2 commander cards.",
                )
            )
        commander_pair: tuple[CardDocument, CardDocument] | None = None
        if commander_count == 2:
            if len(commander_entries) == 1:
                commander_pair = (commander_entries[0][1], commander_entries[0][1])
            else:
                commander_pair = (commander_entries[0][1], commander_entries[1][1])
        valid_background_pair = commander_pair is not None and _is_background_pair(
            commander_pair[0], commander_pair[1]
        )
        checked_commanders: set[str] = set()
        for _, commander in commander_entries:
            key = _card_key(commander)
            if key in checked_commanders:
                continue
            checked_commanders.add(key)
            if not (
                _is_eligible_primary_commander(commander)
                or (valid_background_pair and _is_legendary_background(commander))
            ):
                warnings.append(
                    dict(
                        code="commander_ineligible",
                        message=f"{commander['name']} cannot be a commander.",
                        cardName=commander["name"],
                    )
                )
        if commander_pair is not None and not _is_valid_commander_pair(
            commander_pair[0], commander_pair[1]
        ):
            warnings.append(
                dict(
                    code="commander_invalid_pairing",
                    message=(
                        f"{commander_pair[0]['name']} and {commander_pair[1]['name']} "
                        "cannot be paired as commanders."
                    ),
                )
            )
        if commander_entries:
            allowed_identity = {
                color.upper()
                for _, commander in commander_entries
                for color in commander.get("color_identity", ())
                if color
            }
            checked_identity: set[str] = set()
            for _, role, card in lines:
                if role in ("maybeboard", "commander"):
                    continue
                key = _card_key(card)
                if key in checked_identity:
                    continue
                checked_identity.add(key)
                card_identity = {
                    color.upper() for color in card.get("color_identity", ()) if color
                }
                if not card_identity.issubset(allowed_identity):
                    warnings.append(
                        dict(
                            code="commander_color_identity",
                            message=f"{card['name']} is outside the commander's color identity.",
                            cardName=card["name"],
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
