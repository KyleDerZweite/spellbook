"""Opt-in real Deck journeys; Root supplies an exact disposable assignment.

Set DECK_NATIVE_DATABASE to Root's assigned database name and TEST_DATABASE_URL to
that exact already-migrated database. No services, migrations or worker leases run.
The fixture changes only its own accounts and Catalog generation, restores the
original Catalog pointer, and fails closed if another publisher changes it.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol, cast
from uuid import uuid4

import pytest
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

from spellbook_core.auth import SessionAuth, create_session_auth, hash_session_token
from spellbook_core.db import ConnectionPool, transaction
from spellbook_core.errors import ActorError, RequestConflictError
from spellbook_core.migrations import read_migrations, validate_ledger
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog, create_catalog
from spellbook_core.mtg.decks import Decks, create_decks
from spellbook_core.mtg.decks.common import first
from spellbook_core.mtg.decks.library import DeckLibraryRevisionChanged
from spellbook_core.mtg.errors import DeckNotFoundError, DescriptionConflictError
from spellbook_core.mtg.models import CardDocument

pytestmark = pytest.mark.skipif(
    not os.environ.get("DECK_NATIVE_DATABASE"),
    reason="Requires Root's explicit disposable Deck PostgreSQL assignment",
)


class NativePool(ConnectionPool, Protocol):
    async def open(self, wait: bool = False, timeout: float = 30.0) -> None: ...
    async def close(self, timeout: float = 5.0) -> None: ...


@dataclass
class Fixture:
    pool: ConnectionPool
    auth: SessionAuth
    catalog: Catalog
    decks: Decks
    actor: Actor
    other: Actor
    token: str
    printing: str
    alternate: str
    canonical: str


@asynccontextmanager
async def fixture() -> AsyncIterator[Fixture]:
    target = os.environ["DECK_NATIVE_DATABASE"]
    assert target.startswith(("sb_", "spellbook_test")), "Assigned disposable target required"
    dsn = os.environ["TEST_DATABASE_URL"]
    try:
        parameters = conninfo_to_dict(dsn)
    except Exception:
        raise AssertionError("Invalid protected test database configuration") from None
    assert parameters.get("dbname") == target, "Exact Root assignment mismatch"
    if os.environ.get("DATABASE_URL"):
        assert os.environ["DATABASE_URL"] == dsn, "DATABASE_URL must match the assigned target"
    module = pytest.importorskip("psycopg_pool")
    pool = cast(Callable[..., NativePool], module.AsyncConnectionPool)(
        dsn, open=False, min_size=0, max_size=4
    )
    await pool.open()
    account, other, generation, printing, alternate, canonical = [str(uuid4()) for _ in range(6)]
    token, other_token = uuid4().hex + uuid4().hex[:11], uuid4().hex + uuid4().hex[:11]
    backup: tuple[object, ...] | None = None
    seeded = False
    now = datetime.now(UTC)
    try:
        async with transaction(pool) as tx:
            migrations = read_migrations(Path(__file__).resolve().parents[2] / "drizzle")
            ledger = await (
                await tx.execute(
                    "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id"
                )
            ).fetchall()
            assert validate_ledger(migrations, ledger) == len(migrations)
            backup = await (
                await tx.execute(
                    "SELECT active_generation,previous_generation "
                    "FROM catalog_state WHERE id=1 FOR UPDATE"
                )
            ).fetchone()
            assert backup is not None
            for identifier, session in ((account, token), (other, other_token)):
                await tx.execute(
                    "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)",
                    (identifier, "deck-" + identifier),
                )
                await tx.execute(
                    "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                    (hash_session_token(session), identifier, now + timedelta(hours=1)),
                )
            await tx.execute(
                "INSERT INTO catalog_generations(id,source_type,source_updated_at,"
                "document_count) VALUES(%s,'test',%s,2)",
                (generation, now),
            )
            for identifier, number in ((printing, "1"), (alternate, "2")):
                card: CardDocument = dict(
                    id=identifier,
                    oracle_id=canonical,
                    name="Deck Fixture",
                    lang="en",
                    released_at="2026-01-01",
                    layout="normal",
                    mana_cost="{1}",
                    cmc=1,
                    type_line="Creature",
                    oracle_text="",
                    colors=[],
                    color_identity=[],
                    keywords=[],
                    card_types=["Creature"],
                    rarity="common",
                    set_code="tst",
                    set_name="Deck Test",
                    collector_number=number,
                    image_uri="image",
                    image_uri_small="small",
                    is_foil_available=True,
                    is_nonfoil_available=True,
                    legalities={"modern": "legal", "commander": "legal"},
                )
                await tx.execute(
                    """INSERT INTO catalog_printings(generation_id,id,oracle_id,name,
                    normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,
                    colors,card_types,legalities,search_name,search_text,document)
                    VALUES(%s,%s,%s,'Deck Fixture','deck fixture','Deck Fixture','en',
                    'tst',%s,'common',1,%s,%s,%s,'deck fixture','Deck Fixture',%s)""",
                    (
                        generation,
                        identifier,
                        canonical,
                        number,
                        [],
                        ["Creature"],
                        Jsonb(card["legalities"]),
                        Jsonb(card),
                    ),
                )
            await tx.execute(
                "UPDATE catalog_state SET active_generation=%s WHERE id=1", (generation,)
            )
        seeded = True
        auth, catalog = create_session_auth(pool), create_catalog(pool)
        actor, foreign = (
            await auth.validate_session(token),
            await auth.validate_session(other_token),
        )
        assert actor is not None and foreign is not None
        yield Fixture(
            pool,
            auth,
            catalog,
            create_decks(pool, catalog, auth),
            actor,
            foreign,
            token,
            printing,
            alternate,
            canonical,
        )
    finally:
        try:
            if seeded:
                async with transaction(pool) as tx:
                    current = await (
                        await tx.execute(
                            "SELECT active_generation FROM catalog_state WHERE id=1 FOR UPDATE"
                        )
                    ).fetchone()
                    assert current and str(current[0]) == generation, (
                        "Foreign Catalog publication blocks restoration"
                    )
                    assert backup is not None
                    await tx.execute(
                        "UPDATE catalog_state SET active_generation=%s,"
                        "previous_generation=%s WHERE id=1",
                        backup,
                    )
                    await tx.execute(
                        "DELETE FROM user_profiles WHERE account_id=ANY(%s::text[])",
                        ([account, other],),
                    )
                    await tx.execute(
                        "DELETE FROM catalog_generations WHERE id=%s::uuid", (generation,)
                    )
        finally:
            await pool.close()


async def create_deck(f: Fixture, name: str = "Functional Deck") -> str:
    deck = await f.decks.create_deck_record(
        f.actor, dict(game="mtg", name=name, description="", format="Commander")
    )
    return deck["id"]


def test_related_tokens_use_active_catalog_without_changing_requirements() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck_id = await create_deck(f)
            await f.decks.add_catalog_card_to_deck(
                f.actor,
                dict(
                    deckId=deck_id,
                    catalogCardId=f.printing,
                    quantity=3,
                    role="main",
                    requestId=str(uuid4()),
                ),
            )
            legacy = await f.decks.get_deck(f.actor, deck_id)
            assert legacy["relatedTokens"]["status"] == "unavailable"
            token_id = str(uuid4())
            facts = {
                "items": [
                    dict(
                        catalogCardId=token_id,
                        canonicalCardId=None,
                        name="Spirit",
                        layout="token",
                        setCode="tst",
                        collectorNumber="1",
                        faces=[
                            dict(
                                name="Spirit",
                                typeLine="Token Creature — Spirit",
                                colors=["R"],
                                oracleText="Menace",
                                power="2",
                                toughness="2",
                                imageUri=None,
                                imageUriSmall=None,
                            )
                        ],
                    )
                ],
                "unresolved": [],
            }
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE catalog_printings SET "
                    "document=jsonb_set(document,'{related_tokens}',%s) "
                    "WHERE id=%s::uuid AND generation_id="
                    "(SELECT active_generation FROM catalog_state WHERE id=1)",
                    (Jsonb(facts), f.printing),
                )
            current = await f.decks.get_deck(f.actor, deck_id)
            assert current["deckCards"] == legacy["deckCards"]
            assert current["relatedTokens"]["status"] == "available"
            assert current["relatedTokens"]["items"] == [
                {**facts["items"][0], "sourceEntryIds": [current["deckCards"][0]["id"]]}
            ]
            assert "related_tokens" not in await f.catalog.get_catalog_printing(f.printing)
            with pytest.raises(DeckNotFoundError):
                await f.decks.get_deck(f.other, deck_id)

    asyncio.run(scenario())


def test_real_crud_import_identity_ownership_library_and_receipt_replay() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck_id = await create_deck(f)
            request = str(uuid4())
            input = dict(
                deckId=deck_id,
                catalogCardId=f.printing,
                canonicalCardId="untrusted",
                name="untrusted",
                setCode="wrong",
                imageUri="wrong",
                quantity=3,
                role="main",
                requestId=request,
            )
            added = await f.decks.add_deck_card(f.actor, input)
            assert added["revision"] == "1"
            entry = added["changes"][0]["entryId"]
            cards = await f.decks.get_deck_cards_for_deck(f.actor, deck_id)
            assert (
                cards[0]["canonicalCardId"] == f.canonical and cards[0]["name"] == "Deck Fixture"
            )
            assert cards[0]["imageUri"] == "image"
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "INSERT INTO inventories(id,account_id,game) VALUES(%s,%s,'mtg')",
                    (f.actor.account_id, f.actor.account_id),
                )
                for identity, quantity in ((f.printing, 1), (f.alternate, 1)):
                    await tx.execute(
                        """INSERT INTO inventory_cards(id,inventory_id,account_id,game,
                    catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,
                    finish,condition,spellbook_position)
                    VALUES(%s,%s,%s,'mtg',%s,%s,'Deck Fixture','tst','image',
                    %s,'nonfoil','NM',0)""",
                        (
                            uuid4(),
                            f.actor.account_id,
                            f.actor.account_id,
                            identity,
                            f.canonical,
                            quantity,
                        ),
                    )
            state = await f.decks.get_deck(f.actor, deck_id)
            assert state["availability"][entry] == dict(exact=1, alternate=1, missing=1)
            assert state["ownedByCanonical"] == {f.canonical: 2}
            assert state["valuationError"] is None and state["valueEstimates"] is not None
            assert (await f.decks.availability(f.actor, deck_id))["totals"] == dict(
                required=3, exact=1, alternate=1, missing=1
            )
            assert (await f.decks.get_deck_legality(f.actor, deck_id))["deckDocuments"][
                f.printing
            ]["id"] == f.printing
            assert (
                await f.decks.export_decklist(f.actor, deck_id)
                == "About\nName Functional Deck\n\nDeck\n3 Deck Fixture (TST) 1\n"
            )
            page = await f.decks.get_deck_library(f.actor)
            assert page["items"][0]["id"] == deck_id
            assert page["matchingTotal"] == page["globalTotal"] == 1
            assert page["items"][0]["quantity"] == 3
            assert page["items"][0]["availability"] == dict(
                required=3, exact=1, alternate=1, missing=1
            )
            assert (await f.decks.get_deck_library(f.actor, dict(ownership="complete")))[
                "matchingTotal"
            ] == 0
            assert (await f.decks.get_deck_library(f.actor, dict(ownership="in-progress")))[
                "matchingTotal"
            ] == 1
            assert (await f.decks.locate_deck(f.actor, deck_id, dict(ownership="complete")))[
                "offset"
            ] is None
            assert (await f.decks.locate_deck(f.actor, deck_id))["offset"] == 0
            choices = await f.decks.get_deck_choices(
                f.actor, dict(query="missing", selectedDeckId=deck_id)
            )
            assert choices["selected"] is not None
            assert choices["selected"]["id"] == deck_id
            assert len(await f.decks.ownership(f.actor, [f.canonical])) == 2
            assert (await f.decks.search(f.actor, "Deck Fixture"))["ownedByCanonical"] == {
                f.canonical: 2
            }
            with pytest.raises(DeckNotFoundError):
                await f.decks.get_deck(f.other, deck_id)
            assert (await f.decks.get_deck_library(f.other))["globalTotal"] == 0
            with pytest.raises(DeckNotFoundError):
                await f.decks.delete_deck(f.other, deck_id)
            with pytest.raises(DeckNotFoundError):
                await f.decks.add_catalog_card_to_deck(
                    f.other,
                    {
                        **input,
                        "requestId": str(uuid4()),
                    },
                )
            assert await f.decks.ownership(f.other, [f.canonical]) == []
            unchanged = await f.decks.update_deck_card(f.actor, entry, 3, None, str(uuid4()))
            assert unchanged["revision"] == "1"
            updated = await f.decks.update_deck(
                f.actor, dict(deckId=deck_id, description="saved", descriptionRevision="0")
            )
            assert updated["descriptionRevision"] == "1"
            with pytest.raises(DescriptionConflictError):
                await f.decks.update_deck(
                    f.actor, dict(deckId=deck_id, description="stale", descriptionRevision="0")
                )
            with pytest.raises(DeckLibraryRevisionChanged):
                await f.decks.get_deck_library(f.actor, dict(expectedRevision=page["revision"]))
            assert await f.decks.add_deck_card(f.actor, input) == added
            with pytest.raises(RequestConflictError):
                await f.decks.add_deck_card(f.actor, {**input, "quantity": 4})
            before_printing = (await f.decks.get_deck_cards_for_deck(f.actor, deck_id))[0]
            replaced = await f.decks.change_deck_printing(
                f.actor,
                dict(
                    entryId=entry,
                    catalogCardId=f.alternate,
                    quantity=3,
                    role="main",
                    requestId=str(uuid4()),
                ),
            )
            assert replaced["changes"][0]["entryId"] == entry
            after_printing = (await f.decks.get_deck_cards_for_deck(f.actor, deck_id))[0]
            assert after_printing["catalogCardId"] == f.alternate
            assert after_printing["createdAt"] == before_printing["createdAt"]
            text_add = await f.decks.import_into_deck(
                f.actor,
                dict(
                    deckId=deck_id,
                    text="1 Deck Fixture (TST) 1",
                    requestId=str(uuid4()),
                ),
            )
            assert text_add["changes"][0]["quantity"] == 1
            preview = await f.decks.preview_mtg_import(
                f.actor,
                "Deck\n2 Deck Fixture (TST) 1\nMaybeboard\n1 Deck Fixture (TST) 2",
                "Commander",
            )
            assert len(preview["resolved"]) == 2
            import_input = dict(
                game="mtg",
                name="Imported",
                description="",
                format="Commander",
                text="Deck\n2 Deck Fixture (TST) 1",
                source="import",
                requestId=str(uuid4()),
            )
            imported = await f.decks.import_text_deck(f.actor, import_input)
            assert imported["changes"][0]["quantity"] == 2
            await f.decks.delete_deck(f.actor, imported["deckId"])
            assert await f.decks.import_text_deck(f.actor, import_input) == imported
            direct = await f.decks.import_deck(
                f.actor,
                dict(
                    requestId=str(uuid4()),
                    game="mtg",
                    source="import",
                    name="Structured",
                    description="",
                    format="Modern",
                    operations=[
                        dict(
                            op="add",
                            quantity=1,
                            role="main",
                            card=dict(
                                catalogCardId=f.printing,
                                canonicalCardId="untrusted",
                                name="untrusted",
                                setCode="",
                                imageUri="",
                            ),
                        )
                    ],
                ),
            )
            assert direct["changes"][0]["quantity"] == 1
            await f.decks.delete_deck(f.actor, direct["deckId"])
            await f.decks.delete_deck(f.actor, deck_id)
            assert await f.decks.add_deck_card(f.actor, input) == added

    asyncio.run(scenario())


def test_real_rollback_merge_replay_concurrent_retry_and_session_recheck() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            deck_id = await create_deck(f)
            input = dict(
                deckId=deck_id,
                catalogCardId=f.printing,
                quantity=2,
                role="main",
                requestId=str(uuid4()),
            )
            first_add, replay = await asyncio.gather(
                f.decks.add_catalog_card_to_deck(f.actor, input),
                f.decks.add_catalog_card_to_deck(f.actor, input),
            )
            assert first_add == replay
            entry = first_add["changes"][0]["entryId"]
            before = await f.decks.get_deck_library(f.actor)
            failure_request = str(uuid4())
            with pytest.raises(DeckNotFoundError):
                await f.decks.bulk_mutate_deck_cards(
                    f.actor,
                    dict(
                        deckId=deck_id,
                        requestId=failure_request,
                        source="web",
                        game="mtg",
                        operations=[
                            dict(op="increment", target=dict(entryId=entry), quantity=1),
                            dict(op="remove", target=dict(entryId=str(uuid4()))),
                        ],
                    ),
                )
            assert (await f.decks.get_deck_cards_for_deck(f.actor, deck_id))[0]["quantity"] == 2
            async with transaction(f.pool) as tx:
                assert not await first(
                    tx,
                    "SELECT 1 FROM deck_mutation_requests WHERE account_id=%s AND request_id=%s",
                    (f.actor.account_id, failure_request),
                )
            assert (await f.decks.get_deck_library(f.actor))["revision"] == before["revision"]
            # Delta decrement keeps one copy; explicit bulk decrement can remove the row.
            floor = await f.decks.update_deck_card(f.actor, entry, None, None, str(uuid4()), -9)
            assert floor["changes"][0]["quantity"] == 1
            side = await f.decks.add_catalog_card_to_deck(
                f.actor, {**input, "role": "sideboard", "requestId": str(uuid4())}
            )
            side_id = side["changes"][0]["entryId"]
            merge_request = str(uuid4())
            merged = await f.decks.update_deck_card(
                f.actor, entry, None, "sideboard", merge_request
            )
            assert (
                await f.decks.update_deck_card(f.actor, entry, None, "sideboard", merge_request)
                == merged
            )
            assert merged["changes"][0]["quantity"] == 3
            assert (
                merged["removedEntryIds"] == [entry] and merged["changes"][0]["entryId"] == side_id
            )
            request = str(uuid4())
            removed = await f.decks.remove_deck_card(f.actor, side_id, request)
            assert await f.decks.remove_deck_card(f.actor, side_id, request) == removed
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "DELETE FROM auth_sessions WHERE token_hash=%s",
                    (hash_session_token(f.token),),
                )
            with pytest.raises(ActorError):
                await f.decks.add_catalog_card_to_deck(f.actor, input)

    asyncio.run(scenario())


@pytest.mark.parametrize("exchange_format", ["json", "csv"])
def test_portable_roundtrip_additive_import_and_atomic_rejection(exchange_format: str) -> None:
    async def scenario() -> None:
        import json

        from spellbook_core.errors import ValidationError

        async with fixture() as f:
            original = await f.decks.create_deck_record(
                f.actor,
                dict(
                    game="mtg",
                    name='Portable, "雪"',
                    format="Modern",
                    description='First\n"Second", line',
                ),
            )
            await f.decks.bulk_mutate_deck_cards(
                f.actor,
                dict(
                    deckId=original["id"],
                    requestId=str(uuid4()),
                    source="web",
                    game="mtg",
                    operations=[
                        dict(
                            op="add",
                            card=dict(
                                catalogCardId=f.printing if i % 2 else f.alternate,
                                canonicalCardId="untrusted",
                                name="untrusted",
                            ),
                            quantity=i + 1,
                            role=role,
                        )
                        for i, role in enumerate(("main", "sideboard", "commander", "companion"))
                    ],
                ),
            )
            value = await f.decks.export_decklist(f.actor, original["id"], exchange_format)
            receipt = await f.decks.import_text_deck(
                f.actor,
                dict(
                    game="mtg",
                    requestId=str(uuid4()),
                    text=value,
                ),
            )
            created = await f.decks.get_deck(f.actor, receipt["deckId"])
            assert {
                key: created["decks"][0][key] for key in ("name", "format", "description")
            } == {key: original[key] for key in ("name", "format", "description")}
            expected = {
                (entry["catalogCardId"], entry["role"]): entry["quantity"]
                for entry in created["deckCards"]
            }
            assert len(expected) == 4
            addition = dict(deckId=receipt["deckId"], requestId=str(uuid4()), text=value)
            await f.decks.import_into_deck(f.actor, addition)
            await f.decks.import_into_deck(f.actor, addition)
            assert {
                (entry["catalogCardId"], entry["role"]): entry["quantity"]
                for entry in await f.decks.get_deck_cards_for_deck(f.actor, receipt["deckId"])
            } == {key: quantity * 2 for key, quantity in expected.items()}
            with pytest.raises(DeckNotFoundError):
                await f.decks.export_decklist(f.other, receipt["deckId"], exchange_format)
            payload = json.loads(await f.decks.export_decklist(f.actor, original["id"], "json"))
            payload["cards"].append(dict(catalogCardId=str(uuid4()), quantity=1, role="main"))
            before = await f.decks.get_deck_library(f.actor)
            with pytest.raises(ValidationError):
                await f.decks.import_text_deck(
                    f.actor, dict(game="mtg", requestId=str(uuid4()), text=json.dumps(payload))
                )
            assert (await f.decks.get_deck_library(f.actor))["globalTotal"] == before[
                "globalTotal"
            ]

    asyncio.run(scenario())
