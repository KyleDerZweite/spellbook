"""Opt-in Category job acceptance on a fully migrated, exclusively assigned DB.

Set CATEGORY_JOB_NATIVE_DATABASE and CATEGORY_NATIVE_DATABASE to the exact
disposable TEST_DATABASE_URL target. The existing native pool caps clients at four.
Fixtures own accounts and one uniquely named failure trigger/function, never public
source pointers or migrations. No service or external provider is started.
"""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import uuid4

import pytest
from psycopg import sql
from psycopg.errors import SerializationFailure
from test_categories_postgres import account, native_pool

from spellbook_core.auth import create_session_auth
from spellbook_core.db import ConnectionPool
from spellbook_core.models import Actor
from spellbook_core.mtg.categories import (
    Categories,
    create_categories,
    queue_whole_deck_evaluation,
)
from spellbook_core.mtg.categories.common import (
    CategoryUnavailable,
    Document,
    category_transaction,
    first,
)
from spellbook_core.mtg.categories.jobs import (
    WholeDeckJobClaim,
    backoff_whole_deck_job,
    claim_whole_deck_job,
    process_whole_deck_job,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("CATEGORY_JOB_NATIVE_DATABASE"),
    reason="Explicit exclusive Category job PostgreSQL assignment required",
)


@dataclass
class Fixture:
    pool: ConnectionPool
    api: Categories
    actor: Actor
    decks: list[str]
    version: str


@asynccontextmanager
async def fixture(deck_count: int = 1) -> AsyncIterator[Fixture]:
    assert os.environ["CATEGORY_JOB_NATIVE_DATABASE"] == os.environ["CATEGORY_NATIVE_DATABASE"]
    async with native_pool() as pool, account(pool) as (token, _):
        auth = create_session_auth(pool)
        actor = await auth.validate_session(token)
        assert actor is not None
        api = create_categories(pool, auth)
        saved = await api.save_definition(
            actor,
            dict(
                requestId=str(uuid4()),
                originId=None,
                expectedLibraryRevision="0",
                scope="deck",
                name="No proven lands",
                meaning="Empty is True; missing printing facts remain Unknown",
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
        decks = [str(uuid4()) for _ in range(deck_count)]
        for deck in decks:
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "INSERT INTO decks(id,account_id,game,name) "
                    "VALUES(%s::uuid,%s,'mtg','Category job fixture')",
                    (deck, actor.account_id),
                )
            await api.initialize_deck_categories(actor, dict(requestId=str(uuid4()), deckId=deck))
            await make_due(pool, deck)
        yield Fixture(pool, api, actor, decks, saved["versionId"])


async def make_due(pool: ConnectionPool, deck: str) -> None:
    async with category_transaction(pool) as tx:
        await tx.execute(
            "UPDATE deck_whole_category_jobs SET available_at=clock_timestamp()-interval '1 day' "
            "WHERE deck_id=%s::uuid",
            (deck,),
        )


async def claim_job(f: Fixture, deck: str) -> WholeDeckJobClaim:
    claim = await claim_whole_deck_job(f.pool)
    assert claim is not None and claim.deck_id == deck
    return claim


async def snapshot(f: Fixture, deck: str) -> Document:
    async with category_transaction(f.pool, read_only=True) as tx:
        job = await first(
            tx, "SELECT * FROM deck_whole_category_jobs WHERE deck_id=%s::uuid", (deck,)
        )
        bundle = await first(
            tx, "SELECT * FROM deck_category_bundles WHERE deck_id=%s::uuid", (deck,)
        )
        directory = await first(
            tx,
            "SELECT * FROM deck_library_state WHERE account_id=%s",
            (f.actor.account_id,),
        )
    whole = await f.api.get_deck_whole_categories(f.actor, deck)
    return dict(job=job, bundle=bundle, directory=directory, whole=whole)


def decision(state: Document) -> Document:
    categories = state["whole"]["categories"]
    assert len(categories) == 1
    result = categories[0]["decision"]
    assert isinstance(result, dict)
    return result


def test_competing_claims_skip_a_locked_job_and_never_share_a_lease() -> None:
    async def scenario() -> None:
        async with fixture(2) as f:
            locked, free = f.decks
            async with category_transaction(f.pool) as tx:
                await tx.execute(
                    "SELECT deck_id FROM deck_whole_category_jobs "
                    "WHERE deck_id=%s::uuid FOR UPDATE",
                    (locked,),
                )
                # Both claims use actual independent PostgreSQL transactions while
                # a third connection holds a candidate row lock.
                claims = await asyncio.gather(
                    claim_whole_deck_job(f.pool), claim_whole_deck_job(f.pool)
                )
                winners = [c for c in claims if c is not None]
                assert len(winners) == 1 and winners[0].deck_id == free
                assert await claim_whole_deck_job(f.pool) is None
            other = await claim_job(f, locked)
            assert other.lease_token != winners[0].lease_token
            for claim in [*winners, other]:
                assert claim.attempts == 1
                await process_whole_deck_job(f.pool, claim)
                state = await snapshot(f, claim.deck_id)
                assert not state["job"]
                assert decision(state)["truth"] == "True"
            assert await claim_whole_deck_job(f.pool) is None

    asyncio.run(scenario())


def test_blocked_old_processor_and_error_cannot_publish_over_new_generation() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck = f.decks[0]
            await process_whole_deck_job(f.pool, await claim_job(f, deck))
            initial = await snapshot(f, deck)
            async with category_transaction(f.pool) as tx:
                await tx.execute(
                    "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                    (f.actor.account_id,),
                )
                await tx.execute("SELECT id FROM decks WHERE id=%s::uuid FOR UPDATE", (deck,))
                await queue_whole_deck_evaluation(tx, deck)
            await make_due(f.pool, deck)
            old = await claim_job(f, deck)
            processor: asyncio.Task[None] | None = None
            try:
                async with category_transaction(f.pool) as tx:
                    blocker = await first(tx, "SELECT pg_backend_pid() AS pid")
                    await tx.execute(
                        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                        (f.actor.account_id,),
                    )
                    await tx.execute("SELECT id FROM decks WHERE id=%s::uuid FOR UPDATE", (deck,))
                    processor = asyncio.create_task(process_whole_deck_job(f.pool, old))
                    # Observe real lock contention before committing the edit.
                    async with asyncio.timeout(1.5):
                        while True:
                            async with category_transaction(f.pool, read_only=True) as observer:
                                waiting = await first(
                                    observer,
                                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity "
                                    "WHERE datname=current_database() AND "
                                    "%s=ANY(pg_blocking_pids(pid))) AS blocked",
                                    (blocker["pid"],),
                                )
                            if waiting["blocked"]:
                                break
                            await asyncio.sleep(0.01)
                    entry, printing = str(uuid4()), str(uuid4())
                    await tx.execute(
                        "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
                        "canonical_card_id,name,set_code,image_uri,quantity,role) "
                        "VALUES(%s::uuid,%s::uuid,%s,'mtg',%s,%s,'Unknown','test','',1,'main')",
                        (entry, deck, f.actor.account_id, printing, printing),
                    )
                    await tx.execute(
                        "UPDATE decks SET composition_revision=composition_revision+1 "
                        "WHERE id=%s::uuid",
                        (deck,),
                    )
                    await queue_whole_deck_evaluation(tx, deck)
                await processor
            finally:
                if processor is not None:
                    if not processor.done():
                        processor.cancel()
                    await asyncio.gather(processor, return_exceptions=True)
            newer = await snapshot(f, deck)
            assert newer["job"]["generation"] == int(old.generation) + 1
            assert newer["job"]["lease_token"] is None
            assert decision(newer) == decision(initial)
            await backoff_whole_deck_job(f.pool, old)
            assert await snapshot(f, deck) == newer
            await make_due(f.pool, deck)
            await process_whole_deck_job(f.pool, await claim_job(f, deck))
            completed = await snapshot(f, deck)
            assert not completed["job"]
            pending = decision(completed)
            assert pending["state"] == "Pending" and pending["truth"] == "True"
            assert pending["attemptedTruth"] == "Unknown"
            assert pending["evidence"] == decision(initial)["evidence"]
            assert pending["previousEvaluation"]["attemptedTruth"] == "Unknown"
            assert await claim_whole_deck_job(f.pool) is None

    asyncio.run(scenario())


def test_expired_lease_reclaim_fences_old_success_and_backoff_with_same_generation() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck = f.decks[0]
            old = await claim_job(f, deck)
            assert await claim_whole_deck_job(f.pool) is None
            async with category_transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE deck_whole_category_jobs "
                    "SET lease_expires_at=clock_timestamp()-interval '1 second' "
                    "WHERE deck_id=%s::uuid",
                    (deck,),
                )
            replacement = await claim_job(f, deck)
            assert replacement.generation == old.generation
            assert replacement.lease_token != old.lease_token and replacement.attempts == 2
            owned = await snapshot(f, deck)
            await process_whole_deck_job(f.pool, old)
            await backoff_whole_deck_job(f.pool, old)
            assert await snapshot(f, deck) == owned
            await process_whole_deck_job(f.pool, replacement)
            completed = await snapshot(f, deck)
            assert not completed["job"] and decision(completed)["state"] == "Automatic"

    asyncio.run(scenario())


@pytest.mark.parametrize("manual", ["Include", "Exclude"])
def test_manual_write_fences_claim_and_survives_fresh_processing(manual: str) -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck = f.decks[0]
            old = await claim_job(f, deck)
            whole = await f.api.get_deck_whole_categories(f.actor, deck)
            await f.api.set_whole_category(
                f.actor,
                dict(
                    requestId=str(uuid4()),
                    deckId=deck,
                    versionId=f.version,
                    manual=manual,
                    expectedDecisionRevision=whole["decisionRevision"],
                ),
            )
            saved = await snapshot(f, deck)
            assert saved["job"]["generation"] == int(old.generation) + 1
            assert decision(saved)["state"] == "Manual"
            assert decision(saved)["manual"] == manual
            await process_whole_deck_job(f.pool, old)
            await backoff_whole_deck_job(f.pool, old)
            assert await snapshot(f, deck) == saved
            await make_due(f.pool, deck)
            await process_whole_deck_job(f.pool, await claim_job(f, deck))
            completed = await snapshot(f, deck)
            assert not completed["job"]
            assert decision(completed) == decision(saved)
            assert completed["bundle"] == saved["bundle"]
            assert completed["directory"] == saved["directory"]

    asyncio.run(scenario())


@pytest.mark.parametrize("fence", ["composition", "decision"])
def test_changed_revision_requeues_instead_of_publishing_stale_result(fence: str) -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck = f.decks[0]
            old = await claim_job(f, deck)
            async with category_transaction(f.pool) as tx:
                if fence == "composition":
                    await tx.execute(
                        "UPDATE decks SET composition_revision=composition_revision+1 "
                        "WHERE id=%s::uuid",
                        (deck,),
                    )
                else:
                    await tx.execute(
                        "UPDATE deck_category_bundles SET decision_revision=decision_revision+1 "
                        "WHERE deck_id=%s::uuid",
                        (deck,),
                    )
            before = await snapshot(f, deck)
            await process_whole_deck_job(f.pool, old)
            requeued = await snapshot(f, deck)
            assert requeued["job"]["generation"] == int(old.generation) + 1
            assert requeued["job"]["lease_token"] is None
            assert requeued["job"]["attempts"] == 0
            assert requeued["whole"] == before["whole"]
            await backoff_whole_deck_job(f.pool, old)
            assert await snapshot(f, deck) == requeued
            await make_due(f.pool, deck)
            await process_whole_deck_job(f.pool, await claim_job(f, deck))
            completed = await snapshot(f, deck)
            assert not completed["job"] and decision(completed)["truth"] == "True"

    asyncio.run(scenario())


@asynccontextmanager
async def failing_completion(f: Fixture, deck: str) -> AsyncIterator[None]:
    """Fail after real evaluation writes, immediately before the job would be deleted."""
    name = "category_job_failure_" + uuid4().hex
    async with category_transaction(f.pool) as tx:
        await tx.execute(
            sql.SQL(
                "CREATE FUNCTION public.{}() RETURNS trigger LANGUAGE plpgsql AS $$ "
                "BEGIN RAISE EXCEPTION 'Owned category completion failure' "
                "USING ERRCODE='40001'; END $$"
            ).format(sql.Identifier(name))
        )
        await tx.execute(
            sql.SQL(
                "CREATE TRIGGER {} BEFORE DELETE ON public.deck_whole_category_jobs "
                "FOR EACH ROW WHEN (OLD.deck_id={}) EXECUTE FUNCTION public.{}()"
            ).format(sql.Identifier(name), sql.Literal(deck), sql.Identifier(name))
        )
    try:
        yield
    finally:
        async with category_transaction(f.pool) as tx:
            await tx.execute(
                sql.SQL("DROP TRIGGER {} ON public.deck_whole_category_jobs").format(
                    sql.Identifier(name)
                )
            )
            await tx.execute(sql.SQL("DROP FUNCTION public.{}()").format(sql.Identifier(name)))


def test_completion_failure_rolls_back_decisions_revisions_and_job_then_retry_commits() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck = f.decks[0]
            claim = await claim_job(f, deck)
            before = await snapshot(f, deck)
            async with failing_completion(f, deck):
                with pytest.raises(CategoryUnavailable) as failure:
                    await process_whole_deck_job(f.pool, claim)
                assert isinstance(failure.value.__cause__, SerializationFailure)
                assert await snapshot(f, deck) == before
            await backoff_whole_deck_job(f.pool, claim)
            backed_off = await snapshot(f, deck)
            job = backed_off["job"]
            assert job["generation"] == int(claim.generation) and job["attempts"] == 1
            assert job["lease_token"] is None and job["lease_expires_at"] is None
            assert job["last_error"] == "Category evaluation temporarily unavailable"
            assert job["available_at"] > before["job"]["available_at"]
            assert backed_off["whole"] == before["whole"]
            assert backed_off["directory"] == before["directory"]
            assert await claim_whole_deck_job(f.pool) is None
            await make_due(f.pool, deck)
            retry = await claim_job(f, deck)
            assert retry.attempts == 2 and retry.lease_token != claim.lease_token
            await process_whole_deck_job(f.pool, retry)
            completed = await snapshot(f, deck)
            assert not completed["job"]
            assert decision(completed)["state"] == "Automatic"
            assert decision(completed)["truth"] == "True"
            assert (
                completed["bundle"]["decision_revision"]
                == before["bundle"]["decision_revision"] + 1
            )
            assert completed["directory"]["revision"] == before["directory"]["revision"] + 1

    asyncio.run(scenario())
