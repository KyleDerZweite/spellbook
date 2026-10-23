"""Opt-in real PostgreSQL Category journey. Root owns the assigned disposable DB.

Set CATEGORY_NATIVE_DATABASE to its exact database name and TEST_DATABASE_URL to
its protected connection reference. This suite neither starts services nor migrates.
It changes only its own account/decks, and requires no pre-existing queued jobs.
"""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from psycopg.conninfo import conninfo_to_dict
from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.categories import (
    create_categories,
    ensure_entry_category_initialization,
    queue_whole_deck_evaluation,
)
from spellbook_core.categories.common import (
    CategoryNotFound,
    LibraryConflict,
    category_transaction,
)
from spellbook_core.categories.jobs import claim_whole_deck_job, process_whole_deck_job
from spellbook_core.db import ConnectionPool
from spellbook_core.models import Actor

NATIVE = pytest.mark.skipif(
    not os.environ.get("CATEGORY_NATIVE_DATABASE"),
    reason="Root's isolated disposable PostgreSQL assignment required",
)


@asynccontextmanager
async def native_pool() -> AsyncIterator[ConnectionPool]:
    target = os.environ["CATEGORY_NATIVE_DATABASE"]
    dsn = os.environ["TEST_DATABASE_URL"]
    try:
        parameters = conninfo_to_dict(dsn)
    except Exception:
        raise AssertionError("Invalid protected test database configuration") from None
    if parameters.get("dbname") != target:
        raise AssertionError("Test database does not match the explicit disposable assignment")
    assert target.startswith(("sb_py_", "spellbook_test")), "Disposable database required"
    if os.environ.get("DATABASE_URL") and os.environ["DATABASE_URL"] != dsn:
        raise AssertionError("DATABASE_URL and TEST_DATABASE_URL must match")
    module = pytest.importorskip("psycopg_pool")
    pool: Any = module.AsyncConnectionPool(dsn, open=False, min_size=0, max_size=4)
    await pool.open()
    try:
        async with category_transaction(pool, read_only=True) as tx:
            assert await (
                await tx.execute("SELECT count(*) FROM deck_whole_category_jobs")
            ).fetchone() == (0,), "Exclusive fixture must have no unrelated category jobs"
            assert await (
                await tx.execute("SELECT count(*) FROM drizzle.__drizzle_migrations")
            ).fetchone() == (25,)
        yield cast(ConnectionPool, pool)
    finally:
        await pool.close()


@asynccontextmanager
async def account(pool: ConnectionPool) -> AsyncIterator[tuple[str, Actor]]:
    identifier = str(uuid4())
    token = uuid4().hex + uuid4().hex[:11]
    auth = create_session_auth(pool)
    try:
        async with category_transaction(pool) as tx:
            await tx.execute(
                "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)",
                (identifier, "category-" + identifier),
            )
            await tx.execute(
                "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                (hash_session_token(token), identifier, datetime.now(UTC) + timedelta(hours=1)),
            )
        actor = await auth.validate_session(token)
        assert actor is not None
        # Actor trust is per issuer; return the token's actor with the issuer used below.
        yield token, actor
    finally:
        async with category_transaction(pool) as tx:
            await tx.execute("DELETE FROM user_profiles WHERE account_id=%s", (identifier,))


@NATIVE
def test_real_library_adoption_preview_replay_unknown_jobs_and_account_isolation() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            account(pool) as (token, _),
            account(pool) as (other_token, _),
        ):
            auth = create_session_auth(pool)
            actor = await auth.validate_session(token)
            other = await auth.validate_session(other_token)
            assert actor is not None and other is not None
            api = create_categories(pool, auth)
            deck, entry, printing = str(uuid4()), str(uuid4()), str(uuid4())
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "INSERT INTO decks(id,account_id,game,name) "
                    "VALUES(%s::uuid,%s,'mtg','Category fixture')",
                    (deck, actor.account_id),
                )
            request = str(uuid4())
            saved = await api.save_definition(
                actor,
                dict(
                    requestId=request,
                    originId=None,
                    expectedLibraryRevision="0",
                    scope="deck",
                    name="Empty",
                    meaning="No proven lands",
                    priority=0,
                    displayOrder=0,
                    roles=["main"],
                    rule=dict(
                        op="not",
                        child=dict(
                            op="minimumCopies", minimum=1, predicate=dict(op="type", value="Land")
                        ),
                    ),
                    confirmRetainedRule=False,
                ),
            )
            initialized = await api.initialize_deck_categories(
                actor, dict(requestId=str(uuid4()), deckId=deck)
            )
            assert initialized["entryIds"] == []
            with pytest.raises(CategoryNotFound):
                await api.get_deck_entry_categories(other, deck)
            assert (await api.get_library(other))["total"] == 0
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "UPDATE deck_whole_category_jobs "
                    "SET available_at=clock_timestamp()-interval '1 second' "
                    "WHERE deck_id=%s::uuid",
                    (deck,),
                )
            claim = await claim_whole_deck_job(pool)
            assert claim and claim.deck_id == deck
            await process_whole_deck_job(pool, claim)
            whole = await api.get_deck_whole_categories(actor, deck)
            first_decision = whole["categories"][0]["decision"]
            assert first_decision is not None and first_decision["truth"] == "True"
            preview = await api.preview_category_change(
                actor,
                dict(
                    requestId=str(uuid4()),
                    deckId=deck,
                    scope="entry",
                    mode="Review",
                    restoreOriginIds=[],
                ),
            )
            assert preview["status"] == "Ready"
            commit_request = str(uuid4())
            committed = await api.commit_category_change(
                actor, dict(requestId=commit_request, previewId=preview["id"])
            )
            assert (await api.get_category_preview(actor, dict(previewId=preview["id"])))[
                "status"
            ] == "Committed"
            # Preserve a second preview before a real composition mutation.
            stale = await api.preview_category_change(
                actor,
                dict(
                    requestId=str(uuid4()),
                    deckId=deck,
                    scope="entry",
                    mode="Reset",
                    restoreOriginIds=[],
                ),
            )
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                    (actor.account_id,),
                )
                await tx.execute("SELECT id FROM decks WHERE id=%s::uuid FOR UPDATE", (deck,))
                await tx.execute(
                    """INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,
                    canonical_card_id,name,set_code,image_uri,quantity,role)
                    VALUES(%s::uuid,%s::uuid,%s,'mtg',%s,%s,'Missing facts','test','',1,'main')""",
                    (entry, deck, actor.account_id, printing, printing),
                )
                await tx.execute(
                    "UPDATE decks SET composition_revision=composition_revision+1 "
                    "WHERE id=%s::uuid",
                    (deck,),
                )
                assert await ensure_entry_category_initialization(tx, deck) == [entry]
                await queue_whole_deck_evaluation(tx, deck)
            with pytest.raises(LibraryConflict):
                await api.commit_category_change(
                    actor, dict(requestId=str(uuid4()), previewId=stale["id"])
                )
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "UPDATE deck_whole_category_jobs "
                    "SET available_at=clock_timestamp()-interval '1 second' "
                    "WHERE deck_id=%s::uuid",
                    (deck,),
                )
            claim = await claim_whole_deck_job(pool)
            assert claim and claim.deck_id == deck
            await process_whole_deck_job(pool, claim)
            whole = await api.get_deck_whole_categories(actor, deck)
            decision = whole["categories"][0]["decision"]
            assert decision is not None
            assert decision["state"] == "Pending" and decision["truth"] == "True"
            assert decision["evidence"] is not None
            assert decision["evidence"]["attemptedTruth"] == "True"
            assert decision["previousEvaluation"] is not None
            assert decision["previousEvaluation"]["attemptedTruth"] == "Unknown"
            assert saved["versionId"] == whole["categories"][0]["versionId"]
            async with category_transaction(pool) as tx:
                await tx.execute("DELETE FROM decks WHERE id=%s::uuid", (deck,))
                await tx.execute(
                    "UPDATE category_change_previews SET plan=NULL,"
                    "expires_at=clock_timestamp()-interval '1 day' WHERE id=%s::uuid",
                    (preview["id"],),
                )
            assert (
                await api.commit_category_change(
                    actor, dict(requestId=commit_request, previewId=preview["id"])
                )
                == committed
            )

    asyncio.run(scenario())
