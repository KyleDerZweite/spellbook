"""Capture policy and batch/evidence behavior; real transactions have separate PG cases."""

import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

from psycopg.types.json import Jsonb

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.mtg.inventory_value import InventoryValues
from spellbook_core.mtg.valuation import Valuation
from spellbook_core.mtg.value_history import CaptureObservation, capture_account

OBSERVED = datetime(2026, 10, 23, 21, 59, 30, tzinfo=UTC)


class CaptureFixture:
    def __init__(self, *, eligible: bool = True, pairs: int = 0):
        self.tx = cast(Transaction, object())
        self.eligible = eligible
        self.holdings = [
            (str(uuid4()), "nonfoil", "NM", 1, "oracle", "Test", "tst", "") for _ in range(pairs)
        ]
        self.existing: list[tuple[object, ...]] = []
        self.calls: list[tuple[str, Sequence[object]]] = []

    async def query(
        self, tx: Transaction, sql: str, parameters: Sequence[object]
    ) -> list[tuple[object, ...]]:
        assert tx is self.tx
        sql = " ".join(sql.split())
        self.calls.append((sql, parameters))
        if sql.startswith("WITH observation"):
            return [
                (
                    OBSERVED,
                    "2026-10-23",
                    OBSERVED - timedelta(hours=23, minutes=59, seconds=30),
                    OBSERVED + timedelta(seconds=30),
                    self.eligible,
                )
            ]
        if sql.startswith("SELECT id, timezone"):
            return self.existing
        if sql.startswith("SELECT revision::text"):
            return [("7",)]
        if sql.startswith("SELECT catalog_card_id AS printing_id"):
            return list(self.holdings)
        if "FROM price_state" in sql or "FROM optional_price_state" in sql:
            return []
        if sql.startswith(("INSERT", "UPDATE", "DELETE")):
            return []
        raise AssertionError(sql)


def values() -> InventoryValues:
    pool = cast(ConnectionPool, None)
    return InventoryValues(pool, Valuation(pool, cast(SessionAuth, None)))


def test_ineligible_observation_reads_no_inventory_and_writes_nothing() -> None:
    fixture = CaptureFixture(eligible=False)
    result = asyncio.run(capture_account(fixture.tx, values(), "account", query=fixture.query))
    assert result is None and len(fixture.calls) == 1


def test_timezone_change_retains_previous_calendar_observation() -> None:
    fixture = CaptureFixture()
    fixture.existing = [
        ("day", "UTC", OBSERVED - timedelta(seconds=1), OBSERVED - timedelta(hours=24), OBSERVED)
    ]
    result = asyncio.run(capture_account(fixture.tx, values(), "account", query=fixture.query))
    assert result == CaptureObservation(0, 0, False)
    assert len(fixture.calls) == 2


def test_empty_capture_is_known_zero_header_and_no_reference_rows() -> None:
    fixture = CaptureFixture()
    result = asyncio.run(capture_account(fixture.tx, values(), "account", query=fixture.query))
    assert result == CaptureObservation(0, 0, True)
    writes = [(sql, p) for sql, p in fixture.calls if sql.startswith("INSERT")]
    assert len(writes) == 1
    estimate = writes[0][1][7]
    assert isinstance(estimate, Jsonb)
    assert estimate.obj["coveredValue"] == "0.00" and estimate.obj["complete"] is True


def test_freeze_batches_share_transaction_and_clock_and_copy_unknown_evidence() -> None:
    fixture = CaptureFixture(pairs=101)
    # A second condition reuses the first printing/finish reference.
    first = fixture.holdings[0]
    fixture.holdings.append((first[0], first[1], "LP", 2, *first[4:]))
    result = asyncio.run(capture_account(fixture.tx, values(), "account", query=fixture.query))
    assert result == CaptureObservation(102, 101, True)
    source_reads = [sql for sql, _ in fixture.calls if "FROM price_state" in sql]
    assert len(source_reads) == 2
    copies = [
        p for sql, p in fixture.calls if sql.startswith("INSERT INTO inventory_value_references")
    ]
    evidence = [e for parameters in copies for e in cast(Jsonb, parameters[1]).obj]
    assert len(evidence) == 101
    assert all(e["evidence"]["reference"]["reason"] == "SourceUnavailable" for e in evidence)
    assert {e["evidence"]["evaluatedAt"] for e in evidence} == {"2026-10-23T21:59:30.000Z"}
    assert all(len(e["evidence"]["sourceSelections"]) == 1 for e in evidence)
