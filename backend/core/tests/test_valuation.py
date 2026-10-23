"""Real selection/estimate logic through the explicit transaction query seam."""

import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import DatabaseIntegerRangeError, ValidationError
from spellbook_core.inventory_value import history_request, value_estimate
from spellbook_core.valuation import (
    PriceReadUnavailable,
    Valuation,
    choose_reference,
    price_requests,
    reference_freshness,
)
from spellbook_core.valuation_query import (
    BASELINE_ROWS,
    OPTIONAL_ROWS,
    Document,
    records,
)

PRINTING = "11111111-1111-4111-8111-111111111111"
ENGLISH = "22222222-2222-4222-8222-222222222222"
NOW = datetime(2026, 10, 23, 12, tzinfo=UTC)
PAIR: Document = {"printingId": PRINTING, "finish": "nonfoil"}


def publication(source: str = "Scryfall", age: timedelta = timedelta()) -> Document:
    result: Document = {
        "id": source + "-publication",
        "source": source,
        "timePrecision": "Instant",
        "sourceTime": (NOW - age).isoformat(),
        "mappingVersion": 1,
    }
    if source == "MTGJSON":
        result.update(timePrecision="Day", sourceDate=(NOW - age).date().isoformat())
    return result


def selection(amount: object = "0", *, source: str = "Scryfall") -> Document:
    return {
        "printing_id": PRINTING,
        "identity": {"lang": "en"},
        "supported": True,
        "amount": amount,
        "measure": "prices.eur" if source == "Scryfall" else "trend",
        "provider_id": "123",
        "raw_value": amount,
        "english_amount": None,
        "english_supported": False,
        "english_printing_id": None,
    }


def test_known_zero_and_exact_before_english() -> None:
    row = selection("000.000")
    row.update(
        english_printing_id=ENGLISH,
        english_supported=True,
        english_amount="12",
        english_identity={"lang": "en"},
    )
    reference, evidence = choose_reference(PAIR, row, publication(), NOW, [])
    assert reference["amount"] == "0"
    assert reference["provenance"] == "Exact"
    assert evidence is not None and evidence["rawValue"] == "000.000"


def test_approved_english_fallback_and_unknown_mapping() -> None:
    row = selection(None)
    row.update(identity={"lang": "de"}, mapping_reason="AmbiguousLanguageMapping")
    reference, _ = choose_reference(PAIR, row, publication(), NOW, [])
    assert reference["reason"] == "AmbiguousLanguageMapping"
    row.update(
        english_printing_id=ENGLISH,
        english_supported=True,
        english_amount="2.50",
        english_raw_value="2.50",
        english_identity={"lang": "en"},
    )
    reference, evidence = choose_reference(PAIR, row, publication(), NOW, [])
    assert reference["amount"] == "2.5"
    assert reference["matchedPrintingId"] == ENGLISH
    assert evidence is not None and evidence["requestedIdentity"] == {"lang": "de"}


@pytest.mark.parametrize("amount", ["-1", "1e3", "NaN", "0." + "1" * 19, "1" * 129])
def test_corrupt_amount_fails_even_when_expired(amount: str) -> None:
    with pytest.raises(PriceReadUnavailable):
        choose_reference(PAIR, selection(amount), publication(age=timedelta(days=9)), NOW, [])


@pytest.mark.parametrize(
    "hours,freshness", [(24, "Fresh"), (24.01, "Stale"), (168, "Stale"), (168.01, None)]
)
def test_instant_freshness_boundaries(hours: float, freshness: str | None) -> None:
    assert reference_freshness(publication(age=timedelta(hours=hours)), NOW) == freshness


def test_day_precision_uses_utc_start_and_rejects_future() -> None:
    p = publication("MTGJSON")
    assert reference_freshness(p, NOW) == "Fresh"
    p["sourceDate"] = "2026-10-24"
    with pytest.raises(PriceReadUnavailable):
        reference_freshness(p, NOW)
    p["sourceDate"] = "2026-02-30"
    with pytest.raises(PriceReadUnavailable):
        reference_freshness(p, NOW)


def test_exact_products_round_once_and_retain_incomplete_coverage() -> None:
    result = value_estimate(
        [
            {
                "quantity": 3,
                "reference": {"kind": "Known", "amount": "0.0017", "freshness": "Fresh"},
            },
            {
                "quantity": "2",
                "reference": {"kind": "Known", "amount": "2.125", "freshness": "Stale"},
            },
            {"quantity": 4, "reference": {"kind": "Unknown"}},
        ]
    )
    assert result == {
        "currency": "EUR",
        "coveredValue": "4.26",
        "coveredQuantity": 5,
        "staleQuantity": 2,
        "unknownQuantity": 4,
        "totalQuantity": 9,
        "complete": False,
    }
    assert value_estimate([])["complete"] is True
    assert value_estimate([])["coveredValue"] == "0.00"


def test_estimate_rejects_negative_and_unsafe_quantities() -> None:
    for quantity in (-1, 9007199254740992):
        with pytest.raises((PriceReadUnavailable, DatabaseIntegerRangeError)):
            value_estimate([{"quantity": quantity, "reference": {"kind": "Unknown"}}])


@pytest.mark.parametrize(
    "input",
    [
        [],
        [PAIR, PAIR],
        [{"printingId": PRINTING, "finish": "etched"}],
        [{"printingId": PRINTING, "finish": "foil", "extra": None}],
    ],
)
def test_price_request_rejects_duplicates_and_unknown_fields(input: object) -> None:
    with pytest.raises(ValidationError):
        price_requests(input)


@pytest.mark.parametrize(
    "input",
    [
        {"days": None},
        {"from": "2026-01-01"},
        {"from": "2026-02-30", "to": "2026-03-01"},
        {"finish": "foil"},
        {"printingId": PRINTING, "condition": None},
        {"days": 30, "from": "2026-01-01", "to": "2026-01-02"},
    ],
)
def test_history_request_rejects_invalid_windows_and_partial_identities(input: object) -> None:
    with pytest.raises(ValidationError):
        history_request(input)


class ReferenceFixture:
    def __init__(self, *, cardmarket_age: timedelta = timedelta()):
        self.cardmarket_age = cardmarket_age
        self.tx = cast(Transaction, object())
        self.calls: list[str] = []
        self.descriptor: Document = {"source": "fixture"}

    async def query(
        self, tx: Transaction, sql: str, params: Sequence[object]
    ) -> list[tuple[object, ...]]:
        assert tx is self.tx
        self.calls.append(sql)
        if "FROM price_state" in " ".join(sql.split()):
            return [
                (
                    {"kind": "Succeeded"},
                    "baseline",
                    self.descriptor,
                    "default_cards",
                    NOW,
                    "digest",
                    3,
                    1,
                    NOW,
                )
            ]
        if sql == BASELINE_ROWS:
            return [
                (
                    UUID(PRINTING),
                    {"lang": "en"},
                    [{"provider": "Cardmarket", "url": "https://example.com"}],
                    True,
                    "1.00",
                    "prices.eur",
                    "1.00",
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                )
            ]
        if "FROM optional_price_state" in " ".join(sql.split()):
            return [
                (
                    "Cardmarket",
                    True,
                    {"kind": "Failed"},
                    "optional",
                    "Cardmarket",
                    "Instant",
                    NOW - self.cardmarket_age,
                    None,
                    self.descriptor,
                    "digest",
                    1,
                    1,
                    NOW,
                ),
                ("MTGJSON", False, {}, None, None, None, None, None, None, None, None, None, None),
            ]
        if sql == OPTIONAL_ROWS:
            return [
                (
                    UUID(PRINTING),
                    {"lang": "en"},
                    True,
                    "2.00",
                    "trend",
                    "2.00",
                    "123",
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                )
            ]
        raise AssertionError(sql)


def test_freeze_chooses_fresh_before_source_priority_and_clones_full_outcome() -> None:
    async def scenario() -> None:
        valuation = Valuation(cast(ConnectionPool, None), cast(SessionAuth, None))
        fixture = ReferenceFixture()
        frozen = await valuation.freeze_in_transaction(
            fixture.tx, [PAIR], NOW, query=fixture.query
        )
        reference = frozen["response"]["results"][0]
        assert reference["source"] == "Cardmarket"
        assert reference["amount"] == "2"
        assert frozen["response"]["sourceStatuses"][1]["kind"] == "Failed"
        evidence = frozen["evidence"][0]
        assert len(evidence["sourceSelections"]) == 3
        assert evidence["sourceSelections"][2]["enabled"] is False
        assert evidence["selection"]["printing_id"] == PRINTING
        fixture.descriptor["source"] = "changed"
        reference["amount"] = "changed"
        assert evidence["known"]["descriptor"]["source"] == "fixture"
        assert evidence["reference"]["amount"] == "2"
        fixture.cardmarket_age = timedelta(days=2)
        next = await valuation.freeze_in_transaction(fixture.tx, [PAIR], NOW, query=fixture.query)
        assert next["response"]["results"][0]["source"] == "Scryfall"

    asyncio.run(scenario())


def test_freeze_query_failure_propagates_without_pool_or_nested_transaction() -> None:
    async def fail(
        tx: Transaction, sql: str, params: Sequence[object]
    ) -> list[tuple[object, ...]]:
        raise RuntimeError("query failed")

    valuation = Valuation(cast(ConnectionPool, None), cast(SessionAuth, None))
    with pytest.raises(RuntimeError, match="query failed"):
        asyncio.run(
            valuation.freeze_in_transaction(cast(Transaction, None), [PAIR], NOW, query=fail)
        )


def test_record_projection_preserves_complete_rows_and_normalizes_uuid() -> None:
    async def query(
        tx: Transaction, sql: str, params: Sequence[object]
    ) -> list[tuple[object, ...]]:
        return [(UUID(PRINTING), None)]

    result = asyncio.run(
        records(cast(Transaction, None), query, "SELECT fixture", [], ["id", "missing"])
    )
    assert result == [{"id": PRINTING, "missing": None}]


def test_freeze_uses_node_millisecond_clock_precision() -> None:
    async def scenario() -> None:
        valuation = Valuation(cast(ConnectionPool, None), cast(SessionAuth, None))
        fixture = ReferenceFixture(cardmarket_age=timedelta(days=2))
        # A sub-millisecond tail must not move a 24-hour reference to Stale.
        as_of = NOW + timedelta(days=1, microseconds=900)
        frozen = await valuation.freeze_in_transaction(
            fixture.tx, [PAIR], as_of, query=fixture.query
        )
        assert frozen["response"]["results"][0]["freshness"] == "Fresh"

    asyncio.run(scenario())
