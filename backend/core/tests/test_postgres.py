"""Native PostgreSQL transfer for common Core, using an explicitly leased target.

Run with the existing API dev environment, which owns psycopg-pool. Core keeps no
pool dependency. Set P02B_CORE_NATIVE_DATABASE to the assigned database name and
TEST_DATABASE_URL through that lease's protected environment before selecting this file.
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
from typing import Protocol, cast
from uuid import uuid4

import pytest
from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict
from psycopg.errors import LockNotAvailable, ReadOnlySqlTransaction
from psycopg.types.json import Jsonb

from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.errors import ActorError, ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import create_catalog, read_transaction_catalog_printing
from spellbook_core.mtg.errors import CatalogPrintingNotFoundError

pytestmark = pytest.mark.skipif(
    not os.environ.get("P02B_CORE_NATIVE_DATABASE"), reason="Requires exclusive native PG lease"
)
ROOT = Path(__file__).resolve().parents[3]


class _Pool(ConnectionPool, Protocol):
    async def open(self, wait: bool = False, timeout: float = 30.0) -> None: ...
    async def close(self, timeout: float = 5.0) -> None: ...


async def _ledger(tx: Transaction) -> list[tuple[object, ...]]:
    cursor = await tx.execute(
        "SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at"
    )
    return await cursor.fetchall()


@asynccontextmanager
async def native_pool() -> AsyncIterator[_Pool]:
    target = os.environ["P02B_CORE_NATIVE_DATABASE"]
    assert target == "sb_py_0e56d611_api_python", "Requires the allocated api_python database"
    dsn = os.environ["TEST_DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target, "Lease target mismatch"
    # Actual Psycopg pool, injected through the same structural port as API lifetime.
    module = pytest.importorskip("psycopg_pool")
    factory = cast(Callable[..., _Pool], module.AsyncConnectionPool)
    pool = factory(dsn, open=False, min_size=0, max_size=4, max_waiting=32, timeout=2.0)
    await pool.open()
    try:
        async with transaction(pool, read_only=True) as tx:
            before = await _ledger(tx)
            version = await (await tx.execute("SHOW server_version_num")).fetchone()
            assert version and int(str(version[0])) // 10000 == 18
            journal = json.loads((ROOT / "backend/drizzle/meta/_journal.json").read_text())
            expected = [
                (
                    hashlib.sha256(
                        (ROOT / "backend/drizzle" / (entry["tag"] + ".sql")).read_bytes()
                    ).hexdigest(),
                    str(entry["when"]),
                )
                for entry in journal["entries"]
            ]
            assert len(expected) == 25
            assert before == expected
        yield pool
        async with transaction(pool, read_only=True) as tx:
            assert await _ledger(tx) == before
    finally:
        await pool.close()


@asynccontextmanager
async def native_account(pool: ConnectionPool) -> AsyncIterator[tuple[str, str]]:
    account_id = str(uuid4())
    # Synthetic public values, never a real account's credentials.
    token = uuid4().hex + uuid4().hex[:11]
    digest = hash_session_token(token)
    try:
        async with transaction(pool) as tx:
            await tx.execute(
                "INSERT INTO user_profiles(account_id,username) VALUES (%s,%s)",
                (account_id, "p02b-common-" + account_id),
            )
            await tx.execute(
                "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES (%s,%s,%s)",
                (digest, account_id, datetime.now(UTC) + timedelta(hours=1)),
            )
        yield account_id, token
    finally:
        async with transaction(pool) as tx:
            await tx.execute("DELETE FROM user_profiles WHERE account_id=%s", (account_id,))
        async with transaction(pool, read_only=True) as tx:
            assert (
                await (
                    await tx.execute(
                        "SELECT 1 FROM user_profiles WHERE account_id=%s", (account_id,)
                    )
                ).fetchone()
                is None
            )
            assert (
                await (
                    await tx.execute("SELECT 1 FROM auth_sessions WHERE token_hash=%s", (digest,))
                ).fetchone()
                is None
            )


def test_native_session_identity_revocation_and_dto() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_account(pool) as (account_id, token):
            auth = create_session_auth(pool)
            info = await auth.inspect_session(token)
            assert info is not None
            actor = info.user
            assert actor.account_id == account_id
            assert set(info.to_dto()) == {"user", "expiresAt"}
            assert set(info.to_dto()["user"]) == {
                "accountId",
                "username",
                "email",
                "avatarId",
                "artworkId",
            }
            assert info.expires_at.endswith("Z")
            assert actor != await auth.require_actor(actor)
            assert (await auth.actor_session(actor)).user.account_id == account_id
            forged = Actor(
                account_id, actor.username, actor.email, actor.avatar_id, actor.artwork_id
            )
            for untrusted in (forged, copy.copy(actor)):
                with pytest.raises(ActorError):
                    await auth.require_actor(untrusted)
            with pytest.raises(ActorError):
                await create_session_auth(pool).require_actor(actor)
            async with transaction(pool) as tx:
                await tx.execute(
                    "UPDATE user_profiles SET username='changed' WHERE account_id=%s",
                    (account_id,),
                )
            assert (await auth.require_actor(actor)).username == "changed"
            async with transaction(pool) as tx:
                await tx.execute(
                    "DELETE FROM auth_sessions WHERE token_hash=%s", (hash_session_token(token),)
                )
            assert await auth.validate_session(token) is None
            with pytest.raises(ActorError):
                await auth.actor_session(actor)
            with pytest.raises(ActorError):
                await auth.require_actor(actor)

    asyncio.run(scenario())


def test_native_ordinary_auth_does_not_take_session_share_lock() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_account(pool) as (account_id, token):
            auth = create_session_auth(pool)
            actor = await auth.validate_session(token)
            assert actor is not None
            async with transaction(pool) as tx:
                await tx.execute(
                    "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                    (account_id,),
                )
                assert (await auth.require_actor(actor, tx)).account_id == account_id
                # Logout can delete after ordinary authorization, as in Node Inventory.
                async with transaction(pool) as peer:
                    await peer.execute("SET LOCAL lock_timeout='100ms'")
                    await peer.execute(
                        "DELETE FROM auth_sessions WHERE token_hash=%s",
                        (hash_session_token(token),),
                    )
                with pytest.raises(ActorError):
                    await auth.require_actor(actor, tx)

    asyncio.run(scenario())


def test_native_write_fence_blocks_logout_and_rechecks_expiry_after_wait() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_account(pool) as (account_id, token):
            auth = create_session_auth(pool)
            actor = await auth.validate_session(token)
            assert actor is not None
            async with transaction(pool) as tx:
                await tx.execute(
                    "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                    (account_id,),
                )
                assert (await auth.require_actor_for_write(actor, tx)).account_id == account_id
                with pytest.raises(LockNotAvailable):
                    async with transaction(pool) as peer:
                        await peer.execute("SET LOCAL lock_timeout='100ms'")
                        await peer.execute(
                            "DELETE FROM auth_sessions WHERE token_hash=%s",
                            (hash_session_token(token),),
                        )
            # Bind expiry before taking a peer lock, then authorize through the blocked fence.
            async with transaction(pool) as tx:
                await tx.execute(
                    "UPDATE auth_sessions SET expires_at=%s WHERE token_hash=%s",
                    (datetime.now(UTC) + timedelta(milliseconds=300), hash_session_token(token)),
                )
            async with transaction(pool) as peer:
                await peer.execute(
                    "SELECT token_hash FROM auth_sessions WHERE token_hash=%s FOR UPDATE",
                    (hash_session_token(token),),
                )

                async def blocked_authorize() -> Actor:
                    async with transaction(pool) as tx:
                        await tx.execute(
                            "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                            (account_id,),
                        )
                        return await auth.require_actor_for_write(actor, tx)

                pending = asyncio.create_task(blocked_authorize())
                await asyncio.sleep(0.4)
                blocked = not pending.done()
            # Settle the task even if the lock assertion fails.
            try:
                with pytest.raises(ActorError):
                    await pending
                assert blocked
            finally:
                if not pending.done():
                    pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)

    asyncio.run(scenario())


def test_native_transaction_snapshot_limits_and_cancelled_rollback() -> None:
    async def scenario() -> None:
        async with native_pool() as pool, native_account(pool) as (account_id, _):
            async with transaction(pool, read_only=True, repeatable_read=True) as tx:
                assert isinstance(tx, AsyncConnection)
                for setting, expected in (
                    ("transaction_isolation", "repeatable read"),
                    ("transaction_read_only", "on"),
                    ("statement_timeout", "5s"),
                    ("lock_timeout", "2s"),
                    ("idle_in_transaction_session_timeout", "10s"),
                    ("transaction_timeout", "10s"),
                ):
                    row = await (
                        await tx.execute("SELECT current_setting(%s)", (setting,))
                    ).fetchone()
                    assert row == (expected,)
                first = await (
                    await tx.execute(
                        "SELECT username FROM user_profiles WHERE account_id=%s", (account_id,)
                    )
                ).fetchone()
                async with transaction(pool) as peer:
                    await peer.execute(
                        "UPDATE user_profiles SET username='peer' WHERE account_id=%s",
                        (account_id,),
                    )
                assert (
                    await (
                        await tx.execute(
                            "SELECT username FROM user_profiles WHERE account_id=%s", (account_id,)
                        )
                    ).fetchone()
                    == first
                )
            with pytest.raises(ReadOnlySqlTransaction):
                async with transaction(pool, read_only=True) as tx:
                    await tx.execute(
                        "UPDATE user_profiles SET username='forbidden' WHERE account_id=%s",
                        (account_id,),
                    )
            entered = asyncio.Event()

            async def interrupted() -> None:
                async with transaction(pool) as tx:
                    await tx.execute(
                        "UPDATE user_profiles SET username='cancelled' WHERE account_id=%s",
                        (account_id,),
                    )
                    entered.set()
                    await tx.execute("SELECT pg_sleep(5)")

            pending = asyncio.create_task(interrupted())
            await entered.wait()
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending
            async with transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT username FROM user_profiles WHERE account_id=%s", (account_id,)
                    )
                ).fetchone() == ("peer",)
            # The same real pool remains usable after rollback/cancellation.
            async with transaction(pool) as tx:
                assert await (await tx.execute("SELECT 1")).fetchone() == (1,)

    asyncio.run(scenario())


def test_native_catalog_active_generation_projection_and_finish_resolution() -> None:
    async def scenario() -> None:
        async with native_pool() as pool:
            catalog = create_catalog(pool)
            with pytest.raises(ValidationError, match="Invalid catalog card ID"):
                await catalog.get_catalog_printing("bad")
            with pytest.raises(CatalogPrintingNotFoundError):
                await catalog.get_catalog_printing(str(uuid4()))
            generation_id = uuid4()
            document = json.loads((ROOT / "backend/scripts/demo/cards.json").read_text())[0]
            document["internal_fact"] = "must not escape"
            async with transaction(pool, read_only=True) as tx:
                state = await (
                    await tx.execute(
                        "SELECT active_generation,previous_generation,updated_at "
                        "FROM catalog_state WHERE id=1"
                    )
                ).fetchone()
                assert state is not None
            try:
                async with transaction(pool) as tx:
                    await tx.execute(
                        "INSERT INTO catalog_generations("
                        "id,source_type,source_updated_at,document_count) "
                        "VALUES (%s,'p02b-common-test',%s,1)",
                        (generation_id, datetime.now(UTC)),
                    )
                    await tx.execute(
                        "INSERT INTO catalog_printings(generation_id,id,oracle_id,name,"
                        "normalized_name,"
                        "printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,"
                        "search_name,search_text,document) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (
                            generation_id,
                            document["id"],
                            document["oracle_id"],
                            document["name"],
                            document["name"].lower(),
                            document["name"],
                            document["lang"],
                            document["set_code"],
                            document["collector_number"],
                            document["rarity"],
                            document["cmc"],
                            document["colors"],
                            document["card_types"],
                            Jsonb(document["legalities"]),
                            document["name"].lower(),
                            document["name"],
                            Jsonb(document),
                        ),
                    )
                    await tx.execute(
                        "UPDATE catalog_state SET active_generation=%s WHERE id=1",
                        (generation_id,),
                    )
                result = await catalog.get_catalog_printing(document["id"].upper())
                assert result["id"] == document["id"]
                assert result["oracle_id"] == document["oracle_id"]
                assert result["is_foil_available"] == document["is_foil_available"]
                assert result["is_nonfoil_available"] == document["is_nonfoil_available"]
                assert "internal_fact" not in result
                async with transaction(pool, read_only=True) as tx:
                    assert await read_transaction_catalog_printing(tx, document["id"]) == result
                async with transaction(pool) as tx:
                    await tx.execute("UPDATE catalog_state SET active_generation=NULL WHERE id=1")
                with pytest.raises(CatalogPrintingNotFoundError):
                    await catalog.get_catalog_printing(document["id"])
            finally:
                async with transaction(pool) as tx:
                    await tx.execute(
                        "UPDATE catalog_state SET active_generation=%s,"
                        "previous_generation=%s,updated_at=%s "
                        "WHERE id=1",
                        state,
                    )
                    await tx.execute(
                        "DELETE FROM catalog_generations WHERE id=%s", (generation_id,)
                    )
                async with transaction(pool, read_only=True) as tx:
                    assert (
                        await (
                            await tx.execute(
                                "SELECT 1 FROM catalog_printings WHERE generation_id=%s",
                                (generation_id,),
                            )
                        ).fetchone()
                        is None
                    )
                    assert (
                        await (
                            await tx.execute(
                                "SELECT active_generation,previous_generation,updated_at "
                                "FROM catalog_state WHERE id=1"
                            )
                        ).fetchone()
                        == state
                    )

    asyncio.run(scenario())
