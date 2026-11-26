"""Unit tests for single/multi-deck missing-cards aggregation, formatting and bulk hints."""

import asyncio
from typing import cast
from unittest.mock import create_autospec

import pytest

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks import create_decks
from spellbook_core.mtg.decks.missing import (
    MissingDeckSummary,
    build_missing_cards_export,
    is_basic_land,
)
from spellbook_core.mtg.decks.models import DeckCard, Document, OwnedPrinting
from spellbook_core.mtg.models import CardDocument

DECK_A = "11111111-1111-4111-8111-111111111111"
DECK_B = "22222222-2222-4222-8222-222222222222"
SOL_CANON = "aaaa0000-0000-4000-8000-000000000001"
SOL_CMM = "aaaa0000-0000-4000-8000-000000000101"
SOL_C21 = "aaaa0000-0000-4000-8000-000000000102"
FOREST_CANON = "bbbb0000-0000-4000-8000-000000000002"
FOREST_FDN = "bbbb0000-0000-4000-8000-000000000201"
BOLT_CANON = "cccc0000-0000-4000-8000-000000000003"
BOLT_M10 = "cccc0000-0000-4000-8000-000000000301"
ACTOR = Actor("owner", "owner", "", "", "")


def _card(
    entry_id: str,
    deck_id: str,
    catalog_id: str,
    canonical_id: str,
    name: str,
    set_code: str,
    quantity: int,
) -> DeckCard:
    return cast(
        DeckCard,
        dict(
            id=entry_id,
            deckId=deck_id,
            accountId="owner",
            game="mtg",
            catalogCardId=catalog_id,
            canonicalCardId=canonical_id,
            name=name,
            setCode=set_code,
            imageUri="",
            quantity=quantity,
            role="main",
            createdAt="",
            updatedAt="",
        ),
    )


def _doc(
    printing_id: str,
    canonical_id: str,
    name: str,
    set_code: str,
    collector_number: str,
    type_line: str = "Artifact",
) -> CardDocument:
    return cast(
        CardDocument,
        dict(
            id=printing_id,
            oracle_id=canonical_id,
            name=name,
            set_code=set_code,
            collector_number=collector_number,
            image_uri="",
            type_line=type_line,
            oracle_text="",
            legalities={},
        ),
    )


def _known_eur(amount: str) -> Document:
    return dict(kind="Known", currency="EUR", amount=amount, freshness="Fresh")


def test_single_deck_canonical_and_printing_formats() -> None:
    deck_cards = [
        _card("e1", DECK_A, SOL_CMM, SOL_CANON, "Sol Ring", "cmm", 2),
        _card("e2", DECK_A, BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", 4),
    ]
    owned = [OwnedPrinting(catalogCardId=SOL_CMM, canonicalCardId=SOL_CANON, quantity=1)]
    docs = {
        SOL_CMM: _doc(SOL_CMM, SOL_CANON, "Sol Ring", "cmm", "410", "Artifact"),
        BOLT_M10: _doc(BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", "146", "Instant"),
    }

    canonical = build_missing_cards_export(
        [MissingDeckSummary(id=DECK_A, name="Burn")],
        [deck_cards],
        owned,
        mode="sum",
        include_printing=False,
        documents=docs,
    )
    assert canonical["totalMissingCopies"] == 5
    assert canonical["uniqueMissingCards"] == 2
    assert canonical["exports"]["cardmarket"] == "4 Lightning Bolt\n1 Sol Ring\n"
    assert canonical["exports"]["tcgplayer"] == "4 Lightning Bolt\n1 Sol Ring\n"
    assert canonical["exports"]["text"] == "4 Lightning Bolt\n1 Sol Ring\n"

    exact = build_missing_cards_export(
        [MissingDeckSummary(id=DECK_A, name="Burn")],
        [deck_cards],
        owned,
        mode="sum",
        include_printing=True,
        documents=docs,
    )
    assert exact["exports"]["cardmarket"] == "4 Lightning Bolt (M10)\n1 Sol Ring (CMM)\n"
    assert exact["exports"]["tcgplayer"] == "4 Lightning Bolt [M10] 146\n1 Sol Ring [CMM] 410\n"
    assert exact["exports"]["text"] == "4 Lightning Bolt (M10) 146\n1 Sol Ring (CMM) 410\n"


def test_multi_deck_sum_default_vs_max_share_mode() -> None:
    deck_a = [
        _card("a1", DECK_A, SOL_CMM, SOL_CANON, "Sol Ring", "cmm", 1),
        _card("a2", DECK_A, FOREST_FDN, FOREST_CANON, "Forest", "fdn", 12),
    ]
    deck_b = [
        _card("b1", DECK_B, SOL_C21, SOL_CANON, "Sol Ring", "c21", 1),
        _card("b2", DECK_B, FOREST_FDN, FOREST_CANON, "Forest", "fdn", 15),
    ]
    owned = [
        OwnedPrinting(catalogCardId=SOL_CMM, canonicalCardId=SOL_CANON, quantity=1),
        OwnedPrinting(catalogCardId=FOREST_FDN, canonicalCardId=FOREST_CANON, quantity=10),
    ]
    docs = {
        SOL_CMM: _doc(SOL_CMM, SOL_CANON, "Sol Ring", "cmm", "410", "Artifact"),
        SOL_C21: _doc(SOL_C21, SOL_CANON, "Sol Ring", "c21", "263", "Artifact"),
        FOREST_FDN: _doc(FOREST_FDN, FOREST_CANON, "Forest", "fdn", "281", "Basic Land — Forest"),
    }
    decks = [
        MissingDeckSummary(id=DECK_A, name="Deck A"),
        MissingDeckSummary(id=DECK_B, name="Deck B"),
    ]

    # Sum mode (default): needs 2 Sol Rings (owns 1 -> 1 missing) and 27 Forests (owns 10 -> 17).
    summed = build_missing_cards_export(
        decks, [deck_a, deck_b], owned, mode="sum", include_printing=False, documents=docs
    )
    assert [(i["name"], i["quantity"]) for i in summed["items"]] == [
        ("Forest", 17),
        ("Sol Ring", 1),
    ]
    assert summed["totalMissingCopies"] == 18
    assert summed["missingBasicLandCopies"] == 17
    assert summed["bulkHintEligible"] is True

    # Max mode (share across decks): Sol Ring max=1 (owned 1 -> 0 missing),
    # Forest max=15 (owned 10 -> 5 missing).
    shared = build_missing_cards_export(
        decks, [deck_a, deck_b], owned, mode="max", include_printing=False, documents=docs
    )
    assert [(i["name"], i["quantity"]) for i in shared["items"]] == [("Forest", 5)]
    assert shared["totalMissingCopies"] == 5
    assert shared["missingBasicLandCopies"] == 5
    assert shared["bulkHintEligible"] is False


def test_multi_deck_sum_with_zero_owned_doubles_staples() -> None:
    deck_a = [_card("a1", DECK_A, SOL_CMM, SOL_CANON, "Sol Ring", "cmm", 1)]
    deck_b = [_card("b1", DECK_B, SOL_C21, SOL_CANON, "Sol Ring", "c21", 1)]
    decks = [
        MissingDeckSummary(id=DECK_A, name="Deck A"),
        MissingDeckSummary(id=DECK_B, name="Deck B"),
    ]

    summed = build_missing_cards_export(decks, [deck_a, deck_b], [], mode="sum")
    assert summed["exports"]["cardmarket"] == "2 Sol Ring\n"

    shared = build_missing_cards_export(decks, [deck_a, deck_b], [], mode="max")
    assert shared["exports"]["cardmarket"] == "1 Sol Ring\n"


def test_bulk_hint_thresholds_basic_lands_and_budget_cards() -> None:
    decks = [MissingDeckSummary(id=DECK_A, name="Budget")]
    docs = {
        FOREST_FDN: _doc(FOREST_FDN, FOREST_CANON, "Forest", "fdn", "281", "Basic Land — Forest"),
        BOLT_M10: _doc(BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", "146", "Instant"),
    }

    # 9 basic lands -> below threshold
    nine_lands = build_missing_cards_export(
        decks,
        [[_card("e1", DECK_A, FOREST_FDN, FOREST_CANON, "Forest", "fdn", 9)]],
        [],
        documents=docs,
    )
    assert nine_lands["missingBasicLandCopies"] == 9
    assert nine_lands["bulkHintEligible"] is False

    # 10 basic lands -> eligible
    ten_lands = build_missing_cards_export(
        decks,
        [[_card("e1", DECK_A, FOREST_FDN, FOREST_CANON, "Forest", "fdn", 10)]],
        [],
        documents=docs,
    )
    assert ten_lands["missingBasicLandCopies"] == 10
    assert ten_lands["bulkHintEligible"] is True

    # 19 cards at 0.49 EUR -> below threshold
    nineteen_budget = build_missing_cards_export(
        decks,
        [[_card("e1", DECK_A, BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", 19)]],
        [],
        documents=docs,
        price_references={(BOLT_M10, "nonfoil"): _known_eur("0.49")},
    )
    assert nineteen_budget["missingBudgetCardCopies"] == 19
    assert nineteen_budget["bulkHintEligible"] is False

    # 20 cards at 0.49 EUR -> eligible
    twenty_budget = build_missing_cards_export(
        decks,
        [[_card("e1", DECK_A, BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", 20)]],
        [],
        documents=docs,
        price_references={(BOLT_M10, "nonfoil"): _known_eur("0.49")},
    )
    assert twenty_budget["missingBudgetCardCopies"] == 20
    assert twenty_budget["bulkHintEligible"] is True

    # 20 cards at exactly 0.50 EUR -> NOT under 0.50 EUR
    fifty_cents = build_missing_cards_export(
        decks,
        [[_card("e1", DECK_A, BOLT_M10, BOLT_CANON, "Lightning Bolt", "m10", 20)]],
        [],
        documents=docs,
        price_references={(BOLT_M10, "nonfoil"): _known_eur("0.50")},
    )
    assert fifty_cents["missingBudgetCardCopies"] == 0
    assert fifty_cents["bulkHintEligible"] is False


def test_basic_land_detection_fallback_and_printing_without_collector_number() -> None:
    assert is_basic_land("Plains") is True
    assert is_basic_land("Snow-Covered Island") is True
    assert is_basic_land("Custom Basic", "Basic Land — Swamp") is True
    assert is_basic_land("Sol Ring", "Artifact") is False

    result = build_missing_cards_export(
        [MissingDeckSummary(id=DECK_A, name="No Catalog")],
        [[_card("e1", DECK_A, SOL_CMM, SOL_CANON, "Sol Ring", "cmm", 1)]],
        [],
        include_printing=True,
        documents={},
    )
    assert result["exports"]["cardmarket"] == "1 Sol Ring (CMM)\n"
    assert result["exports"]["tcgplayer"] == "1 Sol Ring [CMM]\n"
    assert result["exports"]["text"] == "1 Sol Ring (CMM)\n"


def test_cardmarket_merges_same_set_variants_while_tcgplayer_and_text_keep_collector_numbers() -> (
    None
):
    forest_a = "bbbb0000-0000-4000-8000-000000000281"
    forest_b = "bbbb0000-0000-4000-8000-000000000282"
    deck_cards = [
        _card("e1", DECK_A, forest_a, FOREST_CANON, "Forest", "fdn", 2),
        _card("e2", DECK_A, forest_b, FOREST_CANON, "Forest", "fdn", 3),
    ]
    docs = {
        forest_a: _doc(forest_a, FOREST_CANON, "Forest", "fdn", "281", "Basic Land — Forest"),
        forest_b: _doc(forest_b, FOREST_CANON, "Forest", "fdn", "282", "Basic Land — Forest"),
    }
    exact = build_missing_cards_export(
        [MissingDeckSummary(id=DECK_A, name="Mono Green")],
        [deck_cards],
        [],
        include_printing=True,
        documents=docs,
    )
    assert exact["exports"]["cardmarket"] == "5 Forest (FDN)\n"
    assert exact["exports"]["tcgplayer"] == "2 Forest [FDN] 281\n3 Forest [FDN] 282\n"
    assert exact["exports"]["text"] == "2 Forest (FDN) 281\n3 Forest (FDN) 282\n"


def test_export_missing_cards_validates_inputs() -> None:
    decks = create_decks(
        create_autospec(ConnectionPool),
        create_autospec(Catalog),
        create_autospec(SessionAuth),
    )

    async def check() -> None:
        with pytest.raises(ValidationError):
            await decks.export_missing_cards(ACTOR, [])
        with pytest.raises(ValidationError):
            await decks.export_missing_cards(ACTOR, [DECK_A], mode="invalid")
        with pytest.raises(ValidationError):
            await decks.export_missing_cards(
                ACTOR,
                [DECK_A],
                include_printing="yes",  # type: ignore[arg-type]
            )
        with pytest.raises(ValidationError):
            await decks.export_missing_cards(
                ACTOR, [f"00000000-0000-4000-8000-{i:012d}" for i in range(51)]
            )

    asyncio.run(check())
