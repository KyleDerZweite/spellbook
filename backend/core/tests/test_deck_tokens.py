"""Derived token references do not alter Deck requirements or ownership."""

from typing import cast

from spellbook_core.mtg.catalog_tokens import token_facts_dto
from spellbook_core.mtg.decks.models import DeckCard
from spellbook_core.mtg.decks.tokens import related_tokens


def card(identity: str, printing: str) -> DeckCard:
    return cast(DeckCard, {"id": identity, "catalogCardId": printing})


def test_distinct_same_name_tokens_and_shared_producers_are_preserved() -> None:
    one = {"catalogCardId": "red-spirit", "name": "Spirit"}
    two = {"catalogCardId": "colorless-spirit", "name": "Spirit"}
    cards = [card("entry-a", "printing-a"), card("entry-b", "printing-b")]
    facts = {
        "printing-a": {"items": [one, two], "unresolved": []},
        "printing-b": {"items": [two], "unresolved": []},
    }
    result = related_tokens(cards, facts)
    assert result["status"] == "available"
    assert len(result["items"]) == 2
    assert next(t for t in result["items"] if t["catalogCardId"] == "colorless-spirit")[
        "sourceEntryIds"
    ] == ["entry-a", "entry-b"]
    assert not any("sourceEntryIds" in t for f in facts.values() for t in f["items"])
    assert all("quantity" not in t and "owned" not in t for t in result["items"])


def test_unknown_legacy_metadata_is_distinct_from_known_empty_references() -> None:
    cards = [card("a", "legacy"), card("b", "known")]
    assert related_tokens(cards, {})["status"] == "unavailable"
    result = related_tokens(cards, {"known": {"items": [], "unresolved": []}})
    assert result["status"] == "partial"
    assert result["unavailableEntryIds"] == ["a"]
    assert related_tokens([], {}) == dict(
        status="available", items=[], unresolved=[], unavailableEntryIds=[]
    )


def test_missing_source_targets_are_visible_and_do_not_hide_resolved_tokens() -> None:
    result = related_tokens(
        [card("a", "known")],
        {
            "known": {
                "items": [{"catalogCardId": "known-token", "name": "Beast"}],
                "unresolved": [{"catalogCardId": "missing-token", "name": "Spirit"}],
            }
        },
    )
    assert result["status"] == "partial"
    assert result["unresolved"] == [
        {"catalogCardId": "missing-token", "name": "Spirit", "sourceEntryIds": ["a"]}
    ]


def test_metadata_dto_never_relabels_absence_as_an_empty_list() -> None:
    assert token_facts_dto(None) is None
    assert token_facts_dto({}) is None
    assert token_facts_dto({"items": ["broken"], "unresolved": []}) is None
    assert token_facts_dto({"items": [], "unresolved": []}) == dict(items=[], unresolved=[])
