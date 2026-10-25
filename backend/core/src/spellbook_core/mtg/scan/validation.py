"""Existing Scan input, stored DTO and worker-result compatibility rules."""

import math
from typing import cast

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.models import CardDocument
from spellbook_core.mtg.scan.types import ScanCandidate, ScanStatus, WorkerInput, WorkerResult
from spellbook_core.validation import (
    MISSING,
    assert_bounded_text,
    assert_uuid,
    js_trim,
    utf16_length,
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024


class ScanError(Exception):
    def __init__(self, kind: str, message: str, status: int):
        self.kind = kind
        self.status = status
        super().__init__(message)


def record(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValidationError("Expected a Scan object")
    return cast(dict[str, object], value)


def text(value: object, field: str, maximum: int, optional: bool = False) -> str:
    if optional and value is MISSING:
        return ""
    result = js_trim(assert_bounded_text(value, field, maximum))
    if not optional and not result:
        raise ValidationError(f"{field} must not be empty")
    return result


def score(value: object) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int | float)
        or not 0 <= value <= 2147483647
        or not math.isfinite(value)
        or int(value) != value
    ):
        raise ValidationError("Scan scores must be nonnegative 32-bit integers")
    return int(value)


def status(value: object, count: int) -> ScanStatus:
    if value not in ("matched", "ambiguous", "no_match", "failed"):
        raise ValidationError("Invalid Scan result status")
    if (
        (value == "matched" and count < 1)
        or (value == "ambiguous" and count < 2)
        or (value in ("no_match", "failed") and count != 0)
    ):
        raise ValidationError("Candidates do not match the Scan result status")
    return value


def confidence(value: object, message: str = "Invalid candidate confidence") -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, int | float)
        or not 0 <= value <= 1
        or not math.isfinite(value)
    ):
        raise ValidationError(message)
    return float(value)


def candidate_dto(value: object) -> ScanCandidate:
    c = record(value)
    result: ScanCandidate = {
        "catalogCardId": assert_uuid(c.get("catalogCardId", MISSING), "catalogCardId"),
        "canonicalCardId": assert_uuid(c.get("canonicalCardId", MISSING), "canonicalCardId"),
        "oracleId": assert_uuid(c.get("oracleId", MISSING), "oracleId"),
        "name": text(c.get("name", MISSING), "name", 500),
        "setCode": text(c.get("setCode", MISSING), "setCode", 100),
        "collectorNumber": text(c.get("collectorNumber", MISSING), "collectorNumber", 100, True),
        "imageUri": text(c.get("imageUri", MISSING), "imageUri", 2000, True),
        "similarityScore": score(c.get("similarityScore", MISSING)),
        "ocrScore": score(c.get("ocrScore", MISSING)),
        "finalScore": score(c.get("finalScore", MISSING)),
        "matchReason": text(c.get("matchReason", MISSING), "matchReason", 500, True),
    }
    if "confidence" in c:
        result["confidence"] = confidence(c["confidence"])
    return result


def candidate_array(value: object) -> list[ScanCandidate]:
    if not isinstance(value, list) or len(value) > 20:
        raise ValidationError("Supply at most 20 Scan candidates")
    rows = [candidate_dto(c) for c in value]
    if len({c["catalogCardId"] for c in rows}) != len(rows):
        raise ValidationError("Duplicate candidate printing")
    return rows


def check_image(body: bytes, content_type: str | None = None, file_name: str | None = None) -> str:
    if not body:
        raise ScanError("ScanImageInvalid", "Scan upload must not be empty", 400)
    if len(body) > MAX_IMAGE_BYTES:
        raise ScanError("ScanImageInvalid", "Scan image exceeds 10 MiB", 413)
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        actual = "image/png"
    elif body.startswith(b"\xff\xd8\xff"):
        actual = "image/jpeg"
    elif body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        actual = "image/webp"
    else:
        raise ScanError("ScanImageInvalid", "Scan image is not JPEG, PNG, or WebP", 415)
    if content_type is not None and actual != content_type:
        raise ScanError("ScanImageInvalid", "Scan image content does not match its MIME type", 415)
    if file_name is not None and (not js_trim(file_name) or utf16_length(file_name) > 255):
        raise ValidationError("Invalid Scan file name")
    return actual


async def printing_candidate(catalog: Catalog, identifier: str) -> ScanCandidate:
    card: CardDocument = await catalog.get_catalog_printing(identifier)
    if (
        card["id"].lower() != identifier
        or not card["name"]
        or not card["set_code"]
        or not card["collector_number"]
    ):
        raise ValidationError("Catalog printing is incomplete")
    assert_uuid(card["oracle_id"], "oracleId")
    return {
        "catalogCardId": card["id"],
        "canonicalCardId": card["oracle_id"],
        "oracleId": card["oracle_id"],
        "name": card["name"],
        "setCode": card["set_code"],
        "collectorNumber": card["collector_number"],
        "imageUri": card["image_uri"],
        "similarityScore": 0,
        "ocrScore": 0,
        "finalScore": 0,
        "matchReason": "",
    }


async def worker_result(value: object, input: WorkerInput, catalog: Catalog) -> WorkerResult:
    raw = record(value)
    if raw.get("normalizedObjectKey") != input["originalObjectKey"]:
        raise ValidationError("Invalid worker image identity")
    tokens = record(raw.get("ocrTokens", MISSING))
    if len(tokens) > 100:
        raise ValidationError("Too many OCR tokens")
    ocr: dict[str, str] = {}
    for key, token in tokens.items():
        if (
            key not in {"name", "setCode", "collectorNumber"}
            or not isinstance(token, str)
            or utf16_length(token) > 5000
        ):
            raise ValidationError("Invalid OCR tokens")
        ocr[key] = token
    values = raw.get("candidates")
    if not isinstance(values, list) or len(values) > 20:
        raise ValidationError("Invalid worker candidates")
    seen: set[str] = set()
    candidates: list[ScanCandidate] = []
    for value in values:
        c = record(value)
        identifier = assert_uuid(c.get("catalogCardId", MISSING), "catalogCardId")
        if identifier in seen:
            raise ValidationError("Duplicate worker candidate")
        seen.add(identifier)
        similarity = score(c.get("similarityScore", MISSING))
        ocr_score = score(c.get("ocrScore", MISSING))
        final = score(c.get("finalScore", MISSING))
        canonical = assert_uuid(c.get("canonicalCardId", MISSING), "canonicalCardId")
        oracle = assert_uuid(c.get("oracleId", MISSING), "oracleId")
        candidate = await printing_candidate(catalog, identifier)
        if canonical != candidate["oracleId"].lower() or oracle != canonical:
            raise ValidationError("Worker candidate identity does not match Catalog")
        candidate.update(
            {
                "similarityScore": similarity,
                "ocrScore": ocr_score,
                "finalScore": final,
                "matchReason": text(c.get("matchReason", MISSING), "matchReason", 500, True),
            }
        )
        candidates.append(candidate)
    return {
        "status": status(raw.get("status"), len(candidates)),
        "normalizedObjectKey": input["originalObjectKey"],
        "qualityScore": score(raw.get("qualityScore", MISSING)),
        "embeddingModelVersion": text(
            raw.get("embeddingModelVersion", MISSING), "embeddingModelVersion", 128
        ),
        "ocrModelVersion": text(raw.get("ocrModelVersion", MISSING), "ocrModelVersion", 128),
        "ocrTokens": ocr,
        "candidates": candidates,
    }
