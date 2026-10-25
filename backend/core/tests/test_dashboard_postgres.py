"""Opt-in Dashboard against the Root-assigned PostgreSQL target, without services."""

import asyncio
import os
from uuid import uuid4

import pytest
from test_postgres import native_account, native_pool

from spellbook_core.auth import create_session_auth
from spellbook_core.db import transaction
from spellbook_core.mtg.dashboard import create_dashboard
from spellbook_core.mtg.inventory_value import create_inventory_values
from spellbook_core.mtg.valuation import create_valuation

pytestmark = pytest.mark.skipif(
    not os.environ.get("P02B_CORE_NATIVE_DATABASE"), reason="Requires exclusive native PG lease"
)


def test_dashboard_real_aggregates_deck_allocation_and_account_isolation() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_account(pool) as (account, token),
            native_account(pool) as (_, other_token),
        ):
            auth = create_session_auth(pool)
            actor, other = (
                await auth.validate_session(token),
                await auth.validate_session(other_token),
            )
            assert actor and other
            inventory, deck, empty_deck, canonical, printing, alternate = [
                str(uuid4()) for _ in range(6)
            ]
            async with transaction(pool) as tx:
                await tx.execute(
                    "INSERT INTO inventories(id,account_id,game) VALUES(%s,%s,'mtg')",
                    (inventory, account),
                )
                for position, (identity, finish, condition, quantity) in enumerate(
                    [(printing, "nonfoil", "NM", 2), (alternate, "foil", "LP", 3)]
                ):
                    await tx.execute(
                        "INSERT INTO inventory_cards(id,inventory_id,account_id,game,"
                        "catalog_card_id,"
                        "canonical_card_id,name,set_code,image_uri,quantity,finish,condition,"
                        "spellbook_position) VALUES(%s,%s,%s,'mtg',%s,%s,"
                        "'Dashboard','tst','',%s,%s,%s,%s)",
                        (
                            uuid4(),
                            inventory,
                            account,
                            identity,
                            canonical,
                            quantity,
                            finish,
                            condition,
                            position,
                        ),
                    )
                for identifier, name in [(deck, "Required"), (empty_deck, "Empty")]:
                    await tx.execute(
                        "INSERT INTO decks(id,account_id,game,name) VALUES(%s,%s,'mtg',%s)",
                        (identifier, account, name),
                    )
                for role, quantity in [("main", 5), ("sideboard", 2)]:
                    await tx.execute(
                        "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
                        "canonical_card_id,name,set_code,image_uri,quantity,role) "
                        "VALUES(%s,%s,%s,'mtg',%s,%s,'Dashboard','tst','',%s,%s)",
                        (uuid4(), deck, account, printing, canonical, quantity, role),
                    )
                await tx.execute(
                    "INSERT INTO scan_sessions(id,account_id,game,status) "
                    "VALUES(%s,%s,'mtg','pending_review')",
                    (uuid4(), account),
                )
            values = create_inventory_values(pool, create_valuation(pool, auth))
            dashboard = create_dashboard(pool, auth, values)
            summary = await dashboard.get(actor)
            assert summary["totals"] == dict(
                total=5, names=1, printings=2, sets=1, foils=3, decks=2
            )
            assert summary["sets"] == [{"label": "tst", "quantity": 5, "share": 1}]
            assert len(summary["recentEntries"]) == 2
            required = next(row for row in summary["decks"] if row["name"] == "Required")
            assert {
                key: required[key] for key in ("required", "exact", "alternate", "missing")
            } == {
                "required": 7,
                "exact": 2,
                "alternate": 3,
                "missing": 2,
            }
            assert summary["pendingScanReviews"] == 1
            assert summary["valuationError"] is None
            assert summary["inventoryValue"] is not None
            assert summary["inventoryValue"]["estimate"]["totalQuantity"] == 5
            assert summary["inventoryValueHistory"] is not None
            assert summary["inventoryValueHistory"]["window"]["days"] == 30
            assert (
                summary["inventoryValue"]["evaluatedAt"]
                == summary["inventoryValueHistory"]["asOf"]
            )
            foreign = await dashboard.get(other)
            assert foreign["totals"] == dict(
                total=0, names=0, printings=0, sets=0, foils=0, decks=0
            )
            assert foreign["decks"] == foreign["recentEntries"] == foreign["sets"] == []
            assert foreign["pendingScanReviews"] == 0
            assert all(row["share"] == row["quantity"] == 0 for row in foreign["conditions"])

    asyncio.run(scenario())
