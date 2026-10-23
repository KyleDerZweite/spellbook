"""Account-scoped Scan SQL and explicit public projections."""

from dataclasses import dataclass
from datetime import datetime
from typing import cast

from psycopg.rows import class_row

from ..db import Transaction, iso_timestamp
from .types import ScanArtifact, ScanResult, ScanReviewItem, ScanSession, SessionStatus
from .validation import ScanError, candidate_array, candidate_dto, score, status, text


@dataclass(frozen=True, slots=True)
class SessionRow:
    id: str
    account_id: str
    game: str
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ArtifactRow:
    id: str
    session_id: str
    account_id: str
    original_object_key: str
    normalized_object_key: str
    quality_score: int
    embedding_model_version: str
    ocr_model_version: str
    status: str
    ocr_name: str | None
    ocr_set_code: str | None
    ocr_collector_number: str | None
    candidate_json: object
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ReviewRow:
    id: str
    session_id: str
    scan_artifact_id: str
    account_id: str
    catalog_card_id: str
    canonical_card_id: str
    oracle_id: str
    name: str
    set_code: str
    collector_number: str
    image_uri: str
    similarity_score: int
    ocr_score: int
    final_score: int
    match_reason: str
    finish: str
    condition: str
    quantity: int
    created_at: datetime
    updated_at: datetime


SESSION_COLUMNS = "id::text,account_id,game,status,created_at,updated_at"
ARTIFACT_COLUMNS = (
    "id::text,session_id::text,account_id,original_object_key,normalized_object_key,"
    "quality_score,embedding_model_version,ocr_model_version,status,ocr_name,ocr_set_code,"
    "ocr_collector_number,candidate_json,created_at,updated_at"
)
REVIEW_COLUMNS = (
    "id::text,session_id::text,scan_artifact_id::text,account_id,catalog_card_id,canonical_card_id,"
    "oracle_id,name,set_code,collector_number,image_uri,similarity_score,ocr_score,final_score,"
    "match_reason,finish,condition,quantity,created_at,updated_at"
)


def session_dto(row: SessionRow) -> ScanSession:
    if row.game != "mtg" or row.status not in ("open", "pending_review", "committed", "cancelled"):
        raise ValueError("Invalid stored Scan session")
    return {
        "id": row.id,
        "game": "mtg",
        "status": cast(SessionStatus, row.status),
        "createdAt": iso_timestamp(row.created_at),
        "updatedAt": iso_timestamp(row.updated_at),
    }


def result_dto(row: ArtifactRow) -> ScanResult:
    candidates = candidate_array(row.candidate_json)
    return {
        "artifactId": row.id,
        "status": status(row.status, len(candidates)),
        "qualityScore": score(row.quality_score),
        "embeddingModelVersion": text(row.embedding_model_version, "embeddingModelVersion", 128),
        "ocrModelVersion": text(row.ocr_model_version, "ocrModelVersion", 128),
        "ocrTokens": {
            key: text(value, field, 5000, True)
            for key, field, value in (
                ("name", "ocrName", row.ocr_name),
                ("setCode", "ocrSetCode", row.ocr_set_code),
                ("collectorNumber", "ocrCollectorNumber", row.ocr_collector_number),
            )
            if value is not None
        },
        "candidates": candidates,
    }


def artifact_dto(row: ArtifactRow) -> ScanArtifact:
    return {
        **result_dto(row),
        "id": row.id,
        "sessionId": row.session_id,
        "createdAt": iso_timestamp(row.created_at),
        "updatedAt": iso_timestamp(row.updated_at),
    }


def review_dto(row: ReviewRow) -> ScanReviewItem:
    return {
        **candidate_dto(
            {
                "catalogCardId": row.catalog_card_id,
                "canonicalCardId": row.canonical_card_id,
                "oracleId": row.oracle_id,
                "name": row.name,
                "setCode": row.set_code,
                "collectorNumber": row.collector_number,
                "imageUri": row.image_uri,
                "similarityScore": row.similarity_score,
                "ocrScore": row.ocr_score,
                "finalScore": row.final_score,
                "matchReason": row.match_reason,
            }
        ),
        "id": row.id,
        "sessionId": row.session_id,
        "scanArtifactId": row.scan_artifact_id,
        "finish": row.finish,
        "condition": row.condition,
        "quantity": row.quantity,
        "createdAt": iso_timestamp(row.created_at),
        "updatedAt": iso_timestamp(row.updated_at),
    }


async def owned_session(
    tx: Transaction, account_id: str, session_id: str, *, lock: bool = False
) -> SessionRow:
    async with tx.cursor(row_factory=class_row(SessionRow)) as cursor:
        await cursor.execute(
            f"SELECT {SESSION_COLUMNS} FROM scan_sessions WHERE account_id=%s AND id=%s"
            + (" FOR UPDATE" if lock else ""),
            (account_id, session_id),
        )
        row = await cursor.fetchone()
    if row is None:
        raise ScanError("ScanNotFound", "Scan session not found", 404)
    return row


async def owned_artifact(
    tx: Transaction, account_id: str, artifact_id: str, session_id: str | None = None
) -> ArtifactRow:
    # The parent scope is checked too; malformed retained rows cannot grant image access.
    async with tx.cursor(row_factory=class_row(ArtifactRow)) as cursor:
        await cursor.execute(
            f"SELECT {ARTIFACT_COLUMNS} FROM scan_artifacts WHERE account_id=%s AND id=%s "
            "AND session_id IN (SELECT id FROM scan_sessions WHERE account_id=%s)"
            + (" AND session_id=%s" if session_id is not None else ""),
            (account_id, artifact_id, account_id)
            + ((session_id,) if session_id is not None else ()),
        )
        row = await cursor.fetchone()
    if row is None:
        raise ScanError("ScanNotFound", "Scan artifact not found", 404)
    return row


def assert_open(value: str) -> None:
    if value != "open":
        raise ScanError("ScanClosed", "Scan session is not open for uploads", 409)


def assert_reviewable(value: str) -> None:
    if value not in ("open", "pending_review"):
        raise ScanError("ScanClosed", "Scan session is not open for review", 409)
