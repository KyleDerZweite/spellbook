"""Disposable PostgreSQL functional scenarios. Root owns database assignment/execution.

Select explicitly with SPELLBOOK_DOMAIN_TEST_DATABASE and TEST_DATABASE_URL pointing
at that same already-migrated disposable sb_* database. This suite starts no services.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import uuid4

import pytest
from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.mtg.catalog import Catalog, create_catalog
from spellbook_core.mtg.inventory_value import InventoryValues, create_inventory_values
from spellbook_core.mtg.valuation import InventoryPriceNotFound, Valuation, create_valuation
from spellbook_core.mtg.valuation_query import Document, valuation_query
from spellbook_core.mtg.value_history import LEASE_KEY, capture_value_history

pytestmark = pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_DOMAIN_TEST_DATABASE"),
    reason="Requires Root-assigned disposable PostgreSQL database",
)


class NativePool(ConnectionPool, Protocol):
    async def open(self, wait: bool = False, timeout: float = 30.0) -> None: ...
    async def close(self, timeout: float = 5.0) -> None: ...


@dataclass
class Fixture:
    pool: NativePool
    catalog: Catalog
    valuation: Valuation
    values: InventoryValues
    account: str
    other_account: str
    token: str
    generation: str
    publication: str
    printing: str
    alternate: str
    land: str
    oracle: str
    entry: str
    observed: datetime


@asynccontextmanager
async def native_fixture() -> AsyncIterator[Fixture]:
    target = os.environ["SPELLBOOK_DOMAIN_TEST_DATABASE"]
    assert target.startswith("sb_") and len(target) > 3, (
        "Requires an assigned disposable sb_* target"
    )
    dsn = os.environ["TEST_DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target, "Disposable target mismatch"
    module = pytest.importorskip("psycopg_pool")
    factory = cast(Callable[..., NativePool], module.AsyncConnectionPool)
    pool = factory(dsn, open=False, min_size=0, max_size=4, timeout=2.0)
    await pool.open()
    account, other, generation, publication, printing, alternate, land, oracle, entry = [
        str(uuid4()) for _ in range(9)
    ]
    token = uuid4().hex + uuid4().hex[:11]
    now = datetime.now(UTC)
    auth = create_session_auth(pool)
    valuation = create_valuation(pool, auth, lambda: now)
    backup: dict[str, list[tuple[object, ...]]] = {}
    seeded = False
    try:
        async with transaction(pool) as tx:
            # Validate the existing schema; this test never runs a migrator or DDL.
            assert (
                await valuation_query(tx, "SELECT count(*) FROM drizzle.__drizzle_migrations", [])
            )[0][0] == 25
            backup["catalog"] = await valuation_query(
                tx,
                "SELECT active_generation,previous_generation FROM catalog_state WHERE id=1",
                [],
            )
            backup["prices"] = await valuation_query(
                tx,
                """
                SELECT active_publication, previous_publication, refresh_status FROM price_state
                WHERE id=1
                """,
                [],
            )
            backup["optional"] = await valuation_query(
                tx, "SELECT source,enabled FROM optional_price_state", []
            )
            await tx.execute("UPDATE optional_price_state SET enabled=false")
            for owner in (account, other):
                await tx.execute(
                    "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)",
                    (owner, "py-domain-" + owner),
                )
            await tx.execute(
                "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                (hash_session_token(token), account, now + timedelta(hours=1)),
            )
            await tx.execute(
                """
                INSERT INTO catalog_generations(id, source_type, source_updated_at,
                document_count) VALUES(%s, 'test' , %s, 3)
                """,
                (generation, now),
            )
            for identifier, card_oracle, language, name, colors, types, collector in [
                (printing, oracle, "en", "Aether Test", ["W"], ["Creature"], "2"),
                (alternate, oracle, "de", "Aether Test", ["W"], ["Creature"], "2"),
                (land, str(uuid4()), "en", "Zero Test", [], ["Land"], "3"),
            ]:
                document: Document = {
                    "id": identifier,
                    "oracle_id": card_oracle,
                    "name": name,
                    "lang": language,
                    "printed_name": "Ätherprobe" if language == "de" else name,
                    "normalized_name": name.lower(),
                    "released_at": "2026-01-01",
                    "set_code": "tst",
                    "set_name": "Test Set",
                    "collector_number": collector,
                    "internal_raw": "private",
                    "color_identity": colors,
                }
                await tx.execute(
                    """
                    INSERT INTO catalog_printings(generation_id, id, oracle_id, name,
                    normalized_name, printed_name, lang, set_code, collector_number, rarity, cmc,
                    colors, card_types, legalities, search_name, search_text, document) VALUES(%s,
                    %s, %s, %s, %s, %s, %s, 'tst' , %s, 'common' , 0, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        generation,
                        identifier,
                        card_oracle,
                        name,
                        name.lower(),
                        document["printed_name"],
                        language,
                        collector,
                        colors,
                        types,
                        Jsonb({"modern": "legal"}),
                        name.lower() + " " + document["printed_name"].lower(),
                        name,
                        Jsonb(document),
                    ),
                )
            await tx.execute(
                "UPDATE catalog_state SET active_generation=%s WHERE id=1", (generation,)
            )
            await tx.execute(
                """
                INSERT INTO price_publications(id, catalog_generation_id, descriptor, source_type,
                source_updated_at, payload_digest, extractor_version, mapping_version) VALUES(%s,
                %s, %s, 'default_cards' , %s, 'fixture-digest' , 3, 1)
                """,
                (publication, generation, Jsonb({"bulkType": "default_cards"}), now),
            )
            for identifier, language in [(printing, "en"), (alternate, "de"), (land, "en")]:
                await tx.execute(
                    """
                    INSERT INTO price_printings(publication_id, id, oracle_id, set_id, set_code,
                    collector_number, lang, finishes, variant_key, identity, links) VALUES(%s, %s,
                    %s, %s, 'tst' , '2' , %s, ARRAY[ 'nonfoil' , 'foil' ], 'variant' , %s, '[]'
                    ::jsonb)
                    """,
                    (
                        publication,
                        identifier,
                        oracle,
                        generation,
                        language,
                        Jsonb({"lang": language, "id": identifier}),
                    ),
                )
                await tx.execute(
                    """
                    INSERT INTO price_observations(publication_id, printing_id, finish, measure,
                    amount, raw_value, supported, english_printing_id) VALUES(%s, %s, 'nonfoil' ,
                    'prices.eur' , %s, %s, true, %s)
                    """,
                    (
                        publication,
                        identifier,
                        None if language == "de" else "0.0017",
                        None if language == "de" else "0.0017",
                        printing if language == "de" else None,
                    ),
                )
            await tx.execute(
                """
                UPDATE price_state SET active_publication=%s, refresh_status= '{}' ::jsonb WHERE
                id=1
                """,
                (publication,),
            )
            await tx.execute(
                "INSERT INTO inventories(id,account_id,game,revision) VALUES(%s,%s,'mtg',7)",
                (account, account),
            )
            for identifier, condition, quantity in [(entry, "NM", 3), (str(uuid4()), "LP", 2)]:
                await tx.execute(
                    """
                    INSERT INTO inventory_cards(id, inventory_id, account_id, game,
                    catalog_card_id, canonical_card_id, name, set_code, image_uri, finish,
                    condition, quantity, spellbook_position) VALUES(%s, %s, %s, 'mtg' , %s, %s,
                    'Aether Test' , 'tst' , '' , 'nonfoil' , %s, %s, 0)
                    """,
                    (identifier, account, account, alternate, oracle, condition, quantity),
                )
        seeded = True
        yield Fixture(
            pool,
            create_catalog(pool),
            valuation,
            create_inventory_values(pool, valuation),
            account,
            other,
            token,
            generation,
            publication,
            printing,
            alternate,
            land,
            oracle,
            entry,
            now,
        )
    finally:
        if seeded:
            async with transaction(pool) as tx:
                await tx.execute(
                    """
                    UPDATE catalog_state SET active_generation=%s, previous_generation=%s WHERE
                    id=1
                    """,
                    backup["catalog"][0],
                )
                await tx.execute(
                    """
                    UPDATE price_state SET active_publication=%s, previous_publication=%s,
                    refresh_status=%s WHERE id=1
                    """,
                    (*backup["prices"][0][:2], Jsonb(backup["prices"][0][2])),
                )
                for source, enabled in backup["optional"]:
                    await tx.execute(
                        "UPDATE optional_price_state SET enabled=%s WHERE source=%s",
                        (enabled, source),
                    )
                await tx.execute("DELETE FROM price_publications WHERE id=%s", (publication,))
                await tx.execute("DELETE FROM catalog_generations WHERE id=%s", (generation,))
                await tx.execute(
                    "DELETE FROM user_profiles WHERE account_id=ANY(%s::text[])",
                    ([account, other],),
                )
        await pool.close()


def test_native_catalog_generation_facets_import_resolution_and_projection() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            response = await f.catalog.search_catalog_request({"query": "", "facets": True})
            assert response["generationId"] == f.generation
            assert response["estimatedTotalHits"] == 2
            assert response["facets"] == {
                "colors": {"W": 1, "C": 1},
                "rarity": {"common": 2},
                "set_code": {"tst": 2},
            }
            hits = cast(list[Document], response["hits"])
            assert hits[0]["id"] == f.printing and "internal_raw" not in hits[0]
            filtered = await f.catalog.search_catalog_request({"filters": {"colors": ["C"]}})
            assert cast(list[Document], filtered["hits"])[0]["id"] == f.land
            assert (await f.catalog.get_printings(f.oracle, 1, 1))["estimatedTotalHits"] == 2
            assert await f.catalog.get_catalog_set_names(["\ufeffTST\u00a0", "tst"]) == {
                "tst": "Test Set"
            }
            candidates = await f.catalog.resolve_catalog_candidates(
                {"name": "Aether Test", "normalizedName": "aether test"}
            )
            assert len(candidates) == 1 and candidates[0]["id"] == f.printing
            exact = await f.catalog.resolve_catalog_candidates(
                {
                    "name": "Ätherprobe",
                    "normalizedName": "ätherprobe",
                    "setCode": "TST",
                    "collectorNumber": "2",
                }
            )
            assert [card["id"] for card in exact] == [f.alternate]
            assert (await f.catalog.get_catalog_printing(f.printing))["id"] == f.printing

    asyncio.run(scenario())


def test_native_reference_fallback_exact_estimate_and_account_isolation() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            actor = await f.valuation.auth.validate_session(f.token)
            assert actor is not None
            response = await f.valuation.printing_references(
                [{"printingId": f.alternate, "finish": "nonfoil"}]
            )
            reference = response["results"][0]
            assert reference["provenance"] == "EnglishFallback"
            assert reference["amount"] == "0.0017"
            assert (await f.values.current(actor))["estimate"]["coveredValue"] == "0.01"
            prices = await f.valuation.inventory_references(actor, {"entryIds": [f.entry]})
            assert prices["results"][0]["entryId"] == f.entry
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE inventory_cards SET account_id=%s WHERE id=%s",
                    (f.other_account, f.entry),
                )
            with pytest.raises(InventoryPriceNotFound):
                await f.valuation.inventory_references(actor, {"entryIds": [f.entry]})

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "observation,hours",
    [
        (datetime(2026, 3, 29, 21, 59, 30, tzinfo=UTC), 23),
        (datetime(2026, 10, 25, 22, 59, 30, tzinfo=UTC), 25),
    ],
)
def test_native_capture_dst_replacement_rollback_and_closed_history(
    observation: datetime, hours: int
) -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE price_publications SET source_updated_at=%s WHERE id=%s",
                    (observation, f.publication),
                )
            result = await capture_value_history(
                f.pool, f.values, account_ids=[f.account], observation_clock=lambda: observation
            )
            assert (
                result.captured_accounts,
                result.captured_holdings,
                result.copied_references,
            ) == (1, 2, 1)
            async with transaction(f.pool, read_only=True) as tx:
                saved = (
                    await valuation_query(
                        tx,
                        """
                        SELECT day_start, day_end, estimate, observed_at FROM inventory_value_days
                        WHERE account_id=$1
                        """,
                        [f.account],
                    )
                )[0]
                assert cast(datetime, saved[1]) - cast(datetime, saved[0]) == timedelta(
                    hours=hours
                )
                assert cast(Document, saved[2])["coveredValue"] == "0.01"
                evidence = (
                    await valuation_query(
                        tx,
                        """
                        SELECT r.evidence FROM inventory_value_references r JOIN
                        inventory_value_days d ON d.id=r.day_id WHERE d.account_id=$1
                        """,
                        [f.account],
                    )
                )[0][0]
                assert cast(Document, evidence)["known"]["rawValue"] == "0.0017"
            # A newer eligible observation replaces evidence and aggregate atomically.
            later = observation + timedelta(seconds=10)
            replacement = await capture_value_history(
                f.pool, f.values, account_ids=[f.account], observation_clock=lambda: later
            )
            assert replacement.captured_accounts == 1

            async def fail(tx: Transaction) -> None:
                raise RuntimeError("injected before commit")

            failed = await capture_value_history(
                f.pool,
                f.values,
                account_ids=[f.account],
                observation_clock=lambda: later + timedelta(seconds=1),
                before_commit=fail,
            )
            assert failed.failed_accounts == 1 and failed.captured_accounts == 0
            # Retry the same instant is a skip, and midnight performs no late backfill.
            assert (
                await capture_value_history(
                    f.pool, f.values, account_ids=[f.account], observation_clock=lambda: later
                )
            ).captured_accounts == 0
            assert (
                await capture_value_history(
                    f.pool,
                    f.values,
                    account_ids=[f.account],
                    observation_clock=lambda: cast(datetime, saved[1]),
                )
            ).captured_accounts == 0
            async with transaction(f.pool, read_only=True, repeatable_read=True) as tx:
                history = await f.values.history_in_transaction(
                    tx, f.account, {"days": 1}, cast(datetime, saved[1]) + timedelta(seconds=1)
                )
                assert history["points"][0]["kind"] == "Captured"
                assert history["points"][0]["observedAt"].endswith("40.000Z")
                zero = await f.values.history_in_transaction(
                    tx,
                    f.account,
                    {"days": 1, "printingId": f.land},
                    cast(datetime, saved[1]) + timedelta(seconds=1),
                )
                assert zero["points"][0]["estimate"]["coveredValue"] == "0.00"
                assert zero["points"][0]["estimate"]["complete"] is True
                private = await f.values.history_in_transaction(
                    tx,
                    f.other_account,
                    {"days": 1},
                    cast(datetime, saved[1]) + timedelta(seconds=1),
                )
                assert private["points"][0]["kind"] == "Gap"

    asyncio.run(scenario())


def test_native_runner_lease_empty_inventory_and_no_backfill() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            observation = datetime(2026, 10, 23, 21, 59, 40, tzinfo=UTC)
            # Another connection holding the session lease prevents all capture work.
            async with await AsyncConnection.connect(
                os.environ["TEST_DATABASE_URL"], autocommit=True
            ) as lease:
                await valuation_query(lease, "SELECT pg_advisory_lock($1::bigint)", [LEASE_KEY])
                result = await capture_value_history(
                    f.pool,
                    f.values,
                    account_ids=[f.other_account],
                    observation_clock=lambda: observation,
                )
                assert result.captured_accounts == 0
                await valuation_query(lease, "SELECT pg_advisory_unlock($1::bigint)", [LEASE_KEY])
            result = await capture_value_history(
                f.pool,
                f.values,
                account_ids=[f.other_account],
                observation_clock=lambda: observation,
            )
            assert result.captured_accounts == 1 and result.captured_holdings == 0
            result = await capture_value_history(
                f.pool,
                f.values,
                account_ids=[f.account],
                observation_clock=lambda: observation + timedelta(minutes=1),
            )
            assert result.captured_accounts == 0
            async with transaction(f.pool, read_only=True) as tx:
                assert (
                    await valuation_query(
                        tx,
                        "SELECT estimate FROM inventory_value_days WHERE account_id=$1",
                        [f.other_account],
                    )
                )[0][0] == {
                    "currency": "EUR",
                    "coveredValue": "0.00",
                    "coveredQuantity": 0,
                    "staleQuantity": 0,
                    "unknownQuantity": 0,
                    "totalQuantity": 0,
                    "complete": True,
                }

    asyncio.run(scenario())


def test_native_optional_selection_and_public_history_provenance() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            cardmarket, mtgjson = str(uuid4()), str(uuid4())
            history_ids = [f.publication, cardmarket, mtgjson]
            old_optional: list[tuple[object, ...]] = []
            seeded = False
            try:
                async with transaction(f.pool) as tx:
                    old_optional = await valuation_query(
                        tx, "SELECT source,active_publication FROM optional_price_state", []
                    )
                    for id, source, precision, amount, measure, provider in [
                        (cardmarket, "Cardmarket", "Instant", "5.70", "trend", "12345"),
                        (
                            mtgjson,
                            "MTGJSON",
                            "Day",
                            "4.20",
                            "paper.cardmarket.retail.normal",
                            str(uuid4()),
                        ),
                    ]:
                        descriptor = {
                            "sourceTime": f.observed.isoformat(),
                            "sourceDate": f.observed.date().isoformat(),
                            "history": {"digest": "history-digest"},
                        }
                        await tx.execute(
                            """
                            INSERT INTO optional_price_publications(id, source, time_precision,
                            source_instant, source_date, descriptor, payload_digest,
                            extractor_version, mapping_version) VALUES(%s, %s, %s, %s, %s, %s,
                            'optional-digest' , 1, 1)
                            """,
                            (
                                id,
                                source,
                                precision,
                                f.observed if precision == "Instant" else None,
                                f.observed.date() if precision == "Day" else None,
                                Jsonb(descriptor),
                            ),
                        )
                        await tx.execute(
                            """
                            INSERT INTO optional_price_printings(publication_id, printing_id,
                            identity, finishes, variant_key) VALUES(%s, %s, %s, ARRAY[ 'nonfoil'
                            ], 'variant' )
                            """,
                            (id, f.printing, Jsonb({"lang": "en"})),
                        )
                        await tx.execute(
                            """
                            INSERT INTO optional_price_observations(publication_id, printing_id,
                            finish, measure, amount, raw_value, supported, provider_id) VALUES(%s,
                            %s, 'nonfoil' , %s, %s, %s, true, %s)
                            """,
                            (id, f.printing, measure, amount, amount, provider),
                        )
                        await tx.execute(
                            """
                            UPDATE optional_price_state SET enabled=true, active_publication=%s
                            WHERE source=%s
                            """,
                            (id, source),
                        )
                    for id, source, amount, measure, history_provider, precision in [
                        (f.publication, "Scryfall", "0.0017", "prices.eur", None, "Instant"),
                        (cardmarket, "Cardmarket", "5.70", "trend", "12345", "Instant"),
                        (
                            mtgjson,
                            "MTGJSON",
                            "4.20",
                            "paper.cardmarket.retail.normal",
                            str(uuid4()),
                            "Day",
                        ),
                    ]:
                        saved = {
                            "descriptor": {
                                "bulkType": "default_cards",
                                "sourceDate": f.observed.date().isoformat(),
                                "history": {"digest": "history-digest"},
                            },
                            "payloadDigest": "history-digest",
                            "extractorVersion": 1,
                            "mappingVersion": 1,
                            "ingestedAt": f.observed.isoformat(),
                        }
                        await tx.execute(
                            """
                            INSERT INTO price_history_publications(publication_id, source,
                            evidence) VALUES(%s, %s, %s)
                            """,
                            (id, source, Jsonb(saved)),
                        )
                        await tx.execute(
                            """
                            INSERT INTO price_history_printings(publication_id, printing_id,
                            identity, variant_key) VALUES(%s, %s, '{}' ::jsonb, 'variant' )
                            """,
                            (id, f.printing),
                        )
                        await tx.execute(
                            """
                            INSERT INTO price_source_history(source, printing_id, finish, day,
                            time_precision, source_instant, amount, measure, provider_id,
                            publication_id, evidence) VALUES(%s, %s, 'nonfoil' , %s, %s, %s, %s,
                            %s, %s, %s, '{}' ::jsonb)
                            """,
                            (
                                source,
                                f.printing,
                                f.observed.date(),
                                precision,
                                f.observed if precision == "Instant" else None,
                                amount,
                                measure,
                                history_provider,
                                id,
                            ),
                        )
                seeded = True
                response = await f.valuation.printing_references(
                    [{"printingId": f.printing, "finish": "nonfoil"}]
                )
                assert response["results"][0]["source"] == "Cardmarket"
                assert response["results"][0]["amount"] == "5.7"
                history = await f.valuation.printing_history(
                    {"printingId": f.printing, "finish": "nonfoil", "days": 1}
                )
                assert len(history["points"]) == 3 and len(history["publications"]) == 3
                points = {p["source"]: p for p in history["points"]}
                assert points["MTGJSON"]["sourceDate"] == f.observed.date().isoformat()
                assert "sourceTime" not in points["MTGJSON"]
                assert points["MTGJSON"]["pointArtifact"] == "AllPrices"
                assert points["Cardmarket"]["providerId"] == "12345"
                filtered = await f.valuation.printing_history(
                    {"printingId": f.printing, "finish": "nonfoil", "sources": ["Scryfall"]}
                )
                assert [p["source"] for p in filtered["points"]] == ["Scryfall"]
            finally:
                if seeded:
                    async with transaction(f.pool) as tx:
                        for old_source, old in old_optional:
                            await tx.execute(
                                """
                                UPDATE optional_price_state SET enabled=false,
                                active_publication=%s WHERE source=%s
                                """,
                                (old, old_source),
                            )
                        await tx.execute(
                            "DELETE FROM optional_price_publications WHERE id=ANY(%s::uuid[])",
                            ([cardmarket, mtgjson],),
                        )
                        await tx.execute(
                            """
                            DELETE FROM price_source_history WHERE publication_id=ANY(%s::uuid[])
                            """,
                            (history_ids,),
                        )
                        await tx.execute(
                            """
                            DELETE FROM price_history_publications WHERE
                            publication_id=ANY(%s::uuid[])
                            """,
                            (history_ids,),
                        )

    asyncio.run(scenario())
