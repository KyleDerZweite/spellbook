"""Unit tests for ReferenceDecks validation, SQL parameter handling, and DTO mapping."""

import ast
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog_query import _ALLOWED
from spellbook_core.mtg.formats import MTG_FORMATS
from spellbook_core.mtg.reference_decks import ReferenceDecks, create_reference_decks

DECK_ID = "11111111-1111-4111-8111-111111111111"
ORACLE_ID = "22222222-2222-4222-8222-222222222222"
PRINTING_ID = "33333333-3333-4333-8333-333333333333"
SYNCED_AT = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)


class FakeCursor:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self._rows = rows

    async def fetchone(self) -> tuple[object, ...] | None:
        return self._rows[0] if self._rows else None

    async def fetchall(self) -> list[tuple[object, ...]]:
        return list(self._rows)


class FakeTx:
    def __init__(self, responses: list[list[tuple[object, ...]]]) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, tuple[object, ...]]] = []

    async def execute(self, sql: str, params: tuple[object, ...] = ()) -> FakeCursor:
        self.calls.append((sql, params))
        return FakeCursor(self._responses.pop(0))


def _patch_tx(monkeypatch: pytest.MonkeyPatch, tx: FakeTx) -> None:
    @asynccontextmanager
    async def fake_transaction(
        _pool: object, *, read_only: bool = False, repeatable_read: bool = False
    ) -> AsyncIterator[FakeTx]:
        assert read_only is True
        assert repeatable_read is True
        yield tx

    monkeypatch.setattr("spellbook_core.mtg.reference_decks.transaction", fake_transaction)


def test_central_formats_shared_with_catalog_search_and_worker() -> None:
    assert list(MTG_FORMATS) == _ALLOWED["legalities"]
    worker_base = (
        Path(__file__).resolve().parents[3]
        / "backend/workers/catalog/src/worker/reference_decks/base.py"
    )
    tree = ast.parse(worker_base.read_text(encoding="utf-8"))
    worker_formats: tuple[str, ...] | None = None
    for node in tree.body:
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == "MTG_FORMATS"
            and node.value is not None
        ):
            worker_formats = ast.literal_eval(node.value)
    assert worker_formats == MTG_FORMATS


@pytest.mark.parametrize(
    "kwargs",
    [
        {"format": "alchemy"},
        {"source": ""},
        {"source": "x" * 65},
        {"query": "a\x00b"},
        {"query": "x" * 201},
        {"limit": 0},
        {"limit": 101},
        {"limit": True},
        {"offset": -1},
        {"offset": 100001},
    ],
)
def test_list_validation_rejects_invalid_inputs(kwargs: dict[str, object]) -> None:
    service = create_reference_decks(AsyncMock())
    with pytest.raises(ValidationError):
        asyncio.run(service.list_reference_decks(**kwargs))  # type: ignore[arg-type]


def test_get_rejects_invalid_uuid() -> None:
    service = ReferenceDecks(AsyncMock())
    with pytest.raises(ValidationError):
        asyncio.run(service.get_reference_deck("not-a-uuid"))


def test_list_filters_and_escapes_like_pattern(monkeypatch: pytest.MonkeyPatch) -> None:
    tx = FakeTx(
        [
            [(1,)],
            [
                (
                    DECK_ID,
                    "mtggoldfish",
                    "modern:boros-energy",
                    "Boros Energy",
                    "modern",
                    "Boros Energy",
                    "https://www.mtggoldfish.com/archetype/modern-boros-energy",
                    14.5,
                    SYNCED_AT,
                    SYNCED_AT,
                    75,
                    24,
                )
            ],
            [("mtggoldfish", SYNCED_AT, 12)],
        ]
    )
    _patch_tx(monkeypatch, tx)
    service = create_reference_decks(AsyncMock())
    result = asyncio.run(
        service.list_reference_decks(
            format="Modern", source="mtggoldfish", query="100%_test", limit=10, offset=5
        )
    )

    assert result["total"] == 1
    assert result["limit"] == 10
    assert result["offset"] == 5
    assert result["availableFormats"] == list(MTG_FORMATS)
    assert result["sources"] == [
        {"source": "mtggoldfish", "lastSyncedAt": "2026-11-26T09:00:00Z", "deckCount": 12}
    ]
    assert result["decks"] == [
        {
            "id": DECK_ID,
            "source": "mtggoldfish",
            "externalId": "modern:boros-energy",
            "name": "Boros Energy",
            "format": "modern",
            "archetype": "Boros Energy",
            "sourceUrl": "https://www.mtggoldfish.com/archetype/modern-boros-energy",
            "metaShare": 14.5,
            "sourceUpdatedAt": "2026-11-26T09:00:00Z",
            "syncedAt": "2026-11-26T09:00:00Z",
            "cardCount": 75,
            "uniqueCardCount": 24,
        }
    ]
    assert tx.calls[0][1] == ("modern", "mtggoldfish", "%100\\%\\_test%", "%100\\%\\_test%")
    assert tx.calls[1][1] == ("modern", "mtggoldfish", "%100\\%\\_test%", "%100\\%\\_test%", 10, 5)


def test_get_reference_deck_returns_normalized_cards_and_catalog_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tx = FakeTx(
        [
            [
                (
                    DECK_ID,
                    "local_dec",
                    "modern/burn.dec",
                    "Burn",
                    "modern",
                    None,
                    None,
                    None,
                    SYNCED_AT,
                    None,
                    4,
                    1,
                )
            ],
            [
                (
                    ORACLE_ID,
                    "Lightning Bolt",
                    4,
                    "main",
                    {
                        "id": PRINTING_ID,
                        "image_uri": "https://cards.example/bolt.jpg",
                        "image_uri_small": "https://cards.example/bolt-small.jpg",
                        "mana_cost": "{R}",
                        "type_line": "Instant",
                        "colors": ["R"],
                        "color_identity": ["R"],
                    },
                )
            ],
        ]
    )
    _patch_tx(monkeypatch, tx)
    service = create_reference_decks(AsyncMock())
    detail = asyncio.run(service.get_reference_deck(DECK_ID))
    assert detail is not None
    assert detail["id"] == DECK_ID
    assert detail["cards"] == [
        {
            "oracleId": ORACLE_ID,
            "name": "Lightning Bolt",
            "quantity": 4,
            "role": "main",
            "representativePrintingId": PRINTING_ID,
            "imageUri": "https://cards.example/bolt.jpg",
            "imageUriSmall": "https://cards.example/bolt-small.jpg",
            "manaCost": "{R}",
            "typeLine": "Instant",
            "colors": ["R"],
            "colorIdentity": ["R"],
        }
    ]


def test_get_reference_deck_missing_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    tx = FakeTx([[]])
    _patch_tx(monkeypatch, tx)
    service = create_reference_decks(AsyncMock())
    assert asyncio.run(service.get_reference_deck(DECK_ID)) is None
