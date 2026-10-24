"""Real Inventory/Groups journeys against an exclusively leased api_python database.

After loading the protected api_python environment and claiming its lease, run:
P02B_INVENTORY_NATIVE_DATABASE=sb_py_0e56d611_api_python PYTHONPATH=backend/core/src \
    uvx --from uv==0.12.23 uv run --project backend/api --no-sync python -m pytest -q \
    backend/core/tests/test_inventory_groups_postgres.py
Without the native guard these cases skip. The shared helpers own fixture cleanup.
Expected behavior follows Node inventory/read.ts and inventory/mutations.ts.
"""

import asyncio
import os
from uuid import uuid4

import pytest
from test_inventory import (
    CARD,
    PRINTINGS,
    native_account,
    native_catalog,
    native_inventory,
    native_pool,
    operation,
)

from spellbook_core.db import transaction
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.mtg.errors import (
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
)


@pytest.fixture(autouse=True)
def native_database_guard() -> None:
    target = os.environ.get("P02B_INVENTORY_NATIVE_DATABASE")
    if not target:
        pytest.skip("Requires exclusive api_python lease and protected test environment")
    assert target == "sb_py_0e56d611_api_python"


def test_filtered_ranges_keep_global_group_metadata_and_absolute_locations() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_catalog(pool), native_account(pool) as (_, token):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                operations=[
                    operation(quantity=2, notes="needle %_"),
                    operation(condition="LP", quantity=5, notes="needle"),
                    operation(condition="MP", quantity=7, notes="other"),
                ],
            )
            nm, lp, mp = [change["entryId"] for change in added["changes"]]
            group_ids = []
            for name in ("Alpha Box", "Beta Box", "Empty Box"):
                created = await inventory.create_group(
                    actor, {"requestId": str(uuid4()), "name": name}
                )
                group_ids.append(created["groups"][0]["groupId"])
            alpha, beta, empty = group_ids
            for entry_id, groups in ((nm, [alpha]), (lp, [beta, alpha]), (mp, [beta])):
                await inventory.replace_memberships(
                    actor,
                    {"requestId": str(uuid4()), "entryId": entry_id, "groupIds": groups},
                )

            query = {
                "q": "NEEDLE",
                "sets": [CARD["set_code"].upper()],
                "finish": "nonfoil",
                "group": alpha,
                "variant": "condition",
                "variantDir": "asc",
                "offset": 1,
                "limit": 1,
            }
            page = await inventory.page(actor, query)
            assert page["kind"] == "Page"
            assert [entry["id"] for entry in page["entries"]] == [lp]
            assert page["matching"] == {"entryCount": 2, "copyCount": 7}
            assert page["totals"] == {
                "entryCount": 3,
                "copyCount": 14,
                "canonicalCardCount": 1,
                "foilEntryCount": 0,
                "setCount": 1,
            }
            assert page["groups"] == [
                {"id": alpha, "name": "Alpha Box", "entryCount": 2, "quantity": 7},
                {"id": beta, "name": "Beta Box", "entryCount": 2, "quantity": 12},
                {"id": empty, "name": "Empty Box", "entryCount": 0, "quantity": 0},
            ]
            assert page["memberships"] == [
                {"entryId": lp, "groupId": group_id} for group_id in sorted([alpha, beta])
            ]
            assert page["setProgress"] == {
                "setCode": CARD["set_code"].lower(),
                "ownedCanonicalCount": 1,
                "catalogCanonicalCount": len(
                    {p["oracle_id"] for p in PRINTINGS if p["set_code"] == CARD["set_code"]}
                ),
            }
            for entry_id, index in ((nm, 0), (lp, 1), (mp, None)):
                assert await inventory.locate(actor, query, entry_id, page["revision"]) == {
                    "kind": "Location",
                    "revision": page["revision"],
                    "index": index,
                }
            condition_page = await inventory.page(actor, {**query, "condition": "LP", "offset": 0})
            assert condition_page["kind"] == "Page"
            assert [entry["id"] for entry in condition_page["entries"]] == [lp]
            assert condition_page["matching"] == {"entryCount": 1, "copyCount": 5}
            assert condition_page["totals"] == page["totals"]
            assert condition_page["setProgress"] == page["setProgress"]
            literal = await inventory.page(actor, {"q": "%_"})
            assert literal["kind"] == "Page"
            assert [entry["id"] for entry in literal["entries"]] == [nm]
            directory = await inventory.page(
                actor, {"view": "groups", "q": "BOX", "offset": 2, "limit": 1}
            )
            assert directory["kind"] == "Page"
            assert directory["groupCount"] == 3
            assert directory["groupPage"] == [page["groups"][2]]
            assert directory["entries"] == [] and directory["memberships"] == []
            assert directory["totals"] == page["totals"]
            removed = await inventory.delete_group(
                actor, {"requestId": str(uuid4()), "groupId": alpha}
            )
            # A revision reset wins over validation of the now-deleted group.
            changed = {"kind": "RevisionChanged", "revision": removed["revision"]}
            assert await inventory.page(actor, query, page["revision"]) == changed
            assert await inventory.locate(actor, query, lp, page["revision"]) == changed
            with pytest.raises(ValidationError, match="Inventory group not found"):
                await inventory.page(actor, query)

    asyncio.run(scenario())


def test_group_receipts_replay_original_names_and_memberships_after_deletion() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_catalog(pool), native_account(pool) as (_, token):
            inventory, actor = await native_inventory(pool, token)
            created_input = {"requestId": str(uuid4()), "name": " Original Box "}
            created = await inventory.create_group(actor, created_input)
            group_id = created["groups"][0]["groupId"]
            assert created["groups"] == [{"groupId": group_id, "name": "Original Box"}]
            assert created["revision"] == "1" and created["changes"] == []
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[operation()]
            )
            entry_id = added["changes"][0]["entryId"]
            membership_input = {
                "requestId": str(uuid4()),
                "entryId": entry_id,
                "groupIds": [group_id, group_id.upper()],
            }
            membership = await inventory.replace_memberships(actor, membership_input)
            assert membership["memberships"] == [{"entryId": entry_id, "groupIds": [group_id]}]
            assert membership["revision"] == "3"
            rename_input = {
                "requestId": str(uuid4()),
                "groupId": group_id,
                "name": "Renamed Box",
            }
            renamed = await inventory.rename_group(actor, rename_input)
            assert renamed["groups"] == [{"groupId": group_id, "name": "Renamed Box"}]
            noop = await inventory.rename_group(actor, {**rename_input, "requestId": str(uuid4())})
            assert noop["revision"] == renamed["revision"] == "4"
            deleted_input = {"requestId": str(uuid4()), "groupId": group_id}
            deleted = await inventory.delete_group(actor, deleted_input)
            assert deleted["removedGroupIds"] == [group_id] and deleted["revision"] == "5"
            detail = await inventory.get_entry(actor, entry_id)
            assert detail and detail["entry"]["quantity"] == 2 and detail["memberships"] == []
            await inventory.remove(
                actor, {"requestId": str(uuid4()), "entryId": entry_id, "expectedQuantity": 2}
            )
            assert await inventory.create_group(actor, created_input) == created
            assert await inventory.rename_group(actor, rename_input) == renamed
            assert await inventory.replace_memberships(actor, membership_input) == membership
            assert await inventory.delete_group(actor, deleted_input) == deleted
            with pytest.raises(RequestConflictError):
                await inventory.create_group(actor, {**created_input, "name": "Changed request"})
            page = await inventory.page(actor, {})
            assert page["kind"] == "Page" and page["revision"] == "6"
            assert page["groups"] == [] and page["entries"] == []

    asyncio.run(scenario())


def test_ordered_bulk_changes_commit_once_and_replay_after_later_edits_and_deletion() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[operation()]
            )
            entry_id = added["changes"][0]["entryId"]
            created = await inventory.create_group(
                actor, {"requestId": str(uuid4()), "name": "Bulk Box"}
            )
            group_id = created["groups"][0]["groupId"]
            membership = await inventory.replace_memberships(
                actor,
                {"requestId": str(uuid4()), "entryId": entry_id, "groupIds": [group_id]},
            )
            bulk_input = {
                "requestId": str(uuid4()),
                "operations": [
                    {
                        "op": "set",
                        "target": {"entryId": entry_id},
                        "quantity": 5,
                        "notes": "bulk notes",
                        "notesRevision": "0",
                    },
                    operation(quantity=3, notes="bulk notes", notesRevision="1"),
                    {"op": "decrement", "target": {"entryId": entry_id}, "quantity": 2},
                ],
            }
            receipt = await inventory.bulk(actor, bulk_input)
            assert receipt == {
                "requestId": bulk_input["requestId"],
                "inventoryId": added["inventoryId"],
                "revision": str(int(membership["revision"]) + 1),
                "changes": [
                    {
                        "entryId": entry_id,
                        "catalogCardId": CARD["id"],
                        "finish": "nonfoil",
                        "condition": "NM",
                        "quantity": quantity,
                        "delta": delta,
                        "notesRevision": "1",
                    }
                    for quantity, delta in ((5, 3), (8, 3), (6, -2))
                ],
                "removedEntryIds": [],
                "groups": [],
                "removedGroupIds": [],
                "memberships": [],
            }
            detail = await inventory.get_entry(actor, entry_id)
            assert detail and detail["entry"]["quantity"] == 6
            assert detail["entry"]["notes"] == "bulk notes" and detail["memberships"] == [group_id]
            page = await inventory.page(actor, {})
            assert page["kind"] == "Page"
            assert page["groups"] == [
                {"id": group_id, "name": "Bulk Box", "entryCount": 1, "quantity": 6}
            ]
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT acknowledgement FROM inventory_mutation_requests "
                        "WHERE account_id=%s AND request_id=%s",
                        (account, bulk_input["requestId"]),
                    )
                ).fetchone() == (receipt,)
            await inventory.patch_entry(
                actor,
                {
                    "requestId": str(uuid4()),
                    "entryId": entry_id,
                    "quantity": 9,
                    "notes": "later notes",
                    "notesRevision": "1",
                },
            )
            assert await inventory.bulk(actor, bulk_input) == receipt
            await inventory.remove(
                actor, {"requestId": str(uuid4()), "entryId": entry_id, "expectedQuantity": 9}
            )
            assert await inventory.bulk(actor, bulk_input) == receipt
            assert await inventory.get_entry(actor, entry_id) is None
            page = await inventory.page(actor, {})
            assert page["kind"] == "Page" and page["memberships"] == []
            assert page["groups"][0]["quantity"] == page["groups"][0]["entryCount"] == 0

    asyncio.run(scenario())


def test_notes_conflict_rolls_back_earlier_bulk_changes_and_failed_request_can_retry() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            added = await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                operations=[operation(), operation(condition="LP")],
            )
            first, second = [change["entryId"] for change in added["changes"]]
            quantity_edit = await inventory.patch_entry(
                actor, {"requestId": str(uuid4()), "entryId": first, "quantity": 4}
            )
            notes_edit = await inventory.patch_entry(
                actor,
                {
                    "requestId": str(uuid4()),
                    "entryId": first,
                    "notes": "saved",
                    "notesRevision": "0",
                },
            )
            assert notes_edit["revision"] == str(int(quantity_edit["revision"]) + 1)
            before = [await inventory.get_entry(actor, entry) for entry in (first, second)]
            request_id = str(uuid4())
            failed_input = {
                "requestId": request_id,
                "operations": [
                    {"op": "set", "target": {"entryId": second}, "quantity": 99},
                    {
                        "op": "set",
                        "target": {"entryId": first},
                        "quantity": 0,
                        "notes": "stale draft",
                        "notesRevision": "0",
                    },
                ],
            }
            with pytest.raises(NotesConflictError) as conflict:
                await inventory.bulk(actor, failed_input)
            assert conflict.value.latest == {
                "entryId": first,
                "notes": "saved",
                "notesRevision": "1",
            }
            assert [await inventory.get_entry(actor, entry) for entry in (first, second)] == before
            with pytest.raises(InventoryQuantityChangedError) as quantity:
                await inventory.remove(
                    actor, {"requestId": request_id, "entryId": first, "expectedQuantity": 2}
                )
            assert quantity.value.latest_quantity == 4
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT count(*) FROM inventory_mutation_requests "
                        "WHERE account_id=%s AND request_id=%s",
                        (account, request_id),
                    )
                ).fetchone() == (0,)
            # Rollback records no receipt, so the caller can correct and retry this identity.
            noop_input = {
                "requestId": request_id,
                "entryId": first,
                "quantity": 4,
                "notes": "saved",
                "notesRevision": "1",
            }
            noop = await inventory.patch_entry(actor, noop_input)
            assert noop["revision"] == notes_edit["revision"]
            assert noop["changes"][0]["delta"] == 0
            assert noop["changes"][0]["notesRevision"] == "1"
            assert [await inventory.get_entry(actor, entry) for entry in (first, second)] == before
            assert await inventory.patch_entry(actor, noop_input) == noop

    asyncio.run(scenario())


@pytest.mark.parametrize("foreign_group", [False, True], ids=["missing", "foreign"])
def test_invalid_memberships_and_foreign_bulk_targets_leave_both_accounts_unchanged(
    foreign_group: bool,
) -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
            native_account(pool) as (_, other_token),
        ):
            inventory, actor = await native_inventory(pool, token)
            other, other_actor = await native_inventory(pool, other_token)
            # Idempotency identity is scoped to the account, including Group requests.
            shared_input = {"requestId": str(uuid4()), "name": "Private Box"}
            own_group = await inventory.create_group(actor, shared_input)
            other_group = await other.create_group(other_actor, shared_input)
            group_id = own_group["groups"][0]["groupId"]
            foreign_id = other_group["groups"][0]["groupId"]
            assert group_id != foreign_id
            added = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[operation()]
            )
            entry_id = added["changes"][0]["entryId"]
            foreign_added = await other.add_items(
                other_actor, request_id=str(uuid4()), operations=[operation(quantity=7)]
            )
            foreign_entry = foreign_added["changes"][0]["entryId"]
            await inventory.replace_memberships(
                actor,
                {"requestId": str(uuid4()), "entryId": entry_id, "groupIds": [group_id]},
            )
            before = await inventory.get_entry(actor, entry_id)
            foreign_before = await other.get_entry(other_actor, foreign_entry)
            request_id = str(uuid4())
            invalid_id = foreign_id if foreign_group else str(uuid4())
            with pytest.raises(InventoryNotFoundError):
                await inventory.replace_memberships(
                    actor,
                    {
                        "requestId": request_id,
                        "entryId": entry_id,
                        "groupIds": [group_id, invalid_id],
                    },
                )
            with pytest.raises(InventoryNotFoundError):
                await inventory.bulk(
                    actor,
                    {
                        "requestId": request_id,
                        "operations": [
                            {"op": "set", "target": {"entryId": entry_id}, "quantity": 50},
                            {"op": "remove", "target": {"entryId": foreign_entry}},
                        ],
                    },
                )
            assert await inventory.get_entry(actor, entry_id) == before
            assert await other.get_entry(other_actor, foreign_entry) == foreign_before
            assert await inventory.get_entry(actor, foreign_entry) is None
            assert await other.get_entry(other_actor, entry_id) is None
            with pytest.raises(InventoryNotFoundError):
                await inventory.rename_group(
                    actor, {"requestId": request_id, "groupId": foreign_id, "name": "Renamed"}
                )
            with pytest.raises(InventoryNotFoundError):
                await inventory.delete_group(
                    actor, {"requestId": request_id, "groupId": foreign_id}
                )
            page = await inventory.page(actor, {})
            assert page["kind"] == "Page" and before is not None
            assert page["revision"] == before["revision"]
            assert page["groups"] == [
                {"id": group_id, "name": "Private Box", "entryCount": 1, "quantity": 2}
            ]
            assert await inventory.locate(actor, {}, foreign_entry, page["revision"]) == {
                "kind": "Location",
                "revision": page["revision"],
                "index": None,
            }
            with pytest.raises(ValidationError, match="Inventory group not found"):
                await inventory.page(actor, {"group": foreign_id})
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT count(*) FROM inventory_mutation_requests "
                        "WHERE account_id=%s AND request_id=%s",
                        (account, request_id),
                    )
                ).fetchone() == (0,)

    asyncio.run(scenario())
