"""Complete public Oracle Tags publication, independent of account decisions."""

from __future__ import annotations

import gzip
import hashlib
import json
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import psycopg
from psycopg.types.json import Jsonb

PARSER_VERSION = 1
MAPPING_VERSION = 1
PUBLISH_LOCK = (1936747619, 15)
ROOTS = {
    "board-wipes": "3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0",
    "counterspells": "690fc968-48ba-4854-a948-3db6bf19d3a9",
    "removal": "cc12d27d-1d0e-4849-9551-71caead74d24",
    "ramp": "2f3e4ad7-5e60-41b4-bdbc-653f16869cf6",
    "draw": "b6448c45-ce65-4848-aa98-2151e4e07437",
    "protection": "6e2cdc7c-b02c-4b59-a171-f93723721b79",
    "recursion": "82b824ad-648f-467f-a190-2e0fa9a795d2",
}


def source_uuid(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Invalid Oracle Tags UUID")
    return str(UUID(value))


def records(path: Path):
    with path.open("rb") as probe:
        compressed = probe.read(2) == b"\x1f\x8b"
    opener = gzip.open if compressed else Path.open
    with opener(path, mode="rt", encoding="utf-8") as source:
        for line in source:
            if len(line) > 16 * 1024 * 1024:
                raise ValueError("Oversized Oracle Tags record")
            raw = json.loads(line)
            if (
                not isinstance(raw, dict)
                or raw.get("object") != "tag"
                or raw.get("type") != "oracle"
            ):
                raise ValueError("Unsupported Oracle Tags record")
            yield raw


@dataclass
class Taxonomy:
    tags: dict[str, dict]
    descendants: dict[str, set[str]]


def read_taxonomy(path: Path) -> Taxonomy:
    tags = {}
    for raw in records(path):
        identifier = source_uuid(raw.get("id"))
        if identifier in tags or len(tags) >= 20000:
            raise ValueError("Duplicate or excessive Oracle Tags")
        label = raw.get("label")
        if not isinstance(label, str) or not label or len(label) > 512:
            raise ValueError("Invalid Oracle Tags label")
        edges = {}
        for key in ("parent_ids", "child_ids"):
            values = raw.get(key)
            if not isinstance(values, list):
                raise ValueError("Missing Oracle Tags edges")
            edges[key] = {source_uuid(value) for value in values}
            if len(edges[key]) != len(values):
                raise ValueError("Duplicate Oracle Tags edge")
        taggings = raw.get("taggings")
        if not isinstance(taggings, list):
            raise ValueError("Missing Oracle taggings")
        for tagging in taggings:
            if not isinstance(tagging, dict):
                raise ValueError("Invalid Oracle tagging")
            source_uuid(tagging.get("oracle_id"))
            weight = tagging.get("weight")
            if not isinstance(weight, str) or len(weight) > 64:
                raise ValueError("Invalid Oracle prominence")
        tags[identifier] = {"label": label, **edges}
    if not tags:
        raise ValueError("Empty Oracle Tags snapshot")
    for identifier, tag in tags.items():
        for parent in tag["parent_ids"]:
            if parent not in tags or identifier not in tags[parent]["child_ids"]:
                raise ValueError("Inconsistent Oracle Tags graph")
        for child in tag["child_ids"]:
            if child not in tags or identifier not in tags[child]["parent_ids"]:
                raise ValueError("Inconsistent Oracle Tags graph")
    descendants: dict[str, set[str]] = {}
    active = set()

    def visit(identifier):
        if identifier in active:
            raise ValueError("Cyclic Oracle Tags graph")
        if identifier not in descendants:
            active.add(identifier)
            result = {identifier}
            for child in tags[identifier]["child_ids"]:
                result.update(visit(child))
            active.remove(identifier)
            descendants[identifier] = result
        return descendants[identifier]

    for identifier in tags:
        visit(identifier)
    return Taxonomy(tags, descendants)


class OracleTagsPublisher:
    def __init__(self, database_url: str):
        self.database_url = database_url

    def publish(self, path: Path, descriptor: dict) -> dict:
        try:
            return self._publish(path, descriptor)
        except Exception as cause:
            self.record_failure(cause)
            raise

    def record_failure(self, cause: Exception) -> None:
        # A failed status write must not replace the original provider/parser failure.
        with (
            suppress(psycopg.Error),
            psycopg.connect(self.database_url, connect_timeout=10) as conn,
        ):
            conn.execute(
                "UPDATE oracle_tag_state SET refresh_status=%s WHERE id=1",
                (
                    Jsonb(
                        {
                            "kind": "Failed",
                            "attemptedAt": datetime.now(UTC).isoformat(),
                            "error": type(cause).__name__,
                        }
                    ),
                ),
            )

    def _publish(self, path: Path, descriptor: dict) -> dict:
        if (
            descriptor.get("id") != "bd8df61e-5d0a-47a2-9086-40137a645b98"
            or descriptor.get("type") != "oracle_tags"
        ):
            raise ValueError("Invalid Oracle Tags descriptor")
        location = urlsplit(descriptor.get("download_uri", ""))
        if (
            location.scheme != "https"
            or location.hostname != "data.scryfall.io"
            or location.username
        ):
            raise ValueError("Invalid Oracle Tags download identity")
        instant = datetime.fromisoformat(descriptor["updated_at"])
        if instant.tzinfo is None or instant > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Invalid Oracle Tags timestamp")
        taxonomy = read_taxonomy(path)
        if not set(ROOTS.values()).issubset(taxonomy.tags):
            raise ValueError("Missing starter Oracle Tags root")
        with path.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        identifier = uuid4()
        count = 0
        with psycopg.connect(self.database_url, connect_timeout=10) as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s,%s)", PUBLISH_LOCK)
            old = conn.execute(
                "SELECT p.id FROM oracle_tag_state s JOIN oracle_tag_publications p ON "
                "p.id=s.active_publication WHERE s.id=1 AND p.payload_digest=%s AND "
                "p.parser_version=%s AND p.mapping_version=%s",
                (digest, PARSER_VERSION, MAPPING_VERSION),
            ).fetchone()
            if old:
                conn.execute(
                    "UPDATE oracle_tag_state SET refresh_status=%s WHERE id=1",
                    (Jsonb({"kind": "Succeeded", "attemptedAt": datetime.now(UTC).isoformat()}),),
                )
                return {
                    "publicationId": str(old[0]),
                    "tagCount": len(taxonomy.tags),
                    "unchanged": True,
                }
            conn.execute(
                "INSERT INTO "
                "oracle_tag_publications(id,descriptor,source_updated_at,payload_digest,"
                "parser_version,mapping_version,mapping) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s)",
                (
                    identifier,
                    Jsonb(descriptor),
                    instant,
                    digest,
                    PARSER_VERSION,
                    MAPPING_VERSION,
                    Jsonb(ROOTS),
                ),
            )
            with conn.cursor().copy(
                "COPY oracle_tags(publication_id,id,label) FROM STDIN"
            ) as copy:
                for tag_id, tag in taxonomy.tags.items():
                    copy.write_row((identifier, tag_id, tag["label"]))
            with conn.cursor().copy(
                "COPY oracle_tag_closure(publication_id,ancestor_id,descendant_id) FROM STDIN"
            ) as copy:
                for ancestor, children in taxonomy.descendants.items():
                    for child in children:
                        copy.write_row((identifier, ancestor, child))
            with conn.cursor().copy(
                "COPY oracle_tag_memberships(publication_id,tag_id,oracle_id,weight) FROM STDIN"
            ) as copy:
                for raw in records(path):
                    seen = set()
                    for tagging in raw["taggings"]:
                        oracle_id = source_uuid(tagging["oracle_id"])
                        if oracle_id not in seen:
                            copy.write_row(
                                (identifier, source_uuid(raw["id"]), oracle_id, tagging["weight"])
                            )
                            seen.add(oracle_id)
                            count += 1
            with path.open("rb") as source:
                if hashlib.file_digest(source, "sha256").hexdigest() != digest:
                    raise ValueError("Oracle Tags payload changed during publication")
            conn.execute("ANALYZE oracle_tag_memberships")
            conn.execute("ANALYZE oracle_tag_closure")
            conn.execute(
                "UPDATE oracle_tag_state SET "
                "previous_publication=active_publication,active_publication=%s,refresh_status=%s "
                "WHERE id=1",
                (
                    identifier,
                    Jsonb({"kind": "Succeeded", "attemptedAt": datetime.now(UTC).isoformat()}),
                ),
            )
            conn.execute(
                "DELETE FROM oracle_tag_publications WHERE id NOT IN (SELECT "
                "active_publication FROM oracle_tag_state UNION SELECT "
                "previous_publication FROM oracle_tag_state WHERE previous_publication IS "
                "NOT NULL)"
            )
        return {
            "publicationId": str(identifier),
            "tagCount": len(taxonomy.tags),
            "taggingCount": count,
            "unchanged": False,
        }
