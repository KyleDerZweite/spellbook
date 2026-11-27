"""Unit tests for SuperBrew Reference deck discovery and copy-to-library."""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.decks.application import Decks
from spellbook_core.mtg.decks.discovery import (
    ReferenceDeckCandidate,
    rank_discovery_candidates,
)
from spellbook_core.mtg.decks.models import Document

ORACLE_A = "11111111-1111-4111-8111-111111111111"
ORACLE_B = "22222222-2222-4222-8222-222222222222"
ORACLE_C = "33333333-3333-4333-8333-333333333333"
PRINT_A = "aaaa1111-1111-4111-8111-111111111111"
PRINT_B = "bbbb2222-2222-4222-8222-222222222222"
PRINT_C = "cccc3333-3333-4333-8333-333333333333"
DECK_1 = "dddd1111-1111-4111-8111-111111111111"
DECK_2 = "dddd2222-2222-4222-8222-222222222222"
DECK_3 = "dddd3333-3333-4333-8333-333333333333"


def _candidate(
    deck_id: str,
    name: str,
    cards: list[tuple[str, int]],
    *,
    meta_share: float | None = 5.0,
) -> ReferenceDeckCandidate:
    return {
        "id": deck_id,
        "source": "mtggoldfish",
        "externalId": f"ext-{deck_id[:4]}",
        "name": name,
        "format": "modern",
        "archetype": "Aggro",
        "sourceUrl": "https://example.test/deck",
        "metaShare": meta_share,
        "sourceUpdatedAt": "2026-11-20T00:00:00Z",
        "syncedAt": "2026-11-25T12:00:00Z",
        "coverImageUri": "https://cards.scryfall.io/art_crop/front/a/a/test.jpg",
        "cards": cards,
    }


def _known(amount: str, *, stale: bool = False) -> Document:
    return {"kind": "Known", "amount": amount, "freshness": "Stale" if stale else "Fresh"}


def test_rank_discovery_matches_canonical_cards_across_roles_and_prices_missing() -> None:
    candidates = [
        # Card A appears in both main (2) and sideboard (2) => 4 total required.
        _candidate(DECK_1, "Boros Energy", [(ORACLE_A, 2), (ORACLE_A, 2), (ORACLE_B, 4)]),
        _candidate(DECK_2, "Mono Red Burn", [(ORACLE_A, 4), (ORACLE_C, 4)]),
    ]
    owned = {ORACLE_A: 3, ORACLE_B: 4}
    oracle_to_printing = {ORACLE_A: PRINT_A, ORACLE_B: PRINT_B, ORACLE_C: PRINT_C}
    prices: dict[tuple[str, str], Document] = {
        (PRINT_A, "nonfoil"): _known("2.50"),
        (PRINT_B, "nonfoil"): _known("10.00"),
        (PRINT_C, "nonfoil"): {"kind": "Unknown"},
    }

    ranked = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        sort="missing_cost:asc",
    )

    assert [d["id"] for d in ranked] == [DECK_1, DECK_2]

    first = ranked[0]
    assert first["cardCount"] == 8
    assert first["uniqueCardCount"] == 2
    assert first["ownedCards"] == 7
    assert first["missingCards"] == 1
    assert first["ownershipPercent"] == 87.5
    assert first["missingValue"]["coveredValue"] == "2.50"
    assert first["missingValue"]["coveredQuantity"] == 1
    assert first["missingValue"]["unknownQuantity"] == 0
    assert first["missingValue"]["complete"] is True

    second = ranked[1]
    assert second["ownedCards"] == 3
    assert second["missingCards"] == 5
    assert second["ownershipPercent"] == 37.5
    assert second["missingValue"]["coveredValue"] == "2.50"
    assert second["missingValue"]["coveredQuantity"] == 1
    assert second["missingValue"]["unknownQuantity"] == 4
    assert second["missingValue"]["complete"] is False


def test_rank_discovery_free_mode_subtracts_assembled_deck_claims() -> None:
    candidates = [_candidate(DECK_1, "Test Deck", [(ORACLE_A, 4), (ORACLE_B, 4)])]
    owned = {ORACLE_A: 4, ORACLE_B: 2}
    claimed = {ORACLE_A: 3, ORACLE_B: 5}  # over-claimed B floors at 0
    oracle_to_printing = {ORACLE_A: PRINT_A, ORACLE_B: PRINT_B}
    prices = {
        (PRINT_A, "nonfoil"): _known("5.00"),
        (PRINT_B, "nonfoil"): _known("1.00"),
    }

    all_mode = rank_discovery_candidates(
        candidates,
        owned,
        claimed_by_oracle=claimed,
        inventory_mode="all",
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
    )
    free_mode = rank_discovery_candidates(
        candidates,
        owned,
        claimed_by_oracle=claimed,
        inventory_mode="free",
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
    )

    assert all_mode[0]["ownedCards"] == 6
    assert all_mode[0]["missingCards"] == 2
    assert all_mode[0]["missingValue"]["coveredValue"] == "2.00"

    assert free_mode[0]["ownedCards"] == 1
    assert free_mode[0]["missingCards"] == 7
    assert free_mode[0]["missingValue"]["coveredValue"] == "19.00"


def test_rank_discovery_budget_and_ownership_filters_and_sorting() -> None:
    candidates = [
        _candidate(DECK_1, "Complete Deck", [(ORACLE_A, 4)], meta_share=2.0),
        _candidate(DECK_2, "Budget Deck", [(ORACLE_A, 2), (ORACLE_B, 2)], meta_share=10.0),
        _candidate(DECK_3, "Unpriced Deck", [(ORACLE_C, 4)], meta_share=20.0),
    ]
    owned = {ORACLE_A: 4}
    oracle_to_printing = {ORACLE_A: PRINT_A, ORACLE_B: PRINT_B, ORACLE_C: PRINT_C}
    prices: dict[tuple[str, str], Document] = {
        (PRINT_A, "nonfoil"): _known("1.00"),
        (PRINT_B, "nonfoil"): _known("12.50"),
        (PRINT_C, "nonfoil"): {"kind": "Unknown"},
    }

    # Budget filter <= 30 EUR includes complete (0 EUR) and budget (25 EUR), excludes unpriced
    under_30 = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        max_missing_cost=30.0,
    )
    assert [d["id"] for d in under_30] == [DECK_1, DECK_2]

    # Budget filter <= 10 EUR keeps only complete deck
    under_10 = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        max_missing_cost=10.0,
    )
    assert [d["id"] for d in under_10] == [DECK_1]

    # min_ownership >= 50 excludes unpriced (0%)
    owned_50 = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        min_ownership=50.0,
        sort="ownership:desc",
    )
    assert [d["id"] for d in owned_50] == [DECK_1, DECK_2]

    # meta_share:desc puts Unpriced Deck (20%) first
    by_meta = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        sort="meta_share:desc",
    )
    assert [d["id"] for d in by_meta] == [DECK_3, DECK_2, DECK_1]

    # missing_cost:asc puts unpriced deck last
    by_cost = rank_discovery_candidates(
        candidates,
        owned,
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        sort="missing_cost:asc",
    )
    assert [d["id"] for d in by_cost] == [DECK_1, DECK_2, DECK_3]


def test_discover_reference_decks_validates_inputs() -> None:
    auth = MagicMock()
    auth.require_actor = AsyncMock(return_value=MagicMock(account_id="acc-1"))
    decks = Decks(MagicMock(), MagicMock(), auth, MagicMock())
    actor = Actor("acc-1", "test", "", "", "")

    async def _run() -> None:
        with pytest.raises(ValidationError, match="limit"):
            await decks.discover_reference_decks(actor, limit=0)
        with pytest.raises(ValidationError, match="offset"):
            await decks.discover_reference_decks(actor, offset=-1)
        with pytest.raises(ValidationError, match="inventoryMode"):
            await decks.discover_reference_decks(actor, inventory_mode="invalid")
        with pytest.raises(ValidationError, match="sort"):
            await decks.discover_reference_decks(actor, sort="invalid")
        with pytest.raises(ValidationError, match="maxMissingCost"):
            await decks.discover_reference_decks(actor, max_missing_cost=-5.0)
        with pytest.raises(ValidationError, match="maxMissingCost"):
            await decks.discover_reference_decks(actor, max_missing_cost=float("nan"))
        with pytest.raises(ValidationError, match="minOwnership"):
            await decks.discover_reference_decks(actor, min_ownership=101.0)
        with pytest.raises(ValidationError, match="format"):
            await decks.discover_reference_decks(actor, format="not-a-format")

    asyncio.run(_run())


def test_copy_description_and_stale_prices_tracked() -> None:
    candidates = [_candidate(DECK_1, "Stale Deck", [(ORACLE_A, 2)])]
    ranked = rank_discovery_candidates(
        candidates,
        {},
        oracle_to_printing={ORACLE_A: PRINT_A},
        price_references={(PRINT_A, "nonfoil"): _known("4.00", stale=True)},
    )
    assert ranked[0]["missingValue"]["coveredValue"] == "8.00"
    assert ranked[0]["missingValue"]["staleQuantity"] == 2
    assert ranked[0]["missingValue"]["complete"] is True
    assert datetime.fromisoformat(ranked[0]["syncedAt"].replace("Z", "+00:00")).tzinfo == UTC


def test_budget_filter_excludes_partially_priced_decks_but_unfiltered_retains_them() -> None:
    candidates = [
        _candidate(DECK_1, "Partial Priced", [(ORACLE_A, 1), (ORACLE_C, 3)]),
        _candidate(DECK_2, "Fully Priced", [(ORACLE_A, 2)]),
    ]
    oracle_to_printing = {ORACLE_A: PRINT_A, ORACLE_C: PRINT_C}
    prices: dict[tuple[str, str], Document] = {
        (PRINT_A, "nonfoil"): _known("2.00"),
        (PRINT_C, "nonfoil"): {"kind": "Unknown"},
    }

    unfiltered = rank_discovery_candidates(
        candidates,
        {},
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
    )
    assert len(unfiltered) == 2
    partial = next(item for item in unfiltered if item["id"] == DECK_1)
    assert partial["missingValue"]["coveredValue"] == "2.00"
    assert partial["missingValue"]["complete"] is False

    budgeted = rank_discovery_candidates(
        candidates,
        {},
        oracle_to_printing=oracle_to_printing,
        price_references=prices,
        max_missing_cost=10.0,
    )
    assert [item["id"] for item in budgeted] == [DECK_2]


def test_copy_reference_deck_rejects_unresolved_cards_before_inserting_deck(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from collections.abc import AsyncIterator
    from contextlib import asynccontextmanager

    from spellbook_core.mtg.decks import discovery as discovery_module

    tx = MagicMock()
    tx.execute = AsyncMock()

    @asynccontextmanager
    async def fake_tx(_pool: object) -> AsyncIterator[MagicMock]:
        yield tx

    monkeypatch.setattr(discovery_module, "transaction", fake_tx)
    monkeypatch.setattr(discovery_module, "authorize_write", AsyncMock(return_value="acc-1"))
    monkeypatch.setattr(
        discovery_module,
        "rows",
        AsyncMock(
            return_value=[
                {
                    "id": DECK_1,
                    "source": "mtggoldfish",
                    "name": "Missing Card Deck",
                    "format": "modern",
                    "archetype": None,
                    "source_url": None,
                    "oracle_id": ORACLE_A,
                    "role": "main",
                    "quantity": 4,
                    "card_name": "Missing Card",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        discovery_module,
        "_load_representative_printings",
        AsyncMock(return_value={}),
    )
    first_mock = AsyncMock()
    monkeypatch.setattr(discovery_module, "first", first_mock)

    decks = Decks(MagicMock(), MagicMock(), MagicMock(), MagicMock())
    actor = Actor("acc-1", "test", "", "", "")

    with pytest.raises(ValidationError, match="unavailable in the active catalog"):
        asyncio.run(decks.copy_reference_deck(actor, DECK_1))
    first_mock.assert_not_awaited()
    tx.execute.assert_not_awaited()
