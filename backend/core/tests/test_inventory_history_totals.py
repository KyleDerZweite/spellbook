"""Bounded saved-holdings aggregation and private History wire semantics."""

import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
from test_value_capture import values

from spellbook_core.db import Transaction
from spellbook_core.mtg.valuation_query import Document

NOW = datetime(2026, 10, 24, 12, tzinfo=UTC)


@pytest.mark.parametrize("decks", [None, 0, 4])
@pytest.mark.parametrize("filtered", [False, True])
def test_history_totals_are_saved_bounded_owned_and_nullable(
    decks: int | None, filtered: bool
) -> None:
    calls: list[str] = []

    async def query(
        tx: Transaction, sql: str, parameters: Sequence[object]
    ) -> list[tuple[object, ...]]:
        sql = " ".join(sql.split())
        calls.append(sql)
        if sql.startswith("WITH calendar"):
            return [("2026-10-24", NOW + timedelta(hours=10))]
        if sql.startswith("SELECT id, day::text"):
            assert parameters[0] == "owner"
            assert "game= 'mtg'" in sql
            return [
                (
                    key,
                    day,
                    "Europe/Berlin",
                    NOW - timedelta(days=2),
                    NOW - timedelta(days=1),
                    NOW - timedelta(days=1, seconds=30),
                    {},
                    decks,
                )
                for key, day in [("saved", "2026-10-22"), ("empty", "2026-10-23")]
            ]
        if sql.startswith("SELECT least"):
            return [(NOW + timedelta(hours=10),)]
        if "count(DISTINCT h.canonical_card_id)" in sql:
            assert parameters == [["saved", "empty"], "owner"]
            assert "d.account_id=$2 AND d.game='mtg'" in sql
            assert "LEFT JOIN inventory_value_holdings" in sql
            assert "inventory_cards" not in sql
            return [("saved", 9, 2, 1, decks), ("empty", 0, 0, 0, decks)]
        if "h.printing_id=$2" in sql:
            return []
        raise AssertionError(sql)

    result = asyncio.run(
        values().history_in_transaction(
            cast(Transaction, None),
            "owner",
            {
                "days": 3,
                **({"printingId": "00000000-0000-4000-8000-000000000001"} if filtered else {}),
            },
            NOW,
            query=query,
        )
    )
    points: list[Document] = result["points"]
    assert points[0] == {"kind": "Gap", "day": "2026-10-21"}
    assert points[1]["totals"] == (
        None
        if filtered
        else {
            "total": 9,
            "names": 2,
            "sets": 1,
            "decks": decks,
        }
    )
    assert points[2]["totals"] == (
        None
        if filtered
        else {
            "total": 0,
            "names": 0,
            "sets": 0,
            "decks": decks,
        }
    )
    assert sum("count(DISTINCT" in sql for sql in calls) == (0 if filtered else 1)
