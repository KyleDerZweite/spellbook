"""Exact current Inventory estimates and closed private observation queries."""

import re
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from .db import ConnectionPool, Transaction, database_integer, iso_timestamp, transaction
from .errors import ValidationError
from .models import Actor
from .validation import MISSING
from .valuation import PriceReadUnavailable, Valuation, decimal_amount, price_uuid
from .valuation_query import Document, ValuationQuery, records, valuation_query


def exact_amount(value: object) -> int:
    normalized = decimal_amount(value)
    whole, _, fraction = normalized.partition(".")
    return int(whole) * 10**18 + int(fraction.ljust(18, "0"))


def display_amount(value: int) -> str:
    cents = (value + 5 * 10**15) // 10**16
    return f"{cents // 100}.{cents % 100:02d}"


def value_estimate(holdings: Iterable[Document]) -> Document:
    amount = covered = stale = unknown = 0
    for holding in holdings:
        quantity = database_integer(holding["quantity"])
        if quantity < 0:
            raise PriceReadUnavailable()
        reference = holding["reference"]
        if reference["kind"] == "Known":
            amount += exact_amount(reference["amount"]) * quantity
            covered += quantity
            if reference["freshness"] == "Stale":
                stale += quantity
        else:
            unknown += quantity
    return {
        "currency": "EUR",
        "coveredValue": display_amount(amount),
        "coveredQuantity": database_integer(covered),
        "staleQuantity": database_integer(stale),
        "unknownQuantity": database_integer(unknown),
        "totalQuantity": database_integer(covered + unknown),
        "complete": unknown == 0,
    }


def pair_key(pair: Document) -> tuple[str, str]:
    return pair["printingId"], pair["finish"]


async def read_holdings(
    tx: Transaction, account_id: str, *, query: ValuationQuery = valuation_query
) -> list[Document]:
    return await records(
        tx,
        query,
        """
        SELECT catalog_card_id AS printing_id, finish, condition, quantity, canonical_card_id,
        name, set_code, image_uri FROM inventory_cards WHERE account_id=$1 AND game= 'mtg' ORDER
        BY catalog_card_id, finish, condition
        """,
        [account_id],
        [
            "printing_id",
            "finish",
            "condition",
            "quantity",
            "canonical_card_id",
            "name",
            "set_code",
            "image_uri",
        ],
    )


def unique_holding_pairs(holdings: list[Document]) -> list[Document]:
    return list(
        {
            (r["printing_id"], r["finish"]): {
                "printingId": r["printing_id"],
                "finish": r["finish"],
            }
            for r in holdings
        }.values()
    )


def estimate_holdings(
    holdings: list[Document], references: dict[tuple[str, str], Document]
) -> Document:
    values: list[Document] = []
    for row in holdings:
        reference = references.get((row["printing_id"], row["finish"]))
        if reference is None:
            raise PriceReadUnavailable()
        values.append({"quantity": row["quantity"], "reference": reference})
    return value_estimate(values)


def history_request(input: object) -> Document:
    if not isinstance(input, dict) or set(input) - {
        "days",
        "from",
        "to",
        "printingId",
        "finish",
        "condition",
    }:
        raise ValidationError("Invalid value history request")
    identity: Document | None = None
    if "printingId" in input:
        try:
            identity = {"printingId": price_uuid(input["printingId"])}
        except ValidationError:
            raise ValidationError("Invalid printing UUID") from None
        for field, allowed in [
            ("finish", ("foil", "nonfoil")),
            ("condition", ("NM", "LP", "MP", "HP", "DMG")),
        ]:
            if field in input:
                if input[field] not in allowed:
                    raise ValidationError(f"Invalid {field}")
                identity[field] = input[field]
    elif "finish" in input or "condition" in input:
        raise ValidationError("History identity requires a printing")
    if ("from" in input) != ("to" in input) or ("from" in input and "days" in input):
        raise ValidationError("Supply days or from and to")
    days = input.get("days", 30)
    if (
        isinstance(days, bool)
        or not isinstance(days, int | float)
        or not (1 <= days <= 366 and days == int(days))
    ):
        raise ValidationError("History days must be 1 to 366")
    result: Document = {"identity": identity, "days": int(days)}
    for key in ("from", "to"):
        if key in input:
            raw = input[key]
            try:
                if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
                    raise ValueError()
                parsed = date.fromisoformat(raw)
            except TypeError, ValueError:
                raise ValidationError("Invalid history date") from None
            result[key] = parsed.isoformat()
    return result


class InventoryValues:
    def __init__(
        self, pool: ConnectionPool, valuation: Valuation, *, timezone: str = "Europe/Berlin"
    ):
        ZoneInfo(timezone)
        self.pool, self.valuation, self.timezone = pool, valuation, timezone

    async def current_in_transaction(
        self,
        tx: Transaction,
        account_id: str,
        as_of: datetime,
        *,
        query: ValuationQuery = valuation_query,
    ) -> Document:
        holdings = await read_holdings(tx, account_id, query=query)
        pairs = unique_holding_pairs(holdings)
        references: dict[tuple[str, str], Document] = {}
        for offset in range(0, len(pairs), 100):
            response = await self.valuation.read_in_transaction(
                tx, pairs[offset : offset + 100], as_of, query=query
            )
            references.update((pair_key(r), r) for r in response["results"])
        return {
            "evaluatedAt": iso_timestamp(as_of),
            "estimate": estimate_holdings(holdings, references),
        }

    async def history_in_transaction(
        self,
        tx: Transaction,
        account_id: str,
        input: object = MISSING,
        as_of: datetime | None = None,
        *,
        query: ValuationQuery = valuation_query,
    ) -> Document:
        filter = history_request({} if input is MISSING else input)
        as_of = as_of or datetime.now(UTC)
        calendar = (
            await query(
                tx,
                """
                WITH calendar AS (SELECT ($1::timestamptz AT TIME ZONE $2)::date AS day) SELECT
                day::text, (day+1)::timestamp AT TIME ZONE $2 FROM calendar
                """,
                [as_of, self.timezone],
            )
        )[0]
        today = date.fromisoformat(str(calendar[0]))
        boundary = calendar[1]
        if not isinstance(boundary, datetime):
            raise PriceReadUnavailable()
        last_closed = today - timedelta(days=1)
        to = date.fromisoformat(filter.get("to", last_closed.isoformat()))
        start = (
            date.fromisoformat(filter["from"])
            if "from" in filter
            else to - timedelta(days=filter["days"] - 1)
        )
        days = (to - start).days + 1
        if not 1 <= days <= 366 or to > last_closed:
            raise ValidationError("History window must contain at most 366 closed dates")
        headers = await records(
            tx,
            query,
            """
            SELECT id, day::text, timezone, day_start, day_end, observed_at, estimate FROM
            inventory_value_days WHERE account_id=$1 AND game= 'mtg' AND day BETWEEN $2::date AND
            $3::date AND day_end <= $4::timestamptz ORDER BY day
            """,
            [account_id, start, to, as_of],
            ["id", "day", "timezone", "day_start", "day_end", "observed_at", "estimate"],
        )
        next_refresh = (
            await query(
                tx,
                """
                SELECT least($5::timestamptz, coalesce(min(day_end), $5::timestamptz)) FROM
                inventory_value_days WHERE account_id=$1 AND game= 'mtg' AND day BETWEEN $2::date
                AND $3::date AND day_end > $4::timestamptz
                """,
                [account_id, start, to, as_of, boundary],
            )
        )[0][0]
        if not isinstance(next_refresh, datetime):
            raise PriceReadUnavailable()
        identity = filter["identity"]
        estimates: dict[str, Document] = {}
        if identity and headers:
            rows = await records(
                tx,
                query,
                """
                SELECT h.day_id, h.quantity, r.evidence-> 'reference' FROM
                inventory_value_holdings h JOIN inventory_value_references r USING(day_id,
                printing_id, finish) WHERE h.day_id=ANY($1::uuid[]) AND h.printing_id=$2 AND
                ($3::text IS NULL OR h.finish=$3) AND ($4::text IS NULL OR h.condition=$4)
                """,
                [
                    [h["id"] for h in headers],
                    identity["printingId"],
                    identity.get("finish"),
                    identity.get("condition"),
                ],
                ["day_id", "quantity", "reference"],
            )
            for header in headers:
                estimates[str(header["id"])] = value_estimate(
                    r for r in rows if r["day_id"] == header["id"]
                )
        by_day = {header["day"]: header for header in headers}
        points: list[Document] = []
        for offset in range(days):
            day = (start + timedelta(days=offset)).isoformat()
            point_header = by_day.get(day)
            points.append(
                {
                    "kind": "Captured",
                    "day": day,
                    "timezone": point_header["timezone"],
                    "dayStart": iso_timestamp(point_header["day_start"]),
                    "dayEnd": iso_timestamp(point_header["day_end"]),
                    "observedAt": iso_timestamp(point_header["observed_at"]),
                    "estimate": estimates.get(str(point_header["id"]), point_header["estimate"]),
                }
                if point_header
                else {"kind": "Gap", "day": day}
            )
        return {
            "asOf": iso_timestamp(as_of),
            "nextDayBoundary": iso_timestamp(boundary),
            "nextRefreshAt": iso_timestamp(next_refresh),
            "timezone": self.timezone,
            "window": {"from": start.isoformat(), "to": to.isoformat(), "days": days},
            "identity": identity,
            "points": points,
        }

    async def current(self, actor: Actor) -> Document:
        user = await self.valuation.auth.require_actor(actor)
        try:
            async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
                now = (await valuation_query(tx, "SELECT statement_timestamp()", []))[0][0]
                if not isinstance(now, datetime):
                    raise PriceReadUnavailable()
                return await self.current_in_transaction(tx, user.account_id, now)
        except ValidationError:
            raise
        except Exception:
            raise PriceReadUnavailable() from None

    async def history(self, actor: Actor, input: object = MISSING) -> Document:
        user = await self.valuation.auth.require_actor(actor)
        try:
            async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
                now = (await valuation_query(tx, "SELECT statement_timestamp()", []))[0][0]
                if not isinstance(now, datetime):
                    raise PriceReadUnavailable()
                return await self.history_in_transaction(tx, user.account_id, input, now)
        except ValidationError:
            raise
        except Exception:
            raise PriceReadUnavailable() from None


def create_inventory_values(
    pool: ConnectionPool, valuation: Valuation, *, timezone: str = "Europe/Berlin"
) -> InventoryValues:
    return InventoryValues(pool, valuation, timezone=timezone)
