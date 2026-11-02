"""Read unchanged Demo fixtures and verify the versioned public bundle incrementally."""

import gzip
import hashlib
import json
import math
import re
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, cast
from uuid import NAMESPACE_URL, uuid5

from . import OperatorError

MANIFEST_NAME = "catalog-default-en-20261102.manifest.json"
CATALOG_TRANSFORM_VERSION = 5
_UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
_DIGEST = re.compile(r"[0-9a-f]{64}")
type Record = dict[str, Any]


@dataclass(frozen=True)
class Precon:
    name: str
    description: str
    cards: list[Record]
    inventory_extras: list[Record]


@dataclass(frozen=True)
class BundleManifest:
    generation_id: str
    bundle_version: datetime
    transform_version: int
    documents: int
    canonical_count: int
    starter_printing_count: int
    jsonl_bytes: int
    jsonl_sha256: str


@dataclass(frozen=True)
class DemoBundle:
    manifest: BundleManifest
    file: Path
    starters: Path

    def batches(self) -> Iterator[list[Record]]:
        """Final digest checks run only on exhaustion, inside the publication transaction."""
        ids: set[str] = set()
        oracles: set[str] = set()
        digest = hashlib.sha256()
        size = 0
        batch: list[Record] = []
        try:
            with gzip.open(self.file, "rb") as stream:
                for line in stream:
                    digest.update(line)
                    size += len(line)
                    if not line.endswith(b"\n"):
                        raise OperatorError("Demo Catalog payload must end with LF.")
                    record = json.loads(line)
                    d = record.get("document") if isinstance(record, dict) else None
                    if (
                        not isinstance(d, dict)
                        or not _uuid(d.get("id"))
                        or not _uuid(d.get("oracle_id"))
                        or d.get("lang") != "en"
                        or isinstance(d.get("cmc"), bool)
                        or not isinstance(d.get("cmc"), (int, float))
                        or not math.isfinite(d["cmc"])
                        or d["id"] in ids
                        or not _valid_tokens(d.get("related_tokens"))
                        or not isinstance(record.get("search_name"), str)
                        or not isinstance(record.get("search_text"), str)
                        or set(record) != {"document", "search_name", "search_text"}
                    ):
                        raise OperatorError("Invalid Demo Catalog printing.")
                    ids.add(d["id"])
                    oracles.add(d["oracle_id"])
                    batch.append(record)
                    if len(batch) == 500:
                        yield batch
                        batch = []
                if batch:
                    yield batch
            starters = _read_json(self.starters)
            manifest = self.manifest
            if (
                len(ids) != manifest.documents
                or len(oracles) != manifest.canonical_count
                or size != manifest.jsonl_bytes
                or digest.hexdigest() != manifest.jsonl_sha256
                or not isinstance(starters, list)
                or len(starters) != manifest.starter_printing_count
                or any(not isinstance(d, dict) or d.get("id") not in ids for d in starters)
            ):
                raise OperatorError("Demo Catalog payload integrity check failed.")
        except OSError, EOFError, ValueError, TypeError, KeyError, OverflowError:
            raise OperatorError("Demo Catalog payload integrity check failed.") from None


def _valid_tokens(value: object) -> bool:
    """Accept only the bounded, known inline projection, never arbitrary nested JSON."""

    def text(v: object) -> bool:
        return isinstance(v, str) and len(v) <= 20000

    def nullable(v: object) -> bool:
        return v is None or text(v)

    if not isinstance(value, dict) or set(value) != {"items", "unresolved"}:
        return False
    items, unresolved = value["items"], value["unresolved"]
    if not isinstance(items, list) or not isinstance(unresolved, list):
        return False
    if len(items) + len(unresolved) > 100:
        return False
    seen = set()
    for ref in [*items, *unresolved]:
        if not isinstance(ref, dict) or not _uuid(ref.get("catalogCardId")):
            return False
        if ref["catalogCardId"] in seen or not text(ref.get("name")):
            return False
        seen.add(ref["catalogCardId"])
    for ref in unresolved:
        if set(ref) != {"catalogCardId", "name"}:
            return False
    for item in items:
        if set(item) != {
            "catalogCardId",
            "canonicalCardId",
            "name",
            "layout",
            "setCode",
            "collectorNumber",
            "faces",
        }:
            return False
        if item["canonicalCardId"] is not None and not _uuid(item["canonicalCardId"]):
            return False
        if not all(text(item[k]) for k in ("layout", "setCode", "collectorNumber")):
            return False
        faces = item["faces"]
        if not isinstance(faces, list) or not 1 <= len(faces) <= 10:
            return False
        for face in faces:
            if not isinstance(face, dict) or set(face) != {
                "name",
                "typeLine",
                "colors",
                "oracleText",
                "power",
                "toughness",
                "imageUri",
                "imageUriSmall",
            }:
                return False
            if not all(text(face[k]) for k in ("name", "typeLine", "oracleText")):
                return False
            if not all(
                nullable(face[k]) for k in ("power", "toughness", "imageUri", "imageUriSmall")
            ):
                return False
            colors = face["colors"]
            if (
                not isinstance(colors, list)
                or len(colors) > 5
                or any(c not in ("W", "U", "B", "R", "G") for c in colors)
            ):
                return False
    return True


def _uuid(value: object) -> bool:
    return isinstance(value, str) and _UUID.fullmatch(value) is not None


def _integer(value: object) -> bool:
    return type(value) is int and 0 < value <= 9007199254740991


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError, ValueError:
        raise OperatorError("Demo fixture could not be read.") from None


def verify_bundle(directory: Path) -> DemoBundle:
    raw = _read_json(directory / MANIFEST_NAME)
    try:
        if not isinstance(raw, dict):
            raise ValueError
        version = datetime.fromisoformat(raw["bundleVersion"].replace("Z", "+00:00"))
        name = f"spellbook-demo-catalog:2:{CATALOG_TRANSFORM_VERSION}:{raw['jsonlSHA256']}"
        if (
            type(raw["formatVersion"]) is not int
            or raw["formatVersion"] != 2
            or raw["sourceType"] != "demo-bundle"
            or raw["providerUpdatedAt"] is not None
            or not _uuid(raw["generationId"])
            or type(raw["catalogTransformVersion"]) is not int
            or raw["catalogTransformVersion"] != CATALOG_TRANSFORM_VERSION
            or not re.fullmatch(r"catalog-default-en-\d{8}\.jsonl\.gz", raw["file"])
            or not _DIGEST.fullmatch(raw["gzipSHA256"])
            or not _DIGEST.fullmatch(raw["jsonlSHA256"])
            or str(uuid5(NAMESPACE_URL, name)) != raw["generationId"]
            or not _integer(raw["counts"]["documents"])
            or not _integer(raw["canonicalCount"])
            or version.tzinfo is None
        ):
            raise ValueError
        manifest = BundleManifest(
            raw["generationId"],
            version,
            CATALOG_TRANSFORM_VERSION,
            raw["counts"]["documents"],
            raw["canonicalCount"],
            raw["starterPrintingCount"],
            raw["jsonlBytes"],
            raw["jsonlSHA256"],
        )
        file = directory / raw["file"]
        with file.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if file.stat().st_size != raw["gzipBytes"] or digest != raw["gzipSHA256"]:
            raise OperatorError("Demo Catalog gzip integrity check failed.")
        return DemoBundle(manifest, file, directory / "cards.json")
    except OSError:
        raise OperatorError("Demo Catalog gzip integrity check failed.") from None
    except ValueError, TypeError, KeyError, AttributeError:
        raise OperatorError("Invalid Demo Catalog manifest.") from None


def load_precon(directory: Path) -> Precon:
    raw = _read_json(directory / "upgrades-unleashed.json")
    try:
        return Precon(raw["name"], raw["description"], raw["cards"], raw["inventoryExtras"])
    except TypeError, KeyError:
        raise OperatorError("Invalid Demo precon fixture.") from None


def legacy_inventory(directory: Path) -> list[Record]:
    cards = cast(list[Record], _read_json(directory / "cards.json"))
    try:
        commander = next(c for c in cards if c["name"] == "Lathril, Blade of the Elves")
        forest = next(c for c in cards if c["name"] == "Forest")
        sol = next(c for c in cards if c["name"] == "Sol Ring")
        alternate = next(c for c in cards if c["name"] == "Sol Ring" and c["id"] != sol["id"])
        spells = [
            *[
                c
                for c in cards
                if c is not commander and c is not forest and c["name"] != "Sol Ring"
            ][:63],
            sol,
        ]
        return [
            {
                "catalog_card_id": d["id"],
                "canonical_card_id": d["oracle_id"],
                "name": d["name"],
                "set_code": d["set_code"],
                "image_uri": d["image_uri"],
                "quantity": 30 if d is forest else 1,
                "finish": "nonfoil",
                "condition": "NM",
                "spellbook_position": position,
                "notes": "",
                "notes_revision": "0",
                "game": "mtg",
            }
            for position, d in enumerate([commander, *spells[:40], alternate, forest])
        ]
    except KeyError, TypeError, StopIteration:
        raise OperatorError("Invalid legacy Demo fixture.") from None


def matches_legacy(actual: Sequence[Mapping[str, object]], expected: Sequence[Record]) -> bool:
    # UUID and bigint adapters produce UUID/int rather than Node's strings.
    return len(actual) == len(expected) and all(
        all(key in row and str(row[key]) == str(value) for key, value in wanted.items())
        for row, wanted in zip(actual, expected, strict=True)
    )
