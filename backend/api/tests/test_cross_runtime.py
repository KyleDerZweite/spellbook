"""Reusable actual Node/Python domain scenarios on one retained leased database.

The Node side imports unchanged production TypeScript with the existing test loader
on pinned Node 26.10.0. This file makes no Python HTTP or production-host claim.
"""

import asyncio
import hashlib
import importlib.util
import json
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from psycopg.types.json import Jsonb
from spellbook_core.auth import SessionAuth, create_session_auth
from spellbook_core.catalog import create_catalog
from spellbook_core.db import ConnectionPool, transaction
from spellbook_core.errors import RequestConflictError
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.inventory import Inventory, create_inventory, normalize_add
from spellbook_core.models import Actor, CardDocument

ROOT = Path(__file__).resolve().parents[3]
NATIVE = pytest.mark.skipif(
    not os.environ.get("P02B_INVENTORY_NATIVE_DATABASE"),
    reason="Requires exclusive api_python lease",
)


def _core_native_helpers() -> ModuleType:
    # The five-file ownership contract keeps native fixture helpers in the owned
    # Core test file. Load test support only, never add it to the shipped package.
    name = "p02b_inventory_native_helpers"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "backend/core/tests/test_inventory.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@dataclass(frozen=True)
class NativeInventory:
    pool: ConnectionPool
    auth: SessionAuth
    inventory: Inventory
    actor: Actor
    account_id: str
    token: str
    card: CardDocument


@asynccontextmanager
async def native_fixture() -> AsyncIterator[NativeInventory]:
    helpers = _core_native_helpers()
    async with (
        helpers.native_pool() as pool,
        helpers.native_catalog(pool),
        helpers.native_account(pool) as (account, token),
    ):
        typed_pool = cast(ConnectionPool, pool)
        auth = create_session_auth(typed_pool)
        actor = await auth.validate_session(token)
        assert actor
        yield NativeInventory(
            typed_pool,
            auth,
            create_inventory(typed_pool, create_catalog(typed_pool), auth),
            actor,
            account,
            token,
            cast(CardDocument, helpers.CARD),
        )


NODE_DRIVER = r"""
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
if (process.version !== 'v26.10.0') throw new Error('Wrong Node runtime');
const load = (path) => import(pathToFileURL(input.root + '/' + path).href);
const {createDatabase} = await load('backend/src/db/client.ts');
const {createLocalAuth} = await load('backend/src/auth/local.ts');
const {createCatalog} = await load('backend/src/catalog/search.ts');
const {createInventoryMutations} = await load('backend/src/inventory/mutations.ts');
const {ValidationError} = await load('backend/src/mtg/validation.ts');
const {createInventory} = await load('backend/src/inventory/read.ts');
const {pool, db} = createDatabase(process.env.TEST_DATABASE_URL);
// createDatabase allocates no listener/scheduler. Only this process owns this pool.
const auth = createLocalAuth(db, {demoMode:false});
const catalog = createCatalog(pool);
if (input.noCatalog) catalog.getCatalogPrinting = async () => {
  throw new Error('Catalog accessed during original receipt replay');
};
try {
  const actor = await auth.validateSession(input.token);
  if (!actor) throw new Error('Fixture session missing');
  const inventory = createInventoryMutations(db, catalog, auth);
  let result;
  if (input.action === 'add') result = await inventory.bulk(actor, input.intent);
  else if (input.action === 'read') {
    result = await createInventory(pool, auth).getEntry(actor, input.entryId);
  }
  else throw new Error('Unknown scenario action');
  process.stdout.write(JSON.stringify({version:process.version, result}));
} catch (cause) {
  if (!(cause instanceof ValidationError)) throw cause;
  process.stdout.write(JSON.stringify({version:process.version, failure:cause.message}));
} finally {
  await pool.end();
}
"""


async def node_domain(driver: Path, fixture: NativeInventory, **payload: object) -> dict[str, Any]:
    """Invoke actual Node source sequentially; database remains intact between invocations."""
    driver.write_text(NODE_DRIVER)
    process = await asyncio.create_subprocess_exec(
        "fnm",
        "exec",
        "--using",
        "26.10.0",
        "node",
        "--import",
        str(ROOT / "backend/scripts/register-types.mjs"),
        str(driver),
        cwd=ROOT,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(
                json.dumps(
                    {
                        "root": str(ROOT),
                        "token": fixture.token,
                        **payload,
                    }
                ).encode()
            ),
            20,
        )
    except BaseException:
        if process.returncode is None:
            process.terminate()
        await process.wait()
        raise
    # Never include stderr: a native driver failure may contain connection details.
    assert process.returncode == 0, (
        f"Node scenario failed, exit={process.returncode}, stderr bytes={len(stderr)}"
    )
    result: dict[str, Any] = json.loads(stdout)
    assert result["version"] == "v26.10.0"
    return result


@NATIVE
@pytest.mark.parametrize("first_runtime", ["node", "python"])
def test_native_retained_database_original_replay_both_runtime_directions(
    tmp_path: Path,
    first_runtime: str,
) -> None:
    async def scenario() -> None:
        async with native_fixture() as fixture:
            driver = tmp_path / "inventory-domain.mjs"
            inventory, actor = fixture.inventory, fixture.actor
            operations = [
                {
                    "op": "add",
                    "catalogCardId": fixture.card["id"].upper(),
                    "finish": " nonfoil ",
                    "condition": " NM ",
                    "quantity": 2,
                    "unknown": "ignored",
                    "notesRevision": None,
                }
            ]
            request_id = str(uuid4())
            intent = {"requestId": request_id, "source": " mobile ", "operations": operations}

            async def python_add(ops: object = operations) -> Any:
                return await inventory.add_items(
                    actor, request_id=request_id, source=" mobile ", operations=ops
                )

            async def node_add(ops: object = operations) -> dict[str, Any]:
                return await node_domain(
                    driver,
                    fixture,
                    action="add",
                    noCatalog=True,
                    intent={**intent, "operations": ops},
                )

            if first_runtime == "node":
                original = (await node_domain(driver, fixture, action="add", intent=intent))[
                    "result"
                ]
            else:
                original = await python_add()
            entry_id = original["changes"][0]["entryId"]
            normalized = [normalize_add(operations[0])]
            expected_hash = mutation_fingerprint(
                {"kind": "inventory", "source": "mobile", "operations": normalized}
            )
            async with transaction(fixture.pool, read_only=True) as tx:
                before = await (
                    await tx.execute(
                        "SELECT request_hash,acknowledgement FROM inventory_mutation_requests "
                        "WHERE account_id=%s AND request_id=%s",
                        (fixture.account_id, request_id),
                    )
                ).fetchone()
                assert before == (expected_hash, original)
            python_read = await inventory.get_entry(actor, entry_id)
            assert (await node_domain(driver, fixture, action="read", entryId=entry_id))[
                "result"
            ] == python_read
            with patch.object(
                inventory._catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Unexpected Python Catalog lookup")),
            ):
                assert await python_add() == original
                assert (await node_add())["result"] == original
                async with transaction(fixture.pool) as tx:
                    await tx.execute(
                        "UPDATE inventory_cards SET quantity=19,notes='later',notes_revision=5 "
                        "WHERE id=%s",
                        (entry_id,),
                    )
                assert await python_add() == original
                assert (await node_add())["result"] == original
                async with transaction(fixture.pool) as tx:
                    await tx.execute("DELETE FROM inventory_cards WHERE id=%s", (entry_id,))
                assert await python_add() == original
                assert (await node_add())["result"] == original
            recreated = await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                source="mobile",
                operations=[{**operations[0], "quantity": 7}],
            )
            assert recreated["changes"][0]["entryId"] != entry_id
            with patch.object(
                inventory._catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Unexpected Catalog lookup")),
            ):
                assert await python_add() == original
                assert (await node_add())["result"] == original
                changed = [{**operations[0], "quantity": 3}]
                with pytest.raises(RequestConflictError):
                    await python_add(changed)
                assert (await node_add(changed))[
                    "failure"
                ] == "Request ID was already used for a different mutation"
            async with transaction(fixture.pool, read_only=True) as tx:
                assert (
                    await (
                        await tx.execute(
                            "SELECT request_hash,acknowledgement FROM inventory_mutation_requests "
                            "WHERE account_id=%s AND request_id=%s",
                            (fixture.account_id, request_id),
                        )
                    ).fetchone()
                    == before
                )
                assert await (
                    await tx.execute(
                        "SELECT count(*),sum(quantity) FROM inventory_cards WHERE account_id=%s",
                        (fixture.account_id,),
                    )
                ).fetchone() == (1, 7)
            for legacy_hash, legacy_ack in ((None, original), (None, None), (expected_hash, None)):
                legacy_id = str(uuid4())
                async with transaction(fixture.pool) as tx:
                    await tx.execute(
                        "INSERT INTO inventory_mutation_requests"
                        "(account_id,request_id,source,status,request_hash,acknowledgement) "
                        "VALUES (%s,%s,'mobile','applied',%s,%s)",
                        (
                            fixture.account_id,
                            legacy_id,
                            legacy_hash,
                            Jsonb(legacy_ack) if legacy_ack is not None else None,
                        ),
                    )
                python_legacy = await inventory.add_items(
                    actor,
                    request_id=legacy_id,
                    source="mobile",
                    operations=operations,
                )
                node_legacy = (
                    await node_domain(
                        driver,
                        fixture,
                        action="add",
                        noCatalog=True,
                        intent={**intent, "requestId": legacy_id},
                    )
                )["result"]
                assert python_legacy == node_legacy
                if legacy_ack is not None:
                    assert python_legacy == original
                else:
                    assert python_legacy == {
                        "requestId": legacy_id,
                        "inventoryId": None,
                        "revision": "0",
                        "changes": [],
                        "removedEntryIds": [],
                        "groups": [],
                        "removedGroupIds": [],
                        "memberships": [],
                        "legacy": True,
                    }
                async with transaction(fixture.pool, read_only=True) as tx:
                    assert await (
                        await tx.execute(
                            "SELECT request_hash,acknowledgement FROM inventory_mutation_requests "
                            "WHERE account_id=%s AND request_id=%s",
                            (fixture.account_id, legacy_id),
                        )
                    ).fetchone() == (legacy_hash, legacy_ack)
            (tmp_path / "node-provenance.json").write_text(
                json.dumps(
                    {
                        "runtime": "v26.10.0",
                        "execution": "Node source via existing TypeScript loader",
                        "driverSha256": hashlib.sha256(driver.read_bytes()).hexdigest(),
                        "loaderSha256": hashlib.sha256(
                            (ROOT / "backend/scripts/register-types.mjs").read_bytes()
                        ).hexdigest(),
                        "sourceSha256": {
                            path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
                            for path in (
                                "backend/src/inventory/mutations.ts",
                                "backend/src/inventory/read.ts",
                                "backend/src/inventory/write.ts",
                                "backend/src/auth/local.ts",
                                "backend/src/auth/session.ts",
                                "backend/src/catalog/search.ts",
                            )
                        },
                    },
                    indent=2,
                )
                + "\n"
            )

    asyncio.run(scenario())
