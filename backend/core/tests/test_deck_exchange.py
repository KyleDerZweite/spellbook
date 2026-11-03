"""Portable exchange preserves metadata and exact identity or rejects the whole import."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec, patch

import pytest

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ActorError, ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks import create_decks
from spellbook_core.mtg.decks.exchange import export_deck, preview_deck_import
from spellbook_core.mtg.decks.models import DeckAcknowledgement, DeckCard, Document
from spellbook_core.mtg.errors import CatalogPrintingNotFoundError
from spellbook_core.mtg.models import CardDocument

PRINTING = "33333333-3333-4333-8333-333333333333"
OTHER = "44444444-4444-4444-8444-444444444444"
DECK = "22222222-2222-4222-8222-222222222222"
ACTOR = Actor("owner", "owner", "", "", "")
META: Document = dict(
    name='Deck, "雪"', format="Commander", description='Line 1\r\n"Line 2", café\n'
)


def document(identifier: str = PRINTING) -> CardDocument:
    return cast(
        CardDocument,
        dict(
            id=identifier,
            oracle_id="oracle",
            name='Card, "雪" // Face',
            set_code="tst",
            collector_number="7",
            image_uri="",
            type_line="Creature",
            oracle_text="",
            legalities={},
        ),
    )


def cards() -> list[DeckCard]:
    return [
        cast(
            DeckCard,
            dict(
                catalogCardId=PRINTING if index % 2 == 0 else OTHER,
                quantity=index + 1,
                role=role,
                name=document()["name"],
                setCode="tst",
            ),
        )
        for index, role in enumerate(("main", "sideboard", "commander", "companion"))
    ]


def catalog() -> Any:
    result = create_autospec(Catalog, instance=True)
    result.get_catalog_printing.side_effect = lambda identifier: document(identifier)
    result.resolve_catalog_candidates.return_value = [document()]
    return result


def payload(**overrides: object) -> str:
    return json.dumps(
        dict(
            schema="spellbook.deck",
            version=1,
            **META,
            cards=[dict(catalogCardId=PRINTING, quantity=2, role="main")],
        )
        | overrides
    )


@pytest.mark.parametrize("format", ["csv", "json"])
def test_lossless_round_trip_all_roles_quoting_unicode_and_multiple_exact_printings(
    format: Any,
) -> None:
    async def scenario() -> None:
        source = catalog()
        value = export_deck(META, cards(), {}, format)
        result = await preview_deck_import(source, "\ufeff" + value)
        assert result["metadata"] == META
        assert not result["unresolved"] and not result["ambiguous"]
        operations = create_decks(
            create_autospec(ConnectionPool), source, create_autospec(SessionAuth)
        )._import_operations(result)
        assert [
            (op["card"]["catalogCardId"], op["quantity"], op["role"]) for op in operations
        ] == [(c["catalogCardId"], c["quantity"], c["role"]) for c in cards()]
        source.resolve_catalog_candidates.assert_not_awaited()
        assert source.get_catalog_printing.await_count == 2
        if format == "json":
            assert set(json.loads(value)) == {
                "schema",
                "version",
                "name",
                "format",
                "description",
                "cards",
            }
            assert set(json.loads(value)["cards"][0]) == {"catalogCardId", "quantity", "role"}

    asyncio.run(scenario())


@pytest.mark.parametrize("format", ["csv", "json"])
def test_empty_portable_deck_preserves_metadata(format: Any) -> None:
    result = asyncio.run(preview_deck_import(catalog(), export_deck(META, [], {}, format)))
    assert result["metadata"] == META and result["parsed"] == [] and not result["unresolved"]


def test_official_arena_about_name_and_every_role() -> None:
    async def scenario() -> None:
        source = catalog()
        result = await preview_deck_import(
            source,
            "About\nName Arena Deck\n\nCommander\n1 Card (TST) 7\n\n"
            "Deck\n2 Card (TST) 7\n\nSideboard\n3 Card\n\nCompanion\n1 Card",
        )
        assert result["metadata"] == dict(name="Arena Deck", format="", description="")
        assert not result["unresolved"]
        assert [line["role"] for line in result["parsed"]] == [
            "commander",
            "main",
            "sideboard",
            "companion",
        ]
        first_line = source.resolve_catalog_candidates.await_args_list[0].args[0]
        assert first_line["setCode"] == "tst" and first_line["collectorNumber"] == "7"

    asyncio.run(scenario())


def test_simple_text_is_explicitly_lossy_and_arena_export_retains_sections() -> None:
    source = cards()
    simple = export_deck(META, source, {}, "simple")
    assert "About" not in simple and "Commander" not in simple and PRINTING not in simple
    result = asyncio.run(preview_deck_import(catalog(), simple))
    assert result["metadata"] is None
    assert all(line["role"] == "main" for line in result["parsed"])
    arena = export_deck(META, source, {PRINTING: document(), OTHER: document(OTHER)}, "arena")
    assert arena.startswith('About\nName Deck, "雪"\n')
    assert all(label in arena for label in ("Deck", "Sideboard", "Commander", "Companion"))
    assert "(TST) 7" in arena


@pytest.mark.parametrize(
    "record",
    [
        dict(catalogCardId="bad", quantity=1, role="main"),
        dict(catalogCardId=PRINTING, quantity=True, role="main"),
        dict(catalogCardId=PRINTING, quantity=0, role="main"),
        dict(catalogCardId=PRINTING, quantity=10001, role="main"),
        dict(catalogCardId=PRINTING, quantity=1.5, role="main"),
        dict(catalogCardId=PRINTING, quantity="1", role="main"),
        dict(catalogCardId=PRINTING, quantity=1, role="maybeboard"),
        dict(catalogCardId=PRINTING, quantity=1, role=[]),
        dict(catalogCardId=PRINTING, quantity=1, role="main", inventory=True),
        {},
        None,
    ],
)
def test_malformed_records_remain_visible_and_block_partial_commit(record: object) -> None:
    source = catalog()
    records = [dict(catalogCardId=PRINTING, quantity=1, role="main"), record]
    result = asyncio.run(preview_deck_import(source, payload(cards=records)))
    assert len(result["resolved"]) == 1 and len(result["unresolved"]) == 1
    assert "Record 2:" in result["unresolved"][0]["line"]["raw"]
    with pytest.raises(ValidationError, match="every"):
        create_decks(
            create_autospec(ConnectionPool), source, create_autospec(SessionAuth)
        )._import_operations(result)


def test_unavailable_exact_identity_does_not_fall_back_to_name_or_other_printing() -> None:
    source = catalog()
    source.get_catalog_printing.side_effect = CatalogPrintingNotFoundError()
    result = asyncio.run(preview_deck_import(source, payload()))
    assert not result["resolved"] and len(result["unresolved"]) == 1
    assert PRINTING in result["unresolved"][0]["line"]["raw"]
    source.resolve_catalog_candidates.assert_not_awaited()


@pytest.mark.parametrize(
    "value",
    [
        payload(version=2),
        payload(version=True),
        payload(version=1.0),
        payload(schema="other"),
        payload(accountId="private"),
        payload(revision="1"),
        payload(relatedTokens=[]),
        payload(cards={}),
        payload(name=""),
        payload(description=None),
        "[]",
        "{",
        payload().replace('"version": 1', '"version": 1, "version": 2'),
        'name,format,description,catalogCardId,quantity,role\n"unterminated',
        "name,format,description,catalogCardId,quantity,role\nDeck,Commander,,bad,1,main,extra",
        "name,format,description,catalogCardId,quantity,role\nOne,Commander,,,,\nTwo,Commander,,,,",
    ],
)
def test_unsupported_or_malformed_documents_fail_without_catalog_queries(value: str) -> None:
    source = catalog()
    with pytest.raises(ValidationError):
        asyncio.run(preview_deck_import(source, value))
    source.get_catalog_printing.assert_not_awaited()
    source.resolve_catalog_candidates.assert_not_awaited()


@pytest.mark.parametrize(
    "value",
    ["x" * 100001, payload(cards=[dict(catalogCardId=PRINTING, quantity=1, role="main")] * 1001)],
)
def test_bounds_precede_resolution(value: str) -> None:
    source = catalog()
    with pytest.raises(ValidationError):
        asyncio.run(preview_deck_import(source, value))
    source.get_catalog_printing.assert_not_awaited()
    source.resolve_catalog_candidates.assert_not_awaited()


def test_new_deck_import_preserves_portable_metadata_and_uses_atomic_create_command() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), catalog(), auth)
        with (
            patch.object(decks, "_replay_intent", AsyncMock(return_value=None)),
            patch.object(decks, "_mutation", AsyncMock(return_value={"deckId": DECK})) as command,
        ):
            await decks.import_text_deck(
                ACTOR,
                dict(
                    game="mtg",
                    requestId="new",
                    text=payload(),
                    name="caller",
                    format="Modern",
                    description="caller",
                ),
            )
            assert command.await_args is not None
            assert command.await_args.kwargs["create"] == META
            assert command.await_args.args[1]["operations"][0]["card"]["catalogCardId"] == PRINTING

    asyncio.run(scenario())


def test_additive_import_keeps_target_metadata_and_rejects_unresolved_without_mutating() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), catalog(), auth)

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield cast(Transaction, AsyncMock())

        with (
            patch.object(decks, "_replay_intent", AsyncMock(return_value=None)),
            patch.object(decks, "_mutation", AsyncMock()) as command,
            patch("spellbook_core.mtg.decks.application.transaction", context),
            patch(
                "spellbook_core.mtg.decks.application.require_deck",
                AsyncMock(return_value=dict(id=DECK, format="Modern")),
            ) as owned,
        ):
            await decks.import_into_deck(ACTOR, dict(deckId=DECK, requestId="add", text=payload()))
            owned.assert_awaited_once()
            assert command.await_args is not None
            assert command.await_args.kwargs.keys() == {"intent"}
            assert command.await_args.args[1]["operations"][0]["op"] == "add"
            command.reset_mock()
            with pytest.raises(ValidationError):
                await decks.import_into_deck(
                    ACTOR, dict(deckId=DECK, requestId="bad", text="1 Unknown\nbroken")
                )
            command.assert_not_awaited()

    asyncio.run(scenario())


def test_preview_authentication_precedes_parser_and_catalog() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.side_effect = ActorError()
        source = catalog()
        decks = create_decks(create_autospec(ConnectionPool), source, auth)
        with pytest.raises(ActorError):
            await decks.preview_mtg_import(ACTOR, payload())
        source.get_catalog_printing.assert_not_awaited()

    asyncio.run(scenario())


def test_quoted_csv_header_and_repeated_metadata_are_supported() -> None:
    source = catalog()
    value = (
        '"name","format","description","catalogCardId","quantity","role"\r\n'
        + f"Test,Modern,Notes,{PRINTING},1,main\r\nTest,Modern,Notes,{PRINTING},2,sideboard\r\n"
    )
    result = asyncio.run(preview_deck_import(source, value))
    assert result["metadata"] == dict(name="Test", format="Modern", description="Notes")
    assert len(result["resolved"]) == 2 and not result["unresolved"]


def test_duplicate_printing_role_total_and_text_record_bounds_are_visible() -> None:
    source = catalog()
    value = payload(cards=[dict(catalogCardId=PRINTING, quantity=6000, role="main")] * 2)
    result = asyncio.run(preview_deck_import(source, value))
    assert result["unresolved"][0]["reason"] == "Combined printing/role quantity exceeds 10000"
    with pytest.raises(ValidationError, match="1000 card records"):
        asyncio.run(preview_deck_import(source, "1 Card\n" * 1001))


def test_portable_retry_returns_receipt_before_catalog_or_parser_work() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), catalog(), auth)
        ack: DeckAcknowledgement = dict(
            deckId=DECK, requestId="retry", revision="1", changes=[], removedEntryIds=[]
        )
        with (
            patch.object(decks, "_replay_intent", AsyncMock(return_value=ack)),
            patch.object(
                decks,
                "preview_mtg_import",
                AsyncMock(side_effect=RuntimeError("Catalog unavailable")),
            ) as preview,
        ):
            assert (
                await decks.import_text_deck(
                    ACTOR, dict(game="mtg", requestId="retry", text=payload())
                )
                == ack
            )
            preview.assert_not_awaited()

    asyncio.run(scenario())


def test_exact_import_rejects_a_mismatched_catalog_identity() -> None:
    source = catalog()
    source.get_catalog_printing.side_effect = None
    source.get_catalog_printing.return_value = document(OTHER)
    result = asyncio.run(preview_deck_import(source, payload()))
    assert not result["resolved"] and len(result["unresolved"]) == 1


@pytest.mark.parametrize(
    "value", [payload(name="\ud800"), payload(description="\x00"), "1 Card\ud800", "1 Card\x00"]
)
def test_invalid_unicode_and_nul_fail_before_catalog_or_storage(value: str) -> None:
    source = catalog()
    with pytest.raises(ValidationError):
        asyncio.run(preview_deck_import(source, value))
    source.get_catalog_printing.assert_not_awaited()
    source.resolve_catalog_candidates.assert_not_awaited()
