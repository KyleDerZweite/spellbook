"""Derived token references do not alter Deck requirements or ownership."""

from typing import cast

from spellbook_core.mtg.catalog_tokens import token_facts_dto
from spellbook_core.mtg.decks.models import DeckCard
from spellbook_core.mtg.decks.tokens import adjust_token, merge_suggestions, related_tokens


def card(identity: str, printing: str) -> DeckCard:
    return cast(
        DeckCard, {"id": identity, "catalogCardId": printing, "role": "main", "quantity": 1}
    )


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


def test_suggestions_sum_per_source_and_exclude_sideboard() -> None:
    token = {"catalogCardId": "treasure", "name": "Treasure"}
    texts = [
        ("Create four Treasure tokens.", 3, "commander"),
        ("Whenever you attack, create a Treasure token.", 4, "main"),
        ("Create X Treasure tokens.", 2, "companion"),
        ("Investigate.", 5, "main"),
        ("Create ten Treasure tokens.", 8, "sideboard"),
    ]
    cards = [
        cast(DeckCard, dict(id=str(i), catalogCardId=str(i), quantity=copies, role=role))
        for i, (_, copies, role) in enumerate(texts)
    ]
    facts = {
        str(i): dict(items=[token], unresolved=[], oracleText=oracle)
        for i, (oracle, _, _) in enumerate(texts)
    }
    result = related_tokens(cards, facts)
    assert result["items"][0]["suggestedQuantity"] == 20
    assert result["items"][0]["sourceEntryIds"] == ["0", "1", "2", "3"]


def test_upkeep_and_face_names_match_repeatable_production_and_per_item_text_is_unclear() -> None:
    cases = [
        (
            "Faerie Rogue",
            [],
            "At the beginning of your upkeep, create a 1/1 Faerie Rogue token.",
            1,
            3,
        ),
        (
            "Virtuous Role // Wicked Role",
            [{"name": "Virtuous Role"}],
            "Whenever this creature attacks, create a Virtuous Role token.",
            2,
            6,
        ),
        (
            "Cat Beast",
            [],
            "Landfall — Whenever a land you control enters, choose one —\n"
            "• Create a 2/2 white Cat Beast creature token.\n"
            "• Put a +1/+1 counter on each creature you control.",
            1,
            3,
        ),
        (
            "Bear",
            [],
            "When this enters, choose one —\n"
            "• For each creature that died, create a Bear token.\n"
            "• Draw a card.",
            4,
            1,
        ),
        ("Pest", [], "Create twice X 1/1 black and green Pest creature tokens.", 4, 3),
        ("Bear", [], "When this enters, create a Bear token for each creature that died.", 4, 1),
    ]
    for name, faces, oracle, copies, expected in cases:
        producer = card("producer", "printing")
        producer["quantity"] = copies
        facts = {
            "printing": dict(
                items=[dict(catalogCardId="token", name=name, faces=faces)],
                unresolved=[],
                oracleText=oracle,
            )
        }
        assert related_tokens([producer], facts)["items"][0]["suggestedQuantity"] == expected


def test_missing_catalog_metadata_retains_per_source_estimates_and_negative_delta() -> None:
    cards = [card("a", "known"), card("b", "temporarily-missing")]
    metadata = dict(
        items=[dict(catalogCardId="token", name="Treasure")],
        unresolved=[],
        oracleText="Create three Treasure tokens.",
    )
    facts = {"known": metadata, "temporarily-missing": metadata}
    previous = adjust_token(
        related_tokens(cards, facts), dict(op="quantity", catalogCardId="token", quantity=4)
    )
    incomplete = merge_suggestions(previous, related_tokens(cards, {"known": metadata}))
    assert incomplete["items"][0]["sourceEntryIds"] == ["a", "b"]
    assert incomplete["items"][0]["effectiveQuantity"] == 4

    only_missing_source = merge_suggestions(incomplete, related_tokens([cards[1]], {}))
    token = only_missing_source["items"][0]
    assert token["sourceEntryIds"] == ["b"]
    assert token["suggestedQuantity"] == 3
    assert token["userDelta"] == -2
    assert token["effectiveQuantity"] == 1

    orphan = merge_suggestions(only_missing_source, related_tokens([], {}))["items"][0]
    assert orphan["userDelta"] == 0
    assert orphan["suggestedQuantity"] == 0
