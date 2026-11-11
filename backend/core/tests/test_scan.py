"""Scan validation, replay and orchestration using actual Core module logic.

Transaction doubles isolate failure ordering; native tests are separately opted in.
"""

import asyncio
import copy
import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, create_autospec, patch

import pytest

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryAcknowledgement,
    PreparedInventoryMutation,
)
from spellbook_core.mtg.models import CardDocument
from spellbook_core.mtg.scan import (
    Scan,
    ScanError,
    ScanWorker,
    create_scan,
)
from spellbook_core.mtg.scan.commit import normalize_commit, probe
from spellbook_core.mtg.scan.read import ArtifactRow, SessionRow, artifact_dto
from spellbook_core.mtg.scan.types import WorkerInput
from spellbook_core.mtg.scan.validation import MAX_IMAGE_BYTES, check_image, worker_result

ROOT = Path(__file__).resolve().parents[3]
CARD: CardDocument = json.loads((ROOT / "backend/scripts/demo/cards.json").read_text())[0]
SESSION = "11111111-1111-4111-8111-111111111111"
ARTIFACT = "22222222-2222-4222-8222-222222222222"
ACTOR = Actor("scan-unit", "unit", "", "", "")
PNG = b"\x89PNG\r\n\x1a\nfixture"
NOW = datetime(2026, 10, 23, tzinfo=UTC)
INPUT: WorkerInput = {
    "sessionId": SESSION,
    "artifactId": ARTIFACT,
    "imageSha256": sha256(PNG).hexdigest(),
    "contentType": "image/png",
    "fileName": "card.png",
}
RAW: dict[str, object] = {
    "status": "no_match",
    "imageSha256": INPUT["imageSha256"],
    "qualityScore": 0,
    "embeddingModelVersion": "stub-v1",
    "ocrModelVersion": "stub-v1",
    "ocrTokens": {},
    "candidates": [],
}
ACK: InventoryAcknowledgement = {
    "requestId": "scan-request",
    "inventoryId": None,
    "revision": "11",
    "changes": [],
    "removedEntryIds": [],
    "groups": [],
    "removedGroupIds": [],
    "memberships": [],
}


def intent(**fields: object) -> dict[str, Any]:
    return {
        "requestId": "scan-request",
        "sessionId": SESSION,
        "items": [
            {
                "scanArtifactId": ARTIFACT,
                "catalogCardId": CARD["id"],
                "finish": "nonfoil",
                "condition": "NM",
                "quantity": 2,
            }
        ],
        **fields,
    }


def artifact() -> ArtifactRow:
    return ArtifactRow(
        ARTIFACT,
        SESSION,
        ACTOR.account_id,
        0,
        "stub-v1",
        "stub-v1",
        "no_match",
        None,
        "",
        None,
        [],
        NOW,
        NOW,
    )


@pytest.fixture
def fixture() -> Iterator[tuple[Scan, Any, Any, Any, Any, Any, Any]]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.require_actor.return_value = ACTOR
    auth.require_actor_for_write.return_value = ACTOR
    catalog = create_autospec(Catalog, instance=True)
    catalog.get_catalog_printing.return_value = CARD
    inventory = create_autospec(Inventory, instance=True)
    inventory.replay.return_value = None
    inventory.apply.return_value = ACK
    storage = AsyncMock()  # retained in fixture shape for older non-storage assertions
    worker = create_autospec(ScanWorker, instance=True)
    worker.process.side_effect = lambda input, image: {
        **RAW,
        "imageSha256": sha256(image).hexdigest(),
    }
    tx = AsyncMock()
    tx.cursor = MagicMock()
    tx.cursor.return_value.__aenter__.return_value = AsyncMock()
    pool = create_autospec(ConnectionPool, instance=True)
    pool.connection.return_value.__aenter__.return_value = tx
    tx.transaction = MagicMock()
    scan = create_scan(pool, catalog, auth, inventory, worker)

    @asynccontextmanager
    async def unit_transaction(*args: object, **kwargs: object) -> AsyncIterator[Transaction]:
        yield cast(Transaction, tx)

    with (
        patch("spellbook_core.mtg.scan.application.transaction", unit_transaction),
        patch("spellbook_core.mtg.scan.commit.transaction", unit_transaction),
    ):
        yield scan, auth, catalog, inventory, storage, worker, tx


@pytest.mark.parametrize(
    ("body", "mime", "name", "status"),
    [
        (b"", "image/png", "x", 400),
        (b"x" * (MAX_IMAGE_BYTES + 1), "image/png", "x", 413),
        (b"not an image", "image/png", "x", 415),
        (PNG, "image/jpeg", "x", 415),
    ],
)
def test_image_failures(body: bytes, mime: str, name: str, status: int) -> None:
    with pytest.raises(ScanError) as error:
        check_image(body, mime, name)
    assert error.value.status == status


@pytest.mark.parametrize(
    "body,mime",
    [(PNG, "image/png"), (b"\xff\xd8\xffx", "image/jpeg"), (b"RIFF1234WEBP", "image/webp")],
)
def test_image_formats(body: bytes, mime: str) -> None:
    assert check_image(body, mime, "photo") == mime
    with pytest.raises(ValidationError):
        check_image(body, mime, "🔮" * 128)


def test_public_artifact_omits_keys_account_and_absent_tokens() -> None:
    dto = artifact_dto(artifact())
    assert dto["ocrTokens"] == {"setCode": ""}
    assert dto["createdAt"] == "2026-10-23T00:00:00.000Z"
    assert set(dto) == {
        "id",
        "sessionId",
        "artifactId",
        "status",
        "qualityScore",
        "embeddingModelVersion",
        "ocrModelVersion",
        "ocrTokens",
        "candidates",
        "createdAt",
        "updatedAt",
    }


@pytest.mark.parametrize(
    "fields",
    [
        {"imageSha256": "foreign"},
        {"qualityScore": True},
        {"qualityScore": -1},
        {"qualityScore": 0.5},
        {"qualityScore": 2147483648},
        {"ocrModelVersion": ""},
        {"embeddingModelVersion": "🔮" * 65},
        {"ocrTokens": {"accountId": "foreign"}},
        {"ocrTokens": {"name": "x" * 5001}},
        {"status": "matched"},
        {"status": "ambiguous"},
        {"status": "unknown"},
        {"candidates": [{}] * 21},
    ],
)
def test_worker_rejects_malformed_evidence(fields: dict[str, object]) -> None:
    async def scenario() -> None:
        catalog = create_autospec(Catalog, instance=True)
        with pytest.raises(ValidationError):
            await worker_result({**RAW, **fields}, INPUT, catalog)

    asyncio.run(scenario())


def test_worker_resolves_authoritative_identity_and_rejects_duplicates() -> None:
    async def scenario() -> None:
        catalog = create_autospec(Catalog, instance=True)
        catalog.get_catalog_printing.return_value = CARD
        candidate = {
            "catalogCardId": CARD["id"],
            "canonicalCardId": CARD["oracle_id"],
            "oracleId": CARD["oracle_id"],
            "name": "forged",
            "similarityScore": 1,
            "ocrScore": 2,
            "finalScore": 3,
        }
        result = await worker_result(
            {**RAW, "status": "matched", "candidates": [candidate]}, INPUT, catalog
        )
        assert result["candidates"][0]["name"] == CARD["name"]
        for candidates in ([candidate, candidate], [{**candidate, "oracleId": ARTIFACT}]):
            with pytest.raises(ValidationError):
                await worker_result(
                    {**RAW, "status": "matched", "candidates": candidates}, INPUT, catalog
                )

    asyncio.run(scenario())


def test_v3_hash_ignores_display_review_id_and_honors_order_quantity() -> None:
    original = intent()
    expected = "scan-intent-v3:" + mutation_fingerprint(
        {
            "version": "scan-intent-v3",
            "kind": "scan_review",
            "sessionId": SESSION,
            "items": original["items"],
        }
    )
    assert normalize_commit(original).hash == expected
    changed = copy.deepcopy(original)
    changed["items"][0].update(id=ARTIFACT, name="forged", finalScore=99)
    assert normalize_commit(changed).hash == expected
    changed["items"][0]["quantity"] = 3
    assert normalize_commit(changed).hash != expected
    with pytest.raises(ValidationError, match="Duplicate"):
        normalize_commit(
            intent(items=[original["items"][0], {**original["items"][0], "quantity": 3}])
        )


@pytest.mark.parametrize(
    "acknowledgement",
    [
        None,
        {},
        [],
        False,
        {**ACK, "requestId": "another"},
        {**ACK, "changes": [{}]},
        {**ACK, "revision": "not-a-revision"},
    ],
)
def test_receipt_replays_original_and_rejects_incomplete_rows(acknowledgement: object) -> None:
    async def scenario() -> None:
        normalized = normalize_commit(intent())
        tx = AsyncMock()
        tx.execute.return_value.fetchone.return_value = ("scan_review", normalized.hash, ACK)
        result = await probe(cast(Transaction, tx), ACTOR.account_id, normalized)
        assert result == {"kind": "Committed", "sessionId": SESSION, "acknowledgement": ACK}
        assert result is not None and result["acknowledgement"] is ACK
        for row in (("scan_review", None, ACK), ("scan_review", normalized.hash, acknowledgement)):
            tx.execute.return_value.fetchone.return_value = row
            with pytest.raises(RequestConflictError):
                await probe(cast(Transaction, tx), ACTOR.account_id, normalized)

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "source,hash_value",
    [("web", "same"), ("scan_review", "scan-intent-v3:other")],
)
def test_receipt_conflicts(source: str, hash_value: str) -> None:
    async def scenario() -> None:
        normalized = normalize_commit(intent())
        tx = AsyncMock()
        tx.execute.return_value.fetchone.return_value = (
            source,
            normalized.hash if hash_value == "same" else hash_value,
            ACK,
        )
        with pytest.raises(RequestConflictError):
            await probe(cast(Transaction, tx), ACTOR.account_id, normalized)

    asyncio.run(scenario())


def test_commit_composes_writer_and_keeps_original_replay_without_catalog(
    fixture: tuple[Any, ...],
) -> None:
    async def scenario() -> None:
        scan, auth, catalog, inventory, _storage, _worker, tx = fixture
        input = intent()
        prepared = PreparedInventoryMutation(
            ACTOR,
            ACTOR.account_id,
            cast(Any, None),
            normalize_commit(input).hash,
            {CARD["id"]: CARD},
        )
        inventory.prepare.return_value = prepared
        events: list[str] = []

        async def save(*args: object) -> None:
            events.append("review")

        async def apply(*args: object) -> InventoryAcknowledgement:
            events.append("inventory")
            return ACK

        inventory.apply.side_effect = apply

        async def receipt(*args: object) -> None:
            events.append("receipt")

        inventory.record_receipt.side_effect = receipt
        with (
            patch("spellbook_core.mtg.scan.commit.probe", AsyncMock(return_value=None)),
            patch(
                "spellbook_core.mtg.scan.commit.owned_session",
                AsyncMock(
                    return_value=SessionRow(
                        SESSION, ACTOR.account_id, "mtg", "pending_review", NOW, NOW
                    )
                ),
            ),
            patch("spellbook_core.mtg.scan.commit.save_review", save),
        ):
            result = await scan.commit_review(ACTOR, input)
        assert result == {"kind": "Committed", "sessionId": SESSION, "acknowledgement": ACK}
        assert events == ["review", "inventory", "receipt"]
        inventory.authorize.assert_awaited_once_with(tx, prepared)
        inventory.replay.assert_awaited_once_with(tx, prepared)
        inventory.record_receipt.assert_awaited_once_with(tx, prepared, ACK)
        inventory.prepare.reset_mock()
        tx.execute.return_value.fetchone.return_value = (
            "scan_review",
            normalize_commit(input).hash,
            ACK,
        )
        assert await scan.commit_review(ACTOR, input) == result
        inventory.prepare.assert_not_awaited()
        catalog.get_catalog_printing.assert_not_awaited()
        auth.require_actor_for_write.assert_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize("state,error", [("committed", ScanError), ("cancelled", ScanError)])
def test_closed_review_does_not_apply_inventory(
    fixture: tuple[Any, ...], state: str, error: type[Exception]
) -> None:
    async def scenario() -> None:
        scan, _auth, _catalog, inventory, _storage, _worker, _tx = fixture
        inventory.prepare.return_value = PreparedInventoryMutation(
            ACTOR, ACTOR.account_id, cast(Any, None), "hash", {}
        )
        with (
            patch("spellbook_core.mtg.scan.commit.probe", AsyncMock(return_value=None)),
            patch(
                "spellbook_core.mtg.scan.commit.owned_session",
                AsyncMock(
                    return_value=SessionRow(SESSION, ACTOR.account_id, "mtg", state, NOW, NOW)
                ),
            ),
            pytest.raises(error),
        ):
            await scan.commit_review(ACTOR, intent())
        inventory.apply.assert_not_awaited()
        inventory.record_receipt.assert_not_awaited()

    asyncio.run(scenario())


def test_upload_lost_commit_response_discards_without_image_cleanup(
    fixture: tuple[Any, ...],
) -> None:
    async def scenario() -> None:
        scan, _auth, _catalog, _inventory, _storage, _worker, tx = fixture
        tx.transaction.return_value.__aexit__.side_effect = OSError("lost COMMIT response")
        with (
            patch.object(scan, "assert_uploadable", AsyncMock()),
            patch(
                "spellbook_core.mtg.scan.application.owned_session",
                AsyncMock(
                    return_value=SessionRow(SESSION, ACTOR.account_id, "mtg", "open", NOW, NOW)
                ),
            ),
            patch.object(scan, "_insert_artifact", AsyncMock(return_value=artifact())),
            pytest.raises(ScanError, match="processing failed"),
        ):
            await scan.upload_frame(
                ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="card.png"
            )
        tx.close.assert_awaited_once()

    asyncio.run(scenario())


def test_worker_failure_does_not_record_image_or_metadata(fixture: tuple[Any, ...]) -> None:
    async def scenario() -> None:
        scan, _auth, _catalog, _inventory, _storage, worker, tx = fixture
        worker.process.side_effect = OSError("worker unavailable")
        with patch.object(scan, "assert_uploadable", AsyncMock()), pytest.raises(ScanError):
            await scan.upload_frame(
                ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="card.png"
            )
        worker.process.assert_awaited_once()
        assert worker.process.await_args.args[1] == PNG
        tx.execute.assert_not_awaited()

    asyncio.run(scenario())


def test_upload_cancellation_before_recording(fixture: tuple[Any, ...]) -> None:
    async def scenario() -> None:
        scan, _auth, _catalog, _inventory, _storage, worker, tx = fixture
        worker.process.side_effect = asyncio.CancelledError()
        with (
            patch.object(scan, "assert_uploadable", AsyncMock()),
            pytest.raises(asyncio.CancelledError),
        ):
            await scan.upload_frame(
                ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="card.png"
            )
        tx.execute.assert_not_awaited()

    asyncio.run(scenario())


def test_upload_finishes_transient_worker_before_recording_metadata(
    fixture: tuple[Any, ...],
) -> None:
    async def scenario() -> None:
        scan, _auth, _catalog, _inventory, _storage, worker, _tx = fixture
        events: list[str] = []

        async def process(input: WorkerInput, image: bytes) -> object:
            events.append("worker")
            assert image == PNG
            return {**RAW, "imageSha256": input["imageSha256"]}

        async def insert(
            tx: Transaction, account: str, input: WorkerInput, result: object
        ) -> ArtifactRow:
            events.append("record")
            return replace(artifact(), id=input["artifactId"])

        worker.process.side_effect = process
        with (
            patch.object(scan, "assert_uploadable", AsyncMock()),
            patch(
                "spellbook_core.mtg.scan.application.owned_session",
                AsyncMock(
                    return_value=SessionRow(SESSION, ACTOR.account_id, "mtg", "open", NOW, NOW)
                ),
            ),
            patch.object(scan, "_insert_artifact", insert),
        ):
            response = await scan.upload_frame(
                ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="card.png"
            )
        assert events == ["worker", "record"]
        assert response["artifact"]["id"] == worker.process.await_args.args[0]["artifactId"]

    asyncio.run(scenario())


@pytest.mark.parametrize("failure", ["revoked", "closed"])
def test_upload_revalidates_authority_and_session_after_external_work(
    fixture: tuple[Any, ...], failure: str
) -> None:
    async def scenario() -> None:
        scan, auth, _catalog, _inventory, _storage, worker, _tx = fixture
        if failure == "revoked":
            auth.require_actor_for_write.side_effect = ActorError()
        with (
            patch.object(scan, "assert_uploadable", AsyncMock()),
            patch(
                "spellbook_core.mtg.scan.application.owned_session",
                AsyncMock(
                    return_value=SessionRow(
                        SESSION, ACTOR.account_id, "mtg", "pending_review", NOW, NOW
                    )
                ),
            ),
            patch.object(scan, "_insert_artifact", AsyncMock()) as insert,
            pytest.raises((ActorError, ScanError)),
        ):
            await scan.upload_frame(
                ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="card.png"
            )
        worker.process.assert_awaited_once()
        insert.assert_not_awaited()

    asyncio.run(scenario())
