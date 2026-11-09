"""Read-only Deck appendix, keeping token references outside required quantities."""

from spellbook_core.mtg.catalog_tokens import TokenFacts
from spellbook_core.mtg.decks.models import DeckCard, Document


def related_tokens(cards: list[DeckCard], facts: dict[str, TokenFacts]) -> Document:
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
                item["sourceEntryIds"].append(card["id"])
    for identity in items.keys() & unresolved.keys():
        items[identity]["sourceEntryIds"].extend(unresolved.pop(identity)["sourceEntryIds"])
    for item in [*items.values(), *unresolved.values()]:
        item["sourceEntryIds"] = sorted(set(item["sourceEntryIds"]))
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
