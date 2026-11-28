"""Deck Token suggestions and persisted adjustments."""

import re
from collections.abc import Sequence

from psycopg.types.json import Jsonb

from spellbook_core.db import Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog_tokens import TokenFacts, read_transaction_token_facts
from spellbook_core.mtg.decks.models import DeckCard, Document, TokenSource

_NUMBERS = {
    word: number
    for number, word in enumerate(
        [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
            "twenty",
        ]
    )
} | {"a": 1, "an": 1, "another": 1}
_CREATE = re.compile(
    r"\bcreates?\s+((?:(?:twice|half|up to|exactly)\s+)?\w+)\s+"
    r"((?:(?!\bcreates?\b)[^.;])+?)\btokens?\b",
    re.I,
)


def suggested_quantity(oracle: str, token: Document, copies: int) -> int:
    names = [token["name"], *(face["name"] for face in token.get("faces", []))]
    name = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, names)) + r")(?!\w)", re.I)
    matches = []
    ability = ""
    for line in oracle.splitlines():
        modal_option = line.lstrip().startswith("•")
        if not modal_option:
            ability = line
        for match in _CREATE.finditer(line):
            if name.search(match[2]):
                prefix = line[: match.start()]
                if modal_option:
                    prefix = f"{ability} {prefix}"
                suffix = line[match.end() :].split(".", 1)[0]
                matches.append((match[1].lower(), prefix, suffix))
    if len(matches) != 1:
        return 1
    amount, prefix, suffix = matches[0]
    if amount.split()[-1] == "x":
        return 3
    if re.search(r"\bwhenever\b|^at the (?:beginning|end) of\b|^[^.:]+:", prefix, re.I):
        return min(3 * copies, 6)
    if re.search(r"\bfor each\b|\bequal to\b", f"{prefix} {suffix}", re.I):
        return 1
    number = (
        int((amount.lstrip("0") or "0")[:2])
        if amount.isascii() and amount.isdecimal()
        else _NUMBERS.get(amount)
    )
    return max(1, min(number * copies, 10)) if number is not None else 1


def related_tokens(
    cards: Sequence[DeckCard | TokenSource], facts: dict[str, TokenFacts]
) -> Document:
    cards = [card for card in cards if card["role"] in ("commander", "main", "companion")]
    items: dict[str, Document] = {}
    unresolved: dict[str, Document] = {}
    unavailable: set[str] = set()
    for card in cards:
        metadata = facts.get(card["catalogCardId"])
        if metadata is None:
            unavailable.add(card["id"])
            continue
        for field, destination in (("items", items), ("unresolved", unresolved)):
            for token in metadata[field]:
                identity = token["catalogCardId"]
                item = destination.setdefault(identity, {**token, "sourceEntryIds": []})
                if card["id"] in item["sourceEntryIds"]:
                    continue
                item["sourceEntryIds"].append(card["id"])
                if field == "items":
                    item.setdefault("sourceQuantities", {})[card["id"]] = suggested_quantity(
                        metadata.get("oracleText", ""), token, card["quantity"]
                    )
    for identity in items.keys() & unresolved.keys():
        for source in unresolved.pop(identity)["sourceEntryIds"]:
            items[identity]["sourceQuantities"].setdefault(source, 1)
    for item in items.values():
        update_suggestion(item)
    for item in unresolved.values():
        item["sourceEntryIds"].sort()
    status = (
        "unavailable"
        if cards and len(unavailable) == len(cards)
        else "partial"
        if unavailable or unresolved
        else "available"
    )
    return dict(
        status=status,
        items=sorted(
            items.values(), key=lambda item: (item["name"].casefold(), item["catalogCardId"])
        ),
        unresolved=sorted(
            unresolved.values(), key=lambda item: (item["name"].casefold(), item["catalogCardId"])
        ),
        unavailableEntryIds=sorted(unavailable),
    )


def update_suggestion(item: Document, delta: int = 0, included: bool = False) -> None:
    sources = item["sourceQuantities"]
    suggested = sum(sources.values())
    retained_delta = delta if suggested else max(0, delta)
    item.update(
        sourceEntryIds=sorted(sources),
        suggestedQuantity=suggested,
        userDelta=retained_delta,
        effectiveQuantity=max(0, suggested + retained_delta),
        includeWhenOrphaned=not suggested and included,
    )


def merge_suggestions(previous: Document, current: Document) -> Document:
    suggestions = {item["catalogCardId"]: item for item in current["items"]}
    unresolved = {item["catalogCardId"]: item for item in current["unresolved"]}
    unavailable = set(current["unavailableEntryIds"])
    for old in previous["items"]:
        identity = old["catalogCardId"]
        unknown_sources = unavailable.union(unresolved.get(identity, {}).get("sourceEntryIds", []))
        item = suggestions.setdefault(identity, {**old, "sourceQuantities": {}})
        for source in old["sourceQuantities"].keys() & unknown_sources:
            item["sourceQuantities"][source] = old["sourceQuantities"][source]
        update_suggestion(item, old["userDelta"], old["includeWhenOrphaned"])
    return {
        **current,
        "items": sorted(
            suggestions.values(), key=lambda item: (item["name"].casefold(), item["catalogCardId"])
        ),
    }


def token_snapshot(tokens: Document) -> Document:
    return {
        **tokens,
        "items": [
            {key: value for key, value in item.items() if key != "sourceQuantities"}
            for item in tokens["items"]
        ],
    }


async def calculate_tokens(tx: Transaction, cards: Sequence[DeckCard | TokenSource]) -> Document:
    participants = [card for card in cards if card["role"] in ("commander", "main", "companion")]
    return related_tokens(
        participants,
        await read_transaction_token_facts(tx, [card["catalogCardId"] for card in participants]),
    )


def adjust_token(tokens: Document, action: Document) -> Document:
    identity = action.get("catalogCardId")
    item = next((item for item in tokens["items"] if item["catalogCardId"] == identity), None)
    if item is None:
        raise ValidationError("Deck Token not found")
    suggested = item["suggestedQuantity"]
    operation = action.get("op")
    if operation == "remove" and not suggested:
        tokens["items"].remove(item)
    elif operation == "include" and not suggested and type(action.get("included")) is bool:
        item["includeWhenOrphaned"] = action["included"]
    elif operation == "reset":
        item.update(userDelta=0, effectiveQuantity=suggested)
    elif operation == "quantity":
        desired = action.get("quantity")
        if type(desired) is not int or not 0 <= desired <= 2_147_483_647:
            raise ValidationError("Invalid Deck Token quantity")
        item.update(userDelta=desired - suggested, effectiveQuantity=desired)
    else:
        raise ValidationError("Invalid Deck Token action")
    return tokens


async def save_tokens(tx: Transaction, deck_id: str, tokens: Document) -> None:
    await tx.execute(
        "UPDATE decks SET deck_tokens=%s WHERE id=%s::uuid",
        (Jsonb(tokens), deck_id),
    )
