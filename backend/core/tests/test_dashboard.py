"""Dashboard snapshot, partial failure and exact-number contracts."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta, timezone
from typing import cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from psycopg import AsyncConnection, sql

from spellbook_core import dashboard as module
from spellbook_core.auth import SessionAuth
from spellbook_core.dashboard import create_dashboard, summary_number
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ActorError
from spellbook_core.inventory_value import InventoryValues
from spellbook_core.models import Actor
from spellbook_core.profile import SummaryRangeError

ACTOR = Actor("account-one", "one", "", "wizard", "grove")
NOW = datetime(2026, 10, 25, 1, 30, tzinfo=UTC)


@pytest.mark.parametrize("value", ["9007199254740992", "-1", "1.5", True, None])
def test_summary_range_is_never_rounded(value: object) -> None:
    with pytest.raises(SummaryRangeError):
        summary_number(value)


@pytest.mark.parametrize(
    "scan_failure,value_failure", [(False, False), (True, False), (False, True)]
)
def test_snapshot_account_distributions_allocation_and_optional_failures(
    monkeypatch: pytest.MonkeyPatch, scan_failure: bool, value_failure: bool
) -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        values = create_autospec(InventoryValues, instance=True)
        values.current_in_transaction.return_value = {"current": True}
        values.history_in_transaction.return_value = {"history": True}
        if value_failure:
            values.history_in_transaction.side_effect = RuntimeError("private provider failure")
        tx = create_autospec(AsyncConnection, instance=True)
        commands: list[str] = []

        async def execute(statement: object, params: object = None) -> AsyncMock:
            query = (
                statement.as_string() if isinstance(statement, sql.Composable) else str(statement)
            )
            commands.append(query)
            result = AsyncMock()
            if query == "SELECT statement_timestamp()":
                result.fetchone.return_value = (NOW,)
            elif "count(distinct canonical_card_id)" in query:
                assert params == (ACTOR.account_id,) * 2
                result.fetchone.return_value = ("5", "1", "2", "1", "2", "1")
            elif 'SELECT "set_code"' in query:
                assert params == (ACTOR.account_id,)
                result.fetchall.return_value = [("tst", "5")]
            elif 'SELECT "finish"' in query:
                result.fetchall.return_value = [("nonfoil", "3"), ("foil", "2")]
            elif 'SELECT "condition"' in query:
                result.fetchall.return_value = [("LP", "3"), ("NM", "2")]
            elif "LIMIT 8" in query:
                assert params == (ACTOR.account_id,)
                result.fetchall.return_value = [
                    (
                        "entry",
                        "printing",
                        "oracle",
                        "Name",
                        "tst",
                        "image",
                        2,
                        "foil",
                        "NM",
                        NOW.astimezone(tz=timezone(timedelta(hours=2))),
                    )
                ]
            elif "WITH owned_printings" in query:
                assert params == (ACTOR.account_id,) * 3
                result.fetchall.return_value = [("deck", "Deck", "Commander", "8", "2", "3", "3")]
            elif "FROM scan_sessions" in query:
                assert params == (ACTOR.account_id,)
                if scan_failure:
                    raise RuntimeError("optional scan storage unavailable")
                result.fetchone.return_value = ("2",)
            else:
                assert "SAVEPOINT" in query
            return result

        tx.execute.side_effect = execute

        @asynccontextmanager
        async def transaction(
            pool: ConnectionPool, *, read_only: bool = False, repeatable_read: bool = False
        ) -> AsyncIterator[Transaction]:
            assert read_only and repeatable_read
            yield cast(Transaction, tx)

        monkeypatch.setattr(module, "transaction", transaction)
        result = await create_dashboard(cast(ConnectionPool, object()), auth, values).get(ACTOR)
        assert result["totals"] == dict(total=5, names=1, printings=2, sets=1, foils=2, decks=1)
        assert result["sets"] == [{"label": "tst", "quantity": 5, "share": 1}]
        assert result["finishes"] == [
            {"label": "nonfoil", "quantity": 3, "share": 0.6},
            {"label": "foil", "quantity": 2, "share": 0.4},
        ]
        assert result["conditions"] == [
            {"label": "NM", "quantity": 2, "share": 0.4},
            {"label": "LP", "quantity": 3, "share": 0.6},
            *({"label": label, "quantity": 0, "share": 0} for label in ("MP", "HP", "DMG")),
        ]
        assert result["recentEntries"][0]["updatedAt"] == "2026-10-25T01:30:00.000Z"
        assert result["decks"] == [
            dict(
                id="deck",
                name="Deck",
                format="Commander",
                required=8,
                exact=2,
                alternate=3,
                missing=3,
            )
        ]
        assert result["pendingScanReviews"] == (None if scan_failure else 2)
        assert ("ROLLBACK TO SAVEPOINT scan_summary" in commands) is scan_failure
        assert ("ROLLBACK TO SAVEPOINT inventory_value_summary" in commands) is value_failure
        assert result["inventoryValue"] == (None if value_failure else {"current": True})
        assert result["inventoryValueHistory"] == (None if value_failure else {"history": True})
        assert result["valuationError"] == (
            {
                "kind": "PriceReadUnavailable",
                "message": "Reference prices are temporarily unavailable.",
            }
            if value_failure
            else None
        )
        values.current_in_transaction.assert_awaited_once_with(tx, ACTOR.account_id, NOW)
        values.history_in_transaction.assert_awaited_once_with(
            tx, ACTOR.account_id, {"days": 30}, NOW
        )

    asyncio.run(scenario())


def test_untrusted_actor_opens_no_snapshot() -> None:
    auth = create_autospec(SessionAuth, instance=True)
    auth.require_actor.side_effect = ActorError()
    pool = create_autospec(ConnectionPool, instance=True)
    dashboard = create_dashboard(pool, auth, create_autospec(InventoryValues, instance=True))
    with pytest.raises(ActorError):
        asyncio.run(dashboard.get(ACTOR))
    pool.connection.assert_not_called()
