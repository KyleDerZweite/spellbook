"""Inventory/Groups compatibility, plus guarded real PostgreSQL functional journeys."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, Mock, create_autospec, patch
from uuid import uuid4

import pytest
from test_inventory import (
    CARD,
    NATIVE,
    native_account,
    native_catalog,
    native_inventory,
    native_pool,
)
from test_inventory import (
    operation as add_operation,
)

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.errors import (
    InventoryCountError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
)
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryAcknowledgement,
    InventoryIntent,
    Operation,
    PreparedInventoryMutation,
    RecordedInventoryMutation,
    normalize_bulk_operation,
    normalize_patch,
)
from spellbook_core.mtg.inventory_query import (
    inventory_query_key,
    normalize_inventory_query,
    selection,
)
from spellbook_core.mtg.inventory_read import _EntryRow, count, read_page

ACTOR = Actor("inventory-test", "test", "", "", "")
ENTRY = "11111111-1111-4111-8111-111111111111"
GROUP = "22222222-2222-4222-8222-222222222222"
INVENTORY = "33333333-3333-4333-8333-333333333333"
NOW = datetime(2026, 10, 23, tzinfo=UTC)
ROW = _EntryRow(
    ENTRY,
    INVENTORY,
    ACTOR.account_id,
    "mtg",
    CARD["id"],
    CARD["oracle_id"],
    CARD["name"],
    CARD["set_code"],
    CARD["image_uri"],
    3,
    "nonfoil",
    "NM",
    "saved notes",
    "9",
    24,
    NOW,
    NOW,
)


def application() -> Inventory:
    auth = create_autospec(SessionAuth, instance=True)
    auth.require_actor.return_value = ACTOR
    return Inventory(
        create_autospec(ConnectionPool), create_autospec(Catalog, instance=True), auth
    )


@pytest.mark.parametrize("input", [None, [], "q", 0])
def test_query_requires_object(input: object) -> None:
    with pytest.raises(ValidationError, match="Inventory query must be an object"):
        normalize_inventory_query(input)


@pytest.mark.parametrize(
    ("input", "message"),
    [
        ({"unknown": 1}, "Unknown Inventory query option"),
        ({"q": "🔮" * 151}, "q must contain at most 300"),
        ({"sets": ["bad-code"]}, "Invalid sets"),
        ({"sets": ["x"] * 101}, "Invalid sets"),
        ({"sets": "abc"}, "Invalid sets"),
        ({"sets": ["\u017f"]}, "Invalid sets"),
        ({"finish": "FOIL"}, "Invalid finish"),
        ({"condition": "nm"}, "Invalid condition"),
        ({"sort": "position"}, "Invalid sort"),
        ({"variantDir": "DESC"}, "Invalid variantDir"),
        ({"group": " " + GROUP}, "group must be a UUID"),
        ({"offset": True}, "offset must be a nonnegative integer"),
        ({"offset": 9007199254740992}, "offset must be a nonnegative integer"),
        ({"offset": -1}, "offset must be a nonnegative integer"),
        ({"limit": 1.1}, "limit must be between 1 and 500"),
        ({"limit": "50"}, "limit must be between 1 and 500"),
        ({"limit": 501}, "limit must be between 1 and 500"),
    ],
)
def test_query_rejects_unknowns_coercion_and_invalid_values(input: object, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        normalize_inventory_query(input)


def test_query_normalization_key_and_literal_search() -> None:
    query = normalize_inventory_query(
        {
            "q": " \ufeff100%_\\ \ufeff",
            "sets": ["ABC", "abc", "DEF"],
            "group": GROUP.upper(),
            "offset": 100,
            "limit": 200,
            "sort": "set",
            "variant": "quantity",
            "variantDir": "desc",
        }
    )
    assert query["q"] == "100%_\\"
    assert query["sets"] == ["abc", "def"]
    assert query["group"] == GROUP
    assert inventory_query_key(query) == (
        '{"finish":"all","condition":"all","sort":"set","dir":"asc",'
        '"variant":"quantity","variantDir":"desc","view":"cards","q":"100%_\\\\",'
        '"sets":["abc","def"],"group":"' + GROUP + '","offset":0,"limit":50}'
    )
    where, order, values = selection(query, INVENTORY, ACTOR.account_id)
    assert values[:2] == [INVENTORY, ACTOR.account_id]
    assert values[2:6] == ["%100\\%\\_\\\\%"] * 4
    assert values[-2:] == [["abc", "def"], GROUP]
    assert "inventory_group_memberships" in where
    assert order.startswith('c.set_code COLLATE "inventory_root" asc,c.quantity desc,')
    assert "spellbook_position" not in order
    default = normalize_inventory_query({"q": None, "sets": None, "variant": None})
    assert default == normalize_inventory_query({})
    # Python-only whitespace must not change JavaScript normalization.
    assert normalize_inventory_query({"q": "\x1c"})["q"] == "\x1c"
    _, _, params = selection(
        normalize_inventory_query({"q": "\ud800"}), INVENTORY, ACTOR.account_id
    )
    assert params[2] == "%\ufffd%"


@pytest.mark.parametrize("value", [-1, "9007199254740992", True, 1.5, None])
def test_totals_fail_closed_on_inexact_or_negative_counts(value: object) -> None:
    with pytest.raises(InventoryCountError):
        count(value)


def test_bulk_normalizes_actual_operations_and_ignores_unowned_metadata() -> None:
    assert normalize_bulk_operation(
        {
            "op": "decrement",
            "target": {"entryId": ENTRY},
            "quantity": 3,
            "delta": 100,
            "unknown": "ignored",
        }
    ) == {
        "op": "patch",
        "entryId": ENTRY,
        "floor": 0,
        "delta": -3,
    }
    assert normalize_bulk_operation(
        {"op": "remove", "target": {"entryId": ENTRY}, "notes": None, "expectedQuantity": 99}
    ) == {
        "op": "remove",
        "entryId": ENTRY,
    }
    assert normalize_patch({"entryId": ENTRY, "delta": -5}) == {
        "op": "patch",
        "entryId": ENTRY,
        "floor": 1,
        "delta": -5,
    }
    assert normalize_bulk_operation(
        {"op": "set", "target": {"entryId": ENTRY}, "quantity": 0}
    ) == {
        "op": "patch",
        "entryId": ENTRY,
        "floor": 0,
        "quantity": 0,
    }


@pytest.mark.parametrize(
    ("input", "message"),
    [
        ({"quantity": 2, "delta": 1}, "Supply quantity or delta, not both"),
        ({}, "Supply a changed field"),
        ({"delta": 0}, "Delta must not be zero"),
        ({"quantity": None}, "Quantity must be a finite 32-bit integer"),
        ({"quantity": True}, "Quantity must be a finite 32-bit integer"),
        ({"notes": "draft", "notesRevision": "01"}, "Invalid Notes revision"),
    ],
)
def test_patch_validation(input: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        normalize_patch({"entryId": ENTRY, **input})


def test_public_mutations_share_the_original_fingerprint_and_receipt_path() -> None:
    async def scenario() -> None:
        inventory = application()
        recorded = RecordedInventoryMutation(
            {
                "requestId": "original",
                "inventoryId": INVENTORY,
                "revision": "7",
                "changes": [],
                "removedEntryIds": [],
                "groups": [],
                "removedGroupIds": [],
                "memberships": [],
            }
        )
        with patch.object(inventory, "prepare", AsyncMock(return_value=recorded)) as prepare:
            calls: list[
                tuple[
                    Callable[[Actor, object], Awaitable[InventoryAcknowledgement]],
                    dict[str, object],
                ]
            ] = [
                (inventory.patch_entry, {"entryId": ENTRY, "quantity": 3}),
                (
                    inventory.bulk,
                    {"operations": [{"op": "set", "target": {"entryId": ENTRY}, "quantity": 0}]},
                ),
                (inventory.remove, {"entryId": ENTRY, "expectedQuantity": 3}),
                (inventory.create_group, {"name": "  🔮Box  "}),
                (inventory.rename_group, {"groupId": GROUP, "name": "Renamed"}),
                (inventory.delete_group, {"groupId": GROUP}),
                (
                    inventory.replace_memberships,
                    {"entryId": ENTRY, "groupIds": [GROUP.upper(), GROUP]},
                ),
                (inventory.reorder, {"entryId": ENTRY, "position": 10}),
            ]
            for method, fields in calls:
                assert (
                    await method(ACTOR, {"requestId": " retry ", **fields})
                    == recorded.acknowledgement
                )
                assert prepare.await_args is not None
                intent = prepare.await_args.args[1]
                assert intent.request_id == "retry"
                assert prepare.await_args.args[2] == mutation_fingerprint(
                    {
                        "kind": "inventory",
                        "source": "web",
                        "operations": list(intent.operations),
                    }
                )
            assert prepare.await_args_list[3].args[1].operations == (
                {"op": "group-create", "name": "🔮Box"},
            )
            assert prepare.await_args_list[6].args[1].operations == (
                {
                    "op": "memberships",
                    "entryId": ENTRY,
                    "groupIds": [GROUP],
                },
            )
        cast(AsyncMock, inventory._catalog.get_catalog_printing).assert_not_awaited()

    asyncio.run(scenario())


def test_group_name_validates_utf16_bound_and_codepoint_length() -> None:
    async def scenario() -> None:
        inventory = application()
        with patch.object(inventory, "_mutate", AsyncMock()):
            await inventory.create_group(ACTOR, {"requestId": "r", "name": "🔮" * 64})
            await inventory.create_group(ACTOR, {"requestId": "r", "name": "\ud83d\udd2e" * 64})
            for name in ("", "  ", "x" * 65, "🔮" * 65, " " * 257 + "x", None):
                with pytest.raises(ValidationError):
                    await inventory.create_group(ACTOR, {"requestId": "r", "name": name})

    asyncio.run(scenario())


def transaction_double(row: _EntryRow | None = ROW) -> AsyncMock:
    tx = AsyncMock()
    tx.execute.return_value.fetchone.return_value = (INVENTORY, "7")
    tx.execute.return_value.fetchall.return_value = []
    # Psycopg cursor construction is synchronous, its context manager is asynchronous.
    cursor = AsyncMock()
    cursor.fetchone.return_value = row
    tx.cursor = Mock(return_value=AsyncMock())
    tx.cursor.return_value.__aenter__.return_value = cursor
    return tx


async def apply(inventory: Inventory, tx: AsyncMock, operation: Operation) -> Any:
    prepared = PreparedInventoryMutation(
        ACTOR, ACTOR.account_id, InventoryIntent("r", "web", (operation,)), "hash", {}
    )
    return await inventory.apply(cast(Transaction, tx), prepared)


@pytest.mark.parametrize(
    ("operation", "quantity", "delta", "revision"),
    [
        ({"op": "patch", "entryId": ENTRY, "floor": 1, "delta": -10}, 1, -2, "8"),
        ({"op": "patch", "entryId": ENTRY, "floor": 0, "delta": -10}, 0, -3, "8"),
        ({"op": "patch", "entryId": ENTRY, "floor": 1, "quantity": 0}, 0, -3, "8"),
        ({"op": "patch", "entryId": ENTRY, "floor": 1, "quantity": 3}, 3, 0, "7"),
        (
            {
                "op": "patch",
                "entryId": ENTRY,
                "floor": 1,
                "notes": "saved notes",
                "notesRevision": "9",
            },
            3,
            0,
            "7",
        ),
        (
            {"op": "patch", "entryId": ENTRY, "floor": 1, "notes": "new", "notesRevision": "9"},
            3,
            0,
            "8",
        ),
        ({"op": "remove", "entryId": ENTRY, "expectedQuantity": 3}, 0, -3, "8"),
    ],
)
def test_writer_quantity_floors_noops_and_notes_revisions(
    operation: Operation,
    quantity: int,
    delta: int,
    revision: str,
) -> None:
    async def scenario() -> None:
        tx = transaction_double()
        ack = await apply(application(), tx, operation)
        assert ack["revision"] == revision
        assert ack["changes"][0]["quantity"] == quantity
        assert ack["changes"][0]["delta"] == delta
        assert ack["removedEntryIds"] == ([ENTRY] if quantity == 0 else [])
        assert ack["changes"][0]["notesRevision"] == (
            "10" if operation.get("notes") == "new" else "9"
        )
        sql = [call.args[0] for call in tx.execute.await_args_list]
        assert sum(text.startswith("UPDATE inventories") for text in sql) == int(revision != "7")
        if revision == "7":
            assert not any(text.startswith(("UPDATE", "DELETE")) for text in sql)
        if operation["op"] == "patch" and operation.get("notes") == "new":
            update = next(
                call
                for call in tx.execute.await_args_list
                if call.args[0].startswith("UPDATE inventory_cards")
            )
            assert update.args[1][0:3] == (3, "new", "10")

    asyncio.run(scenario())


def test_stale_notes_and_quantity_fail_before_mutation() -> None:
    async def scenario() -> None:
        inventory = application()
        for operation, error in [
            (
                {
                    "op": "patch",
                    "entryId": ENTRY,
                    "floor": 0,
                    "quantity": 0,
                    "notes": "draft",
                    "notesRevision": "8",
                },
                NotesConflictError,
            ),
            (
                {"op": "remove", "entryId": ENTRY, "expectedQuantity": 2},
                InventoryQuantityChangedError,
            ),
        ]:
            tx = transaction_double()
            with pytest.raises(error) as caught:
                await apply(inventory, tx, cast(Operation, operation))
            if isinstance(caught.value, NotesConflictError):
                assert caught.value.latest == {
                    "entryId": ENTRY,
                    "notes": "saved notes",
                    "notesRevision": "9",
                }
            else:
                assert isinstance(caught.value, InventoryQuantityChangedError)
                assert caught.value.latest_quantity == 3
            assert not any(
                call.args[0].startswith(("UPDATE", "DELETE"))
                for call in tx.execute.await_args_list
            )
        with pytest.raises(InventoryNotFoundError):
            await apply(inventory, transaction_double(None), {"op": "remove", "entryId": ENTRY})

    asyncio.run(scenario())


def test_revision_reset_precedes_group_validation_and_uses_readonly_snapshot() -> None:
    async def scenario() -> None:
        inventory = application()
        tx = AsyncMock()
        tx.execute.return_value.fetchone.return_value = (INVENTORY, "8")
        options: list[dict[str, object]] = []

        @asynccontextmanager
        async def snapshot(pool: ConnectionPool, **kwargs: object) -> AsyncIterator[Transaction]:
            options.append(kwargs)
            yield cast(Transaction, tx)

        with patch("spellbook_core.mtg.inventory.transaction", snapshot):
            assert await inventory.page(ACTOR, {"group": GROUP}, "7") == {
                "kind": "RevisionChanged",
                "revision": "8",
            }
            assert await inventory.locate(ACTOR, {"group": GROUP}, ENTRY, "7") == {
                "kind": "RevisionChanged",
                "revision": "8",
            }
            for revision in ("01", "-1", "", "1.1"):
                with pytest.raises(ValidationError, match="Invalid Inventory revision"):
                    await inventory.page(ACTOR, {}, revision)
        assert options == [{"read_only": True, "repeatable_read": True}] * 2
        assert tx.execute.await_count == 2

    asyncio.run(scenario())


def test_membership_and_reorder_noops_preserve_revision_and_lock_entries_before_groups() -> None:
    async def scenario() -> None:
        inventory = application()
        tx = transaction_double()
        tx.execute.return_value.fetchall.return_value = [(GROUP,)]
        ack = await apply(
            inventory, tx, {"op": "memberships", "entryId": ENTRY, "groupIds": [GROUP]}
        )
        assert ack["revision"] == "7"
        assert ack["memberships"] == [{"entryId": ENTRY, "groupIds": [GROUP]}]
        sql = [call.args[0] for call in tx.execute.await_args_list]
        locks = [text for text in sql if "FOR UPDATE" in text]
        assert "inventories" in locks[0]
        assert "inventory_cards" in locks[1]
        assert "inventory_groups" in locks[2]
        assert not any(text.startswith(("DELETE", "INSERT", "UPDATE")) for text in sql)

        tx = transaction_double(replace(ROW, quantity=1))
        cursor = tx.cursor.return_value.__aenter__.return_value
        cursor.fetchone.return_value = replace(ROW, quantity=1)
        ack = await apply(
            inventory, tx, {"op": "patch", "entryId": ENTRY, "floor": 1, "delta": -1}
        )
        assert ack["revision"] == "7"
        assert ack["changes"][0]["quantity"] == 1
        assert ack["changes"][0]["delta"] == 0

        # An already first entry is a no-op even when its stored position has a gap.
        tx = transaction_double()
        tx.execute.return_value.fetchall.return_value = [(ENTRY, 24), (GROUP, 100)]
        ack = await apply(inventory, tx, {"op": "reorder", "entryId": ENTRY, "position": 0})
        assert ack["revision"] == "7"
        tx = transaction_double()
        tx.execute.return_value.fetchall.return_value = [(ENTRY, 24), (GROUP, 100)]
        ack = await apply(inventory, tx, {"op": "reorder", "entryId": ENTRY, "position": 999})
        assert ack["revision"] == "8"
        updates = [
            call.args[1]
            for call in tx.execute.await_args_list
            if call.args[0].startswith("UPDATE inventory_cards")
        ]
        assert [(u[0], u[2]) for u in updates] == [(0, GROUP), (1, ENTRY)]

    asyncio.run(scenario())


@NATIVE
def test_native_inventory_groups_queries_locations_receipts_and_isolation() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (_, token),
            native_account(pool) as (_, other_token),
        ):
            inventory, actor = await native_inventory(pool, token)
            other, other_actor = await native_inventory(pool, other_token)
            empty = await inventory.page(actor, {})
            assert empty["kind"] == "Page"
            assert empty["revision"] == "0" and empty["entries"] == []
            assert empty["totals"] == {
                "entryCount": 0,
                "copyCount": 0,
                "canonicalCardCount": 0,
                "foilEntryCount": 0,
                "setCount": 0,
            }
            added = await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                operations=[
                    add_operation(quantity=3),
                    add_operation(quantity=2, condition="LP"),
                    add_operation(quantity=1, condition="MP", notes="100%_literal"),
                ],
            )
            ids = [change["entryId"] for change in added["changes"]]
            original = await inventory.create_group(
                actor, {"requestId": str(uuid4()), "name": " 🔮 Box "}
            )
            group_id = original["groups"][0]["groupId"]
            with pytest.raises(ValidationError, match="already exists"):
                await inventory.create_group(actor, {"requestId": str(uuid4()), "name": "🔮 BOX"})
            noop = await inventory.rename_group(
                actor, {"requestId": str(uuid4()), "groupId": group_id, "name": "🔮 Box"}
            )
            assert noop["revision"] == original["revision"]
            membership_input = {
                "requestId": str(uuid4()),
                "entryId": ids[0],
                "groupIds": [group_id, group_id],
            }
            membership = await inventory.replace_memberships(actor, membership_input)
            same = await inventory.replace_memberships(
                actor, {**membership_input, "requestId": str(uuid4())}
            )
            assert same["revision"] == membership["revision"]
            detail = await inventory.get_entry(actor, ids[0])
            assert detail and detail["memberships"] == [group_id]
            page = await inventory.page(actor, {"group": group_id, "sets": [CARD["set_code"]]})
            assert page["kind"] == "Page"
            assert [entry["id"] for entry in page["entries"]] == [ids[0]]
            assert page["matching"] == {"entryCount": 1, "copyCount": 3}
            assert page["totals"]["copyCount"] == 6
            assert page["groups"][0]["entryCount"] == 1 and page["groups"][0]["quantity"] == 3
            assert page["setProgress"] and page["setProgress"]["ownedCanonicalCount"] == 1
            assert page["sets"][0]["code"] == CARD["set_code"].lower()
            literal = await inventory.page(actor, {"q": "%_"})
            assert literal["kind"] == "Page" and [e["id"] for e in literal["entries"]] == [ids[2]]
            directory = await inventory.page(actor, {"view": "groups", "q": "box"})
            assert directory["kind"] == "Page" and directory["groupCount"] == 1
            for query in (
                {},
                {"sort": "set", "dir": "desc"},
                {"variant": "condition", "variantDir": "desc"},
                {"sort": "newest"},
            ):
                ordered = await inventory.page(actor, query)
                assert ordered["kind"] == "Page"
                for index, entry in enumerate(ordered["entries"]):
                    assert await inventory.locate(
                        actor, query, entry["id"], ordered["revision"]
                    ) == {
                        "kind": "Location",
                        "revision": ordered["revision"],
                        "index": index,
                    }
            with pytest.raises(ValidationError, match="Inventory group not found"):
                await other.page(other_actor, {"group": group_id})
            with pytest.raises(InventoryNotFoundError):
                await other.replace_memberships(
                    other_actor,
                    {"requestId": str(uuid4()), "entryId": ids[0], "groupIds": [group_id]},
                )
            assert await other.get_entry(other_actor, ids[0]) is None
            deleted = await inventory.delete_group(
                actor, {"requestId": str(uuid4()), "groupId": group_id}
            )
            assert deleted["removedGroupIds"] == [group_id]
            stale = await inventory.page(actor, {"group": group_id}, membership["revision"])
            assert stale == {"kind": "RevisionChanged", "revision": deleted["revision"]}
            assert await inventory.replace_memberships(actor, membership_input) == membership
            detail = await inventory.get_entry(actor, ids[0])
            assert detail and detail["memberships"] == []

    asyncio.run(scenario())


@NATIVE
def test_native_bulk_atomicity_stale_conflicts_and_noop_receipts() -> None:
    from spellbook_core.db import transaction

    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[add_operation(quantity=3)]
            )
            entry_id = added["changes"][0]["entryId"]
            no_change = await inventory.patch_entry(
                actor, {"requestId": str(uuid4()), "entryId": entry_id, "quantity": 3}
            )
            assert no_change["revision"] == added["revision"]
            request_id = str(uuid4())
            before = await inventory.get_entry(actor, entry_id)
            with pytest.raises(InventoryNotFoundError):
                await inventory.bulk(
                    actor,
                    {
                        "requestId": request_id,
                        "operations": [
                            {"op": "add", **add_operation(quantity=2, condition="LP")},
                            {"op": "set", "target": {"entryId": str(uuid4())}, "quantity": 2},
                        ],
                    },
                )
            assert await inventory.get_entry(actor, entry_id) == before
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT count(*) FROM inventory_cards WHERE account_id=%s", (account,)
                    )
                ).fetchone() == (1,)
                assert (
                    await (
                        await tx.execute(
                            "SELECT 1 FROM inventory_mutation_requests "
                            "WHERE account_id=%s AND request_id=%s",
                            (account, request_id),
                        )
                    ).fetchone()
                    is None
                )
            notes = await inventory.patch_entry(
                actor,
                {
                    "requestId": str(uuid4()),
                    "entryId": entry_id,
                    "notes": "saved",
                    "notesRevision": "0",
                },
            )
            assert notes["changes"][0]["notesRevision"] == "1"
            with pytest.raises(NotesConflictError) as stale:
                await inventory.patch_entry(
                    actor,
                    {
                        "requestId": str(uuid4()),
                        "entryId": entry_id,
                        "quantity": 0,
                        "notes": "retained draft",
                        "notesRevision": "0",
                    },
                )
            assert stale.value.latest == {
                "entryId": entry_id,
                "notes": "saved",
                "notesRevision": "1",
            }
            with pytest.raises(InventoryQuantityChangedError) as quantity:
                await inventory.remove(
                    actor, {"requestId": str(uuid4()), "entryId": entry_id, "expectedQuantity": 2}
                )
            assert quantity.value.latest_quantity == 3
            floor = await inventory.patch_entry(
                actor, {"requestId": str(uuid4()), "entryId": entry_id, "delta": -99}
            )
            assert floor["changes"][0]["quantity"] == 1
            noop = await inventory.patch_entry(
                actor, {"requestId": str(uuid4()), "entryId": entry_id, "delta": -1}
            )
            assert noop["revision"] == floor["revision"] and noop["changes"][0]["delta"] == 0
            remove_input = {
                "requestId": str(uuid4()),
                "operations": [
                    {"op": "decrement", "target": {"entryId": entry_id}, "quantity": 2}
                ],
            }
            removed = await inventory.bulk(actor, remove_input)
            assert (
                removed["removedEntryIds"] == [entry_id] and removed["changes"][0]["delta"] == -1
            )
            assert await inventory.get_entry(actor, entry_id) is None
            assert await inventory.bulk(actor, remove_input) == removed
            assert (
                await inventory.patch_entry(
                    actor,
                    {"requestId": no_change["requestId"], "entryId": entry_id, "quantity": 3},
                )
                == no_change
            )

    asyncio.run(scenario())


@NATIVE
def test_native_concurrent_group_receipts_and_notes_edits() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_catalog(pool), native_account(pool) as (_, token):
            inventory, actor = await native_inventory(pool, token)
            group_input = {"requestId": str(uuid4()), "name": "Concurrent Box"}
            first, duplicate = await asyncio.gather(
                inventory.create_group(actor, group_input),
                inventory.create_group(actor, group_input),
            )
            assert first == duplicate
            page = await inventory.page(actor, {"view": "groups"})
            assert page["kind"] == "Page" and page["groupCount"] == 1
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[add_operation()]
            )
            entry_id = added["changes"][0]["entryId"]
            outcomes = await asyncio.gather(
                *[
                    inventory.patch_entry(
                        actor,
                        {
                            "requestId": str(uuid4()),
                            "entryId": entry_id,
                            "notes": text,
                            "notesRevision": "0",
                        },
                    )
                    for text in ("first editor", "second editor")
                ],
                return_exceptions=True,
            )
            saved = [outcome for outcome in outcomes if isinstance(outcome, dict)]
            conflicts = [
                outcome for outcome in outcomes if isinstance(outcome, NotesConflictError)
            ]
            assert len(saved) == len(conflicts) == 1
            detail = await inventory.get_entry(actor, entry_id)
            assert detail and detail["entry"]["notesRevision"] == "1"
            assert conflicts[0].latest == {
                "entryId": entry_id,
                "notes": detail["entry"]["notes"],
                "notesRevision": "1",
            }
            assert detail["revision"] == str(int(added["revision"]) + 1)

    asyncio.run(scenario())


@NATIVE
def test_native_positions_membership_deletion_and_semantic_noops() -> None:
    from spellbook_core.db import transaction

    async def scenario() -> None:
        async with native_pool() as pool, native_catalog(pool), native_account(pool) as (_, token):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                operations=[
                    add_operation(condition="NM"),
                    add_operation(condition="LP"),
                    add_operation(condition="MP"),
                ],
            )
            ids = [change["entryId"] for change in added["changes"]]
            async with transaction(pool) as tx:
                for index, entry_id in enumerate(ids):
                    await tx.execute(
                        "UPDATE inventory_cards SET spellbook_position=%s WHERE id=%s",
                        (index * 10 + 4, entry_id),
                    )
            same = await inventory.reorder(
                actor, {"requestId": str(uuid4()), "entryId": ids[0], "position": 0}
            )
            assert same["revision"] == added["revision"]
            moved = await inventory.reorder(
                actor, {"requestId": str(uuid4()), "entryId": ids[0], "position": 100}
            )
            details = [await inventory.get_entry(actor, entry_id) for entry_id in ids]
            assert [detail["entry"]["spellbookPosition"] for detail in details if detail] == [
                2,
                0,
                1,
            ]
            assert moved["revision"] == str(int(added["revision"]) + 1)
            group = await inventory.create_group(actor, {"requestId": str(uuid4()), "name": "Box"})
            group_id = group["groups"][0]["groupId"]
            await inventory.replace_memberships(
                actor, {"requestId": str(uuid4()), "entryId": ids[1], "groupIds": [group_id]}
            )
            removed = await inventory.remove(
                actor, {"requestId": str(uuid4()), "entryId": ids[1], "expectedQuantity": 2}
            )
            page = await inventory.page(actor, {})
            assert page["kind"] == "Page" and page["groups"][0]["entryCount"] == 0
            assert page["memberships"] == [] and page["revision"] == removed["revision"]
            # Ordinary deletion leaves unrelated display positions untouched.
            details = [await inventory.get_entry(actor, entry_id) for entry_id in (ids[0], ids[2])]
            assert [detail["entry"]["spellbookPosition"] for detail in details if detail] == [2, 1]

    asyncio.run(scenario())


def test_page_keeps_global_metadata_separate_from_the_loaded_range() -> None:
    async def scenario() -> None:
        tx = transaction_double()
        cursor = tx.cursor.return_value.__aenter__.return_value
        cursor.fetchall.return_value = [ROW]
        results = []
        for single, rows in [
            (("2", "5"), []),
            (("8", "21", "4", "2", "3"), []),
            (None, [(GROUP, "Box", "5", "11"), (INVENTORY, "Other", "2", "4")]),
            (None, [(ENTRY, GROUP)]),
            (None, [("abc", "Alpha Set"), ("def", "DEF")]),
            (("4",), []),
            (("10",), []),
        ]:
            result = AsyncMock()
            result.fetchone.return_value = single
            result.fetchall.return_value = rows
            results.append(result)
        tx.execute.side_effect = results
        query = normalize_inventory_query({"q": "box", "sets": ["abc"], "offset": 0, "limit": 1})
        page = await read_page(cast(Transaction, tx), INVENTORY, ACTOR.account_id, "7", query)
        assert page["entries"][0]["id"] == ENTRY
        assert page["entries"][0]["notesRevision"] == "9"
        assert page["entries"][0]["createdAt"] == "2026-10-23T00:00:00.000Z"
        assert page["matching"] == {"entryCount": 2, "copyCount": 5}
        assert page["totals"] == {
            "entryCount": 8,
            "copyCount": 21,
            "canonicalCardCount": 4,
            "foilEntryCount": 2,
            "setCount": 3,
        }
        assert len(page["groups"]) == 2 and page["groupCount"] == 1
        assert [group["id"] for group in page["groupPage"]] == [GROUP]
        assert page["memberships"] == [{"entryId": ENTRY, "groupId": GROUP}]
        assert page["sets"] == [
            {"code": "abc", "name": "Alpha Set"},
            {"code": "def", "name": "DEF"},
        ]
        assert page["setProgress"] == {
            "setCode": "abc",
            "ownedCanonicalCount": 4,
            "catalogCanonicalCount": 10,
        }
        # One-set progress deliberately ignores q, group, finish and condition.
        assert tx.execute.await_args_list[-2].args[1] == (INVENTORY, "abc", ACTOR.account_id)

    asyncio.run(scenario())


@NATIVE
def test_native_saved_state_notifications_commit_with_mutations_and_not_with_rollback() -> None:
    import json

    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[add_operation()]
            )
            entry_id = added["changes"][0]["entryId"]
            async with pool.connection() as listener:
                await listener.execute("LISTEN spellbook_saved_state")
                await listener.commit()
                try:
                    group = await inventory.create_group(
                        actor, {"requestId": str(uuid4()), "name": "Notified Box"}
                    )
                    events = [
                        json.loads(event.payload)
                        async for event in listener.notifies(timeout=1, stop_after=1)
                    ]
                    assert events == [{"accountId": account, "topic": "inventory"}]
                    await inventory.rename_group(
                        actor,
                        {
                            "requestId": str(uuid4()),
                            "groupId": group["groups"][0]["groupId"],
                            "name": "Notified Box",
                        },
                    )
                    assert [event async for event in listener.notifies(timeout=0.2)] == []
                    with pytest.raises(InventoryNotFoundError):
                        await inventory.bulk(
                            actor,
                            {
                                "requestId": str(uuid4()),
                                "operations": [
                                    {"op": "set", "target": {"entryId": entry_id}, "quantity": 12},
                                    {"op": "remove", "target": {"entryId": str(uuid4())}},
                                ],
                            },
                        )
                    assert [event async for event in listener.notifies(timeout=0.2)] == []
                    detail = await inventory.get_entry(actor, entry_id)
                    assert detail and detail["entry"]["quantity"] == 2
                finally:
                    await listener.execute("UNLISTEN *")
                    await listener.commit()

    asyncio.run(scenario())
