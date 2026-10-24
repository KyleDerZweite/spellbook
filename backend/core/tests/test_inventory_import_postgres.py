"""Guarded real Catalog/Inventory import transactions for Root's assigned database.

Uses the existing P02B_INVENTORY_NATIVE_DATABASE guard and fixture cleanup. These
cases require Root's exclusive api_python lease; ordinary local runs skip them.
"""

import asyncio
from uuid import uuid4

import pytest
from test_inventory import (
    CARD,
    NATIVE,
    PRINTINGS,
    native_account,
    native_catalog,
    native_inventory,
    native_pool,
)

from spellbook_core.db import transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.mtg.models import CardDocument


def exact_line(quantity: int = 2, card: CardDocument = CARD) -> str:
    return f"{quantity} {card['name']} ({card['set_code'].upper()}) {card['collector_number']}"


@NATIVE
def test_native_import_preview_commit_account_isolation_and_concurrent_replay() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (_, token),
            native_account(pool) as (_, other_token),
        ):
            inventory, actor = await native_inventory(pool, token)
            other, other_actor = await native_inventory(pool, other_token)
            text = (
                exact_line() + "\n1 Missing Catalog Card\nmalformed\nSideboard\n" + exact_line(5)
            )
            preview = await inventory.preview_import(actor, text)
            assert len(preview["resolved"]) == 2 and len(preview["unresolved"]) == 2
            assert preview["resolved"][0]["card"]["id"] == CARD["id"]
            request = {"requestId": str(uuid4()), "text": text, "defaultCondition": "LP"}
            first, duplicate = await asyncio.gather(
                inventory.commit_import(actor, request), inventory.commit_import(actor, request)
            )
            assert first == duplicate
            assert first["revision"] == "1"
            assert first["import"] == {
                "resolvedCount": 1,
                "unresolvedCount": 2,
                "ambiguousCount": 0,
            }
            change = first["changes"][0]
            assert change["quantity"] == 2 and change["condition"] == "LP"
            detail = await inventory.get_entry(actor, change["entryId"])
            assert detail and detail["entry"]["quantity"] == 2
            assert await other.get_entry(other_actor, change["entryId"]) is None
            isolated = await other.commit_import(other_actor, request)
            assert isolated["inventoryId"] != first["inventoryId"]
            assert isolated["changes"][0]["quantity"] == 2
            with pytest.raises(RequestConflictError):
                await inventory.commit_import(actor, {**request, "defaultCondition": "MP"})

    asyncio.run(scenario())


@NATIVE
def test_native_import_replays_original_ack_after_entry_deletion_and_catalog_removal() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (_, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            request = {"requestId": str(uuid4()), "text": exact_line()}
            original = await inventory.commit_import(actor, request)
            entry = original["changes"][0]["entryId"]
            await inventory.remove(
                actor, {"requestId": str(uuid4()), "entryId": entry, "expectedQuantity": 2}
            )
            assert await inventory.commit_import(actor, request) == original
            recreated = await inventory.commit_import(
                actor, {**request, "requestId": str(uuid4())}
            )
            assert recreated["changes"][0]["entryId"] != entry
            async with transaction(pool) as tx:
                await tx.execute(
                    "DELETE FROM catalog_printings WHERE id=%s AND generation_id="
                    "(SELECT active_generation FROM catalog_state WHERE id=1)",
                    (CARD["id"],),
                )
            assert not (await inventory.preview_import(actor, request["text"]))["resolved"]
            assert await inventory.commit_import(actor, request) == original
            with pytest.raises(ValidationError, match="No resolved Inventory lines to commit"):
                await inventory.commit_import(actor, {**request, "requestId": str(uuid4())})

    asyncio.run(scenario())


@NATIVE
def test_native_unsupported_finish_rolls_back_import_and_revoked_actor_cannot_replay() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            assert CARD["is_nonfoil_available"] and not CARD["is_foil_available"]
            inventory, actor = await native_inventory(pool, token)
            foil = next(card for card in PRINTINGS if card["is_foil_available"])
            request = {
                "requestId": str(uuid4()),
                "text": exact_line(card=foil) + "\n" + exact_line(),
                "defaultFinish": "foil",
            }
            with pytest.raises(ValidationError, match="Printing does not support this finish"):
                await inventory.commit_import(actor, request)
            async with transaction(pool, read_only=True) as tx:
                for table in ("inventories", "inventory_cards", "inventory_mutation_requests"):
                    assert (
                        await (
                            await tx.execute(
                                f"SELECT 1 FROM {table} WHERE account_id=%s", (account,)
                            )
                        ).fetchone()
                        is None
                    )
            request["defaultFinish"] = "nonfoil"
            request["text"] = exact_line()
            original = await inventory.commit_import(actor, request)
            assert original["changes"][0]["quantity"] == 2
            async with transaction(pool) as tx:
                await tx.execute("DELETE FROM auth_sessions WHERE account_id=%s", (account,))
            with pytest.raises(ActorError):
                await inventory.commit_import(actor, request)

    asyncio.run(scenario())
