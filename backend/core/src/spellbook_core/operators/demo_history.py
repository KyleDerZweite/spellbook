"""Insert an explicit Demo scenario using starter identities, never private edits."""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from psycopg.types.json import Jsonb

from spellbook_core.mtg.demo_prices import fixture, frozen
from spellbook_core.mtg.inventory_value import estimate_holdings, pair_key, unique_holding_pairs

from . import OperatorError
from .fixtures import Precon

if TYPE_CHECKING:
    from .demo import Client


def seed_demo_history(client: Client, account: str, precon: Precon, timezone: str) -> None:
    try:
        calendar = ZoneInfo(timezone)
    except ZoneInfoNotFoundError, ValueError:
        raise OperatorError("VALUE_HISTORY_TIMEZONE must be a valid IANA timezone.") from None
    today = datetime.now(UTC).astimezone(calendar).date()
    holdings = [
        {
            "printing_id": row["card"]["id"],
            "canonical_card_id": row["card"]["oracle_id"],
            "name": row["card"]["name"],
            "set_code": row["card"]["set_code"],
            "image_uri": row["card"].get("image_uri", ""),
            "finish": row["finish"],
            "condition": row["condition"],
            "quantity": row["quantity"],
        }
        for row in precon.cards + precon.inventory_extras
    ]
    pairs = unique_holding_pairs(holdings)
    factors = fixture()["historyFactors"]
    for index, factor in enumerate(factors):
        day = today - timedelta(days=len(factors) - index)
        start = datetime.combine(day, datetime.min.time(), calendar).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=1), datetime.min.time(), calendar).astimezone(
            UTC
        )
        observed = end - timedelta(seconds=10)
        values = frozen(pairs, observed, factor=factor)
        references = {pair_key(row): row for row in values["response"]["results"]}
        estimate = estimate_holdings(holdings, references)
        day_id = str(uuid5(NAMESPACE_URL, f"spellbook-demo-history:{account}:{day}"))
        inserted = client.execute(
            """INSERT INTO inventory_value_days(id,account_id,game,day,timezone,day_start,
               day_end,observed_at,estimate,policy_version) VALUES(%s,%s,'mtg',%s,%s,%s,%s,%s,%s,
               'demo-scenario-v1') ON CONFLICT(account_id,game,day) DO NOTHING RETURNING id""",
            (day_id, account, day, timezone, start, end, observed, Jsonb(estimate)),
        ).fetchone()
        if inserted is None:
            continue
        for evidence in values["evidence"]:
            pair = evidence["reference"]
            client.execute(
                """INSERT INTO inventory_value_references(day_id,printing_id,finish,evidence)
                   VALUES(%s,%s,%s,%s)""",
                (day_id, pair["printingId"], pair["finish"], Jsonb(evidence)),
            )
        for row in holdings:
            client.execute(
                """INSERT INTO inventory_value_holdings(day_id,printing_id,finish,condition,
                   canonical_card_id,name,set_code,image_uri,quantity)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    day_id,
                    row["printing_id"],
                    row["finish"],
                    row["condition"],
                    row["canonical_card_id"],
                    row["name"],
                    row["set_code"],
                    row["image_uri"],
                    row["quantity"],
                ),
            )
