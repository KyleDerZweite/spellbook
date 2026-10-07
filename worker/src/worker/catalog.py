from __future__ import annotations

import hashlib
import math
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from psycopg.types.json import Jsonb

from worker.bulk import _iter_bulk_cards
from worker.prices import EXTRACTOR_VERSION, MAPPING_VERSION, project_printing
from worker.scryfall import BulkDataInfo
from worker.transform import transform_card

SCHEMA_VERSION = 1
# Shared by every catalog publisher. Held until commit or rollback.
PUBLISH_LOCK = (1936747619, 1)


class CatalogPublisher:
    """Publish a complete Scryfall snapshot in one PostgreSQL transaction."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, connect_timeout=10)

    def health_check(self) -> bool:
        try:
            with self._connect() as conn:
                conn.execute(
                    "SELECT active_generation, active_publication "
                    "FROM catalog_state CROSS JOIN price_state LIMIT 1"
                )
            return True
        except psycopg.Error:
            return False

    @staticmethod
    def _current_count(conn: psycopg.Connection, info: BulkDataInfo) -> int | None:
        row = conn.execute(
            "SELECT g.document_count FROM catalog_state s "
            "JOIN catalog_generations g ON g.id = s.active_generation "
            "JOIN price_state ps ON ps.id=1 "
            "JOIN price_publications pp ON pp.id=ps.active_publication "
            "WHERE s.id = 1 AND g.source_type = %s AND g.source_updated_at >= %s "
            "AND g.schema_version = %s AND g.document_count > 0 "
            "AND pp.catalog_generation_id=g.id AND pp.extractor_version=%s "
            "AND pp.mapping_version=%s AND pp.source_updated_at=g.source_updated_at "
            "AND EXISTS (SELECT 1 FROM catalog_printings p WHERE p.generation_id = g.id)",
            (info.type, source_time(info), SCHEMA_VERSION, EXTRACTOR_VERSION, MAPPING_VERSION),
        ).fetchone()
        return row[0] if row else None

    def is_current(self, info: BulkDataInfo) -> bool:
        with self._connect() as conn:
            return self._current_count(conn, info) is not None

    def record_failure(self, source: str, cause: Exception) -> None:
        # This transaction intentionally follows the failed publication rollback.
        with self._connect() as conn:
            conn.execute(
                "UPDATE price_state SET refresh_status=%s WHERE id=1",
                (
                    Jsonb(
                        {
                            "kind": "Failed",
                            "source": source,
                            "attemptedAt": datetime.now(UTC).isoformat(),
                            "error": type(cause).__name__,
                        }
                    ),
                ),
            )

    def publish(self, path: Path, info: BulkDataInfo) -> int:
        try:
            return self._publish(path, info)
        except Exception as cause:
            with suppress(psycopg.Error):
                self.record_failure(info.type, cause)
            raise

    def restore_previous(self) -> None:
        with self._connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
            pair = conn.execute(
                "SELECT p.catalog_generation_id FROM price_state s "
                "JOIN price_publications p ON p.id=s.previous_publication "
                "JOIN catalog_generations g ON g.id=p.catalog_generation_id WHERE s.id=1"
            ).fetchone()
            if pair is None:
                raise ValueError("No recoverable Catalog/Price pair")
            conn.execute(
                "UPDATE catalog_state SET previous_generation=active_generation, "
                "active_generation=%s, updated_at=now() WHERE id=1",
                (pair[0],),
            )
            conn.execute(
                "UPDATE price_state SET active_publication=previous_publication, "
                "previous_publication=active_publication WHERE id=1"
            )

    def _publish(self, path: Path, info: BulkDataInfo) -> int:
        if info.type not in ("all_cards", "default_cards"):
            raise ValueError("Unsupported catalog source")
        with self._connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
            current = self._current_count(conn, info)
            if current is not None:
                return current
            generation, publication = uuid4(), uuid4()
            with path.open("rb") as payload:
                digest = hashlib.file_digest(payload, "sha256").hexdigest()
            descriptor = {
                "source": "Scryfall",
                "bulkType": info.type,
                "downloadUri": info.download_uri,
                "sourceTime": source_time(info).isoformat(),
                "timePrecision": "Instant",
            }
            conn.execute(
                "INSERT INTO price_publications (id,catalog_generation_id,descriptor,source_type,"
                "source_updated_at,payload_digest,extractor_version,mapping_version) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    publication,
                    generation,
                    Jsonb(descriptor),
                    info.type,
                    source_time(info),
                    digest,
                    EXTRACTOR_VERSION,
                    MAPPING_VERSION,
                ),
            )
            conn.execute(
                "INSERT INTO catalog_generations "
                "(id, source_type, source_updated_at, document_count, schema_version) "
                "VALUES (%s, %s, %s, 0, %s)",
                (generation, info.type, datetime.fromisoformat(info.updated_at), SCHEMA_VERSION),
            )
            count = 0
            with (
                path.open(encoding="utf-8") as source,
                conn.cursor().copy(
                    "COPY catalog_printings (generation_id, id, oracle_id, name, normalized_name, "
                    "printed_name, lang, set_code, collector_number, rarity, cmc, colors, "
                    "card_types, legalities, search_name, search_text, document) FROM STDIN"
                ) as copy,
            ):
                for raw in _iter_bulk_cards(source):
                    doc = transform_card(raw)
                    if doc is None:
                        continue
                    copy.write_row(_printing_row(generation, raw, doc))
                    count += 1
            if not count:
                raise ValueError("Bulk file contains no indexable cards")
            self._publish_prices(conn, path, publication)
            conn.execute(
                "UPDATE catalog_generations SET document_count = %s, published_at = now() "
                "WHERE id = %s",
                (count, generation),
            )
            conn.execute(
                "INSERT INTO catalog_state (id, active_generation) VALUES (1, %s) "
                "ON CONFLICT (id) DO UPDATE SET "
                "previous_generation = catalog_state.active_generation, "
                "active_generation = EXCLUDED.active_generation, updated_at = now()",
                (generation,),
            )
            conn.execute(
                "UPDATE price_state SET previous_publication=active_publication, "
                "active_publication=%s, refresh_status=%s WHERE id=1",
                (
                    publication,
                    Jsonb(
                        {
                            "kind": "Succeeded",
                            "source": info.type,
                            "attemptedAt": datetime.now(UTC).isoformat(),
                        }
                    ),
                ),
            )
            conn.execute(
                "DELETE FROM price_publications WHERE id NOT IN "
                "(SELECT active_publication FROM price_state UNION "
                "SELECT previous_publication FROM price_state "
                "WHERE previous_publication IS NOT NULL)"
            )
            conn.execute(
                "DELETE FROM catalog_generations WHERE id NOT IN "
                "(SELECT active_generation FROM catalog_state WHERE id = 1 "
                "UNION SELECT previous_generation FROM catalog_state "
                "WHERE id = 1 AND previous_generation IS NOT NULL)"
            )
        return count

    @staticmethod
    def _publish_prices(conn: psycopg.Connection, path: Path, publication: UUID) -> None:
        with (
            path.open(encoding="utf-8") as source,
            conn.cursor().copy(
                "COPY price_printings (publication_id,id,oracle_id,set_id,set_code,"
                "collector_number,"
                "lang,finishes,variant_key,identity,links) FROM STDIN"
            ) as copy,
        ):
            for raw in _iter_bulk_cards(source):
                if transform_card(raw) is None:
                    continue
                p = project_printing(raw)
                i = p["identity"]
                copy.write_row(
                    (
                        publication,
                        p["id"],
                        i["oracle_id"],
                        i["set_id"],
                        i["set"],
                        i["collector_number"],
                        i["lang"],
                        i["finishes"],
                        p["variant_key"],
                        Jsonb(i),
                        Jsonb(p["links"]),
                    )
                )
        with (
            path.open(encoding="utf-8") as source,
            conn.cursor().copy(
                "COPY price_observations (publication_id,printing_id,finish,measure,"
                "amount,raw_value,"
                "supported) FROM STDIN"
            ) as copy,
        ):
            for raw in _iter_bulk_cards(source):
                if transform_card(raw) is None:
                    continue
                p = project_printing(raw)
                for finish, field in (("nonfoil", "eur"), ("foil", "eur_foil")):
                    copy.write_row(
                        (
                            publication,
                            p["id"],
                            finish,
                            "prices." + field,
                            p["amounts"][finish],
                            p["raw_prices"][field],
                            p["supported"][finish],
                        )
                    )
        # COPY adds an unseen publication to existing statistics. Refresh before the
        # mapping join so PostgreSQL does not plan million-row inputs as one row.
        conn.execute("ANALYZE price_printings")
        conn.execute("ANALYZE price_observations")
        if conn.execute(
            "SELECT 1 FROM price_printings WHERE publication_id=%s "
            "GROUP BY set_id HAVING count(DISTINCT set_code)>1 LIMIT 1",
            (publication,),
        ).fetchone():
            raise ValueError("Contradictory edition identity")
        conn.execute(
            "WITH candidates AS (SELECT p.id,o.finish,count(e.id) AS matches,"
            "(array_agg(e.id) FILTER(WHERE e.id IS NOT NULL))[1] AS english "
            "FROM price_printings p JOIN price_observations o "
            "ON o.publication_id=p.publication_id AND o.printing_id=p.id "
            "LEFT JOIN price_printings e ON e.publication_id=p.publication_id "
            "AND e.variant_key=p.variant_key AND e.lang='en' AND p.lang!='en' "
            "AND e.id!=p.id AND o.supported "
            "AND o.finish=ANY(e.finishes) "
            "WHERE p.publication_id=%s GROUP BY p.id,o.finish) "
            "UPDATE price_observations o SET english_printing_id=CASE WHEN c.matches=1 "
            "THEN c.english END,mapping_reason=CASE WHEN p.variant_key IS NULL "
            "THEN 'MissingVariantEvidence' WHEN c.matches>1 THEN 'AmbiguousLanguageMapping' "
            "WHEN c.matches=0 THEN 'AmountMissing' END FROM candidates c,price_printings p "
            "WHERE o.publication_id=%s AND p.publication_id=o.publication_id "
            "AND p.id=o.printing_id AND o.printing_id=c.id AND o.finish=c.finish",
            (publication, publication),
        )


def source_time(info: BulkDataInfo) -> datetime:
    try:
        value = datetime.fromisoformat(info.updated_at)
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid source timestamp") from exc
    if value.tzinfo is None or value > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Invalid source timestamp")
    return value


def _printing_row(generation: UUID, raw: dict, doc: dict) -> tuple:
    try:
        printing_id = UUID(doc["id"])
        oracle_id = UUID(doc["oracle_id"])
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Catalog card has an invalid printing or oracle ID") from exc
    doc["id"], doc["oracle_id"] = str(printing_id), str(oracle_id)
    cmc = doc["cmc"]
    if isinstance(cmc, bool) or not isinstance(cmc, (int, float)) or not math.isfinite(cmc):
        raise ValueError("Catalog card has an invalid mana value")
    search_name = " ".join((doc["name"], doc["printed_name"])).strip().lower()
    text = [search_name, doc["type_line"], doc["oracle_text"], doc["set_name"]]
    for card in [raw, *(raw.get("card_faces") or [])]:
        text.extend(card.get(field) or "" for field in ("printed_text", "printed_type_line"))
    return (
        generation,
        printing_id,
        oracle_id,
        doc["name"],
        doc["normalized_name"],
        doc["printed_name"],
        doc["lang"],
        doc["set_code"],
        doc["collector_number"],
        doc["rarity"],
        cmc,
        doc["colors"],
        doc["card_types"],
        Jsonb(doc["legalities"]),
        search_name,
        " ".join(text),
        Jsonb(doc),
    )
