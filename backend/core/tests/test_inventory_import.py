"""Arena parser, resolution and original-receipt application compatibility."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec, patch

import pytest
from test_inventory import ACTOR, CARD, GOLDEN

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryAcknowledgement,
    PreparedInventoryMutation,
    RecordedInventoryMutation,
)
from spellbook_core.mtg.inventory_import import (
    normalize_card_name,
    parse_arena_decklist,
    preview_inventory_import,
)
from spellbook_core.mtg.models import CardDocument

ACK: InventoryAcknowledgement = {
    "requestId": "original",
    "inventoryId": None,
    "revision": "5",
    "changes": [],
    "removedEntryIds": [],
    "groups": [],
    "removedGroupIds": [],
    "memberships": [],
    "import": {"resolvedCount": 1, "unresolvedCount": 2, "ambiguousCount": 3},
}


def application() -> tuple[Inventory, Any, Any]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.require_actor.return_value = ACTOR
    catalog = create_autospec(Catalog, instance=True)
    catalog.resolve_catalog_candidates.return_value = [CARD]
    catalog.get_catalog_printing.return_value = CARD
    return Inventory(create_autospec(ConnectionPool), catalog, auth), auth, catalog


@asynccontextmanager
async def no_receipt(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
    tx = AsyncMock()
    tx.execute.return_value.fetchone.return_value = None
    yield cast(Transaction, tx)


def test_arena_sections_printing_hints_duplicates_and_first_spelling() -> None:
    parsed, malformed = parse_arena_decklist(
        "\ufeffDeck\r\n# comment\n// comment\n; comment\n"
        "2x Fire/Ice (STA) 019★\n3 FIRE // ICE (sta) 019★\n"
        "1 Fire // Ice (STA) 19\n1 Fire // Ice\n"
        "SB: 4 Fire/Ice (STA) 019★\n1 Island\nSideboard\n2 Island\n"
        "Commander\n1 Atraxa\nCompanion\n1 Jegantha\nMaybeboard\n4 Opt\nbad line"
    )
    assert parsed[0] == {
        "quantity": 5,
        "name": "Fire/Ice",
        "normalizedName": "fire // ice",
        "setCode": "sta",
        "collectorNumber": "019★",
        "role": "main",
        "raw": "2x Fire/Ice (STA) 019★\n3 FIRE // ICE (sta) 019★",
    }
    assert [(line["name"], line["role"], line["quantity"]) for line in parsed[3:]] == [
        ("Fire/Ice", "sideboard", 4),
        ("Island", "main", 1),
        ("Island", "sideboard", 2),
        ("Atraxa", "commander", 1),
        ("Jegantha", "companion", 1),
        ("Opt", "maybeboard", 4),
    ]
    assert malformed == [
        {"line": {"raw": "bad line", "role": "maybeboard"}, "reason": "Unrecognized card line"}
    ]


@pytest.mark.parametrize("section", ["Deck", "Main", "Mainboard", "Maindeck", "DECK"])
def test_main_section_aliases(section: str) -> None:
    parsed, malformed = parse_arena_decklist(f"Sideboard\n1 Opt\n{section}\n2 Opt")
    assert not malformed
    assert [line["role"] for line in parsed] == ["sideboard", "main"]


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Gaea's Cradle", "gaeas cradle"),
        ("Urza\u2019s Saga", "urzas saga"),
        (" Fire /// Ice ", "fire // ice"),
        ("骨砕きの巨人", "骨砕きの巨人"),
        ("Éowyn, Shieldmaiden", "éowyn shieldmaiden"),
        ("Opt\u0301\x1c\u00a0🔮", "opt"),
    ],
)
def test_unicode_card_name_normalization(name: str, expected: str) -> None:
    assert normalize_card_name(name) == expected


@pytest.mark.parametrize(
    "text",
    [
        "0 Opt",
        "-1 Opt",
        "1.5 Opt",
        "9007199254740992 Opt",
        "1" * 5000 + " Opt",
        "\uff14 Opt",
        "2xOpt",
        "1\x1cOpt",
        "1 Opt\r1 Island",
        "1 Opt\u2028Island",
    ],
)
def test_malformed_lines_remain_reviewable(text: str) -> None:
    parsed, malformed = parse_arena_decklist(text)
    assert parsed == []
    assert malformed == [
        {"line": {"raw": text, "role": "main"}, "reason": "Unrecognized card line"}
    ]


def test_javascript_whitespace_safe_quantities_and_merged_rounding() -> None:
    parsed, malformed = parse_arena_decklist(
        "1\ufeffOpt\n1 Opt\n9007199254740991 Island\n2 Island\n1 Mountain (bad-set) 2"
    )
    assert not malformed
    assert parsed[0]["quantity"] == 2
    assert parsed[1]["quantity"] == 9007199254740992
    assert parsed[2]["name"] == "Mountain (bad-set) 2"
    assert parsed[2]["setCode"] is None


def test_resolution_deduplicates_across_roles_preserves_candidate_dtos_and_order() -> None:
    async def scenario() -> None:
        _, _, catalog = application()
        alternative: CardDocument = {**CARD, "id": "another", "lang": "ja"}
        candidates: dict[str, list[CardDocument]] = {"opt": [CARD], "island": [CARD, alternative]}

        async def resolve(line: dict[str, object]) -> list[CardDocument]:
            return candidates.get(str(line["normalizedName"]), [])

        catalog.resolve_catalog_candidates.side_effect = resolve
        result = await preview_inventory_import(
            catalog, "1 Opt (STA) 19\nSideboard\n2 Opt (sta) 19\n1 Island\n1 Missing\nBAD"
        )
        assert catalog.resolve_catalog_candidates.await_count == 3
        assert [item["line"]["role"] for item in result["resolved"]] == ["main", "sideboard"]
        assert result["resolved"][0]["card"] is CARD
        assert result["ambiguous"][0]["candidates"] == [CARD, alternative]
        assert [item["reason"] for item in result["unresolved"]] == [
            "Unrecognized card line",
            "No exact catalog match",
        ]
        assert result["unresolved"][0]["line"] == {"raw": "BAD", "role": "sideboard"}
        assert result["warnings"] == []

    asyncio.run(scenario())


@pytest.mark.parametrize("fails", [False, True])
def test_resolution_bounds_concurrency_and_settles_workers_on_failure(fails: bool) -> None:
    async def scenario() -> None:
        _, _, catalog = application()
        active, maximum = 0, 0

        async def resolve(line: dict[str, object]) -> list[CardDocument]:
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            try:
                await asyncio.sleep(0)
                if fails and line["name"] == "Card0":
                    raise ValidationError("Catalog unavailable")
                if fails:
                    await asyncio.Event().wait()
                return [CARD]
            finally:
                active -= 1

        catalog.resolve_catalog_candidates.side_effect = resolve
        text = "\n".join(f"1 Card{i}" for i in range(25))
        if fails:
            with pytest.raises(ValidationError, match="Catalog unavailable"):
                await preview_inventory_import(catalog, text)
        else:
            result = await preview_inventory_import(catalog, text)
            assert len(result["resolved"]) == 25
        assert maximum == 8 and active == 0

    asyncio.run(scenario())


def test_preview_checks_actor_before_text_and_catalog() -> None:
    async def scenario() -> None:
        inventory, auth, catalog = application()
        auth.require_actor.side_effect = ActorError()
        with pytest.raises(ActorError):
            await inventory.preview_import(ACTOR, None)
        auth.require_actor.side_effect = None
        for text in (None, "🔮" * 100001):
            with pytest.raises(ValidationError, match="text must be a string of at most"):
                await inventory.preview_import(ACTOR, text)
        catalog.resolve_catalog_candidates.assert_not_awaited()
        assert await inventory.preview_import(ACTOR, "") == {
            "parsed": [],
            "resolved": [],
            "unresolved": [],
            "ambiguous": [],
            "warnings": [],
        }

    asyncio.run(scenario())


def test_commit_normalizes_the_original_import_golden_fingerprint() -> None:
    async def scenario() -> None:
        inventory, _, catalog = application()
        vector = next(
            v for v in GOLDEN["fingerprints"] if '"kind":"inventory_import"' in v["inputJson"]
        )
        with patch.object(
            inventory, "prepare", AsyncMock(return_value=RecordedInventoryMutation(ACK))
        ) as prepare:
            assert (
                await inventory.commit_import(
                    ACTOR,
                    {
                        "requestId": " original ",
                        "text": " \ufeff2 Forest\r\n1 Island\r ",
                        "ignored": True,
                    },
                )
                is ACK
            )
        assert prepare.await_args is not None
        actor, intent, fingerprint = prepare.await_args.args
        assert actor is ACTOR and intent.request_id == "original" and intent.source == "import"
        assert intent.operations == ()
        assert intent.import_input == {
            "text": "2 Forest\n1 Island",
            "finish": "nonfoil",
            "condition": "NM",
        }
        assert fingerprint == vector["sha256"]
        catalog.resolve_catalog_candidates.assert_not_awaited()
        catalog.get_catalog_printing.assert_not_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize("condition", ["NM", "LP", "MP", "HP", "DMG"])
@pytest.mark.parametrize("finish", ["nonfoil", "foil"])
def test_commit_supported_defaults_are_normalized(condition: str, finish: str) -> None:
    async def scenario() -> None:
        inventory, _, _ = application()
        with patch.object(
            inventory, "prepare", AsyncMock(return_value=RecordedInventoryMutation(ACK))
        ) as prepare:
            await inventory.commit_import(
                ACTOR,
                {
                    "requestId": "r",
                    "text": "1 Opt",
                    "defaultFinish": f" {finish} ",
                    "defaultCondition": f" {condition} ",
                    "source": " scan_review ",
                },
            )
        assert prepare.await_args is not None
        intent = prepare.await_args.args[1]
        assert intent.source == "scan_review"
        assert intent.import_input == {"text": "1 Opt", "finish": finish, "condition": condition}

    asyncio.run(scenario())


@pytest.mark.parametrize("conflict", [False, True])
def test_commit_original_receipt_and_conflict_precede_all_catalog_calls(conflict: bool) -> None:
    async def scenario() -> None:
        inventory, auth, catalog = application()
        tx = AsyncMock()
        fingerprint = mutation_fingerprint(
            {
                "kind": "inventory_import",
                "source": "import",
                "import": {"text": "bad", "finish": "nonfoil", "condition": "NM"},
            }
        )
        tx.execute.return_value.fetchone.return_value = (
            "different" if conflict else fingerprint,
            ACK,
        )

        @asynccontextmanager
        async def stored_receipt(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield cast(Transaction, tx)

        with patch("spellbook_core.mtg.inventory.transaction", stored_receipt):
            if conflict:
                with pytest.raises(RequestConflictError):
                    await inventory.commit_import(ACTOR, {"requestId": "original", "text": "bad"})
            else:
                assert (
                    await inventory.commit_import(ACTOR, {"requestId": "original", "text": "bad"})
                    is ACK
                )
        auth.require_actor.assert_awaited_once_with(ACTOR)
        catalog.resolve_catalog_candidates.assert_not_awaited()
        catalog.get_catalog_printing.assert_not_awaited()
        assert tx.execute.await_args is not None
        assert tx.execute.await_args.args[1] == (ACTOR.account_id, "original")

    asyncio.run(scenario())


def test_fresh_commit_uses_preparation_and_the_shared_transaction_seam() -> None:
    async def scenario() -> None:
        inventory, _, catalog = application()
        catalog.resolve_catalog_candidates.side_effect = lambda line: (
            []
            if line["name"] == "Missing"
            else [CARD, CARD]
            if line["name"] == "Ambiguous"
            else [CARD]
        )
        events: list[str] = []

        async def authorize(tx: Transaction, prepared: PreparedInventoryMutation) -> str:
            events.append("authorize")
            return ACTOR.account_id

        async def replay(tx: Transaction, prepared: PreparedInventoryMutation) -> None:
            events.append("replay")

        async def apply(
            tx: Transaction, prepared: PreparedInventoryMutation
        ) -> InventoryAcknowledgement:
            events.append("apply")
            assert prepared.input.operations == (
                {
                    "op": "add",
                    "catalogCardId": CARD["id"],
                    "quantity": 3,
                    "finish": "nonfoil",
                    "condition": "NM",
                },
            )
            assert prepared.printings == {CARD["id"]: CARD}
            assert prepared.import_summary == {
                "resolvedCount": 1,
                "unresolvedCount": 2,
                "ambiguousCount": 1,
            }
            return ACK

        async def record(
            tx: Transaction, prepared: PreparedInventoryMutation, ack: InventoryAcknowledgement
        ) -> None:
            events.append("record")
            assert ack is ACK

        with (
            patch("spellbook_core.mtg.inventory.transaction", no_receipt),
            patch.object(inventory, "authorize", authorize),
            patch.object(inventory, "replay", replay),
            patch.object(inventory, "apply", apply),
            patch.object(inventory, "record_receipt", record),
        ):
            assert (
                await inventory.commit_import(
                    ACTOR,
                    {
                        "requestId": "r",
                        "text": "1 Opt\n2 Opt\n1 Missing\nbad\n1 Ambiguous\nSideboard\n5 Opt",
                    },
                )
                is ACK
            )
        assert events == ["authorize", "replay", "apply", "record"]
        catalog.get_catalog_printing.assert_awaited_once_with(CARD["id"])

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("bad", "No resolved Inventory lines to commit"),
        ("Sideboard\n1 Opt", "No resolved Inventory lines to commit"),
        ("2147483648 Opt", "Quantity must be a finite 32-bit integer"),
        (
            "\n".join(f"1 Card{i}" for i in range(1001)),
            "Supply at most 1000 Inventory import lines",
        ),
    ],
)
def test_fresh_commit_rejects_empty_unsupported_or_oversized_operations(
    text: str, message: str
) -> None:
    async def scenario() -> None:
        inventory, _, _ = application()
        with (
            patch("spellbook_core.mtg.inventory.transaction", no_receipt),
            pytest.raises(ValidationError, match=message),
        ):
            await inventory.commit_import(ACTOR, {"requestId": "r", "text": text})

    asyncio.run(scenario())
