"""Opt-in Scan SQL acceptance on the existing exclusively leased disposable PG.

Root must assign P02B_SCAN_NATIVE_DATABASE and P02B_INVENTORY_NATIVE_DATABASE to
the same existing guarded target and inject TEST_DATABASE_URL privately. No service,
DDL or migration ownership is acquired here. Worker/storage integration is separate.
"""

import asyncio
import copy
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, create_autospec, patch
from uuid import uuid4

import pytest
from test_inventory import CARD, native_account, native_catalog, native_pool

from spellbook_core.auth import create_session_auth
from spellbook_core.db import ConnectionPool, transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog, create_catalog
from spellbook_core.mtg.inventory import Inventory, create_inventory
from spellbook_core.mtg.scan import Scan, ScanError, ScanStorage, ScanWorker, create_scan
from spellbook_core.mtg.scan.commit import normalize_commit

pytestmark = pytest.mark.skipif(
    not os.environ.get("P02B_SCAN_NATIVE_DATABASE"),
    reason="Requires explicit exclusive Scan native PG assignment",
)


@asynccontextmanager
async def fixture() -> AsyncIterator[tuple[ConnectionPool, Scan, Inventory, Actor, Catalog]]:
    assert os.environ["P02B_SCAN_NATIVE_DATABASE"] == os.environ["P02B_INVENTORY_NATIVE_DATABASE"]
    async with (
        native_pool() as pool,
        native_catalog(pool),
        native_account(pool) as (_account, token),
    ):
        auth = create_session_auth(pool)
        actor = await auth.validate_session(token)
        assert actor is not None
        catalog = create_catalog(pool)
        inventory = create_inventory(pool, catalog, auth)
        scan = create_scan(
            pool,
            catalog,
            auth,
            inventory,
            create_autospec(ScanStorage, instance=True),
            create_autospec(ScanWorker, instance=True),
        )
        yield pool, scan, inventory, actor, catalog


async def artifact(pool: ConnectionPool, actor: Actor, session_id: str) -> str:
    identifier = str(uuid4())
    key = f"scan-sessions/{session_id}/{identifier}.png"
    async with transaction(pool) as tx:
        await tx.execute(
            "INSERT INTO scan_artifacts(id,session_id,account_id,original_object_key,"
            "normalized_object_key,quality_score,embedding_model_version,ocr_model_version,"
            "status) "
            "VALUES (%s,%s,%s,%s,%s,0,'stub-v1','stub-v1','no_match')",
            (identifier, session_id, actor.account_id, key, key),
        )
    return identifier


def intent(session_id: str, artifact_id: str, quantity: int = 2) -> dict[str, Any]:
    return {
        "requestId": str(uuid4()),
        "sessionId": session_id,
        "items": [
            {
                "scanArtifactId": artifact_id,
                "catalogCardId": CARD["id"],
                "finish": "nonfoil",
                "condition": "NM",
                "quantity": quantity,
            }
        ],
    }


def test_native_scan_snapshot_result_replacement_and_scope() -> None:
    async def scenario() -> None:
        async with fixture() as (pool, scan, _inventory, actor, _catalog):
            session = await scan.create_session(actor)
            identifiers = sorted([await artifact(pool, actor, session["id"]) for _ in range(3)])
            result = await scan.submit_result(
                actor,
                {
                    "sessionId": session["id"],
                    "artifactId": identifiers[0],
                    "status": "matched",
                    "modelVersion": "external-v1",
                    "candidates": [
                        {"catalogCardId": CARD["id"], "confidence": 0.875, "notes": " external "}
                    ],
                },
            )
            assert result["result"]["candidates"][0]["name"] == CARD["name"]
            assert result["result"]["candidates"][0]["finalScore"] == 88
            assert result["result"]["candidates"][0]["confidence"] == 0.875
            page = await scan.read_session(
                actor, {"sessionId": session["id"], "limit": 1, "artifactCursor": identifiers[0]}
            )
            assert page["artifactCount"] == 3 and page["reviewCount"] == 0
            assert page["artifacts"][0]["id"] == identifiers[1]
            assert page["nextArtifactCursor"] == identifiers[1]
            assert page["nextReviewCursor"] is None
            assert page["lastResult"] == result["result"]
            assert page["session"]["status"] == "pending_review"
            with pytest.raises(ScanError) as closed:
                await scan.assert_uploadable(actor, session["id"])
            assert closed.value.status == 409
            assert (await scan.list_sessions(actor))[0]["id"] == session["id"]
            async with native_account(pool) as (_foreign, token):
                foreign_auth = create_session_auth(pool)
                foreign = await foreign_auth.validate_session(token)
                assert foreign is not None
                other = create_scan(
                    pool,
                    create_catalog(pool),
                    foreign_auth,
                    create_inventory(pool, create_catalog(pool), foreign_auth),
                    create_autospec(ScanStorage),
                    create_autospec(ScanWorker),
                )
                assert await other.list_sessions(foreign) == []
                with pytest.raises(ScanError) as hidden:
                    await other.read_session(foreign, {"sessionId": session["id"]})
                assert hidden.value.status == 404
                with pytest.raises(ScanError):
                    await other.read_image(foreign, identifiers[0])
            for forged in (copy.copy(actor), Actor(actor.account_id, "forged", "", "", "")):
                with pytest.raises(ActorError):
                    await scan.list_sessions(forged)

    asyncio.run(scenario())


def test_native_atomic_review_concurrent_retry_and_original_receipt() -> None:
    async def scenario() -> None:
        async with fixture() as (pool, scan, inventory, actor, catalog):
            session = await scan.create_session(actor)
            artifact_id = await artifact(pool, actor, session["id"])
            input = intent(session["id"], artifact_id)
            first, retry = await asyncio.gather(
                scan.commit_review(actor, input), scan.commit_review(actor, input)
            )
            assert first == retry and first["kind"] == "Committed"
            ack = first["acknowledgement"]
            entry_id = ack["changes"][0]["entryId"]
            detail = await inventory.get_entry(actor, entry_id)
            assert detail and detail["entry"]["quantity"] == 2
            selected = await scan.read_session(actor, {"sessionId": session["id"]})
            assert selected["session"]["status"] == "committed" and selected["reviewCount"] == 1
            assert selected["reviewItems"][0]["matchReason"] == "manual_review"
            async with transaction(pool) as tx:
                row = await (
                    await tx.execute(
                        "SELECT source,request_hash,acknowledgement "
                        "FROM inventory_mutation_requests WHERE account_id=%s AND request_id=%s",
                        (actor.account_id, input["requestId"]),
                    )
                ).fetchone()
                assert row == ("scan_review", normalize_commit(input).hash, ack)
                await tx.execute("DELETE FROM inventory_cards WHERE id=%s", (entry_id,))
            with patch.object(
                catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Catalog read during replay")),
            ):
                assert await scan.commit_review(actor, input) == first
                changed = copy.deepcopy(input)
                changed["items"][0]["quantity"] = 3
                with pytest.raises(RequestConflictError):
                    await scan.commit_review(actor, changed)
            with pytest.raises(ScanError) as stale:
                await scan.submit_result(
                    actor,
                    {
                        "sessionId": session["id"],
                        "artifactId": artifact_id,
                        "status": "no_match",
                        "modelVersion": "late",
                        "candidates": [],
                    },
                )
            assert stale.value.status == 409

    asyncio.run(scenario())


def test_native_invalid_review_rolls_back_session_inventory_and_receipt() -> None:
    async def scenario() -> None:
        async with fixture() as (pool, scan, inventory, actor, _catalog):
            session = await scan.create_session(actor)
            artifact_id = await artifact(pool, actor, session["id"])
            input = intent(session["id"], artifact_id)
            # Force a failure after valid review SQL, in the actual shared writer.
            input["items"].append({**input["items"][0], "condition": "LP", "quantity": 2147483647})
            await inventory.add_items(
                actor,
                request_id=str(uuid4()),
                operations=[
                    {
                        "op": "add",
                        "catalogCardId": CARD["id"],
                        "finish": "nonfoil",
                        "condition": "LP",
                        "quantity": 1,
                    }
                ],
            )
            with pytest.raises(ValidationError):
                await scan.commit_review(actor, input)
            selected = await scan.read_session(actor, {"sessionId": session["id"]})
            assert selected["session"]["status"] == "open" and selected["reviewCount"] == 0
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT count(*) FROM inventory_mutation_requests "
                        "WHERE account_id=%s AND request_id=%s",
                        (actor.account_id, input["requestId"]),
                    )
                ).fetchone() == (0,)
                assert await (
                    await tx.execute(
                        "SELECT sum(quantity) FROM inventory_cards WHERE account_id=%s",
                        (actor.account_id,),
                    )
                ).fetchone() == (1,)

    asyncio.run(scenario())


def test_native_review_id_cannot_move_between_artifacts_and_legacy_no_repeat() -> None:
    async def scenario() -> None:
        async with fixture() as (pool, scan, _inventory, actor, catalog):
            first_session = await scan.create_session(actor)
            first_artifact = await artifact(pool, actor, first_session["id"])
            first = intent(first_session["id"], first_artifact)
            first["items"][0]["id"] = str(uuid4())
            await scan.commit_review(actor, first)
            other_session = await scan.create_session(actor)
            other_artifact = await artifact(pool, actor, other_session["id"])
            other = intent(other_session["id"], other_artifact)
            other["items"][0]["id"] = first["items"][0]["id"]
            with pytest.raises(ValidationError, match="another artifact or session"):
                await scan.commit_review(actor, other)
            async with transaction(pool) as tx:
                await tx.execute(
                    "UPDATE inventory_mutation_requests "
                    "SET request_hash=NULL,acknowledgement=NULL "
                    "WHERE account_id=%s AND request_id=%s",
                    (actor.account_id, first["requestId"]),
                )
            with patch.object(
                catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Catalog during legacy replay")),
            ):
                legacy = await scan.commit_review(actor, first)
            assert (
                legacy["kind"] == "LegacyNoRepeat" and legacy["binding"] == "UnverifiedLegacyHash"
            )
            assert legacy["acknowledgement"]["legacy"] is True

    asyncio.run(scenario())
