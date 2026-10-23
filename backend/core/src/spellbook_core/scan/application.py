"""Scan orchestration over caller-owned PostgreSQL, storage and worker ports."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from psycopg.rows import class_row
from psycopg.types.json import Jsonb

from ..auth import SessionAuth
from ..catalog import Catalog
from ..db import ConnectionPool, Transaction, database_integer, transaction
from ..errors import ActorError, ValidationError
from ..inventory import Inventory
from ..models import Actor
from ..validation import MISSING, assert_uuid, js_utf8
from .commit import authorize_scan, commit_review
from .read import (
    ARTIFACT_COLUMNS,
    REVIEW_COLUMNS,
    SESSION_COLUMNS,
    ArtifactRow,
    ReviewRow,
    SessionRow,
    artifact_dto,
    assert_open,
    assert_reviewable,
    owned_artifact,
    owned_session,
    result_dto,
    review_dto,
    session_dto,
)
from .types import (
    ArtifactResult,
    ScanCandidate,
    ScanCommitAcknowledgement,
    ScanImage,
    ScanSession,
    ScanSessionResult,
    ScanStorage,
    ScanWorker,
    WorkerInput,
    WorkerResult,
)
from .validation import (
    ScanError,
    check_image,
    confidence,
    printing_candidate,
    record,
    status,
    text,
    worker_result,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def guarded(
    message: str = "Scan temporarily unavailable. Try again.",
) -> AsyncIterator[None]:
    try:
        yield
    except ScanError, ActorError, ValidationError:
        raise
    except Exception:
        raise ScanError("ScanUnavailable", message, 503) from None


class Scan:
    def __init__(
        self,
        pool: ConnectionPool,
        catalog: Catalog,
        auth: SessionAuth,
        inventory: Inventory,
        storage: ScanStorage,
        worker: ScanWorker,
    ):
        self._pool = pool
        self._catalog = catalog
        self._auth = auth
        self._inventory = inventory
        self._storage = storage
        self._worker = worker

    async def create_session(self, actor: Actor) -> ScanSession:
        async with guarded(), transaction(self._pool) as tx:
            user = await authorize_scan(tx, actor, self._auth)
            async with tx.cursor(row_factory=class_row(SessionRow)) as cursor:
                await cursor.execute(
                    "INSERT INTO scan_sessions(id,account_id,game,status) "
                    "VALUES (%s,%s,'mtg','open') "
                    f"RETURNING {SESSION_COLUMNS}",
                    (uuid4(), user.account_id),
                )
                row = await cursor.fetchone()
            if row is None:
                raise RuntimeError("Scan session unavailable")
            return session_dto(row)

    async def list_sessions(self, actor: Actor) -> list[ScanSession]:
        user = await self._auth.require_actor(actor)
        try:
            async with (
                transaction(self._pool, read_only=True) as tx,
                tx.cursor(row_factory=class_row(SessionRow)) as cursor,
            ):
                await cursor.execute(
                    f"SELECT {SESSION_COLUMNS} FROM scan_sessions WHERE account_id=%s "
                    "ORDER BY updated_at DESC,id DESC LIMIT 100",
                    (user.account_id,),
                )
                result = [session_dto(row) for row in await cursor.fetchall()]
            await self._auth.require_actor(actor)
            return result
        except ActorError:
            raise
        except Exception:
            raise ScanError("ScanUnavailable", "Unable to load scans. Try again.", 503) from None

    async def assert_uploadable(self, actor: Actor, session_id: str) -> None:
        async with guarded():
            user = await self._auth.require_actor(actor)
            identifier = assert_uuid(session_id, "sessionId")
            async with transaction(self._pool, read_only=True) as tx:
                assert_open((await owned_session(tx, user.account_id, identifier)).status)

    async def read_session(self, actor: Actor, input: object) -> ScanSessionResult:
        value = record(input)
        session_id = assert_uuid(value.get("sessionId", MISSING), "sessionId")
        limit_value = value.get("limit", 50)
        if (
            isinstance(limit_value, bool)
            or not isinstance(limit_value, int | float)
            or not 1 <= limit_value <= 100
            or int(limit_value) != limit_value
        ):
            raise ValidationError("Scan page limit must be from 1 to 100")
        limit = int(limit_value)
        artifact_cursor = (
            assert_uuid(value["artifactCursor"], "artifactCursor")
            if "artifactCursor" in value
            else None
        )
        review_cursor = (
            assert_uuid(value["reviewCursor"], "reviewCursor") if "reviewCursor" in value else None
        )
        user = await self._auth.require_actor(actor)
        try:
            async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
                session = await owned_session(tx, user.account_id, session_id)
                scope = (user.account_id, session_id)
                async with tx.cursor(row_factory=class_row(ArtifactRow)) as cursor:
                    await cursor.execute(
                        f"SELECT {ARTIFACT_COLUMNS} FROM scan_artifacts "
                        "WHERE account_id=%s AND session_id=%s"
                        + (" AND id>%s" if artifact_cursor else "")
                        + " ORDER BY id LIMIT %s",
                        (*scope, *((artifact_cursor,) if artifact_cursor else ()), limit + 1),
                    )
                    artifacts = await cursor.fetchall()
                    await cursor.execute(
                        f"SELECT {ARTIFACT_COLUMNS} FROM scan_artifacts "
                        "WHERE account_id=%s AND session_id=%s "
                        "ORDER BY updated_at DESC,id DESC LIMIT 1",
                        scope,
                    )
                    latest = await cursor.fetchone()
                async with tx.cursor(row_factory=class_row(ReviewRow)) as reviews_cursor:
                    await reviews_cursor.execute(
                        f"SELECT {REVIEW_COLUMNS} FROM scan_review_items "
                        "WHERE account_id=%s AND session_id=%s"
                        + (" AND id>%s" if review_cursor else "")
                        + " ORDER BY id LIMIT %s",
                        (*scope, *((review_cursor,) if review_cursor else ()), limit + 1),
                    )
                    reviews = await reviews_cursor.fetchall()
                counts = await (
                    await tx.execute(
                        "SELECT (SELECT count(*) FROM scan_artifacts "
                        "WHERE account_id=%s AND session_id=%s),"
                        "(SELECT count(*) FROM scan_review_items "
                        "WHERE account_id=%s AND session_id=%s)",
                        (*scope, *scope),
                    )
                ).fetchone()
                if counts is None:
                    raise RuntimeError("Scan counts unavailable")
                result: ScanSessionResult = {
                    "session": session_dto(session),
                    "artifacts": [artifact_dto(row) for row in artifacts[:limit]],
                    "reviewItems": [review_dto(row) for row in reviews[:limit]],
                    "artifactCount": database_integer(counts[0]),
                    "reviewCount": database_integer(counts[1]),
                    "nextArtifactCursor": artifacts[limit - 1].id
                    if len(artifacts) > limit
                    else None,
                    "nextReviewCursor": reviews[limit - 1].id if len(reviews) > limit else None,
                    "lastResult": result_dto(latest) if latest else None,
                }
            await self._auth.require_actor(actor)
            return result
        except ScanError, ActorError:
            raise
        except Exception:
            raise ScanError("ScanUnavailable", "Unable to load scans. Try again.", 503) from None

    async def submit_result(self, actor: Actor, input: object) -> ArtifactResult:
        async with guarded():
            value = record(input)
            session_id = assert_uuid(value.get("sessionId", MISSING), "sessionId")
            artifact_id = assert_uuid(value.get("artifactId", MISSING), "artifactId")
            user = await self._auth.require_actor(actor)
            async with transaction(self._pool, read_only=True) as tx:
                await owned_artifact(tx, user.account_id, artifact_id, session_id)
                assert_reviewable((await owned_session(tx, user.account_id, session_id)).status)
            model = text(value.get("modelVersion", MISSING), "modelVersion", 128)
            values = value.get("candidates")
            if not isinstance(values, list) or len(values) > 20:
                raise ValidationError("Supply at most 20 Scan candidates")
            result_status = status(value.get("status"), len(values))
            seen: set[str] = set()
            candidates: list[ScanCandidate] = []
            for item in values:
                c = record(item)
                identifier = assert_uuid(c.get("catalogCardId", MISSING), "catalogCardId")
                if identifier in seen:
                    raise ValidationError("Duplicate candidate printing")
                seen.add(identifier)
                certainty = confidence(
                    c.get("confidence"), "confidence must be a finite number between 0 and 1"
                )
                notes = text(c.get("notes", MISSING), "notes", 500, True)
                candidate = await printing_candidate(self._catalog, identifier)
                points = int(certainty * 100 + 0.5)
                candidate.update(
                    {
                        "similarityScore": points,
                        "finalScore": points,
                        "confidence": certainty,
                        "matchReason": notes or "external_scanner",
                    }
                )
                candidates.append(candidate)
            async with transaction(self._pool) as tx:
                user = await authorize_scan(tx, actor, self._auth)
                assert_reviewable(
                    (await owned_session(tx, user.account_id, session_id, lock=True)).status
                )
                async with tx.cursor(row_factory=class_row(ArtifactRow)) as cursor:
                    await cursor.execute(
                        "UPDATE scan_artifacts SET status=%s,embedding_model_version=%s,"
                        "candidate_json=%s,updated_at=%s "
                        "WHERE id=%s AND session_id=%s AND account_id=%s "
                        f"RETURNING {ARTIFACT_COLUMNS}",
                        (
                            result_status,
                            js_utf8(model).decode("utf-8"),
                            Jsonb(candidates),
                            datetime.now(UTC),
                            artifact_id,
                            session_id,
                            user.account_id,
                        ),
                    )
                    row = await cursor.fetchone()
                if row is None:
                    raise ScanError("ScanNotFound", "Scan artifact not found", 404)
                await self._pending(tx, session_id)
                return {"artifact": artifact_dto(row), "result": result_dto(row)}

    async def commit_review(self, actor: Actor, input: object) -> ScanCommitAcknowledgement:
        async with guarded("Unable to save scan review. Try again."):
            return await commit_review(self._pool, self._auth, self._inventory, actor, input)

    @staticmethod
    async def _pending(tx: Transaction, session_id: str) -> None:
        await tx.execute(
            "UPDATE scan_sessions SET status='pending_review',updated_at=%s WHERE id=%s",
            (datetime.now(UTC), session_id),
        )

    async def _attachment_exists(self, account_id: str, session_id: str, artifact_id: str) -> bool:
        # This transaction starts only after the failed attachment connection was closed.
        # The ordered locks wait for any dispatched COMMIT before absence is used.
        async with transaction(self._pool) as tx:
            await tx.execute(
                "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                (account_id,),
            )
            await owned_session(tx, account_id, session_id, lock=True)
            return (
                await (
                    await tx.execute(
                        "SELECT id FROM scan_artifacts "
                        "WHERE id=%s AND account_id=%s AND session_id=%s",
                        (artifact_id, account_id, session_id),
                    )
                ).fetchone()
                is not None
            )

    async def _cleanup(
        self, key: str, account_id: str, session_id: str, artifact_id: str, uncertain: bool
    ) -> None:
        if uncertain:
            try:
                if await self._attachment_exists(account_id, session_id, artifact_id):
                    return
            except Exception:
                logger.error(
                    "Unable to establish rejected Scan attachment outcome; object retained"
                )
                return
        try:
            await self._storage.delete(key)
        except Exception:
            logger.error("Failed to clean up a rejected Scan upload")

    async def upload_frame(
        self, actor: Actor, *, session_id: str, body: bytes, content_type: str, file_name: str
    ) -> ArtifactResult:
        session_id = assert_uuid(session_id, "sessionId")
        await self.assert_uploadable(actor, session_id)
        actual = check_image(body, content_type, file_name)
        artifact_id = str(uuid4())
        extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[actual]
        key = f"scan-sessions/{session_id}/{artifact_id}.{extension}"
        user = await self._auth.require_actor(actor)
        uncertain = attached = False
        try:
            await self._storage.write(key, body, actual)
            input: WorkerInput = {
                "sessionId": session_id,
                "artifactId": artifact_id,
                "originalObjectKey": key,
                "contentType": actual,
                "fileName": file_name,
            }
            result = await worker_result(await self._worker.process(input), input, self._catalog)
            # Keep the lease until a possible COMMIT failure has discarded the connection.
            async with self._pool.connection(timeout=2.0) as tx:
                try:
                    async with asyncio.timeout(15), tx.transaction():
                        await tx.execute("SET LOCAL lock_timeout = '5s'")
                        await tx.execute("SET LOCAL statement_timeout = '10s'")
                        await tx.execute("SET LOCAL transaction_timeout = '15s'")
                        current = await authorize_scan(tx, actor, self._auth)
                        session = await owned_session(
                            tx, current.account_id, session_id, lock=True
                        )
                        assert_open(session.status)
                        row = await self._insert_artifact(tx, current.account_id, input, result)
                        await self._pending(tx, session_id)
                        # Cancellation/errors from here may have lost the COMMIT response.
                        uncertain = True
                    attached = True
                except BaseException:
                    if uncertain:
                        await tx.close()
                    raise
            return {"artifact": artifact_dto(row), "result": result_dto(row)}
        except BaseException as cause:
            if not attached and not isinstance(cause, FileExistsError):
                cleanup = asyncio.create_task(
                    self._cleanup(key, user.account_id, session_id, artifact_id, uncertain)
                )
                # Settle cleanup even when the request was cancelled. Both DB and adapter
                # operations have ordinary finite timeouts; no process retention protocol.
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        continue
                await cleanup
            if isinstance(cause, ScanError | ActorError | asyncio.CancelledError):
                raise
            if not isinstance(cause, Exception):
                raise
            raise ScanError(
                "ScanProcessingFailed", "Scan processing failed. Retry the upload.", 502
            ) from None

    @staticmethod
    async def _insert_artifact(
        tx: Transaction, account_id: str, input: WorkerInput, result: WorkerResult
    ) -> ArtifactRow:
        tokens = result["ocrTokens"]
        async with tx.cursor(row_factory=class_row(ArtifactRow)) as cursor:
            await cursor.execute(
                "INSERT INTO scan_artifacts(id,session_id,account_id,original_object_key,"
                "normalized_object_key,status,quality_score,embedding_model_version,ocr_model_version,"
                "ocr_name,ocr_set_code,ocr_collector_number,candidate_json) "
                f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {ARTIFACT_COLUMNS}",
                (
                    input["artifactId"],
                    input["sessionId"],
                    account_id,
                    input["originalObjectKey"],
                    input["originalObjectKey"],
                    result["status"],
                    result["qualityScore"],
                    js_utf8(result["embeddingModelVersion"]).decode("utf-8"),
                    js_utf8(result["ocrModelVersion"]).decode("utf-8"),
                    js_utf8(tokens["name"]).decode("utf-8") if "name" in tokens else None,
                    js_utf8(tokens["setCode"]).decode("utf-8") if "setCode" in tokens else None,
                    js_utf8(tokens["collectorNumber"]).decode("utf-8")
                    if "collectorNumber" in tokens
                    else None,
                    Jsonb(result["candidates"]),
                ),
            )
            row = await cursor.fetchone()
        if row is None:
            raise RuntimeError("Scan artifact unavailable")
        return row

    async def read_image(self, actor: Actor, artifact_id: str) -> ScanImage:
        user = await self._auth.require_actor(actor)
        identifier = assert_uuid(artifact_id, "artifactId")
        async with guarded("Unable to load scan image. Try again."):
            async with transaction(self._pool, read_only=True) as tx:
                artifact = await owned_artifact(tx, user.account_id, identifier)
            image = await self._storage.read(artifact.original_object_key)
            await self._auth.require_actor(actor)
            return image


def create_scan(
    pool: ConnectionPool,
    catalog: Catalog,
    auth: SessionAuth,
    inventory: Inventory,
    storage: ScanStorage,
    worker: ScanWorker,
) -> Scan:
    """No IO or resource acquisition; the runtime closes both external adapters."""
    return Scan(pool, catalog, auth, inventory, storage, worker)
