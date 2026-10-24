"""Inventory transfer: units plus opt-in, exclusively leased native PostgreSQL.

Native cases use tracked real public printings. They prove domain/SQL behavior,
not an assembled production host or the P01 performance experiment.
"""

import asyncio
import copy
import hashlib
import json
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol, cast
from unittest.mock import AsyncMock, create_autospec, patch
from uuid import uuid4

import pytest
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

from spellbook_core.auth import SessionAuth, create_session_auth, hash_session_token
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_mutation
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog, create_catalog
from spellbook_core.mtg.errors import NotesConflictError
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryIntent,
    PreparedInventoryMutation,
    RecordedInventoryMutation,
    create_inventory,
    normalize_add,
)
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import MISSING, js_utf8

ROOT = Path(__file__).resolve().parents[3]
GOLDEN: dict[str, Any] = json.loads((ROOT / "contracts/fixtures/wire.json").read_text())
PRINTINGS: list[CardDocument] = json.loads((ROOT / "backend/scripts/demo/cards.json").read_text())
CARD = PRINTINGS[0]
ACTOR = Actor("unit-account", "unit", "", "", "")
NATIVE = pytest.mark.skipif(
    not os.environ.get("P02B_INVENTORY_NATIVE_DATABASE"),
    reason="Requires exclusive api_python lease",
)


def operation(**fields: object) -> dict[str, object]:
    return {
        "op": "add",
        "catalogCardId": CARD["id"],
        "finish": "nonfoil",
        "condition": "NM",
        "quantity": 2,
        **fields,
    }


@pytest.mark.parametrize("vector", GOLDEN["fingerprints"], ids=lambda v: v["id"])
def test_every_golden_fingerprint(vector: dict[str, Any]) -> None:
    payload = json.loads(vector["inputJson"], parse_int=float, parse_float=float)
    serialized = serialize_mutation(payload)
    assert serialized == vector["serialized"]
    assert js_utf8(serialized).hex() == vector["utf8Hex"]
    assert mutation_fingerprint(payload) == vector["sha256"]


@pytest.mark.parametrize("vector", GOLDEN["receipts"], ids=lambda v: v["id"])
def test_every_golden_receipt_uses_prepare_before_catalog(vector: dict[str, Any]) -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        catalog = create_autospec(Catalog, instance=True)
        catalog.get_catalog_printing.side_effect = AssertionError("Unexpected Catalog lookup")
        catalog.get_catalog_printing.return_value = CARD
        if vector.get("missing"):
            catalog.get_catalog_printing.side_effect = None
        tx = AsyncMock()
        tx.execute.return_value.fetchone.return_value = (
            None if vector.get("missing") else (vector["requestHash"], vector["acknowledgement"])
        )

        @asynccontextmanager
        async def unit_transaction(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield cast(Transaction, tx)

        inventory = create_inventory(create_autospec(ConnectionPool), catalog, auth)
        intent = InventoryIntent(
            "11111111-1111-4111-8111-111111111111", "web", (normalize_add(operation()),)
        )
        with patch("spellbook_core.mtg.inventory.transaction", unit_transaction):
            if vector.get("conflict"):
                with pytest.raises(RequestConflictError):
                    await inventory.prepare(ACTOR, intent, vector["incomingHash"])
            else:
                result = await inventory.prepare(ACTOR, intent, vector.get("incomingHash", "new"))
                if vector.get("missing"):
                    assert isinstance(result, PreparedInventoryMutation)
                    catalog.get_catalog_printing.assert_awaited_once_with(CARD["id"])
                else:
                    assert isinstance(result, RecordedInventoryMutation)
                    assert result.acknowledgement == vector["expected"]
                    catalog.get_catalog_printing.assert_not_awaited()
        auth.require_actor.assert_awaited_once_with(ACTOR)

    asyncio.run(scenario())


def test_incomplete_receipt_fails_before_catalog_or_mutation() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        catalog = create_autospec(Catalog, instance=True)
        inventory = create_inventory(create_autospec(ConnectionPool), catalog, auth)
        tx = AsyncMock()

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield cast(Transaction, tx)

        fingerprint = mutation_fingerprint(
            {"kind": "inventory", "source": "web", "operations": [normalize_add(operation())]}
        )
        receipts: tuple[tuple[str | None, object], ...] = ((None, {}), (fingerprint, None))
        with patch("spellbook_core.mtg.inventory.transaction", context):
            for row in receipts:
                tx.execute.return_value.fetchone.return_value = row
                with pytest.raises(RequestConflictError):
                    await inventory.add_items(
                        ACTOR, request_id="incomplete", operations=[operation()]
                    )
        catalog.get_catalog_printing.assert_not_awaited()
        assert all("SELECT" in call.args[0] for call in tx.execute.call_args_list)

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"catalogCardId": " " + CARD["id"]}, "catalogCardId must be a string"),
        ({"quantity": None}, "Quantity must be a finite 32-bit integer"),
        ({"quantity": True}, "Quantity must be a finite 32-bit integer"),
        ({"quantity": 0}, "Quantity must be greater than zero"),
        ({"quantity": 2147483648}, "Quantity must be a finite 32-bit integer"),
        ({"finish": None}, "value must be a string"),
        ({"condition": "bad"}, "Invalid condition"),
        ({"notes": None}, "notes must be a string"),
        ({"notes": "🔮" * 2001}, "notes must be a string"),
        ({"notes": "", "notesRevision": None}, "notesRevision must be a string"),
        ({"notes": "", "notesRevision": "01"}, "Invalid Notes revision"),
        ({"notes": "", "notesRevision": "1\n"}, "Invalid Notes revision"),
    ],
)
def test_add_normalization_rejects_actual_application_failures(
    fields: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        normalize_add(operation(**fields))


def test_add_absence_unknown_keys_and_uuid_rules() -> None:
    base = normalize_add(operation())
    assert normalize_add(
        operation(
            catalogCardId=CARD["id"].upper(), finish=" foil ", condition=" NM ", quantity=2.0
        )
    ) == {**base, "finish": "foil"}
    assert (
        normalize_add(operation(notesRevision=None, name="untrusted", canonicalCardId="fake"))
        == base
    )
    assert normalize_add(operation(catalogCardId=None, card={"catalogCardId": CARD["id"]})) == base
    assert normalize_add(operation(notes="", notesRevision=MISSING)) == {**base, "notes": ""}
    assert (
        normalize_add(operation(notes="🔮" * 2000, notesRevision="9007199254740993"))[
            "notesRevision"
        ]
        == "9007199254740993"
    )


def test_normalized_payload_excludes_request_id_and_unowned_metadata() -> None:
    async def scenario() -> None:
        inventory = create_inventory(
            create_autospec(ConnectionPool), create_autospec(Catalog), create_autospec(SessionAuth)
        )
        prepare = AsyncMock(return_value=RecordedInventoryMutation(cast(Any, {"original": True})))
        with patch.object(inventory, "prepare", prepare):
            for request_id in (" first ", "second"):
                await inventory.add_items(
                    ACTOR,
                    request_id=request_id,
                    source=" mobile ",
                    operations=[operation(name="ignored", notesRevision=None)],
                )
        first, second = prepare.await_args_list
        assert first.args[1].request_id == "first"
        assert first.args[2] == second.args[2]
        assert first.args[2] == mutation_fingerprint(
            {"kind": "inventory", "source": "mobile", "operations": [normalize_add(operation())]}
        )
        cases: list[tuple[dict[str, object], str]] = [
            ({"operations": []}, "Supply 1 to 1000"),
            ({"operations": [operation()] * 1001}, "Supply 1 to 1000"),
            ({"operations": [{"op": "patch"}]}, "Unsupported Inventory operation"),
            ({"source": None}, "source must be a string"),
            ({"request_id": None}, "requestId must be a string"),
        ]
        for kwargs, expected in cases:
            with pytest.raises(ValidationError, match=expected):
                await inventory.add_items(
                    ACTOR, **{"request_id": "x", "operations": [operation()], **kwargs}
                )

    asyncio.run(scenario())


class _Pool(ConnectionPool, Protocol):
    async def open(self, wait: bool = False, timeout: float = 30.0) -> None: ...
    async def close(self, timeout: float = 5.0) -> None: ...


@asynccontextmanager
async def native_pool() -> AsyncIterator[_Pool]:
    target = os.environ["P02B_INVENTORY_NATIVE_DATABASE"]
    assert target == "sb_py_0e56d611_api_python"
    dsn = os.environ["TEST_DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target
    module = pytest.importorskip("psycopg_pool")
    pool = cast(Callable[..., _Pool], module.AsyncConnectionPool)(
        dsn,
        open=False,
        min_size=0,
        max_size=2,
        max_waiting=32,
        timeout=2.0,
    )
    await pool.open()
    try:
        async with transaction(pool, read_only=True) as tx:
            before = await (
                await tx.execute(
                    "SELECT hash,created_at::text FROM "
                    "drizzle.__drizzle_migrations ORDER BY created_at"
                )
            ).fetchall()
            journal = json.loads((ROOT / "backend/drizzle/meta/_journal.json").read_text())
            assert before == [
                (
                    hashlib.sha256(
                        (ROOT / "backend/drizzle" / (e["tag"] + ".sql")).read_bytes()
                    ).hexdigest(),
                    str(e["when"]),
                )
                for e in journal["entries"]
            ]
            assert len(before) == 25
        yield pool
        async with transaction(pool, read_only=True) as tx:
            assert (
                await (
                    await tx.execute(
                        "SELECT hash,created_at::text FROM "
                        "drizzle.__drizzle_migrations ORDER BY created_at"
                    )
                ).fetchall()
                == before
            )
    finally:
        await pool.close()


@asynccontextmanager
async def native_account(pool: ConnectionPool) -> AsyncIterator[tuple[str, str]]:
    account_id, token = str(uuid4()), uuid4().hex + uuid4().hex[:11]
    try:
        async with transaction(pool) as tx:
            await tx.execute(
                "INSERT INTO user_profiles(account_id,username) VALUES (%s,%s)",
                (account_id, "p02b-inventory-" + account_id),
            )
            await tx.execute(
                "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES (%s,%s,%s)",
                (hash_session_token(token), account_id, datetime.now(UTC) + timedelta(hours=1)),
            )
        yield account_id, token
    finally:
        async with transaction(pool) as tx:
            await tx.execute(
                "DELETE FROM inventory_mutation_requests WHERE account_id=%s", (account_id,)
            )
            await tx.execute("DELETE FROM user_profiles WHERE account_id=%s", (account_id,))


@asynccontextmanager
async def native_catalog(pool: ConnectionPool) -> AsyncIterator[None]:
    # This tracked fixture is also used by P01's actual Node/PostgreSQL transfer.
    assert (
        hashlib.sha256((ROOT / "backend/scripts/demo/cards.json").read_bytes()).hexdigest()
        == "af9334071e99a93a7ac5265cd2d2919c8e09774dcdcfb7a639772e9adbf67849"
    )
    generation = uuid4()
    async with transaction(pool) as tx:
        state = await (
            await tx.execute(
                "SELECT active_generation,previous_generation,updated_at "
                "FROM catalog_state WHERE id=1"
            )
        ).fetchone()
    published = False
    try:
        async with transaction(pool) as tx:
            await tx.execute("SELECT pg_advisory_xact_lock(1936747619,1)")
            await tx.execute(
                (
                    "INSERT INTO "
                    "catalog_generations(id,source_type,source_updated_at,documen"
                    "t_count,schema_version,published_at) VALUES "
                    "(%s,'test-p02b-inventory',%s,%s,2,now())"
                ),
                (generation, datetime(2026, 10, 7, tzinfo=UTC), len(PRINTINGS)),
            )
            for d in PRINTINGS:
                await tx.execute(
                    (
                        "INSERT INTO "
                        "catalog_printings(generation_id,id,oracle_id,name,normalized"
                        "_name,printed_name,lang,set_code,collector_number,rarity,cmc"
                        ",colors,card_types,legalities,search_name,search_text,docume"
                        "nt) VALUES "
                        "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
                    ),
                    (
                        generation,
                        d["id"],
                        d["oracle_id"],
                        d["name"],
                        d.get("normalized_name", d["name"].lower()),
                        d.get("printed_name", d["name"]),
                        d["lang"],
                        d["set_code"],
                        d["collector_number"],
                        d["rarity"],
                        d["cmc"],
                        d["colors"],
                        d["card_types"],
                        Jsonb(d["legalities"]),
                        d["name"].lower(),
                        d["name"],
                        Jsonb(d),
                    ),
                )
            await tx.execute(
                (
                    "INSERT INTO catalog_state(id,active_generation) VALUES "
                    "(1,%s) ON CONFLICT(id) DO UPDATE SET "
                    "active_generation=excluded.active_generation"
                ),
                (generation,),
            )
        published = True
        yield
    finally:
        if published:
            async with transaction(pool) as tx:
                await tx.execute("SELECT pg_advisory_xact_lock(1936747619,1)")
                current = await (
                    await tx.execute(
                        "SELECT active_generation FROM catalog_state WHERE id=1 FOR UPDATE"
                    )
                ).fetchone()
                assert current and str(current[0]) == str(generation), (
                    "Foreign Catalog publication"
                )
                if state:
                    await tx.execute(
                        (
                            "UPDATE catalog_state SET "
                            "active_generation=%s,previous_generation=%s,updated_at=%s "
                            "WHERE id=1"
                        ),
                        state,
                    )
                else:
                    await tx.execute("DELETE FROM catalog_state WHERE id=1")
                await tx.execute("DELETE FROM catalog_generations WHERE id=%s", (generation,))


async def native_inventory(pool: ConnectionPool, token: str) -> tuple[Inventory, Actor]:
    auth = create_session_auth(pool)
    actor = await auth.validate_session(token)
    assert actor is not None
    return create_inventory(pool, create_catalog(pool), auth), actor


@NATIVE
def test_native_duplicate_replay_edits_deletion_recreation_and_receipts() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            request_id = str(uuid4())
            args = {"request_id": request_id, "operations": [operation()]}
            first, duplicate = await asyncio.gather(
                inventory.add_items(actor, **args), inventory.add_items(actor, **args)
            )
            assert first == duplicate
            entry_id = first["changes"][0]["entryId"]
            detail = await inventory.get_entry(actor, entry_id)
            assert detail and detail["entry"]["quantity"] == 2 and detail["revision"] == "1"
            async with transaction(pool) as tx:
                stored = await (
                    await tx.execute(
                        (
                            "SELECT request_hash,acknowledgement FROM "
                            "inventory_mutation_requests WHERE account_id=%s AND "
                            "request_id=%s"
                        ),
                        (account, request_id),
                    )
                ).fetchone()
                assert stored == (
                    mutation_fingerprint(
                        {
                            "kind": "inventory",
                            "source": "web",
                            "operations": [normalize_add(operation())],
                        }
                    ),
                    first,
                )
                await tx.execute(
                    (
                        "UPDATE inventory_cards SET "
                        "quantity=9,notes='later',notes_revision=5 WHERE id=%s"
                    ),
                    (entry_id,),
                )
            with patch.object(
                inventory._catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Catalog accessed on replay")),
            ):
                assert await inventory.add_items(actor, **args) == first
                with pytest.raises(RequestConflictError):
                    await inventory.add_items(
                        actor, request_id=request_id, operations=[operation(quantity=3)]
                    )
                async with transaction(pool) as tx:
                    await tx.execute("DELETE FROM inventory_cards WHERE id=%s", (entry_id,))
                assert await inventory.add_items(actor, **args) == first
            recreated = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[operation(quantity=7)]
            )
            assert recreated["changes"][0]["entryId"] != entry_id
            with patch.object(
                inventory._catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Catalog accessed")),
            ):
                assert await inventory.add_items(actor, **args) == first
                for index, vector in enumerate(GOLDEN["receipts"]):
                    if vector.get("missing"):
                        continue
                    receipt_id = "receipt-" + str(index)
                    async with transaction(pool) as tx:
                        await tx.execute(
                            (
                                "INSERT INTO "
                                "inventory_mutation_requests(account_id,request_id,source,sta"
                                "tus,request_hash,acknowledgement) VALUES "
                                "(%s,%s,'web','applied',%s,%s)"
                            ),
                            (
                                account,
                                receipt_id,
                                vector["requestHash"],
                                Jsonb(vector["acknowledgement"]),
                            ),
                        )
                    intent = InventoryIntent(receipt_id, "web", (normalize_add(operation()),))
                    if vector.get("conflict"):
                        with pytest.raises(RequestConflictError):
                            await inventory.prepare(actor, intent, vector["incomingHash"])
                    else:
                        result = await inventory.prepare(actor, intent, vector["incomingHash"])
                        expected = vector["expected"]
                        assert (
                            isinstance(result, RecordedInventoryMutation)
                            and result.acknowledgement == expected
                        )
                    async with transaction(pool, read_only=True) as tx:
                        assert await (
                            await tx.execute(
                                (
                                    "SELECT request_hash,acknowledgement FROM "
                                    "inventory_mutation_requests WHERE account_id=%s AND "
                                    "request_id=%s"
                                ),
                                (account, receipt_id),
                            )
                        ).fetchone() == (vector["requestHash"], vector["acknowledgement"])
            for untrusted in (copy.copy(actor), Actor(account, actor.username, "", "", "")):
                with pytest.raises(ActorError):
                    await inventory.add_items(untrusted, **args)
            async with transaction(pool) as tx:
                await tx.execute(
                    (
                        "UPDATE auth_sessions SET expires_at=now()-interval '1 "
                        "second' WHERE account_id=%s"
                    ),
                    (account,),
                )
            with pytest.raises(ActorError):
                await inventory.add_items(actor, **args)

    asyncio.run(scenario())


@NATIVE
def test_native_notes_overflow_finish_position_and_atomic_receipts() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)

            async def add(*ops: dict[str, object]) -> Any:
                return await inventory.add_items(
                    actor, request_id=str(uuid4()), operations=list(ops)
                )

            first = await add(operation(notes="Original"))
            entry_id = first["changes"][0]["entryId"]
            await add(operation())
            await add(operation(notes="Original", notesRevision="0"))
            changed = await add(operation(notes="Changed", notesRevision="0"))
            assert changed["changes"][0]["notesRevision"] == "1"
            before = await inventory.get_entry(actor, entry_id)
            assert before and before["entry"]["quantity"] == 8
            for ops, error in [
                (
                    [operation(condition="LP"), operation(notes="stale", notesRevision="0")],
                    NotesConflictError,
                ),
                (
                    [operation(condition="LP"), operation(notes="missing revision")],
                    ValidationError,
                ),
                ([operation(condition="LP"), operation(quantity=2147483647)], ValidationError),
            ]:
                request_id = str(uuid4())
                with pytest.raises(error):
                    await inventory.add_items(actor, request_id=request_id, operations=ops)
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
                                (
                                    "SELECT 1 FROM inventory_mutation_requests WHERE "
                                    "account_id=%s AND request_id=%s"
                                ),
                                (account, request_id),
                            )
                        ).fetchone()
                        is None
                    )
            async with transaction(pool) as tx:
                await tx.execute(
                    (
                        "UPDATE inventory_cards SET "
                        "spellbook_position=123,notes_revision=9007199254740993 "
                        "WHERE id=%s"
                    ),
                    (entry_id,),
                )
            result = await add(operation(condition="LP"), operation(condition="MP"))
            assert result["revision"] == str(int(before["revision"]) + 1)
            detail = await inventory.get_entry(actor, result["changes"][0]["entryId"])
            assert detail and detail["entry"]["spellbookPosition"] == 124
            assert detail["entry"]["canonicalCardId"] == CARD["oracle_id"]
            assert (
                detail["entry"]["createdAt"].endswith("Z")
                and len(detail["entry"]["createdAt"]) == 24
            )
            large = await add(operation(notes="large revision", notesRevision="9007199254740993"))
            assert large["changes"][0]["notesRevision"] == "9007199254740994"
            async with transaction(pool) as tx:
                await tx.execute(
                    "UPDATE inventory_cards SET spellbook_position=2147483647 WHERE id=%s",
                    (entry_id,),
                )
            with pytest.raises(ValidationError, match="display position range exhausted"):
                await add(operation(condition="HP"))
            unsupported = next(
                (d, finish)
                for d in PRINTINGS
                for finish, available in (
                    ("foil", d["is_foil_available"]),
                    ("nonfoil", d["is_nonfoil_available"]),
                )
                if not available
            )
            with pytest.raises(ValidationError, match="does not support this finish"):
                await add(operation(catalogCardId=unsupported[0]["id"], finish=unsupported[1]))

    asyncio.run(scenario())


@NATIVE
def test_native_readback_snapshot_memberships_account_and_no_creation() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (_, token),
            native_account(pool) as (other, other_token),
        ):
            inventory, actor = await native_inventory(pool, token)
            other_inventory, other_actor = await native_inventory(pool, other_token)
            assert await other_inventory.get_entry(other_actor, str(uuid4())) is None
            async with transaction(pool, read_only=True) as tx:
                assert (
                    await (
                        await tx.execute("SELECT 1 FROM inventories WHERE account_id=%s", (other,))
                    ).fetchone()
                    is None
                )
            receipt = await inventory.add_items(
                actor, request_id=str(uuid4()), operations=[operation()]
            )
            entry_id, inventory_id = receipt["changes"][0]["entryId"], receipt["inventoryId"]
            assert await other_inventory.get_entry(other_actor, entry_id) is None
            groups = sorted([str(uuid4()), str(uuid4())])
            async with transaction(pool) as tx:
                for i, group in enumerate(reversed(groups)):
                    await tx.execute(
                        "INSERT INTO inventory_groups(id,inventory_id,name) VALUES (%s,%s,%s)",
                        (group, inventory_id, "group-" + str(i)),
                    )
                    await tx.execute(
                        (
                            "INSERT INTO inventory_group_memberships(group_id,entry_id) "
                            "VALUES (%s,%s)"
                        ),
                        (group, entry_id),
                    )
            before = await inventory.get_entry(actor, entry_id.upper())
            assert before and before["memberships"] == groups
            assert await inventory.get_entry(actor, str(uuid4())) is None
            with pytest.raises(ValidationError):
                await inventory.get_entry(actor, " " + entry_id)
            # Interpose only after the actual snapshot has read Inventory/revision.
            original_transaction = transaction
            entered, resume = asyncio.Event(), asyncio.Event()

            @asynccontextmanager
            async def observed(
                pool_arg: ConnectionPool, **options: bool
            ) -> AsyncIterator[Transaction]:
                async with original_transaction(pool_arg, **options) as tx:
                    if options.get("repeatable_read"):
                        await tx.execute(
                            "SELECT revision FROM inventories WHERE id=%s", (inventory_id,)
                        )
                        settings = await (
                            await tx.execute(
                                "SELECT "
                                "current_setting('transaction_isolation'),current_setting('tr"
                                "ansaction_read_only')"
                            )
                        ).fetchone()
                        assert settings == ("repeatable read", "on")
                        entered.set()
                        await resume.wait()
                    yield tx

            with patch("spellbook_core.mtg.inventory.transaction", observed):
                pending = asyncio.create_task(inventory.get_entry(actor, entry_id))
                try:
                    await asyncio.wait_for(entered.wait(), 2)
                    async with transaction(pool) as peer:
                        await peer.execute(
                            "UPDATE inventory_cards SET quantity=42 WHERE id=%s", (entry_id,)
                        )
                        await peer.execute(
                            "DELETE FROM inventory_group_memberships WHERE entry_id=%s",
                            (entry_id,),
                        )
                        await peer.execute(
                            "UPDATE inventories SET revision=revision+1 WHERE id=%s",
                            (inventory_id,),
                        )
                    resume.set()
                    assert await pending == before
                finally:
                    resume.set()
                    if not pending.done():
                        pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
            after = await inventory.get_entry(actor, entry_id)
            assert after and after["entry"]["quantity"] == 42 and after["memberships"] == []
            assert int(after["revision"]) == int(before["revision"]) + 1

    asyncio.run(scenario())


@NATIVE
def test_native_profile_wait_rechecks_authority_and_cancellation_rolls_back() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_catalog(pool),
            native_account(pool) as (account, token),
        ):
            inventory, actor = await native_inventory(pool, token)
            args = {"request_id": str(uuid4()), "operations": [operation()]}
            original_record = inventory.record_receipt
            entered = asyncio.Event()

            async def blocked_record(
                tx: Transaction, prepared: PreparedInventoryMutation, ack: Any
            ) -> None:
                await original_record(tx, prepared, ack)
                entered.set()
                await tx.execute("SELECT pg_sleep(5)")

            with patch.object(inventory, "record_receipt", blocked_record):
                pending = asyncio.create_task(inventory.add_items(actor, **args))
                try:
                    await asyncio.wait_for(entered.wait(), 3)
                    pending.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await pending
                finally:
                    if not pending.done():
                        pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
            async with transaction(pool, read_only=True) as tx:
                assert (
                    await (
                        await tx.execute(
                            "SELECT 1 FROM inventory_mutation_requests WHERE account_id=%s",
                            (account,),
                        )
                    ).fetchone()
                    is None
                )
                assert (
                    await (
                        await tx.execute(
                            "SELECT 1 FROM inventories WHERE account_id=%s", (account,)
                        )
                    ).fetchone()
                    is None
                )
            original_authorize = inventory.authorize
            authorizing = asyncio.Event()

            async def observed_authorize(
                tx: Transaction, prepared: PreparedInventoryMutation
            ) -> str:
                authorizing.set()
                return await original_authorize(tx, prepared)

            with patch.object(inventory, "authorize", observed_authorize):
                async with transaction(pool) as peer:
                    await peer.execute(
                        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                        (account,),
                    )
                    pending = asyncio.create_task(inventory.add_items(actor, **args))
                    try:
                        await asyncio.wait_for(authorizing.wait(), 3)
                        await peer.execute(
                            "DELETE FROM auth_sessions WHERE account_id=%s", (account,)
                        )
                    except BaseException:
                        pending.cancel()
                        await asyncio.gather(pending, return_exceptions=True)
                        raise
                try:
                    with pytest.raises(ActorError):
                        await pending
                finally:
                    if not pending.done():
                        pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
            async with transaction(pool, read_only=True) as tx:
                assert (
                    await (
                        await tx.execute(
                            "SELECT 1 FROM inventory_mutation_requests WHERE account_id=%s",
                            (account,),
                        )
                    ).fetchone()
                    is None
                )

    asyncio.run(scenario())
