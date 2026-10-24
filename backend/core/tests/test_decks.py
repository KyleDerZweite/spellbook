"""Functional Deck rules and transaction components, without database services."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec, patch

import pytest

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import (
    ActorError,
    DatabaseIntegerRangeError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.categories import CategoryMergeConflict
from spellbook_core.mtg.decks import create_decks
from spellbook_core.mtg.decks.common import normalize_operations
from spellbook_core.mtg.decks.library import (
    DeckLibraryRevisionChanged,
    next_deck_choice_offset,
    parse_library_input,
)
from spellbook_core.mtg.decks.models import DeckAcknowledgement, DeckCard, Document, OwnedPrinting
from spellbook_core.mtg.decks.mutation import apply_operation
from spellbook_core.mtg.decks.rules import (
    allocate_deck_availability,
    canonical_quantities,
    format_arena_decklist,
    legality_warnings,
)
from spellbook_core.mtg.models import CardDocument
from spellbook_core.mtg.valuation import Valuation

ENTRY = "11111111-1111-4111-8111-111111111111"
DECK = "22222222-2222-4222-8222-222222222222"
PRINTING = "33333333-3333-4333-8333-333333333333"
ACTOR = Actor("owner", "owner", "", "", "")
NOW = datetime(2026, 10, 23, tzinfo=UTC)


def document(**overrides: Any) -> CardDocument:
    return cast(
        CardDocument,
        dict(
            id=PRINTING,
            oracle_id="oracle",
            name="Test",
            set_code="tst",
            collector_number="7",
            image_uri="image",
            type_line="Creature",
            oracle_text="",
            legalities={"commander": "legal"},
            **overrides,
        ),
    )


def card(identifier: str, printing: str, quantity: int, role: str = "main") -> DeckCard:
    return DeckCard(
        id=identifier,
        deckId=DECK,
        accountId="owner",
        game="mtg",
        catalogCardId=printing,
        canonicalCardId="oracle",
        name="Test",
        setCode="tst",
        imageUri="",
        quantity=quantity,
        role=role,
        createdAt="",
        updatedAt="",
    )


def test_exact_printings_are_allocated_before_alternates_across_all_roles() -> None:
    cards = [
        card("a", "requested", 3),
        card("b", "owned", 2, "sideboard"),
        card("c", "requested", 1, "commander"),
    ]
    inventory = [OwnedPrinting(catalogCardId="owned", canonicalCardId="oracle", quantity=3)]
    assert allocate_deck_availability(cards, inventory) == {
        "a": dict(exact=0, alternate=1, missing=2),
        "b": dict(exact=2, alternate=0, missing=0),
        "c": dict(exact=0, alternate=0, missing=1),
    }
    assert inventory[0]["quantity"] == 3
    assert canonical_quantities(inventory) == {"oracle": 3}
    with pytest.raises(DatabaseIntegerRangeError):
        canonical_quantities(
            [
                *inventory,
                OwnedPrinting(
                    catalogCardId="other", canonicalCardId="oracle", quantity=9007199254740991
                ),
            ]
        )


def test_legality_includes_copy_exceptions_restricted_cards_and_maybeboard() -> None:
    ordinary = document()
    warnings = legality_warnings([(2, "main", ordinary), (1, "maybeboard", ordinary)], "Commander")
    assert [w["code"] for w in warnings] == [
        "commander_singleton",
        "commander_size",
        "commander_count",
    ]
    restricted: CardDocument = {**ordinary, "legalities": {"vintage": "restricted"}}
    warnings = legality_warnings([(2, "main", restricted)], "Vintage")
    assert [w["code"] for w in warnings] == ["main_under_60", "restricted_copies"]
    unlimited: CardDocument = {
        **ordinary,
        "oracle_text": "A deck can have any number of cards named Test.",
    }
    assert [w["code"] for w in legality_warnings([(100, "main", unlimited)], "Commander")] == [
        "commander_count"
    ]
    numbered: CardDocument = {
        **ordinary,
        "oracle_text": "A deck can have up to seven cards named Test.",
    }
    assert all(
        w["code"] != "too_many_copies"
        for w in legality_warnings([(7, "main", numbered)], "Modern")
    )


def test_export_preserves_sections_and_falls_back_without_catalog_numbers() -> None:
    cards = [card("a", PRINTING, 2), card("b", PRINTING, 1, "commander")]
    assert (
        format_arena_decklist(cards, {PRINTING: document()})
        == "Deck\n2 Test (TST) 7\n\nCommander\n1 Test (TST) 7\n"
    )
    assert format_arena_decklist(cards, {}) == "Deck\n2 Test (TST)\n\nCommander\n1 Test (TST)\n"
    assert format_arena_decklist([], {}) == "Deck\n"


@pytest.mark.parametrize(
    "value",
    [
        [],
        [None],
        [dict(op=" add ")],
        [dict(op="increment", target=dict(entryId=ENTRY), quantity=0)],
        [dict(op="set", target=dict(entryId=ENTRY), quantity=True)],
        [dict(op="move", target=dict(entryId=ENTRY), role="main", categoryPreview=None)],
    ],
)
def test_operation_validation_rejects_invalid_and_null_inputs(value: object) -> None:
    with pytest.raises(ValidationError):
        normalize_operations(value)


def test_operation_normalization_preserves_fingerprint_and_deletion_semantics() -> None:
    result = normalize_operations(
        [
            dict(op="set", target=dict(entryId=ENTRY.upper()), quantity=-1),
            dict(
                op="replace",
                target=dict(entryId=ENTRY),
                catalogCardId="  replacement  ",
                quantity=2,
                role=" main ",
                categoryPreview="token",
            ),
        ]
    )
    assert result == [
        dict(op="set", target=dict(entryId=ENTRY.upper()), quantity=-1),
        dict(
            op="replace",
            target=dict(entryId=ENTRY),
            catalogCardId="replacement",
            quantity=2,
            role="main",
            categoryPreview="token",
        ),
    ]


def test_library_query_normalizes_unicode_ids_and_caps_offsets() -> None:
    query = parse_library_input(
        dict(query=" e\u0301 ", categoryVersionIds=[ENTRY.upper(), ENTRY])
    )["query"]
    assert query == dict(query="é", format="", categoryVersionIds=[ENTRY], sort="updated:desc")
    for invalid in [
        dict(sort=""),
        dict(offset=1000001),
        dict(limit=201),
        dict(expectedRevision="01"),
        dict(unknown=1),
    ]:
        with pytest.raises(ValidationError):
            parse_library_input(invalid)
    assert next_deck_choice_offset(999999, 1, True) == 1000000
    assert next_deck_choice_offset(1000000, 1, True) is None


@pytest.mark.parametrize(("floor", "expected"), [(0, 0), (1, 1)])
def test_decrement_floor_is_transactional_and_removal_is_explicit(
    floor: int, expected: int
) -> None:
    async def scenario() -> None:
        tx = cast(Transaction, AsyncMock())
        entry = dict(id=ENTRY, catalog_card_id=PRINTING, role="main", quantity=2)
        with patch("spellbook_core.mtg.decks.mutation.first", AsyncMock(return_value=entry)):
            applied = await apply_operation(
                tx,
                "owner",
                DECK,
                dict(op="decrement", target=dict(entryId=ENTRY), quantity=4),
                NOW,
                {},
                floor,
            )
        assert applied.change["quantity"] == expected
        assert applied.change["delta"] == expected - 2
        assert applied.removed == (ENTRY if floor == 0 else None)
        assert applied.changed
        assert tx.execute.call_count == 1  # type: ignore[attr-defined]

    asyncio.run(scenario())


def test_category_merge_requires_current_preview_before_mutating_destination() -> None:
    async def scenario() -> None:
        tx = cast(Transaction, AsyncMock())
        source = dict(
            id=ENTRY,
            catalog_card_id=PRINTING,
            canonical_card_id="oracle",
            name="Test",
            set_code="tst",
            image_uri="",
            role="main",
            quantity=2,
        )
        destination = {**source, "id": "destination", "role": "sideboard", "quantity": 3}
        with (
            patch(
                "spellbook_core.mtg.decks.mutation.first",
                AsyncMock(side_effect=[source, destination]),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.require_category_merge_preview",
                AsyncMock(side_effect=CategoryMergeConflict(dict(required=True))),
            ),
            pytest.raises(CategoryMergeConflict),
        ):
            await apply_operation(
                tx,
                "owner",
                DECK,
                dict(op="move", target=dict(entryId=ENTRY), role="sideboard"),
                NOW,
                {},
                0,
            )
        assert tx.execute.call_count == 0  # type: ignore[attr-defined]
        saved = {**destination, "quantity": 5}
        with (
            patch(
                "spellbook_core.mtg.decks.mutation.first",
                AsyncMock(side_effect=[source, destination, saved]),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.require_category_merge_preview", AsyncMock()
            ) as preview,
        ):
            result = await apply_operation(
                tx,
                "owner",
                DECK,
                dict(
                    op="move",
                    target=dict(entryId=ENTRY),
                    role="sideboard",
                    categoryPreview="confirmed",
                ),
                NOW,
                {},
                0,
            )
        assert result.change == dict(
            entryId="destination", catalogCardId=PRINTING, role="sideboard", quantity=5, delta=2
        )
        assert result.removed == ENTRY
        assert preview.await_args and preview.await_args.args[2] == "confirmed"

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "field,invalid",
    [
        (None, {}),
        (None, []),
        (None, False),
        ("requestId", "another-request"),
        ("deckId", "another-deck"),
        ("revision", 1),
        ("changes", {}),
        ("changes", [{}]),
        ("categoryDecisionRevision", 1),
        ("categoryEntryIds", [1]),
    ],
)
def test_text_import_replays_original_and_rejects_incomplete_receipts(
    field: str | None, invalid: object
) -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), create_autospec(Catalog), auth)
        tx: Any = AsyncMock()

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield tx

        input: Document = dict(deckId=DECK, requestId="retry", text="2 Forest")
        intent = dict(kind="deck.text", deckId=DECK, text="2 Forest")
        ack: DeckAcknowledgement = dict(
            requestId="retry", deckId=DECK, revision="7", changes=[], removedEntryIds=[]
        )
        receipt: Document = dict(request_hash=mutation_fingerprint(intent), acknowledgement=ack)
        with (
            patch("spellbook_core.mtg.decks.application.transaction", context),
            patch(
                "spellbook_core.mtg.decks.application.first", AsyncMock(return_value=receipt)
            ) as read,
            patch("spellbook_core.mtg.decks.application.require_deck", AsyncMock()) as require,
            patch.object(decks, "preview_mtg_import", AsyncMock()) as catalog,
        ):
            assert await decks.import_into_deck(ACTOR, input) is ack
            read.return_value = {
                **receipt,
                "acknowledgement": invalid if field is None else {**ack, field: invalid},
            }
            with pytest.raises(RequestConflictError):
                await decks.import_into_deck(ACTOR, input)
            for missing_field in ("request_hash", "acknowledgement"):
                read.return_value = {**receipt, missing_field: None}
                with pytest.raises(RequestConflictError):
                    await decks.import_into_deck(ACTOR, input)
            require.assert_not_awaited()
            catalog.assert_not_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "field,invalid",
    [
        (None, {}),
        (None, []),
        (None, False),
        ("requestId", "another-request"),
        ("deckId", "another-deck"),
        ("revision", 1),
        ("changes", {}),
        ("changes", [{}]),
        ("categoryDecisionRevision", 1),
        ("categoryEntryIds", [1]),
    ],
)
def test_original_receipts_precede_catalog_and_deck_lookups(
    field: str | None, invalid: object
) -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor_for_write.return_value = ACTOR
        decks = create_decks(
            create_autospec(ConnectionPool),
            create_autospec(Catalog),
            auth,
            create_autospec(Valuation),
        )
        tx = cast(Transaction, AsyncMock())

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield tx

        input: Document = dict(
            deckId=DECK,
            requestId="request",
            source="mobile",
            game="mtg",
            operations=[dict(op="remove", target=dict(entryId=ENTRY))],
        )
        normalized = {
            "kind": "deck.bulk",
            "deckId": DECK,
            "game": "mtg",
            "source": "mobile",
            "operations": normalize_operations(input["operations"]),
        }
        ack: DeckAcknowledgement = dict(
            requestId="request", deckId=DECK, revision="7", changes=[], removedEntryIds=[ENTRY]
        )
        receipt: Document = dict(
            request_hash=mutation_fingerprint(normalized), acknowledgement=ack, deck_id=DECK
        )
        with (
            patch("spellbook_core.mtg.decks.mutation.category_transaction", context),
            patch("spellbook_core.mtg.decks.mutation.first", AsyncMock(return_value=receipt)),
            patch("spellbook_core.mtg.decks.mutation.require_deck", AsyncMock()) as require,
            patch(
                "spellbook_core.mtg.decks.mutation.read_transaction_catalog_printing", AsyncMock()
            ) as catalog,
        ):
            assert await decks.bulk_mutate_deck_cards(ACTOR, input) is ack
            with (
                patch(
                    "spellbook_core.mtg.decks.mutation.first",
                    AsyncMock(
                        return_value={
                            **receipt,
                            "acknowledgement": invalid
                            if field is None
                            else {**ack, field: invalid},
                        }
                    ),
                ),
                pytest.raises(RequestConflictError),
            ):
                await decks.bulk_mutate_deck_cards(ACTOR, input)
            require.assert_not_awaited()
            catalog.assert_not_awaited()
            with pytest.raises(RequestConflictError):
                await decks.bulk_mutate_deck_cards(ACTOR, {**input, "source": "web"})
            for missing_field in ("request_hash", "acknowledgement"):
                malformed = {**receipt, missing_field: None}
                with (
                    patch(
                        "spellbook_core.mtg.decks.mutation.first",
                        AsyncMock(return_value=malformed),
                    ),
                    pytest.raises(RequestConflictError),
                ):
                    await decks.bulk_mutate_deck_cards(ACTOR, input)
            require.assert_not_awaited()
            catalog.assert_not_awaited()
            # Rechecking the live session happens under the Profile write lock even on replay.
            auth.require_actor_for_write.side_effect = ActorError()
            with pytest.raises(ActorError):
                await decks.bulk_mutate_deck_cards(ACTOR, input)
        sql = [call.args[0] for call in tx.execute.call_args_list]  # type: ignore[attr-defined]
        assert "FOR UPDATE" in sql[0]
        assert "pg_advisory_xact_lock" in sql[1]

    asyncio.run(scenario())


def test_import_preview_uses_real_parser_and_legality_with_resolved_catalog() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        catalog = create_autospec(Catalog, instance=True)
        catalog.resolve_catalog_candidates.return_value = [document()]
        decks = create_decks(create_autospec(ConnectionPool), catalog, auth)
        result = await decks.preview_mtg_import(
            ACTOR, "Deck\n2 Test (TST) 7\nMaybeboard\n1 Test\nbroken line", "Commander"
        )
        assert [r["line"]["quantity"] for r in result["resolved"]] == [2, 1]
        assert result["unresolved"][0]["reason"] == "Unrecognized card line"
        assert result["warnings"][0]["code"] == "commander_singleton"
        committed = decks._import_operations(result)
        assert len(committed) == 1 and committed[0]["quantity"] == 2

    asyncio.run(scenario())


def test_library_revision_error_preserves_public_failure_kind() -> None:
    failure = DeckLibraryRevisionChanged("8")
    assert failure.kind == "RevisionChanged" and failure.revision == "8"


@pytest.mark.parametrize(("quantity", "revision", "changed"), [(2, "1", False), (0, "2", True)])
def test_mutation_receipt_revision_and_category_effects_are_atomic(
    quantity: int, revision: str, changed: bool
) -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor_for_write.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), create_autospec(Catalog), auth)
        tx: Any = AsyncMock()

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield tx

        entry = dict(id=ENTRY, catalog_card_id=PRINTING, role="main", quantity=2)
        with (
            patch("spellbook_core.mtg.decks.mutation.category_transaction", context),
            patch(
                "spellbook_core.mtg.decks.mutation.require_deck",
                AsyncMock(return_value=dict(id=DECK, composition_revision=1)),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.first",
                AsyncMock(side_effect=[{}, entry, dict(decision_revision="4")]),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.rows",
                AsyncMock(return_value=[dict(entry_id=ENTRY)]),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.queue_whole_deck_evaluation", AsyncMock()
            ) as queue,
            patch(
                "spellbook_core.mtg.decks.mutation.advance_deck_library_revision", AsyncMock()
            ) as advance,
        ):
            result = await decks.bulk_mutate_deck_cards(
                ACTOR,
                dict(
                    deckId=DECK,
                    requestId="atomic",
                    source="web",
                    game="mtg",
                    operations=[dict(op="set", target=dict(entryId=ENTRY), quantity=quantity)],
                ),
            )
        assert result["revision"] == revision
        assert result["removedEntryIds"] == ([ENTRY] if changed else [])
        assert result["categoryEntryIds"] == ([ENTRY] if changed else [])
        assert queue.await_count == advance.await_count == int(changed)
        statements = [call.args[0] for call in tx.execute.call_args_list]
        assert any("UPDATE decks" in sql for sql in statements) == changed
        assert any("UPDATE deck_category_bundles" in sql for sql in statements) == changed
        assert "INSERT INTO deck_mutation_requests" in " ".join(statements[-1].split())
        # The stored receipt is the original response, including removed/category identities.
        from spellbook_core.fingerprint import serialize_json

        assert tx.execute.call_args.args[1][5] == serialize_json(result)

    asyncio.run(scenario())


def test_optional_deck_valuation_failure_rolls_back_savepoint_and_keeps_snapshot() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), create_autospec(Catalog), auth)
        tx: Any = AsyncMock()

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            assert kwargs == dict(read_only=True, repeatable_read=True)
            yield tx

        deck = dict(
            id=DECK,
            account_id="owner",
            game="mtg",
            name="Test",
            description="",
            format="Commander",
            description_revision=0,
            composition_revision=1,
            created_at=NOW,
            updated_at=NOW,
        )
        with (
            patch("spellbook_core.mtg.decks.read.transaction", context),
            patch("spellbook_core.mtg.decks.read.first", AsyncMock(return_value=dict(as_of=NOW))),
            patch("spellbook_core.mtg.decks.read.rows", AsyncMock(side_effect=[[deck], []])),
            patch("spellbook_core.mtg.decks.read.read_cards", AsyncMock(return_value=[])),
            patch("spellbook_core.mtg.decks.read.owned", AsyncMock(return_value=[])),
            patch(
                "spellbook_core.mtg.decks.read.deck_value_estimates",
                AsyncMock(side_effect=RuntimeError("optional price SQL failed")),
            ),
        ):
            snapshot = await decks.get_deck(ACTOR, DECK)
        assert snapshot["decks"][0]["id"] == DECK
        assert snapshot["valueEstimates"] is None
        assert (
            snapshot["valuationError"]
            and snapshot["valuationError"]["kind"] == "PriceReadUnavailable"
        )
        assert [call.args[0] for call in tx.execute.call_args_list] == [
            "SAVEPOINT deck_value_summary",
            "ROLLBACK TO SAVEPOINT deck_value_summary",
            "RELEASE SAVEPOINT deck_value_summary",
        ]

    asyncio.run(scenario())


def test_catalog_add_replay_ignores_caller_presentation_and_skips_catalog_resolution() -> None:
    async def scenario() -> None:
        auth = create_autospec(SessionAuth, instance=True)
        auth.require_actor_for_write.return_value = ACTOR
        decks = create_decks(create_autospec(ConnectionPool), create_autospec(Catalog), auth)
        tx: Any = AsyncMock()

        @asynccontextmanager
        async def context(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
            yield tx

        intent = dict(
            kind="deck.catalog.add",
            deckId=DECK,
            catalogCardId=PRINTING,
            quantity=2,
            role="main",
            source="mobile",
        )
        ack: DeckAcknowledgement = dict(
            requestId="retry", deckId=DECK, revision="1", changes=[], removedEntryIds=[]
        )
        with (
            patch("spellbook_core.mtg.decks.mutation.category_transaction", context),
            patch(
                "spellbook_core.mtg.decks.mutation.first",
                AsyncMock(
                    return_value=dict(
                        request_hash=mutation_fingerprint(intent),
                        acknowledgement=ack,
                        deck_id=DECK,
                    )
                ),
            ),
            patch(
                "spellbook_core.mtg.decks.mutation.read_transaction_catalog_printing", AsyncMock()
            ) as resolver,
        ):
            assert (
                await decks.add_deck_card(
                    ACTOR,
                    dict(
                        deckId=DECK,
                        catalogCardId="  " + PRINTING.upper() + "  ",
                        canonicalCardId="untrusted",
                        name="different caller presentation",
                        quantity=2,
                        role="main",
                        requestId="retry",
                    ),
                )
                == ack
            )
            resolver.assert_not_awaited()

    asyncio.run(scenario())
