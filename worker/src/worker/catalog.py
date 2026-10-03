from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from psycopg.types.json import Jsonb

from worker.bulk import _iter_bulk_cards
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
                conn.execute("SELECT active_generation FROM catalog_state LIMIT 1")
            return True
        except psycopg.Error:
            return False

    @staticmethod
    def _current_count(conn: psycopg.Connection, info: BulkDataInfo) -> int | None:
        row = conn.execute(
            "SELECT g.document_count FROM catalog_state s "
            "JOIN catalog_generations g ON g.id = s.active_generation "
            "WHERE s.id = 1 AND g.source_type = %s AND g.source_updated_at >= %s "
            "AND g.schema_version = %s AND g.document_count > 0 "
            "AND EXISTS (SELECT 1 FROM catalog_printings p WHERE p.generation_id = g.id)",
            (info.type, datetime.fromisoformat(info.updated_at), SCHEMA_VERSION),
        ).fetchone()
        return row[0] if row else None

    def is_current(self, info: BulkDataInfo) -> bool:
        with self._connect() as conn:
            return self._current_count(conn, info) is not None

    def publish(self, path: Path, info: BulkDataInfo) -> int:
        if info.type not in ("all_cards", "default_cards"):
            raise ValueError("Unsupported catalog source")
        with self._connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
            current = self._current_count(conn, info)
            if current is not None:
                return current
            generation = uuid4()
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
                "DELETE FROM catalog_generations WHERE id NOT IN "
                "(SELECT active_generation FROM catalog_state WHERE id = 1 "
                "UNION SELECT previous_generation FROM catalog_state "
                "WHERE id = 1 AND previous_generation IS NOT NULL)"
            )
        return count


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
