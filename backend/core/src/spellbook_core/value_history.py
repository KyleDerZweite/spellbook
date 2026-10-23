"""Private per-account daily captures on one session-level advisory lease."""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from psycopg.pq import TransactionStatus
from psycopg.types.json import Jsonb

from .db import ConnectionPool, Transaction
from .inventory_value import (
    InventoryValues,
    estimate_holdings,
    pair_key,
    read_holdings,
    unique_holding_pairs,
)
from .valuation_query import Document, ValuationQuery, records, valuation_query

LEASE_KEY = 78173020462008
CAPTURE_INTERVAL_SECONDS = 10
_LOG = logging.getLogger(__name__)


@dataclass(frozen=True)
class CaptureResult:
    captured_accounts: int = 0
    captured_holdings: int = 0
    copied_references: int = 0
    failed_accounts: int = 0


@dataclass(frozen=True)
class CaptureObservation:
    holdings: int
    references: int
    captured: bool = True


# The first snapshot statement owns both the observation clock and calendar eligibility.
CALENDAR_SQL = """
WITH observation AS (SELECT statement_timestamp() AS observed_at), bounds AS (SELECT observed_at,
(observed_at AT TIME ZONE $1)::date AS day FROM observation), calendar AS (SELECT observed_at,
day, day::timestamp AT TIME ZONE $1 AS day_start, (day+1)::timestamp AT TIME ZONE $1 AS day_end
FROM bounds) SELECT observed_at, day::text, day_start, day_end, observed_at >= day_end - interval
'60 seconds' AND observed_at < day_end FROM calendar
"""


async def capture_account(
    tx: Transaction,
    values: InventoryValues,
    account_id: str,
    *,
    query: ValuationQuery = valuation_query,
    observation: datetime | None = None,
    before_commit: Callable[[Transaction], Awaitable[None]] | None = None,
) -> CaptureObservation | None:
    """Caller owns repeatable-read transaction and session lease; None stops this cycle."""
    parameters: list[object] = [values.timezone]
    sql = CALENDAR_SQL
    if observation is not None:
        sql = sql.replace("statement_timestamp()", "$2::timestamptz")
        parameters.append(observation)
    calendar = (
        await records(
            tx, query, sql, parameters, ["observed_at", "day", "day_start", "day_end", "eligible"]
        )
    )[0]
    if not calendar["eligible"]:
        return None
    existing_rows = await records(
        tx,
        query,
        """
        SELECT id, timezone, observed_at, day_start, day_end FROM inventory_value_days WHERE
        account_id=$1 AND game= 'mtg' AND day=$2::date
        """,
        [account_id, calendar["day"]],
        ["id", "timezone", "observed_at", "day_start", "day_end"],
    )
    existing = existing_rows[0] if existing_rows else None
    if existing and (
        existing["timezone"] != values.timezone
        or existing["day_start"] != calendar["day_start"]
        or existing["day_end"] != calendar["day_end"]
        or existing["observed_at"] >= calendar["observed_at"]
    ):
        return CaptureObservation(0, 0, False)
    revisions = await query(
        tx,
        "SELECT revision::text FROM inventories WHERE account_id=$1 AND game='mtg'",
        [account_id],
    )
    revision = revisions[0][0] if revisions else "0"
    holdings = await read_holdings(tx, account_id, query=query)
    pairs = unique_holding_pairs(holdings)
    outcomes: list[Document] = []
    references: dict[tuple[str, str], Document] = {}
    for offset in range(0, len(pairs), 100):
        frozen = await values.valuation.freeze_in_transaction(
            tx, pairs[offset : offset + 100], calendar["observed_at"], query=query
        )
        outcomes.extend(frozen["evidence"])
        references.update((pair_key(r), r) for r in frozen["response"]["results"])
    estimate = estimate_holdings(holdings, references)
    day_id = existing["id"] if existing else str(uuid4())
    if existing:
        await query(tx, "DELETE FROM inventory_value_holdings WHERE day_id=$1", [day_id])
        await query(tx, "DELETE FROM inventory_value_references WHERE day_id=$1", [day_id])
        await query(
            tx,
            """
            UPDATE inventory_value_days SET observed_at=$2, estimate=$3::jsonb,
            inventory_revision=$4 WHERE id=$1
            """,
            [day_id, calendar["observed_at"], Jsonb(estimate), revision],
        )
    else:
        await query(
            tx,
            """
            INSERT INTO inventory_value_days(id, account_id, game, day, timezone, day_start,
            day_end, observed_at, estimate, inventory_revision) VALUES($1, $2, 'mtg' , $3, $4, $5,
            $6, $7, $8::jsonb, $9)
            """,
            [
                day_id,
                account_id,
                calendar["day"],
                values.timezone,
                calendar["day_start"],
                calendar["day_end"],
                calendar["observed_at"],
                Jsonb(estimate),
                revision,
            ],
        )
    for offset in range(0, len(outcomes), 100):
        rows = [
            {
                "printing_id": e["reference"]["printingId"],
                "finish": e["reference"]["finish"],
                "evidence": e,
            }
            for e in outcomes[offset : offset + 100]
        ]
        await query(
            tx,
            """
            INSERT INTO inventory_value_references(day_id, printing_id, finish, evidence) SELECT
            $1, r.printing_id, r.finish, r.evidence FROM jsonb_to_recordset($2::jsonb) AS
            r(printing_id text, finish text, evidence jsonb)
            """,
            [day_id, Jsonb(rows)],
        )
    for offset in range(0, len(holdings), 500):
        await query(
            tx,
            """
            INSERT INTO inventory_value_holdings(day_id, printing_id, finish, condition, quantity,
            canonical_card_id, name, set_code, image_uri) SELECT $1, r.printing_id, r.finish,
            r.condition, r.quantity, r.canonical_card_id, r.name, r.set_code, r.image_uri FROM
            jsonb_to_recordset($2::jsonb) AS r(printing_id text, finish text, condition text,
            quantity integer, canonical_card_id text, name text, set_code text, image_uri text)
            """,
            [day_id, Jsonb(holdings[offset : offset + 500])],
        )
    if before_commit is not None:
        await before_commit(tx)
    return CaptureObservation(len(holdings), len(outcomes))


async def capture_value_history(
    pool: ConnectionPool,
    values: InventoryValues,
    *,
    query: ValuationQuery = valuation_query,
    observation_clock: Callable[[], datetime] | None = None,
    account_ids: list[str] | None = None,
    before_commit: Callable[[Transaction], Awaitable[None]] | None = None,
) -> CaptureResult:
    """One leased connection, sequential account commits and no backfill or nested checkout."""
    captured = holdings_count = references_count = failed = 0
    async with pool.connection(timeout=10.0) as tx:
        if tx.info.transaction_status != TransactionStatus.IDLE:
            raise ValueError("Value history requires an idle connection")
        original_autocommit = tx.autocommit
        if not original_autocommit:
            await tx.set_autocommit(True)
        previous_timeout: object = None
        lease = False
        try:
            previous_timeout = (await query(tx, "SHOW statement_timeout", []))[0][0]
            await query(tx, "SELECT set_config('statement_timeout','10000ms',false)", [])
            lease = bool(
                (await query(tx, "SELECT pg_try_advisory_lock($1::bigint)", [LEASE_KEY]))[0][0]
            )
            if not lease:
                return CaptureResult()
            after = ""
            while True:
                accounts = await query(
                    tx,
                    """
                    SELECT account_id FROM user_profiles WHERE account_id > $1 AND ($2::text[] IS
                    NULL OR account_id=ANY($2::text[])) ORDER BY account_id LIMIT 200
                    """,
                    [after, account_ids],
                )
                for account in accounts:
                    try:
                        async with tx.transaction():
                            await query(tx, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", [])
                            await query(tx, "SET LOCAL statement_timeout = '10000ms'", [])
                            await query(tx, "SET LOCAL lock_timeout = '2000ms'", [])
                            result = await capture_account(
                                tx,
                                values,
                                str(account[0]),
                                query=query,
                                observation=observation_clock() if observation_clock else None,
                                before_commit=before_commit,
                            )
                        if result is None:
                            return CaptureResult(
                                captured, holdings_count, references_count, failed
                            )
                        if result.captured:
                            captured += 1
                            holdings_count += result.holdings
                            references_count += result.references
                    except Exception:
                        if (
                            tx.closed
                            or tx.broken
                            or tx.info.transaction_status != TransactionStatus.IDLE
                        ):
                            raise
                        failed += 1
                        _LOG.warning(
                            "Inventory value checkpoint failed; prior observation retained."
                        )
                if len(accounts) < 200:
                    break
                after = str(accounts[-1][0])
        finally:
            if not tx.closed:
                try:
                    if tx.info.transaction_status != TransactionStatus.IDLE:
                        await tx.rollback()
                    if lease:
                        unlocked = await query(
                            tx, "SELECT pg_advisory_unlock($1::bigint)", [LEASE_KEY]
                        )
                        if not unlocked or not unlocked[0][0]:
                            raise RuntimeError("Value history lease release failed")
                    if previous_timeout is not None:
                        await query(
                            tx,
                            "SELECT set_config('statement_timeout',$1,false)",
                            [previous_timeout],
                        )
                    if not original_autocommit:
                        await tx.set_autocommit(False)
                except BaseException:
                    # Closing an unusable session releases its advisory lease.
                    await tx.close()
                    raise
    return CaptureResult(captured, holdings_count, references_count, failed)
