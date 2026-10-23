"""Application/SQL adapter tests with scripted fake SQL, not PostgreSQL evidence."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import cast
from unittest.mock import AsyncMock, create_autospec, patch

import pytest
from spellbook_core.auth import SessionAuth
from spellbook_core.categories import create_categories
from spellbook_core.categories.common import (
    CategoryConflict,
    CategoryPreviewExpired,
    Document,
    LibraryConflict,
    category_transaction,
)
from spellbook_core.categories.jobs import (
    WholeDeckJobClaim,
    backoff_delay_ms,
    backoff_whole_deck_job,
    claim_whole_deck_job,
    process_whole_deck_job,
)
from spellbook_core.categories.library import normalize_definition
from spellbook_core.categories.merge import validate_merge_token
from spellbook_core.categories.previews import preview_page
from spellbook_core.db import Transaction
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor

ID = "00000000-0000-4000-8000-000000000001"
ENTRY = "00000000-0000-4000-8000-000000000002"
ORIGIN = "00000000-0000-4000-8000-000000000003"
ACTOR = Actor("account", "user", "", "", "")


class ScriptedCursor:
    def __init__(self, connection: ScriptedConnection):
        self.connection = connection
        self.result: list[Document] = []

    async def __aenter__(self) -> ScriptedCursor:
        return self

    async def __aexit__(self, *args: object) -> None:
        pass

    async def execute(self, sql: str, params: tuple[object, ...]) -> None:
        self.connection.calls.append(("query", " ".join(sql.split()), params))
        assert self.connection.answers, f"Missing fake SQL answer for {sql}"
        self.result = self.connection.answers.pop(0)

    async def fetchall(self) -> list[Document]:
        return self.result


class ScriptedConnection:
    def __init__(self, answers: list[list[Document]], *, fail: str = ""):
        self.answers = answers.copy()
        self.calls: list[tuple[str, str, tuple[object, ...]]] = []
        self.fail = fail

    def cursor(self, **kwargs: object) -> ScriptedCursor:
        return ScriptedCursor(self)

    async def execute(self, sql: str, params: tuple[object, ...] = ()) -> None:
        self.calls.append(("execute", " ".join(sql.split()), params))
        if self.fail and self.fail in sql:
            raise RuntimeError("injected SQL failure")

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        self.calls.append(("begin", "", ()))
        try:
            yield
        except BaseException:
            self.calls.append(("rollback", "", ()))
            raise
        else:
            self.calls.append(("commit", "", ()))


class ScriptedPool:
    def __init__(self, tx: ScriptedConnection):
        self.tx = tx

    @asynccontextmanager
    async def connection(self, timeout: float | None = None) -> AsyncIterator[Transaction]:
        yield cast(Transaction, self.tx)


def auth() -> SessionAuth:
    result = create_autospec(SessionAuth, instance=True)
    result.require_actor.return_value = ACTOR
    result.require_actor_for_write.return_value = ACTOR
    return cast(SessionAuth, result)


def save_input(**values: object) -> Document:
    return dict(
        requestId=ID,
        originId=None,
        expectedLibraryRevision="0",
        scope="entry",
        name="Flying",
        meaning="Evasive",
        priority=0,
        displayOrder=0,
        roles=["main"],
        rule=dict(op="keyword", value="Flying"),
        confirmRetainedRule=False,
        **values,
    )


def test_library_save_real_logic_versions_and_atomic_receipt_notification() -> None:
    async def scenario() -> None:
        sql = ScriptedConnection([[], [], [], [dict(revision="1")]])
        api = create_categories(ScriptedPool(sql), auth())
        ack = await api.save_definition(ACTOR, save_input())
        assert ack["changed"] and ack["libraryRevision"] == "1"
        commands = [(query, params) for _, query, params in sql.calls]
        version = next(
            params
            for query, params in commands
            if "INSERT INTO category_definition_versions" in query
        )
        assert version[2] == 1
        captured: Document = json.loads(cast(str, version[3]))
        assert captured["originId"] == ack["originId"]
        assert captured["rule"] == save_input()["rule"]
        assert sql.calls[-1][0] == "commit"
        receipt_index = next(
            i
            for i, (_, query, _) in enumerate(sql.calls)
            if "INSERT INTO category_mutation_requests" in query
        )
        notification_index = next(
            i for i, (_, query, _) in enumerate(sql.calls) if "pg_notify" in query
        )
        assert receipt_index < notification_index < len(sql.calls) - 1
        assert not sql.answers

    asyncio.run(scenario())


def test_original_receipt_replay_precedes_any_deck_or_preview_lookup() -> None:
    async def scenario() -> None:
        ack: Document = dict(requestId=ID, deckId=ID, decisionRevision="1", entryIds=[ENTRY])
        fingerprint = mutation_fingerprint(
            dict(
                kind="category.initialize",
                deckId=ID,
                entryId=None,
                categoryId=None,
                expectedDecisionRevision=None,
            )
        )
        sql = ScriptedConnection([[dict(request_hash=fingerprint, acknowledgement=ack)]])
        api = create_categories(ScriptedPool(sql), auth())
        assert await api.initialize_deck_categories(ACTOR, dict(requestId=ID, deckId=ID)) == ack
        assert not any("FROM decks" in query for _, query, _ in sql.calls)
        sql = ScriptedConnection(
            [
                [
                    dict(
                        request_hash=mutation_fingerprint(
                            dict(kind="category.preview.commit", previewId=ID)
                        ),
                        acknowledgement=ack,
                    )
                ]
            ]
        )
        api = create_categories(ScriptedPool(sql), auth())
        assert await api.commit_category_change(ACTOR, dict(requestId=ID, previewId=ID)) == ack
        assert not any("FROM category_change_previews" in query for _, query, _ in sql.calls)

    asyncio.run(scenario())


def test_request_reuse_conflict_rolls_back_without_effects() -> None:
    async def scenario() -> None:
        sql = ScriptedConnection([[dict(request_hash="different", acknowledgement={})]])
        with pytest.raises(RequestConflictError):
            await create_categories(ScriptedPool(sql), auth()).initialize_deck_categories(
                ACTOR, dict(requestId=ID, deckId=ID)
            )
        assert sql.calls[-1][0] == "rollback"
        assert not any("INSERT INTO" in query for _, query, _ in sql.calls)

    asyncio.run(scenario())


def test_definition_noop_keeps_version_and_meaning_change_requires_confirmation() -> None:
    async def scenario() -> None:
        raw = save_input()
        raw["originId"] = ORIGIN
        normalized = normalize_definition(raw)
        current = {
            k: normalized[k]
            for k in ("scope", "name", "meaning", "priority", "displayOrder", "roles", "rule")
        }
        current.update(id=ENTRY, originId=ORIGIN, version=4)
        existing = dict(id=ORIGIN, archived=False, definition=current)
        sql = ScriptedConnection([[], [dict(revision="0")], [existing], []])
        ack = await create_categories(ScriptedPool(sql), auth()).save_definition(ACTOR, raw)
        assert ack == dict(
            requestId=ID, libraryRevision="0", originId=ORIGIN, versionId=ENTRY, changed=False
        )
        assert not any("category_definition_versions(" in query for _, query, _ in sql.calls)
        raw["meaning"] = "Different purpose"
        sql = ScriptedConnection([[], [dict(revision="0")], [existing]])
        with pytest.raises(ValidationError, match="Confirm"):
            await create_categories(ScriptedPool(sql), auth()).save_definition(ACTOR, raw)
        assert sql.calls[-1][0] == "rollback"

    asyncio.run(scenario())


def test_entry_manual_noop_and_conflict_expose_exact_latest() -> None:
    async def scenario() -> None:
        raw = dict(
            requestId=ID, deckId=ID, entryId=ENTRY, categoryId=None, expectedDecisionRevision="2"
        )
        latest: Document = dict(
            decisionRevision="2",
            decisions=[dict(entryId=ENTRY, categoryId=None, state="Manual", evidence=None)],
        )
        sql = ScriptedConnection(
            [
                [],
                [dict(composition_revision="1")],
                [dict(definitions=[])],
                [dict(id=ENTRY)],
                [dict(decision_revision="2")],
            ]
        )
        with patch(
            "spellbook_core.categories.application.read_deck_entry_categories",
            AsyncMock(return_value=latest),
        ):
            result = await create_categories(ScriptedPool(sql), auth()).set_entry_category(
                ACTOR, raw
            )
        assert result["entryIds"] == [] and result["decisionRevision"] == "2"
        assert not any(
            "UPDATE deck_category_bundles" in q or "pg_notify" in q for _, q, _ in sql.calls
        )
        sql = ScriptedConnection(
            [[], [dict(composition_revision="1")], [dict(definitions=[])], [dict(id=ENTRY)]]
        )
        with (
            patch(
                "spellbook_core.categories.application.read_deck_entry_categories",
                AsyncMock(return_value={**latest, "decisionRevision": "3"}),
            ),
            pytest.raises(CategoryConflict) as failure,
        ):
            await create_categories(ScriptedPool(sql), auth()).set_entry_category(ACTOR, raw)
        assert failure.value.latest["decisionRevision"] == "3"
        assert sql.calls[-1][0] == "rollback"

    asyncio.run(scenario())


def test_transaction_rollback_on_failure_and_read_snapshot_configuration() -> None:
    async def scenario() -> None:
        sql = ScriptedConnection([])
        with pytest.raises(RuntimeError):
            async with category_transaction(
                ScriptedPool(sql), read_only=True, repeatable_read=True
            ):
                raise RuntimeError("failure")
        assert [q for _, q, _ in sql.calls][1:3] == [
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
            "SET TRANSACTION READ ONLY",
        ]
        assert sql.calls[-1][0] == "rollback"

    asyncio.run(scenario())


def test_committed_preview_survives_expiry_and_pruning() -> None:
    row: Document = dict(
        id=ID,
        deck_id=ID,
        scope="entry",
        mode="Review",
        expires_at=datetime.now(UTC) - timedelta(days=1),
        has_plan=False,
        difference_total=300,
        blocked=False,
        acknowledgement=dict(requestId=ID),
    )
    page = preview_page(row, [dict(kind="EntryChanged")])
    assert page["status"] == "Committed"
    assert page["total"] == 0 and page["differences"] == []
    row["acknowledgement"] = None
    assert preview_page(row, [])["status"] == "Expired"


def test_merge_consequence_and_optional_combo_source_fences() -> None:
    sources: Document = dict(catalogGenerationId="old", oraclePublicationId="old", policy="p")
    current: Document = dict(
        required=True,
        sourceTokens=sources,
        token=serialize_json(dict(consequence="c", sources=sources)),
    )
    validate_merge_token(
        current,
        serialize_json(dict(consequence="c", sources={**sources, "catalogGenerationId": "prior"})),
    )
    from spellbook_core.categories.common import CategoryMergeConflict

    for token in [None, "[]", "{}", serialize_json(dict(consequence="stale", sources=sources))]:
        with pytest.raises(CategoryMergeConflict):
            validate_merge_token(current, token)
    sources["combo"] = dict(enabled=True, publicationId="new", policyVersion="ingredients-v1")
    with pytest.raises(CategoryMergeConflict):
        validate_merge_token(
            current, serialize_json(dict(consequence="c", sources=dict(policy="p")))
        )
    validate_merge_token(current, serialize_json(dict(consequence="c", sources=sources)))


def claim() -> WholeDeckJobClaim:
    return WholeDeckJobClaim(ID, ACTOR.account_id, "3", "7", "11", ENTRY, 2)


def test_committed_claim_precedes_processing_and_skips_locked_candidates() -> None:
    async def scenario() -> None:
        sql = ScriptedConnection(
            [
                [
                    dict(
                        deck_id=ID,
                        account_id=ACTOR.account_id,
                        generation="3",
                        composition_revision="7",
                        decision_revision="11",
                        attempts=2,
                    )
                ]
            ]
        )
        result = await claim_whole_deck_job(ScriptedPool(sql))
        assert result and result.generation == "3"
        assert sql.calls[-1][0] == "commit"
        assert any("FOR UPDATE SKIP LOCKED" in query for _, query, _ in sql.calls)
        assert not any("user_profiles" in query for _, query, _ in sql.calls)

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "fence",
    [
        "generation",
        "lease_token",
        "composition_revision",
        "decision_revision",
        "deck",
        "bundle",
        "valid",
    ],
)
def test_job_generation_token_composition_decision_fences(fence: str) -> None:
    async def scenario() -> None:
        job: Document = dict(
            generation="3", lease_token=ENTRY, composition_revision="7", decision_revision="11"
        )
        deck: Document = dict(composition_revision="7")
        bundle: Document = dict(decision_revision="11")
        if fence in job:
            job[fence] = "stale"
        elif fence == "deck":
            deck["composition_revision"] = "8"
        elif fence == "bundle":
            bundle["decision_revision"] = "12"
        sql = ScriptedConnection([[deck], [bundle], [job]])
        evaluate = AsyncMock(return_value=dict(changed=False))
        with patch("spellbook_core.categories.whole.evaluate_whole_deck", evaluate):
            await process_whole_deck_job(ScriptedPool(sql), claim())
        queries = [q for _, q, _ in sql.calls]
        lock_tables = [
            next(
                t
                for t in [
                    "user_profiles",
                    "decks",
                    "deck_category_bundles",
                    "deck_whole_category_jobs",
                ]
                if t in q
            )
            for q in queries
            if "FOR UPDATE" in q
        ]
        assert lock_tables == [
            "user_profiles",
            "decks",
            "deck_category_bundles",
            "deck_whole_category_jobs",
        ]
        if fence == "valid":
            evaluate.assert_awaited_once()
            assert any("DELETE FROM deck_whole_category_jobs" in q for q in queries)
        else:
            evaluate.assert_not_awaited()
            assert not any("DELETE FROM" in q for q in queries)
            assert any("INSERT INTO deck_whole_category_jobs" in q for q in queries) == (
                fence not in ("generation", "lease_token")
            )
        assert sql.calls[-1][0] == "commit"

    asyncio.run(scenario())


def test_evaluation_failure_rolls_back_and_backoff_retains_generation_token_guard() -> None:
    async def scenario() -> None:
        sql = ScriptedConnection(
            [
                [dict(composition_revision="7")],
                [dict(decision_revision="11")],
                [
                    dict(
                        generation="3",
                        lease_token=ENTRY,
                        composition_revision="7",
                        decision_revision="11",
                    )
                ],
            ]
        )
        with (
            patch(
                "spellbook_core.categories.whole.evaluate_whole_deck",
                AsyncMock(side_effect=RuntimeError("database unavailable")),
            ),
            pytest.raises(RuntimeError),
        ):
            await process_whole_deck_job(ScriptedPool(sql), claim())
        assert sql.calls[-1][0] == "rollback"
        assert not any("DELETE FROM deck_whole_category_jobs" in q for _, q, _ in sql.calls)
        await backoff_whole_deck_job(ScriptedPool(sql), claim())
        query, params = next((q, p) for _, q, p in sql.calls if "last_error=" in q)
        assert params == (2000, ID, "3", ENTRY)
        assert "generation=%s::bigint AND lease_token=%s::uuid" in query
        assert sql.calls[-1][0] == "commit"
        assert [backoff_delay_ms(i) for i in (1, 2, 6, 7, 100)] == [
            1000,
            2000,
            32000,
            60000,
            60000,
        ]

    asyncio.run(scenario())


@pytest.mark.parametrize("expired", [False, True])
def test_preview_commit_rejects_stale_fences_and_expiry(expired: bool) -> None:
    async def scenario() -> None:
        plan: Document = dict(
            blocked=False, compositionRevision="1", libraryRevision="2", decisionRevision="3"
        )
        answers: list[list[Document]] = [
            [],
            [dict(deck_id=ID, acknowledgement=None)],
            [dict(composition_revision="9")],
            [dict(plan=plan, expires_at=datetime.now(UTC), scope="entry")],
            [dict(expired=expired)],
        ]
        if not expired:
            answers.extend([[dict(revision="2")], [dict(decision_revision="3")]])
        sql = ScriptedConnection(answers)
        with pytest.raises(CategoryPreviewExpired if expired else LibraryConflict):
            await create_categories(ScriptedPool(sql), auth()).commit_category_change(
                ACTOR, dict(requestId=ID, previewId=ID)
            )
        assert sql.calls[-1][0] == "rollback"
        assert not any(
            "store_whole_categories" in q or "INSERT INTO category_mutation_requests" in q
            for _, q, _ in sql.calls
        )

    asyncio.run(scenario())


def test_initialization_adopts_current_versions_and_only_missing_main_entries() -> None:
    from spellbook_core.categories.persistence import ensure_entry_category_initialization
    from spellbook_core.categories.rules import STARTER_DEFINITIONS

    async def scenario() -> None:
        generation = "00000000-0000-4000-8000-000000000004"
        fact: Document = dict(
            printing_id=ID,
            raw_oracle_id=ID,
            types=["Land"],
            keywords=[],
            transform_version=3,
            schema_version=3,
            catalog_generation_id=generation,
            oracle_publication_id=None,
            source_time=None,
            payload_digest=None,
            parser_version=None,
            roots={d["rootId"]: [] for d in STARTER_DEFINITIONS if d["rootId"]},
        )
        version: Document = dict(
            id=ORIGIN,
            originId=ORIGIN,
            scope="entry",
            version=2,
            name="Flying",
            meaning="Evasive",
            rule=dict(op="keyword", value="Flying"),
            priority=0,
            displayOrder=0,
            roles=["main"],
            createdAt="2026-10-23T00:00:00.000Z",
        )
        sql = ScriptedConnection(
            [
                [],
                [dict(account_id=ACTOR.account_id)],
                [dict(revision="4")],
                [dict(id=ORIGIN, archived=False, definition=version)],
                [dict(id=ENTRY, catalog_card_id=ID)],
                [dict(id=ENTRY, catalog_card_id=ID, role="main", quantity=1)],
                [fact],
            ]
        )
        async with category_transaction(ScriptedPool(sql)) as tx:
            assert await ensure_entry_category_initialization(tx, ID) == [ENTRY]
        parameters = next(p for _, q, p in sql.calls if "INSERT INTO deck_category_bundles" in q)
        definitions: list[Document] = json.loads(cast(str, parameters[1]))
        assert definitions[0]["definitionVersionId"] == ORIGIN
        assert len(definitions) == 9
        lands = next(d for d in definitions if d["origin"] == "lands")
        inserted = next(
            p for _, q, p in sql.calls if "INSERT INTO deck_entry_category_decisions" in q
        )
        assert inserted[2] == lands["id"] and inserted[3] == "Automatic"
        assert any("INSERT INTO deck_whole_category_jobs" in q for _, q, _ in sql.calls)
        sql = ScriptedConnection([[dict(definitions=definitions)], []])
        async with category_transaction(ScriptedPool(sql)) as tx:
            assert await ensure_entry_category_initialization(tx, ID) == []
        assert not any("UPDATE deck_category_bundles" in q for _, q, _ in sql.calls)

    asyncio.run(scenario())


@pytest.mark.parametrize("mode", ["Review", "Reset"])
def test_entry_preview_real_plan_preserves_manual_only_during_review(mode: str) -> None:
    from spellbook_core.categories.previews import build_entry_plan
    from spellbook_core.categories.rules import STARTER_DEFINITIONS

    async def scenario() -> None:
        local = {**STARTER_DEFINITIONS[0], "originId": STARTER_DEFINITIONS[0]["id"], "id": ORIGIN}
        before: Document = dict(
            entry_id=ENTRY,
            category_id=None,
            state="Manual",
            revision="8",
            evidence=None,
            definition_snapshot=None,
            previous_evaluation=None,
        )
        fact: Document = dict(
            printing_id=ID,
            raw_oracle_id=ID,
            types=["Land"],
            keywords=[],
            transform_version=3,
            schema_version=3,
            catalog_generation_id=ID,
            oracle_publication_id=None,
            source_time=None,
            payload_digest=None,
            parser_version=None,
            roots={},
        )
        sql = ScriptedConnection(
            [
                [dict(composition_revision="3")],
                [dict(definitions=[local])],
                [dict(decision_revision="4", suppressed_origins=[])],
                [dict(id=ENTRY, catalog_card_id=ID)],
                [before],
                [dict(revision="0")],
                [],
                [dict(id=ENTRY, catalog_card_id=ID, role="main", quantity=1)],
                [fact],
            ]
        )
        async with category_transaction(ScriptedPool(sql)) as tx:
            plan = await build_entry_plan(
                tx, ACTOR.account_id, dict(deckId=ID, mode=mode, restoreOriginIds=[])
            )
        if mode == "Review":
            assert plan["decisions"] == []
            assert any(d["kind"] == "EntryPreserved" for d in plan["differences"])
        else:
            decision = plan["decisions"][0]
            assert decision["categoryId"] == ORIGIN and decision["state"] == "Automatic"
            assert decision["revision"] == "9"
            assert decision["previousEvaluation"] is None

    asyncio.run(scenario())


@pytest.mark.parametrize("scope", ["entry", "deck"])
def test_ready_preview_commit_applies_changes_receipt_and_notification_atomically(
    scope: str,
) -> None:
    async def scenario() -> None:
        sources: Document = dict(
            catalogGenerationId=None, oraclePublicationId=None, policy=mutation_fingerprint([])
        )
        version: Document = dict(
            id=ORIGIN,
            originId=ORIGIN,
            name="Whole",
            displayOrder=0,
            scope="deck",
            rule=dict(op="minimumCopies", predicate=dict(op="type", value="Land"), minimum=1),
            version=1,
            meaning="Purpose",
            priority=0,
            roles=["main"],
            createdAt="2026-10-23T00:00:00.000Z",
        )
        whole: Document = dict(
            versionId=ORIGIN,
            originId=ORIGIN,
            definition=version,
            name="Whole",
            displayOrder=0,
            suppressed=False,
            automaticActive=True,
            decision=None,
        )
        plan: Document = dict(
            blocked=False,
            changed=True,
            compositionRevision="1",
            libraryRevision="2",
            decisionRevision="3",
            definitions=[],
            sources=sources,
            suppressed=[],
            wholeCategories=[whole],
            decisions=[
                dict(
                    entryId=ENTRY,
                    categoryId=None,
                    state="Pending",
                    revision="1",
                    evidence=None,
                    definitionSnapshot=None,
                )
            ],
        )
        source_row: Document = dict(
            printing_id=None, catalog_generation_id=None, oracle_publication_id=None
        )
        sql = ScriptedConnection(
            [
                [],
                [dict(deck_id=ID, acknowledgement=None)],
                [dict(composition_revision="1")],
                [
                    dict(
                        plan=plan,
                        scope=scope,
                        expires_at=datetime.now(UTC) + timedelta(minutes=15),
                    )
                ],
                [dict(expired=False)],
                [dict(revision="2")],
                [dict(decision_revision="3")],
                [source_row],
            ]
        )
        ack = await create_categories(ScriptedPool(sql), auth()).commit_category_change(
            ACTOR, dict(requestId=ID, previewId=ID)
        )
        assert ack["decisionRevision"] == "4"
        if scope == "deck":
            assert ack.get("versionIds") == [ORIGIN] and ack.get("changed") is True
        else:
            assert ack.get("entryIds") == [ENTRY]
        statements = [q for _, q, _ in sql.calls]
        catalog_lock = next(
            i for i, q in enumerate(statements) if "catalog_state WHERE id=1 FOR SHARE" in q
        )
        oracle_lock = next(
            i for i, q in enumerate(statements) if "oracle_tag_state WHERE id=1 FOR SHARE" in q
        )
        receipt_index = next(
            i for i, q in enumerate(statements) if "INSERT INTO category_mutation_requests" in q
        )
        assert catalog_lock < oracle_lock < receipt_index
        assert any("pg_notify" in q for q in statements)
        assert sql.calls[-1][0] == "commit"
        assert not sql.answers

    asyncio.run(scenario())


def test_combo_sql_adapter_uses_role_scoped_possible_upper_bounds() -> None:
    from pathlib import Path

    from spellbook_core.categories.combo import read_combo_facts

    async def scenario() -> None:
        variant: Document = json.loads(
            (Path(__file__).parent / "fixtures/category-combo-oak.json").read_text()
        )
        entries = [
            dict(
                entryId=str(i),
                printingId=str(i),
                role="main",
                quantity=1,
                oracleId=ingredient["oracleId"],
            )
            for i, ingredient in enumerate(variant["ingredients"])
        ]
        definition: Document = dict(
            id=ID,
            roles=["main"],
            rule=dict(op="comboParticipant", outcomeId="2244", policyVersion="ingredients-v1"),
        )
        source: Document = dict(availability="Available", publicationId=ORIGIN, parserVersion=1)
        sql = ScriptedConnection([[dict(present=1)], [dict(id=variant["id"], document=variant)]])
        async with category_transaction(ScriptedPool(sql)) as tx:
            facts = await read_combo_facts(tx, entries, [definition], source)
        assert facts.for_definition(definition)[0]["truth"] == "True"
        query, params = next((q, p) for _, q, p in sql.calls if "WITH available" in q)
        assert "FILTER (WHERE i.must_be_commander)" in query
        assert params[-2:] == ("0", "0")
        assert all(v["commander"] == "0" for v in json.loads(cast(str, params[0])))

    asyncio.run(scenario())
