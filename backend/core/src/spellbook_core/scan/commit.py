"""Scan-specific intent/replay envelope and composition with the Inventory writer.

Inventory exclusively owns mutation SQL and receipt persistence. Scan owns historical
Scan fingerprint verification and the review/session effects in the same transaction.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from ..auth import SessionAuth
from ..db import ConnectionPool, Transaction, transaction
from ..errors import ActorError, RequestConflictError, ValidationError
from ..fingerprint import mutation_fingerprint
from ..inventory import (
    Inventory,
    InventoryAcknowledgement,
    InventoryIntent,
    PreparedInventoryMutation,
    RecordedInventoryMutation,
    normalize_add,
)
from ..models import Actor
from ..validation import (
    MISSING,
    assert_bounded_text,
    assert_condition,
    assert_finish,
    assert_request_id,
    assert_uuid,
    js_trim,
    js_utf8,
    positive_quantity,
    utf16_length,
)
from .read import assert_reviewable, owned_artifact, owned_session
from .types import ReviewIntent, ScanCommitAcknowledgement
from .validation import ScanError, candidate_array, record, score, text


async def authorize_scan(tx: Transaction, actor: Actor, auth: SessionAuth) -> Actor:
    user = await auth.require_actor(actor, tx)
    await tx.execute(
        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (user.account_id,)
    )
    current = await auth.require_actor_for_write(actor, tx)
    if current.account_id != user.account_id:
        raise ActorError()
    return current


def normalize(value: object) -> ReviewIntent:
    item = record(value)
    normalized: ReviewIntent = {
        "scanArtifactId": assert_uuid(item.get("scanArtifactId", MISSING), "scanArtifactId"),
        "catalogCardId": assert_uuid(item.get("catalogCardId", MISSING), "catalogCardId"),
        "finish": assert_finish(item.get("finish", MISSING)),
        "condition": assert_condition(item.get("condition", MISSING)),
        "quantity": positive_quantity(item.get("quantity", MISSING)),
    }
    if "id" in item:
        normalized["id"] = assert_uuid(item["id"], "id")
    return normalized


def intent_fields(item: ReviewIntent) -> dict[str, object]:
    return {key: value for key, value in item.items() if key != "id"}


def _legacy_score(value: object) -> int:
    result = score(value)
    if result > 100:
        raise ValidationError("Legacy Scan scores must be from zero to 100")
    return result


def legacy_hash(input: dict[str, object], items: list[ReviewIntent]) -> str | None:
    if "legacyVerification" not in input:
        return None
    raw = input["legacyVerification"]
    if not isinstance(raw, dict):
        raise ValidationError("Invalid legacy Scan verification evidence")
    evidence = record(raw)
    values = evidence.get("items")
    if (
        evidence.get("version") not in ("scan-v1", "scan-v2")
        or not isinstance(values, list)
        or len(values) != len(items)
    ):
        raise ValidationError("Invalid legacy Scan verification evidence")
    session_id = evidence.get("sessionId")
    if session_id is None:
        session_id = input["sessionId"]
    if assert_uuid(session_id, "legacy sessionId") != assert_uuid(input["sessionId"], "sessionId"):
        raise RequestConflictError()
    old_items = [record(value) for value in values]
    for old, item in zip(old_items, items, strict=True):
        if assert_uuid(old.get("sessionId", MISSING), "sessionId") != assert_uuid(
            input["sessionId"], "sessionId"
        ) or mutation_fingerprint(intent_fields(normalize(old))) != mutation_fingerprint(
            intent_fields(item)
        ):
            raise RequestConflictError()
    if evidence["version"] == "scan-v1":
        operations: list[dict[str, object]] = []
        for old, item in zip(old_items, items, strict=True):
            # Historical assertInventoryOperation projected only these five card fields,
            # defaulted notes to empty, and retained the trimmed original UUID spelling.
            card: dict[str, str] = {}
            for field, maximum, optional in (
                ("catalogCardId", 36, False),
                ("canonicalCardId", 36, False),
                ("name", 500, False),
                ("setCode", 100, True),
                ("imageUri", 2000, True),
            ):
                value = old.get(field, "")
                if not isinstance(value, str):
                    raise ValidationError(f"card.{field} must be a string")
                card[field] = js_trim(value)
                text(card[field], "legacy " + field, maximum, optional)
            operations.append(
                {
                    "op": "add",
                    "card": card,
                    "finish": item["finish"],
                    "condition": item["condition"],
                    "quantity": item["quantity"],
                    "notes": "",
                }
            )
        return mutation_fingerprint(
            {
                "kind": "scan_review",
                "sessionId": session_id,
                "artifacts": [old["scanArtifactId"] for old in old_items],
                "operations": operations,
            }
        )
    normalized: list[dict[str, object]] = []
    for old in old_items:
        normalized.append(
            {
                **normalize(old),
                "sessionId": assert_uuid(old["sessionId"], "sessionId"),
                "similarityScore": _legacy_score(old.get("similarityScore", MISSING)),
                "ocrScore": _legacy_score(old.get("ocrScore", MISSING)),
                "finalScore": _legacy_score(old.get("finalScore", MISSING)),
                "matchReason": assert_bounded_text(
                    old.get("matchReason", MISSING), "matchReason", 500
                ),
            }
        )
    return mutation_fingerprint(
        {
            "kind": "scan_review",
            "scan": {"sessionId": assert_uuid(session_id, "sessionId"), "items": normalized},
            "source": "scan_review",
            "operations": [
                {"op": "add", **{k: v for k, v in item.items() if k != "scanArtifactId"}}
                for item in map(intent_fields, items)
            ],
        }
    )


@dataclass(frozen=True, slots=True)
class CommitIntent:
    request_id: str
    session_id: str
    items: list[ReviewIntent]
    hash: str
    historical_hash: str | None


def normalize_commit(value: object) -> CommitIntent:
    input = record(value)
    request_id = assert_request_id(input.get("requestId", MISSING))
    if utf16_length(request_id) > 256:
        raise ValidationError("requestId exceeds 256 characters")
    session_id = assert_uuid(input.get("sessionId", MISSING), "sessionId")
    values = input.get("items")
    if not isinstance(values, list) or not 1 <= len(values) <= 100:
        raise ValidationError("Supply 1 to 100 Scan review items")
    items = [normalize(value) for value in values]
    identities: set[str] = set()
    review_ids: set[str] = set()
    for item in items:
        identity = mutation_fingerprint({**intent_fields(item), "quantity": 1})
        if identity in identities or ("id" in item and item["id"] in review_ids):
            raise ValidationError("Duplicate Scan review identity")
        identities.add(identity)
        if "id" in item:
            review_ids.add(item["id"])
    fingerprint = "scan-intent-v3:" + mutation_fingerprint(
        {
            "version": "scan-intent-v3",
            "kind": "scan_review",
            "sessionId": session_id,
            "items": [intent_fields(item) for item in items],
        }
    )
    return CommitIntent(request_id, session_id, items, fingerprint, legacy_hash(input, items))


def _no_repeat(request_id: str) -> InventoryAcknowledgement:
    return {
        "requestId": request_id,
        "inventoryId": None,
        "revision": "0",
        "changes": [],
        "removedEntryIds": [],
        "groups": [],
        "removedGroupIds": [],
        "memberships": [],
        "legacy": True,
    }


async def probe(
    tx: Transaction, account_id: str, intent: CommitIntent
) -> ScanCommitAcknowledgement | None:
    row = await (
        await tx.execute(
            "SELECT source,request_hash,acknowledgement FROM inventory_mutation_requests "
            "WHERE account_id=%s AND request_id=%s LIMIT 1",
            (account_id, js_utf8(intent.request_id).decode("utf-8")),
        )
    ).fetchone()
    if row is None:
        return None
    source, fingerprint, acknowledgement = row
    if source != "scan_review":
        raise RequestConflictError()
    if fingerprint is None:
        return {
            "kind": "LegacyNoRepeat",
            "requestId": intent.request_id,
            "binding": "UnverifiedLegacyHash",
            "acknowledgement": cast(InventoryAcknowledgement, acknowledgement)
            if acknowledgement is not None
            else _no_repeat(intent.request_id),
        }
    if fingerprint != intent.hash and fingerprint != intent.historical_hash:
        if str(fingerprint).startswith("scan-intent-v3:"):
            raise RequestConflictError()
        if intent.historical_hash is None:
            raise ScanError(
                "LegacyReplayEvidenceRequired",
                "Original Scan retry evidence is required for this request.",
                409,
            )
        raise RequestConflictError()
    if acknowledgement is None:
        return {
            "kind": "LegacyNoRepeat",
            "requestId": intent.request_id,
            "binding": "VerifiedLegacyHash",
            "acknowledgement": _no_repeat(intent.request_id),
        }
    return {
        "kind": "Committed",
        "sessionId": intent.session_id,
        "acknowledgement": cast(InventoryAcknowledgement, acknowledgement),
    }


async def save_review(
    tx: Transaction, prepared: PreparedInventoryMutation, session_id: str, item: ReviewIntent
) -> None:
    try:
        artifact = await owned_artifact(
            tx, prepared.account_id, item["scanArtifactId"], session_id
        )
    except ScanError as cause:
        if cause.kind == "ScanNotFound":
            raise ScanError(
                "ScanNotFound", "Scan artifact not found in this session", 404
            ) from None
        raise
    identifier = item.get("id", str(uuid4()))
    card = prepared.printings[item["catalogCardId"]]
    candidate = next(
        (
            c
            for c in candidate_array(artifact.candidate_json)
            if c["catalogCardId"] == item["catalogCardId"]
        ),
        None,
    )
    values = (
        card["id"],
        card["oracle_id"],
        card["oracle_id"],
        card["name"],
        card["set_code"],
        card["collector_number"],
        card["image_uri"],
        candidate["similarityScore"] if candidate else 0,
        candidate["ocrScore"] if candidate else 0,
        candidate["finalScore"] if candidate else 0,
        js_utf8(candidate["matchReason"]).decode("utf-8") if candidate else "manual_review",
        item["finish"],
        item["condition"],
        item["quantity"],
        datetime.now(UTC),
    )
    saved = await (
        await tx.execute(
            "INSERT INTO scan_review_items(id,session_id,scan_artifact_id,account_id,"
            "catalog_card_id,canonical_card_id,oracle_id,name,set_code,collector_number,"
            "image_uri,similarity_score,ocr_score,final_score,match_reason,finish,condition,quantity,"
            "updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (id) DO UPDATE SET "
            "catalog_card_id=EXCLUDED.catalog_card_id,canonical_card_id=EXCLUDED.canonical_card_id,"
            "oracle_id=EXCLUDED.oracle_id,name=EXCLUDED.name,set_code=EXCLUDED.set_code,"
            "collector_number=EXCLUDED.collector_number,image_uri=EXCLUDED.image_uri,"
            "similarity_score=EXCLUDED.similarity_score,ocr_score=EXCLUDED.ocr_score,"
            "final_score=EXCLUDED.final_score,match_reason=EXCLUDED.match_reason,finish=EXCLUDED.finish,"
            "condition=EXCLUDED.condition,quantity=EXCLUDED.quantity,"
            "updated_at=EXCLUDED.updated_at "
            "WHERE scan_review_items.account_id=EXCLUDED.account_id "
            "AND scan_review_items.session_id=EXCLUDED.session_id "
            "AND scan_review_items.scan_artifact_id=EXCLUDED.scan_artifact_id RETURNING id",
            (identifier, session_id, item["scanArtifactId"], prepared.account_id, *values),
        )
    ).fetchone()
    if saved is None:
        raise ValidationError("Scan review belongs to another artifact or session")


async def commit_review(
    pool: ConnectionPool, auth: SessionAuth, inventory: Inventory, actor: Actor, input: object
) -> ScanCommitAcknowledgement:
    current = await auth.require_actor(actor)
    intent = normalize_commit(input)

    async def authorized_replay() -> ScanCommitAcknowledgement | None:
        async with transaction(pool) as tx:
            user = await authorize_scan(tx, actor, auth)
            return await probe(tx, user.account_id, intent)

    async with transaction(pool, read_only=True) as tx:
        prior = await probe(tx, current.account_id, intent)
    if prior is not None:
        replay = await authorized_replay()
        if replay is not None:
            return replay
    inventory_intent = InventoryIntent(
        intent.request_id,
        "scan_review",
        tuple(normalize_add({"op": "add", **intent_fields(item)}) for item in intent.items),
    )
    try:
        prepared = await inventory.prepare(actor, inventory_intent, intent.hash)
    except RequestConflictError:
        replay = await authorized_replay()
        if replay is not None:
            return replay
        raise
    if isinstance(prepared, RecordedInventoryMutation):
        replay = await authorized_replay()
        if replay is not None:
            return replay
        raise RequestConflictError()
    async with transaction(pool) as tx:
        await inventory.authorize(tx, prepared)
        # Scan uses a locking session fence after Inventory's established Profile prefix.
        await auth.require_actor_for_write(actor, tx)
        replay = await probe(tx, prepared.account_id, intent)
        if replay is not None:
            return replay
        # Consume the shared writer's replay seam as well, preserving its hash check.
        if await inventory.replay(tx, prepared) is not None:
            raise RequestConflictError()
        session = await owned_session(tx, prepared.account_id, intent.session_id, lock=True)
        assert_reviewable(session.status)
        for item in intent.items:
            await save_review(tx, prepared, intent.session_id, item)
        acknowledgement = await inventory.apply(tx, prepared)
        await tx.execute(
            "UPDATE scan_sessions SET status='committed',updated_at=%s WHERE id=%s",
            (datetime.now(UTC), intent.session_id),
        )
        await inventory.record_receipt(tx, prepared, acknowledgement)
        return {
            "kind": "Committed",
            "sessionId": intent.session_id,
            "acknowledgement": acknowledgement,
        }
