"""Demo references exercise ordinary valuation with explicit static provenance."""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from typing import cast
from unittest.mock import AsyncMock, Mock

import pytest
from test_operator_fixtures import FIXTURES

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.mtg.demo_prices import fixture, frozen, history
from spellbook_core.mtg.inventory_value import estimate_holdings, pair_key
from spellbook_core.mtg.valuation import Valuation
from spellbook_core.operators.fixtures import load_precon

NOW = datetime(2026, 10, 29, 12, tzinfo=UTC)


def test_static_snapshot_covers_exact_starter_finishes_and_uses_real_quantities() -> None:
    precon = load_precon(FIXTURES)
    holdings = [
        {"printing_id": row["card"]["id"], "finish": row["finish"], "quantity": row["quantity"]}
        for row in precon.cards + precon.inventory_extras
    ]
    pairs = [{"printingId": row["printing_id"], "finish": row["finish"]} for row in holdings]
    result = frozen(pairs, NOW)
    refs = {pair_key(r): r for r in result["response"]["results"]}
    estimate = estimate_holdings(holdings, refs)
    assert estimate["totalQuantity"] == 101
    assert estimate["coveredQuantity"] == 101 and estimate["complete"]
    assert all(r["source"] == "Demo" and r["freshness"] == "Static" for r in refs.values())
    assert result == frozen(pairs, NOW)
    assert len(fixture()["cards"]) == 75
    changed = estimate_holdings([{**holdings[0], "quantity": 3}], refs)
    single = estimate_holdings([{**holdings[0], "quantity": 1}], refs)
    assert Decimal(changed["coveredValue"]) == Decimal(single["coveredValue"]) * 3


def test_unknown_printing_and_missing_finish_stay_unknown() -> None:
    result = frozen(
        [{"printingId": "00000000-0000-0000-0000-000000000000", "finish": "foil"}], NOW
    )
    assert result["response"]["results"][0]["kind"] == "Unknown"
    card = next(key for key, row in fixture()["cards"].items() if row["foil"] is None)
    assert (
        frozen([{"printingId": card, "finish": "foil"}], NOW)["response"]["results"][0]["kind"]
        == "Unknown"
    )


def test_demo_provider_is_explicit_and_production_keeps_normal_price_reads() -> None:
    async def scenario() -> None:
        pair = {"printingId": next(iter(fixture()["cards"])), "finish": "nonfoil"}
        pool, auth, tx = (
            cast(ConnectionPool, Mock()),
            cast(SessionAuth, Mock()),
            cast(Transaction, Mock()),
        )
        query = AsyncMock(side_effect=RuntimeError("normal SQL path"))
        normal = Valuation(pool, auth)
        with pytest.raises(RuntimeError, match="normal SQL path"):
            await normal.freeze_in_transaction(tx, [pair], NOW, query=query)
        demo = Valuation(pool, auth, demo_mode=True)
        result = await demo.freeze_in_transaction(tx, [pair], NOW, query=query)
        assert result["response"]["publications"][0]["source"] == "Demo"
        assert query.await_count == 1
        with pytest.raises(ValidationError):
            await normal.printing_history({**pair, "sources": ["Demo"]})

    asyncio.run(scenario())


def test_demo_card_history_is_bounded_labelled_and_honors_source_filters() -> None:
    pair = {"printingId": next(iter(fixture()["cards"])), "finish": "nonfoil"}
    result = history(pair, 7, NOW, None)
    assert len(result["points"]) == 7
    assert all(
        p["source"] == "Demo" and p["pointArtifact"] == "DemoFixture" for p in result["points"]
    )
    assert len(history(pair, 90, NOW, None)["points"]) == 30
    assert history(pair, 7, NOW, ["Scryfall"])["points"] == []
