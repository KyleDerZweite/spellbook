"""Account-scoped Dashboard facts against an explicitly leased disposable Catalog."""

import asyncio
import os
from uuid import uuid4

import pytest
from test_catalog_valuation_postgres import native_fixture

from spellbook_core.auth import create_session_auth
from spellbook_core.db import transaction
from spellbook_core.mtg.dashboard import Distribution, create_dashboard

pytestmark = pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_DOMAIN_TEST_DATABASE"),
    reason="Requires Root-assigned disposable PostgreSQL database",
)


def test_catalog_buckets_are_actual_exclusive_weighted_and_active_generation_only() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            auth = create_session_auth(f.pool)
            actor = await auth.validate_session(f.token)
            assert actor
            dashboard = create_dashboard(f.pool, auth, f.values)
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE catalog_printings SET colors=ARRAY['U','R'], "
                    "card_types=ARRAY['Artifact','Creature'],rarity='rare', "
                    "document=jsonb_set(document,'{color_identity}','[\"G\"]') "
                    "WHERE generation_id=%s AND id=%s",
                    (f.generation, f.alternate),
                )
                await tx.execute(
                    "UPDATE catalog_printings SET card_types=ARRAY['Creature','Land'], "
                    "rarity='bonus' WHERE generation_id=%s AND id=%s",
                    (f.generation, f.land),
                )
                for printing, canonical, quantity in [
                    (f.land, str(uuid4()), 3),
                    ("legacy:unmatched", str(uuid4()), 2),
                ]:
                    await tx.execute(
                        "INSERT INTO inventory_cards(id,inventory_id,account_id,game,"
                        "catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,"
                        "finish,condition,spellbook_position) "
                        "VALUES(%s,%s,%s,'mtg',%s,%s,'Stored fact','tst','',%s,'nonfoil','NM',0)",
                        (uuid4(), f.account, f.account, printing, canonical, quantity),
                    )
                await tx.execute(
                    "INSERT INTO inventories(id,account_id,game) VALUES(%s,%s,'mtg')",
                    (f.other_account, f.other_account),
                )
                await tx.execute(
                    "INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,"
                    "canonical_card_id,name,set_code,image_uri,quantity,finish,condition,"
                    "spellbook_position) "
                    "VALUES(%s,%s,%s,'mtg',%s,%s,'Foreign fact','tst','',17,'nonfoil','NM',0)",
                    (uuid4(), f.other_account, f.other_account, f.printing, f.oracle),
                )
            summary = await dashboard.get(actor)
            assert summary["totals"]["total"] == 10
            catalog = summary["catalogBreakdown"]
            assert catalog and catalog["matchedQuantity"] == 8 and catalog["unknownQuantity"] == 2
            assert catalog["setNames"] == {"tst": "Test Set"}
            for distribution in [
                catalog["colors"],
                catalog["colorIdentity"],
                catalog["rarities"],
                catalog["primaryTypes"],
            ]:
                assert sum(row["quantity"] for row in distribution) == 10
                assert sum(row["share"] for row in distribution) == pytest.approx(1)

            def counts(rows: list[Distribution]) -> dict[str, int]:
                return {str(row["label"]): int(row["quantity"]) for row in rows}

            assert counts(catalog["colors"])["Multicolor"] == 5
            assert counts(catalog["colors"])["Colorless"] == 3
            assert counts(catalog["colorIdentity"])["Green"] == 5
            assert (
                counts(catalog["rarities"])["rare"] == 5
                and counts(catalog["rarities"])["special"] == 3
            )
            assert (
                counts(catalog["primaryTypes"])["Creature"] == 5
                and counts(catalog["primaryTypes"])["Artifact"] == 0
            )
            assert counts(catalog["primaryTypes"])["Land"] == 3
            async with transaction(f.pool) as tx:
                await tx.execute("UPDATE catalog_state SET active_generation=NULL WHERE id=1")
            missing = (await dashboard.get(actor))["catalogBreakdown"]
            assert missing and missing["unknownQuantity"] == 10 and missing["matchedQuantity"] == 0
            assert missing["setNames"] == {}
            assert all(
                next(r for r in group if r["label"].lower() == "unknown")["quantity"] == 10
                for group in [
                    missing["colors"],
                    missing["colorIdentity"],
                    missing["rarities"],
                    missing["primaryTypes"],
                ]
            )

    asyncio.run(scenario())


def test_requirement_previews_reuse_allocation_and_are_bounded_and_private() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            auth = create_session_auth(f.pool)
            actor = await auth.validate_session(f.token)
            assert actor
            deck, foreign = str(uuid4()), str(uuid4())
            async with transaction(f.pool) as tx:
                for identifier, account, name in [
                    (deck, f.account, "Actual deck"),
                    (foreign, f.other_account, "Private deck"),
                ]:
                    await tx.execute(
                        "INSERT INTO decks(id,account_id,game,name) VALUES(%s,%s,'mtg',%s)",
                        (identifier, account, name),
                    )
                entries = [(deck, f.account, f.printing, f.oracle, 7, "Alternate requirement")]
                entries += [
                    (deck, f.account, str(uuid4()), str(uuid4()), 1, f"Missing {i}")
                    for i in range(10)
                ]
                entries += [
                    (
                        foreign,
                        f.other_account,
                        str(uuid4()),
                        str(uuid4()),
                        99,
                        "Foreign requirement",
                    )
                ]
                for identifier, account, printing, canonical, quantity, name in entries:
                    await tx.execute(
                        "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
                        "canonical_card_id,name,set_code,image_uri,quantity,role) "
                        "VALUES(%s,%s,%s,'mtg',%s,%s,%s,'tst','https://example.test/actual.jpg',%s,'main')",
                        (uuid4(), identifier, account, printing, canonical, name, quantity),
                    )
                await tx.execute(
                    "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
                    "canonical_card_id,name,set_code,image_uri,quantity,role) "
                    "VALUES(%s,%s,%s,'mtg',%s,%s,'Foreign mismatched row','tst','',99,'main')",
                    (uuid4(), deck, f.other_account, str(uuid4()), str(uuid4())),
                )
            summary = await create_dashboard(f.pool, auth, f.values).get(actor)
            assert len(summary["decks"]) == 1
            actual = summary["decks"][0]
            assert (
                actual["required"],
                actual["exact"],
                actual["alternate"],
                actual["missing"],
            ) == (17, 0, 5, 12)
            previews = summary["requirements"]
            assert len(previews["missing"]) == 8 and len(previews["alternate"]) == 1
            row = previews["alternate"][0]
            assert row == dict(
                deckId=deck,
                deckName="Actual deck",
                canonicalCardId=f.oracle,
                catalogCardId=f.printing,
                name="Alternate requirement",
                imageUri="https://example.test/actual.jpg",
                required=7,
                exact=0,
                alternate=5,
                missing=2,
            )
            for item in previews["missing"]:
                assert item["deckId"] == deck
                assert isinstance(item["missing"], int) and item["missing"] > 0
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE inventory_cards SET quantity=quantity+1 WHERE id=%s", (f.entry,)
                )
            changed = await create_dashboard(f.pool, auth, f.values).get(actor)
            assert changed["requirements"]["alternate"][0]["alternate"] == 6
            assert changed["requirements"]["alternate"][0]["missing"] == 1

    asyncio.run(scenario())


def test_empty_inventory_keeps_true_zero_buckets() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            auth = create_session_auth(f.pool)
            actor = await auth.validate_session(f.token)
            assert actor
            async with transaction(f.pool) as tx:
                await tx.execute("DELETE FROM inventory_cards WHERE account_id=%s", (f.account,))
            result = await create_dashboard(f.pool, auth, f.values).get(actor)
            catalog = result["catalogBreakdown"]
            assert catalog and catalog["matchedQuantity"] == catalog["unknownQuantity"] == 0
            assert all(
                row["quantity"] == row["share"] == 0
                for group in [
                    catalog["colors"],
                    catalog["colorIdentity"],
                    catalog["rarities"],
                    catalog["primaryTypes"],
                ]
                for row in group
            )
            assert result["requirements"] == {"missing": [], "alternate": []}

    asyncio.run(scenario())
