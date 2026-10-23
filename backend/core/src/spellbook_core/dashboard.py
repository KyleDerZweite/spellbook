"""Account dashboard on one read-only snapshot, with optional summaries isolated."""

from datetime import datetime
from typing import Literal, TypedDict

from psycopg import sql

from .auth import SessionAuth
from .db import ConnectionPool, Transaction, database_integer, iso_timestamp, transaction
from .errors import DatabaseIntegerRangeError
from .inventory_value import InventoryValues
from .models import Actor
from .profile import SummaryRangeError
from .valuation import PriceReadUnavailable
from .valuation_query import Document


class Distribution(TypedDict):
    label: str
    quantity: int
    share: float


class DashboardSummary(TypedDict):
    totals: dict[str, int]
    sets: list[Distribution]
    finishes: list[Distribution]
    conditions: list[Distribution]
    recentEntries: list[dict[str, object]]
    decks: list[dict[str, object]]
    pendingScanReviews: int | None
    inventoryValue: Document | None
    inventoryValueHistory: Document | None
    valuationError: dict[str, str] | None


def summary_number(value: object) -> int:
    try:
        number = database_integer(value)
    except DatabaseIntegerRangeError:
        raise SummaryRangeError() from None
    if number < 0:
        raise SummaryRangeError()
    return number


async def _distribution(
    tx: Transaction,
    account_id: str,
    total: int,
    column: Literal["set_code", "finish", "condition"],
    labels: tuple[str, ...] | None = None,
) -> list[Distribution]:
    cursor = await tx.execute(
        sql.SQL(
            "SELECT {column}, sum(quantity::numeric)::text FROM inventory_cards "
            "WHERE account_id=%s AND game='mtg' GROUP BY {column} "
            "ORDER BY sum(quantity::numeric) DESC, {column}"
        ).format(column=sql.Identifier(column)),
        (account_id,),
    )
    quantities = {str(row[0]): summary_number(row[1]) for row in await cursor.fetchall()}
    return [
        {
            "label": label,
            "quantity": quantities.get(label, 0),
            "share": quantities.get(label, 0) / total if total else 0,
        }
        for label in (labels if labels is not None else quantities)
    ]


class Dashboard:
    def __init__(self, pool: ConnectionPool, auth: SessionAuth, values: InventoryValues):
        self._pool, self._auth, self._values = pool, auth, values

    async def get(self, actor: Actor) -> DashboardSummary:
        user = await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            clock = await (await tx.execute("SELECT statement_timestamp()")).fetchone()
            assert clock is not None and isinstance(clock[0], datetime)
            as_of = clock[0]
            args = (user.account_id,)
            row = await (
                await tx.execute(
                    "SELECT coalesce(sum(quantity::numeric),0)::text, "
                    "count(distinct canonical_card_id)::text, "
                    "count(distinct catalog_card_id)::text, count(distinct set_code)::text, "
                    "coalesce(sum(quantity::numeric) FILTER(WHERE finish='foil'),0)::text, "
                    "(SELECT count(*) FROM decks WHERE account_id=%s AND game='mtg')::text "
                    "FROM inventory_cards WHERE account_id=%s AND game='mtg'",
                    (user.account_id, user.account_id),
                )
            ).fetchone()
            assert row is not None
            totals = {
                key: summary_number(value)
                for key, value in zip(
                    ("total", "names", "printings", "sets", "foils", "decks"), row, strict=True
                )
            }
            sets = await _distribution(tx, user.account_id, totals["total"], "set_code")
            finishes = await _distribution(
                tx, user.account_id, totals["total"], "finish", ("nonfoil", "foil")
            )
            conditions = await _distribution(
                tx, user.account_id, totals["total"], "condition", ("NM", "LP", "MP", "HP", "DMG")
            )
            recent = await (
                await tx.execute(
                    "SELECT id, catalog_card_id, canonical_card_id, name, set_code, image_uri, "
                    "quantity, finish, condition, updated_at FROM inventory_cards "
                    "WHERE account_id=%s AND game='mtg' ORDER BY updated_at DESC,id LIMIT 8",
                    args,
                )
            ).fetchall()
            entries: list[dict[str, object]] = []
            for entry in recent:
                assert isinstance(entry[9], datetime)
                entries.append(
                    {
                        **dict(
                            zip(
                                (
                                    "id",
                                    "catalogCardId",
                                    "canonicalCardId",
                                    "name",
                                    "setCode",
                                    "imageUri",
                                ),
                                (str(value) for value in entry[:6]),
                                strict=True,
                            )
                        ),
                        "quantity": summary_number(entry[6]),
                        "finish": entry[7],
                        "condition": entry[8],
                        "updatedAt": iso_timestamp(entry[9]),
                    }
                )
            deck_rows = await (
                await tx.execute(
                    """
                    WITH owned_printings AS (
                        SELECT canonical_card_id,catalog_card_id,sum(quantity::numeric) AS quantity
                        FROM inventory_cards WHERE account_id=%s AND game='mtg'
                        GROUP BY canonical_card_id,catalog_card_id
                    ), owned_names AS (
                        SELECT canonical_card_id,sum(quantity) AS quantity FROM owned_printings
                        GROUP BY canonical_card_id
                    ), required_printings AS (
                        SELECT dc.deck_id,dc.canonical_card_id,dc.catalog_card_id,
                        sum(dc.quantity::numeric) AS quantity FROM deck_cards dc
                        JOIN decks d ON d.id=dc.deck_id WHERE d.account_id=%s AND d.game='mtg'
                        GROUP BY dc.deck_id,dc.canonical_card_id,dc.catalog_card_id
                    ), allocation AS (
                        SELECT r.deck_id,r.canonical_card_id,sum(r.quantity) AS required,
                        sum(least(r.quantity,coalesce(o.quantity,0))) AS exact
                        FROM required_printings r LEFT JOIN owned_printings o
                        USING(canonical_card_id,catalog_card_id)
                        GROUP BY r.deck_id,r.canonical_card_id
                    ), totals AS (
                        SELECT a.deck_id,sum(a.required) AS required,sum(a.exact) AS exact,
                        sum(least(a.required-a.exact,
                        greatest(coalesce(o.quantity,0)-a.exact,0))) AS alternate
                        FROM allocation a LEFT JOIN owned_names o USING(canonical_card_id)
                        GROUP BY a.deck_id
                    ) SELECT d.id,d.name,d.format,coalesce(t.required,0)::text,
                    coalesce(t.exact,0)::text,coalesce(t.alternate,0)::text,
                    coalesce(t.required-t.exact-t.alternate,0)::text
                    FROM decks d LEFT JOIN totals t ON t.deck_id=d.id
                    WHERE d.account_id=%s AND d.game='mtg' ORDER BY d.updated_at DESC,d.id
                    """,
                    (user.account_id,) * 3,
                )
            ).fetchall()
            decks: list[dict[str, object]] = [
                {
                    "id": str(deck[0]),
                    "name": deck[1],
                    "format": deck[2],
                    **dict(
                        zip(
                            ("required", "exact", "alternate", "missing"),
                            (summary_number(value) for value in deck[3:]),
                            strict=True,
                        )
                    ),
                }
                for deck in deck_rows
            ]
            pending: int | None
            await tx.execute("SAVEPOINT scan_summary")
            try:
                scan = await (
                    await tx.execute(
                        "SELECT count(*)::text FROM scan_sessions WHERE account_id=%s "
                        "AND game='mtg' AND status='pending_review'",
                        args,
                    )
                ).fetchone()
                assert scan is not None
                pending = summary_number(scan[0])
            except SummaryRangeError:
                raise
            except Exception:
                await tx.execute("ROLLBACK TO SAVEPOINT scan_summary")
                pending = None
            await tx.execute("RELEASE SAVEPOINT scan_summary")
            current: Document | None = None
            history: Document | None = None
            valuation_error: dict[str, str] | None = None
            await tx.execute("SAVEPOINT inventory_value_summary")
            try:
                current = await self._values.current_in_transaction(tx, user.account_id, as_of)
                history = await self._values.history_in_transaction(
                    tx, user.account_id, {"days": 30}, as_of
                )
            except Exception:
                await tx.execute("ROLLBACK TO SAVEPOINT inventory_value_summary")
                current = history = None
                failure = PriceReadUnavailable()
                valuation_error = {"kind": failure.kind, "message": str(failure)}
            await tx.execute("RELEASE SAVEPOINT inventory_value_summary")
            return {
                "totals": totals,
                "sets": sets,
                "finishes": finishes,
                "conditions": conditions,
                "recentEntries": entries,
                "decks": decks,
                "pendingScanReviews": pending,
                "inventoryValue": current,
                "inventoryValueHistory": history,
                "valuationError": valuation_error,
            }


def create_dashboard(
    pool: ConnectionPool, auth: SessionAuth, values: InventoryValues
) -> Dashboard:
    return Dashboard(pool, auth, values)
