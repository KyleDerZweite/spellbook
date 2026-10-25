"""Durable coalesced WholeDeckCategory work, claims and transactional fencing."""

import asyncio
from dataclasses import dataclass

from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.mtg.categories.common import category_transaction, first, new_id

DEBOUNCE_MS = 250
POLL_SECONDS = 1.0
LEASE_MS = 30000
MAX_BACKOFF_MS = 60000


@dataclass(frozen=True)
class WholeDeckJobClaim:
    deck_id: str
    account_id: str
    generation: str
    composition_revision: str
    decision_revision: str
    lease_token: str
    attempts: int


async def queue_whole_deck_evaluation(tx: Transaction, deck_id: str) -> None:
    """Coalesce work inside the caller's Profile and Deck mutation locks."""
    await tx.execute(
        """INSERT INTO deck_whole_category_jobs
        (deck_id,generation,composition_revision,decision_revision,available_at)
        SELECT d.id,1,d.composition_revision,b.decision_revision,
        clock_timestamp()+%s*interval '1 millisecond' FROM decks d
        JOIN deck_category_bundles b ON b.deck_id=d.id WHERE d.id=%s::uuid
        ON CONFLICT(deck_id) DO UPDATE SET
        generation=deck_whole_category_jobs.generation+1,
composition_revision=EXCLUDED.composition_revision,decision_revision=EXCLUDED.decision_revision,
available_at=EXCLUDED.available_at,lease_token=NULL,lease_expires_at=NULL,attempts=0,last_error=NULL""",
        (DEBOUNCE_MS, deck_id),
    )


async def touch_whole_deck_job(tx: Transaction, deck_id: str) -> None:
    """Fence existing work after a decision write, without creating absent work."""
    await tx.execute(
        """UPDATE deck_whole_category_jobs j SET generation=j.generation+1,
        composition_revision=d.composition_revision,decision_revision=b.decision_revision,
        available_at=clock_timestamp()+%s*interval '1 millisecond',lease_token=NULL,
        lease_expires_at=NULL,attempts=0,last_error=NULL FROM decks d
        JOIN deck_category_bundles b ON b.deck_id=d.id WHERE
        j.deck_id=d.id AND d.id=%s::uuid""",
        (DEBOUNCE_MS, deck_id),
    )


async def claim_whole_deck_job(pool: ConnectionPool) -> WholeDeckJobClaim | None:
    # This short transaction commits before any Profile, Deck or bundle lock.
    async with category_transaction(pool) as tx:
        token = new_id()
        row = await first(
            tx,
            """WITH candidate AS (
            SELECT j.deck_id FROM deck_whole_category_jobs j
            WHERE j.available_at<=clock_timestamp()
            AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp())
            ORDER BY j.available_at,j.deck_id FOR UPDATE SKIP LOCKED LIMIT 1)
            UPDATE deck_whole_category_jobs j SET lease_token=%s::uuid,
            lease_expires_at=clock_timestamp()+%s*interval '1
            millisecond',attempts=j.attempts+1
            FROM candidate c,decks d WHERE j.deck_id=c.deck_id AND d.id=j.deck_id
            RETURNING
            j.deck_id::text,d.account_id,j.generation::text,j.composition_revision::text,
            j.decision_revision::text,j.attempts""",
            (token, LEASE_MS),
        )
        if not row:
            return None
        return WholeDeckJobClaim(
            row["deck_id"],
            row["account_id"],
            row["generation"],
            row["composition_revision"],
            row["decision_revision"],
            token,
            row["attempts"],
        )


async def process_whole_deck_job(pool: ConnectionPool, claim: WholeDeckJobClaim) -> None:
    from spellbook_core.mtg.categories.whole import evaluate_whole_deck

    async with category_transaction(pool) as tx:
        await tx.execute(
            "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
            (claim.account_id,),
        )
        deck = await first(
            tx,
            "SELECT composition_revision::text FROM decks WHERE id=%s::uuid AND "
            "account_id=%s FOR UPDATE",
            (claim.deck_id, claim.account_id),
        )
        if not deck:
            return
        bundle = await first(
            tx,
            "SELECT decision_revision::text FROM deck_category_bundles WHERE "
            "deck_id=%s::uuid FOR UPDATE",
            (claim.deck_id,),
        )
        job = await first(
            tx,
            "SELECT "
            "generation::text,lease_token::text,composition_revision::text,decision_revision::text"
            " FROM deck_whole_category_jobs WHERE deck_id=%s::uuid FOR UPDATE",
            (claim.deck_id,),
        )
        if (
            not job
            or job["generation"] != claim.generation
            or job["lease_token"] != claim.lease_token
        ):
            return
        if not bundle:
            return
        if (
            job["composition_revision"] != claim.composition_revision
            or job["decision_revision"] != claim.decision_revision
            or deck["composition_revision"] != claim.composition_revision
            or bundle["decision_revision"] != claim.decision_revision
        ):
            await queue_whole_deck_evaluation(tx, claim.deck_id)
            return
        await evaluate_whole_deck(tx, claim.deck_id, claim.composition_revision)
        task = asyncio.current_task()
        if task is not None and task.cancelling():
            raise asyncio.CancelledError
        # Unknown is a completed semantic result; infrastructure failures roll back.
        await tx.execute(
            "DELETE FROM deck_whole_category_jobs WHERE deck_id=%s::uuid AND "
            "generation=%s::bigint AND lease_token=%s::uuid",
            (claim.deck_id, claim.generation, claim.lease_token),
        )


def backoff_delay_ms(attempts: int) -> int:
    return min(MAX_BACKOFF_MS, 1000 * (1 << min(max(attempts - 1, 0), 6)))


async def backoff_whole_deck_job(pool: ConnectionPool, claim: WholeDeckJobClaim) -> None:
    async with category_transaction(pool) as tx:
        await tx.execute(
            """UPDATE deck_whole_category_jobs SET
            available_at=clock_timestamp()+%s*interval '1
            millisecond',lease_token=NULL,lease_expires_at=NULL,
            last_error='Category evaluation temporarily unavailable'
            WHERE deck_id=%s::uuid AND generation=%s::bigint AND lease_token=%s::uuid""",
            (backoff_delay_ms(claim.attempts), claim.deck_id, claim.generation, claim.lease_token),
        )
