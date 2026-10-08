"""Finite public Commander Spellbook ingestion, independent of private Decks."""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import re
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import psycopg
from psycopg.types.json import Jsonb

from worker.optional_prices import source_instant, stage_deadline
from worker.optional_publication import _PublicationConnection
from worker.optional_sync import download_artifact
from worker.price_artifacts import ArtifactRecords, NumericToken, PriceLimits
from worker.price_connections import connect

PARSER_VERSION = 1
POLICY_VERSION = "ingredients-v1"
PUBLISH_LOCK = (1936747619, 23)
BULK_URL = "https://json.commanderspellbook.com/variants.json.gz"
log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ComboLimits(PriceLimits):
    compressed_bytes: int = 128 * 1024**2
    decompressed_bytes: int = 1024**3
    staging_bytes: int = 2 * 1024**3


DEFAULT_COMBO_LIMITS = ComboLimits()


class ComboRecords(ArtifactRecords):
    """Stream both arrays and validate every byte, including gzip trailer."""

    def __init__(self, path, limits=DEFAULT_COMBO_LIMITS, *, import_deadline=None):
        super().__init__(path, "variants", False, limits, import_deadline=import_deadline)

    def __iter__(self):
        if self.path.stat().st_size > self.limits.compressed_bytes:
            raise ValueError("Compressed combo byte limit exceeded")
        digest = hashlib.sha256()
        with self.path.open("rb") as payload:
            while chunk := payload.read(65536):
                if time.monotonic() >= self._deadline:
                    raise ValueError("Combo digest deadline exceeded")
                digest.update(chunk)
        self.digest = digest.hexdigest()
        with gzip.open(self.path, "rt", encoding="utf-8", newline="") as self._source:
            self._take("{")
            keys = set()
            while self._ready() != "}":
                key = self._value()
                if type(key) is not str or key in keys:
                    raise ValueError("Invalid or duplicate combo root key")
                keys.add(key)
                self._take(":")
                if key in ("variants", "aliases"):
                    self._take("[")
                    while self._ready() != "]":
                        record = self._value()
                        if not isinstance(record, dict):
                            raise ValueError("Invalid combo record")
                        yield key, record
                        if self._ready() == "]":
                            break
                        self._take(",")
                        if self._ready() == "]":
                            raise ValueError("Trailing combo array comma")
                    self._take("]")
                elif key in ("timestamp", "version"):
                    self.metadata[key] = self._value()
                else:
                    raise ValueError("Unknown combo root shape")
                if self._ready() == "}":
                    break
                self._take(",")
                if self._ready() == "}":
                    raise ValueError("Trailing combo root comma")
            self._take("}")
            if self._ready() or not {"variants", "aliases", "timestamp", "version"} <= keys:
                raise ValueError("Incomplete combo root or trailing content")
            if keys != {"variants", "aliases", "timestamp", "version"}:
                raise ValueError("Unknown combo root shape")


def text(value, *, nonempty=False):
    if type(value) is not str or "\x00" in value or (nonempty and not value):
        raise ValueError("Invalid combo text")
    return value


def opaque_id(value):
    value = text(value, nonempty=True)
    if len(value) > 128:
        raise ValueError("Invalid combo identity")
    return value


def positive(value, *, digits=100):
    if type(value) not in (int, NumericToken) or not re.fullmatch(r"[1-9][0-9]*", str(value)):
        raise ValueError("Invalid exact positive combo integer")
    if len(str(value)) > digits:
        raise ValueError("Combo integer exceeds storage bounds")
    return str(value)


def array(value):
    if not isinstance(value, list):
        raise ValueError("Missing combo array")
    return value


def constraints(raw, reasons):
    zones = array(raw.get("zoneLocations"))
    if any(type(zone) is not str for zone in zones) or len(set(zones)) != len(zones):
        raise ValueError("Invalid combo zones")
    if not zones or not set(zones) <= set("HBCEGL"):
        reasons.add("zones")
    commander = raw.get("mustBeCommander")
    if type(commander) is not bool:
        raise ValueError("Invalid commander requirement")
    states = {
        key: text(raw.get(key))
        for key in (
            "battlefieldCardState",
            "exileCardState",
            "libraryCardState",
            "graveyardCardState",
        )
    }
    if any(states.values()):
        reasons.add("card-state")
    return {"zones": zones, "mustBeCommander": commander, "states": states}


def reduce_variant(raw):
    identifier = opaque_id(raw.get("id"))
    status = text(raw.get("status"), nonempty=True)
    reasons = set()
    if status != "OK":
        reasons.add("status")
    known = {
        "id",
        "status",
        "uses",
        "requires",
        "produces",
        "of",
        "includes",
        "identity",
        "manaNeeded",
        "manaValueNeeded",
        "easyPrerequisites",
        "notablePrerequisites",
        "description",
        "notes",
        "spoiler",
        "legalities",
        "bracketTag",
        "popularity",
        "prices",
        "salt",
        "saltVoteCount",
        "variantCount",
    }
    if set(raw) - known:
        reasons.add("variant-shape")
    ingredients, templates, outcomes = [], [], []
    for use in array(raw.get("uses")):
        if not isinstance(use, dict):
            raise ValueError("Invalid ingredient shape")
        card = use.get("card")
        if not isinstance(card, dict):
            raise ValueError("Missing ingredient card")
        if "oracleId" not in card:
            raise ValueError("Missing original Oracle field")
        oracle = card.get("oracleId")
        if oracle is None:
            reasons.add("oracle-id")
        else:
            if type(oracle) is not str or str(UUID(oracle)) != oracle:
                raise ValueError("Invalid original Oracle UUID")
        face = use.get("usedFace")
        if face is not None:
            face = int(positive(face, digits=8))
            reasons.add("used-face")
        known = {
            "card",
            "quantity",
            "usedFace",
            "zoneLocations",
            "mustBeCommander",
            "battlefieldCardState",
            "exileCardState",
            "libraryCardState",
            "graveyardCardState",
        }
        if set(use) - known:
            reasons.add("ingredient-shape")
        ingredients.append(
            {
                "oracleId": oracle,
                "name": text(card.get("name"), nonempty=True),
                "quantity": positive(use.get("quantity")),
                "usedFace": face,
                **constraints(use, reasons),
            }
        )
    if not ingredients:
        reasons.add("empty-ingredients")
    for requirement in array(raw.get("requires")):
        if not isinstance(requirement, dict):
            raise ValueError("Invalid template shape")
        template = requirement.get("template")
        if not isinstance(template, dict):
            raise ValueError("Invalid template requirement")
        query = template.get("scryfallQuery")
        if query is not None:
            query = text(query)
        templates.append(
            {
                "id": positive(template.get("id"), digits=20),
                "name": text(template.get("name"), nonempty=True),
                "query": query,
                "quantity": positive(requirement.get("quantity")),
                "usedFace": (
                    int(positive(requirement["usedFace"], digits=8))
                    if requirement.get("usedFace") is not None
                    else None
                ),
                **constraints(requirement, reasons),
            }
        )
        reasons.add("templates")
    for produced in array(raw.get("produces")):
        if not isinstance(produced, dict):
            raise ValueError("Invalid produced outcome shape")
        feature = produced.get("feature")
        if not isinstance(feature, dict) or type(feature.get("uncountable")) is not bool:
            raise ValueError("Invalid combo outcome")
        outcomes.append(
            {
                "id": positive(feature.get("id"), digits=20),
                "name": text(feature.get("name"), nonempty=True),
                "status": text(feature.get("status"), nonempty=True),
                "uncountable": feature["uncountable"],
                "quantity": positive(produced.get("quantity")),
            }
        )
    if len({outcome["id"] for outcome in outcomes}) != len(outcomes):
        raise ValueError("Missing or duplicate combo outcomes")
    return {
        "id": identifier,
        "status": status,
        "ingredients": ingredients,
        "outcomeIds": [outcome["id"] for outcome in outcomes],
        "producedOutcomes": outcomes,
        "templates": templates,
        "unsupportedReasons": sorted(reasons),
        "mana": text(raw.get("manaNeeded")),
        "prerequisites": "\n".join(
            filter(
                None, [text(raw.get("easyPrerequisites")), text(raw.get("notablePrerequisites"))]
            )
        ),
        "steps": text(raw.get("description")),
        "notes": text(raw.get("notes")),
    }


class ComboAdapter:
    def __init__(
        self,
        path: Path,
        staging: Path,
        limits=DEFAULT_COMBO_LIMITS,
        *,
        import_deadline=None,
        _local=False,
    ):
        self.path, self.staging, self.limits = path, staging, limits
        self._local = _local
        self.import_deadline = import_deadline or time.monotonic() + limits.import_seconds
        self.metadata = {}

    def bounded(self, deadline=None):
        if time.monotonic() >= min(self.import_deadline, deadline or float("inf")):
            raise ValueError("Combo import deadline exceeded")
        total = self.path.stat().st_size
        total += sum(p.stat().st_size for p in self.staging.parent.glob(self.staging.name + "*"))
        if total > self.limits.staging_bytes:
            raise ValueError("Combo staging byte limit exceeded")

    def __enter__(self):
        self.bounded()
        if not self._local:
            deadline = min(self.import_deadline, time.monotonic() + self.limits.parse_seconds)
            self.metadata = _owned_stage(
                "parse",
                {
                    "path": str(self.path),
                    "staging": str(self.staging),
                    "limits": self.limits.__dict__,
                    "deadline": deadline,
                },
                deadline,
            )
            self.bounded(deadline)
            self.db = sqlite3.connect(self.staging)
            return self
        self.db = sqlite3.connect(self.staging)
        deadline = min(self.import_deadline, time.monotonic() + self.limits.parse_seconds)
        stage_deadline(self.db, deadline)
        try:
            self.db.executescript(
                "CREATE TABLE variants(id TEXT PRIMARY KEY,document TEXT);"
                "CREATE TABLE outcomes(id TEXT PRIMARY KEY,document TEXT);"
                "CREATE TABLE aliases(id TEXT PRIMARY KEY,target TEXT);"
            )
            records = ComboRecords(self.path, self.limits, import_deadline=deadline)
            for collection, raw in records:
                self.bounded(deadline)
                if collection == "aliases":
                    target = raw.get("variant")
                    if target is not None:
                        target = opaque_id(target)
                    if set(raw) != {"id", "variant"}:
                        raise ValueError("Unexpected alias shape")
                    self.db.execute(
                        "INSERT INTO aliases VALUES (?,?)", (opaque_id(raw.get("id")), target)
                    )
                else:
                    document = reduce_variant(raw)
                    self.db.execute(
                        "INSERT INTO variants VALUES (?,?)", (document["id"], json.dumps(document))
                    )
                    for outcome in document["producedOutcomes"]:
                        value = json.dumps(
                            {key: val for key, val in outcome.items() if key != "quantity"},
                            sort_keys=True,
                        )
                        previous = self.db.execute(
                            "SELECT document FROM outcomes WHERE id=?", (outcome["id"],)
                        ).fetchone()
                        if previous and previous[0] != value:
                            raise ValueError("Inconsistent outcome definition")
                        self.db.execute(
                            "INSERT OR IGNORE INTO outcomes VALUES (?,?)", (outcome["id"], value)
                        )
            if self.db.execute(
                "SELECT 1 FROM aliases a LEFT JOIN variants v ON a.target=v.id WHERE a.target "
                "IS NOT NULL AND v.id IS NULL LIMIT 1"
            ).fetchone():
                raise ValueError("Dangling combo alias")
            counts = {
                name + "Count": self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                for name, table in (
                    ("variant", "variants"),
                    ("outcome", "outcomes"),
                    ("alias", "aliases"),
                )
            }
            if not counts["variantCount"]:
                raise ValueError("Empty combo publication")
            version = text(records.metadata.get("version"), nonempty=True)
            if len(version) > 128:
                raise ValueError("Invalid combo source version")
            self.metadata = {
                **records.evidence(),
                **counts,
                "sourceTime": source_instant(records.metadata.get("timestamp")),
                "sourceVersion": version,
                "attribution": "Commander Spellbook",
                "sourceUrl": "https://commanderspellbook.com",
            }
            self.db.commit()
            self.bounded(deadline)
            return self
        except BaseException:
            self.db.close()
            raise

    def __exit__(self, *_):
        self.db.close()

    def rows(self, table, deadline):
        stage_deadline(self.db, deadline)
        for (document,) in self.db.execute(f"SELECT document FROM {table}"):
            self.bounded(deadline)
            yield json.loads(document)


class ComboPublisher:
    def __init__(self, database_url, limits=DEFAULT_COMBO_LIMITS):
        self.database_url, self.limits = database_url, limits

    def record_failure(self, cause):
        with connect(self.database_url, time.monotonic() + 10, 10) as connection:
            conn = _PublicationConnection(connection, connection.deadline)
            conn.execute(
                "INSERT INTO combo_state(id,refresh_status) VALUES(1,%s) ON CONFLICT(id) DO "
                "UPDATE SET refresh_status=EXCLUDED.refresh_status",
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

    def publish(self, adapter):
        try:
            adapter.db.commit()
            deadline = min(
                adapter.import_deadline, time.monotonic() + self.limits.publication_seconds
            )
            return _owned_stage(
                "publish",
                {
                    "path": str(adapter.path),
                    "staging": str(adapter.staging),
                    "limits": adapter.limits.__dict__,
                    "deadline": deadline,
                    "metadata": adapter.metadata,
                    "database_url": self.database_url,
                },
                deadline,
            )
        except Exception as cause:
            with suppress(Exception):
                self.record_failure(cause)
            raise

    def _publish(self, adapter):
        deadline = min(adapter.import_deadline, time.monotonic() + self.limits.publication_seconds)
        adapter.bounded(deadline)
        with connect(self.database_url, deadline, self.limits.connect_seconds) as connection:
            conn = _PublicationConnection(connection, deadline)
            conn.execute("SELECT pg_advisory_xact_lock(%s,%s)", PUBLISH_LOCK)
            conn.execute("INSERT INTO combo_state(id) VALUES(1) ON CONFLICT DO NOTHING")
            old = conn.execute(
                "SELECT p.id FROM combo_state s JOIN combo_publications p ON "
                "p.id=s.active_publication WHERE s.id=1 AND p.payload_digest=%s AND "
                "p.parser_version=%s AND p.policy_version=%s",
                (adapter.metadata["payloadDigest"], PARSER_VERSION, POLICY_VERSION),
            ).fetchone()
            status = Jsonb({"kind": "Succeeded", "attemptedAt": datetime.now(UTC).isoformat()})
            if old:
                conn.execute("UPDATE combo_state SET refresh_status=%s WHERE id=1", (status,))
                return {"publicationId": str(old[0]), "unchanged": True, **adapter.metadata}
            identifier = uuid4()
            conn.execute(
                "INSERT INTO "
                "combo_publications(id,descriptor,source_updated_at,source_version,payload_digest,"
                "decoded_digest,parser_version,policy_version,variant_count,outcome_count,"
                "alias_count) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    identifier,
                    Jsonb(adapter.metadata),
                    adapter.metadata["sourceTime"],
                    adapter.metadata["sourceVersion"],
                    adapter.metadata["payloadDigest"],
                    adapter.metadata["decompressedDigest"],
                    PARSER_VERSION,
                    POLICY_VERSION,
                    adapter.metadata["variantCount"],
                    adapter.metadata["outcomeCount"],
                    adapter.metadata["aliasCount"],
                ),
            )
            with conn.cursor().copy(
                "COPY combo_outcomes(publication_id,id,name,status,uncountable) FROM STDIN"
            ) as copy:
                for row in adapter.rows("outcomes", deadline):
                    copy.write_row(
                        (identifier, row["id"], row["name"], row["status"], row["uncountable"])
                    )
            with conn.cursor().copy(
                "COPY combo_variants(publication_id,id,document) FROM STDIN"
            ) as copy:
                for row in adapter.rows("variants", deadline):
                    copy.write_row((identifier, row["id"], Jsonb(row)))
            with conn.cursor().copy(
                "COPY "
                "combo_variant_ingredients(publication_id,variant_id,position,oracle_id,"
                "quantity,must_be_commander) "
                "FROM STDIN"
            ) as copy:
                for row in adapter.rows("variants", deadline):
                    for position, ingredient in enumerate(row["ingredients"]):
                        copy.write_row(
                            (
                                identifier,
                                row["id"],
                                position,
                                ingredient["oracleId"],
                                ingredient["quantity"],
                                ingredient["mustBeCommander"],
                            )
                        )
            with conn.cursor().copy(
                "COPY combo_variant_outcomes(publication_id,variant_id,outcome_id,quantity) "
                "FROM STDIN"
            ) as copy:
                for row in adapter.rows("variants", deadline):
                    for outcome in row["producedOutcomes"]:
                        copy.write_row((identifier, row["id"], outcome["id"], outcome["quantity"]))
            for table in (
                "combo_outcomes",
                "combo_variants",
                "combo_variant_ingredients",
                "combo_variant_outcomes",
            ):
                conn.execute(f"ANALYZE {table}")
            conn.execute(
                "UPDATE combo_state SET "
                "previous_publication=active_publication,active_publication=%s,refresh_status=%s "
                "WHERE id=1",
                (identifier, status),
            )
            conn.execute(
                "DELETE FROM combo_publications WHERE id NOT IN(SELECT active_publication "
                "FROM combo_state UNION SELECT previous_publication FROM combo_state WHERE "
                "previous_publication IS NOT NULL)"
            )
            adapter.bounded(deadline)
        return {"publicationId": str(identifier), "unchanged": False, **adapter.metadata}


def sync_combo(config, publisher):
    if not config.commander_spellbook_enabled:
        return True
    deadline = time.monotonic() + config.combo_limits.import_seconds
    publication_started = False
    try:
        config.data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="combo-", dir=config.data_dir) as directory:
            directory = Path(directory)
            path = directory / "variants.json.gz"
            transfer = download_combo(path, config.combo_limits, deadline)
            with ComboAdapter(
                path, directory / "stage.sqlite", config.combo_limits, import_deadline=deadline
            ) as adapter:
                adapter.metadata["transfer"] = transfer
                publication_started = True
                publisher.publish(adapter)
        return True
    except Exception as cause:
        if not publication_started:
            with suppress(Exception):
                publisher.record_failure(cause)
        log.error("Commander Spellbook refresh failed (%s)", type(cause).__name__)
        return False


def download_combo(path, limits, deadline):
    """Reap the owned HTTP process on deadline, including DNS and blocked disk I/O."""
    deadline = min(deadline, time.monotonic() + limits.download_seconds)
    return _owned_stage(
        "download", {"path": str(path), "limits": limits.__dict__, "deadline": deadline}, deadline
    )


def _owned_stage(action, payload, deadline):
    """Stop and reap the owned child before returning any interrupted stage."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError(f"Combo {action} deadline exceeded")
    code = "import json,sys; from worker.combo import _child_stage; _child_stage(json.load(sys.stdin))"
    process = subprocess.Popen(
        [sys.executable, "-c", code],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        start_new_session=True,
    )
    try:
        output, _ = process.communicate(
            json.dumps({"action": action, **payload}), timeout=max(0, deadline - time.monotonic())
        )
    except BaseException as cause:
        if process.poll() is None:
            process.terminate()
        process.communicate()
        if isinstance(cause, subprocess.TimeoutExpired):
            raise ValueError(f"Combo {action} deadline exceeded") from None
        raise
    if process.returncode:
        raise ValueError(f"Combo {action} failed")
    result = json.loads(output)
    if "error" in result:
        name = result["error"]
        exception = getattr(psycopg.errors, name, None)
        if exception is None:
            exception = {"IntegrityError": sqlite3.IntegrityError, "EOFError": EOFError}.get(
                name, ValueError
            )
        raise exception(f"Combo {action} failed ({name})")
    return result["result"]


def _stage_expired(_signum, _frame):
    raise TimeoutError("Combo stage deadline exceeded")


def _child_stage(payload):
    signal.signal(signal.SIGTERM, _stage_expired)
    signal.signal(signal.SIGALRM, _stage_expired)
    remaining = payload["deadline"] - time.monotonic()
    if remaining <= 0:
        json.dump({"error": "TimeoutError"}, sys.stdout)
        return
    signal.setitimer(signal.ITIMER_REAL, remaining)
    try:
        limits = ComboLimits(**payload["limits"])
        deadline = payload["deadline"]
        path = Path(payload["path"])
        if payload["action"] == "download":
            result = _download_combo(path, limits, deadline)
        elif payload["action"] == "parse":
            with ComboAdapter(
                path, Path(payload["staging"]), limits, import_deadline=deadline, _local=True
            ) as adapter:
                result = adapter.metadata
        elif payload["action"] == "publish":
            adapter = ComboAdapter(
                path, Path(payload["staging"]), limits, import_deadline=deadline, _local=True
            )
            adapter.metadata = payload["metadata"]
            adapter.db = sqlite3.connect(adapter.staging)
            try:
                result = ComboPublisher(payload["database_url"], limits)._publish(adapter)
            finally:
                adapter.db.close()
        else:
            raise ValueError("Invalid combo stage")
        json.dump({"result": result}, sys.stdout)
    except Exception as cause:
        json.dump({"error": type(cause).__name__}, sys.stdout)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


def _download_combo(path, limits, deadline):
    from dataclasses import replace

    limits = replace(limits, compressed_bytes=min(limits.compressed_bytes, limits.staging_bytes))
    with httpx.Client(
        headers={
            "accept-encoding": "identity",
            "User-Agent": "Spellbook public combo adapter (https://github.com/KyleDerZweite/spellbook)",
        },
        follow_redirects=True,
    ) as client:
        return download_artifact(client, BULK_URL, path, limits, import_deadline=deadline)
