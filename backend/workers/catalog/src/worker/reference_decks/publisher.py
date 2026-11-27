"""PostgreSQL publisher for global Reference decks normalized to Canonical cards."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime

import psycopg

from worker.reference_decks.base import (
    MTG_FORMATS,
    VALID_ROLES,
    NormalizedDeckCard,
    NormalizedReferenceDeck,
    RawReferenceDeck,
)
from worker.transform import normalize_card_name

log = logging.getLogger(__name__)

# Distinct advisory lock key from CatalogPublisher (1936747619, 1).
REFERENCE_DECK_PUBLISH_LOCK = (1936747619, 3)


class ReferenceDeckPublisher:
    """Resolve raw reference decks to Canonical card oracle_ids and publish per source."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, connect_timeout=10)

    def _resolve_oracle_ids(
        self, conn: psycopg.Connection, normalized_names: set[str]
    ) -> dict[str, tuple[str, str]]:
        """Map normalized card names to (oracle_id, canonical_name) via active Catalog."""
        if not normalized_names:
            return {}
        names = sorted(normalized_names)
        rows = conn.execute(
            """
            WITH active AS MATERIALIZED (
                SELECT active_generation AS id FROM catalog_state WHERE id = 1
            ),
            direct AS (
                SELECT DISTINCT ON (p.normalized_name)
                    p.normalized_name AS lookup_key,
                    p.oracle_id::text AS oracle_id,
                    p.name AS canonical_name
                FROM catalog_printings p
                JOIN active a ON a.id = p.generation_id
                WHERE p.normalized_name = ANY(%s::text[])
                ORDER BY p.normalized_name, (p.lang = 'en') DESC, p.id ASC
            ),
            front_face AS (
                SELECT DISTINCT ON (split_part(p.normalized_name, ' // ', 1))
                    split_part(p.normalized_name, ' // ', 1) AS lookup_key,
                    p.oracle_id::text AS oracle_id,
                    p.name AS canonical_name
                FROM catalog_printings p
                JOIN active a ON a.id = p.generation_id
                WHERE p.normalized_name LIKE '%% // %%'
                  AND split_part(p.normalized_name, ' // ', 1) = ANY(%s::text[])
                ORDER BY split_part(p.normalized_name, ' // ', 1), (p.lang = 'en') DESC, p.id ASC
            )
            SELECT lookup_key, oracle_id, canonical_name FROM direct
            UNION ALL
            SELECT f.lookup_key, f.oracle_id, f.canonical_name
            FROM front_face f
            WHERE NOT EXISTS (SELECT 1 FROM direct d WHERE d.lookup_key = f.lookup_key)
            """,
            (names, names),
        ).fetchall()
        return {str(row[0]): (str(row[1]), str(row[2])) for row in rows}

    def _normalize_decks(
        self, conn: psycopg.Connection, raw_decks: Sequence[RawReferenceDeck]
    ) -> list[NormalizedReferenceDeck]:
        all_names: set[str] = set()
        for deck in raw_decks:
            for card in deck.cards:
                normalized = normalize_card_name(card.name)
                if normalized:
                    all_names.add(normalized)

        oracle_map = self._resolve_oracle_ids(conn, all_names)
        normalized_decks: list[NormalizedReferenceDeck] = []

        for deck in raw_decks:
            if deck.format not in MTG_FORMATS:
                continue
            aggregated: dict[tuple[str, str], tuple[str, int]] = {}
            unresolved = 0
            for card in deck.cards:
                if card.role not in VALID_ROLES or card.quantity < 1:
                    continue
                key_name = normalize_card_name(card.name)
                resolved = oracle_map.get(key_name)
                if resolved is None:
                    unresolved += 1
                    continue
                oracle_id, canonical_name = resolved
                slot = (oracle_id, card.role)
                existing = aggregated.get(slot)
                if existing is None:
                    aggregated[slot] = (canonical_name[:200], min(1000, card.quantity))
                else:
                    aggregated[slot] = (existing[0], min(1000, existing[1] + card.quantity))

            if unresolved:
                log.warning(
                    "Skipping reference deck %s/%s with %d unresolved card names",
                    deck.source,
                    deck.external_id,
                    unresolved,
                )
                continue
            if not aggregated:
                continue

            normalized_cards = tuple(
                NormalizedDeckCard(
                    oracle_id=oracle_id,
                    card_name=card_name,
                    quantity=qty,
                    role=role,
                )
                for (oracle_id, role), (card_name, qty) in sorted(aggregated.items())
            )
            normalized_decks.append(
                NormalizedReferenceDeck(
                    source=deck.source,
                    external_id=deck.external_id,
                    name=deck.name.strip()[:200],
                    format=deck.format,
                    cards=normalized_cards,
                    archetype=deck.archetype.strip()[:200] if deck.archetype else None,
                    source_url=deck.source_url[:1000] if deck.source_url else None,
                    meta_share=deck.meta_share,
                    source_updated_at=deck.source_updated_at,
                )
            )
        return normalized_decks

    def set_enabled(self, source: str, enabled: bool) -> None:
        now = datetime.now(UTC)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reference_deck_sources (source, enabled, updated_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (source) DO UPDATE
                SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
                """,
                (source, enabled, now),
            )

    def record_failure(self, source: str, cause: Exception) -> None:
        now = datetime.now(UTC)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reference_deck_sources (
                    source, enabled, last_attempt_at, last_status, last_error, updated_at
                )
                VALUES (%s, true, %s, 'failed', %s, %s)
                ON CONFLICT (source) DO UPDATE
                SET enabled = true,
                    last_attempt_at = EXCLUDED.last_attempt_at,
                    last_status = 'failed',
                    last_error = EXCLUDED.last_error,
                    updated_at = EXCLUDED.updated_at
                """,
                (source, now, type(cause).__name__, now),
            )

    def publish_source(self, source: str, raw_decks: Sequence[RawReferenceDeck]) -> int:
        """Atomically publish all normalized reference decks for one source."""
        now = datetime.now(UTC)
        with self._connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", REFERENCE_DECK_PUBLISH_LOCK)
            active = conn.execute(
                "SELECT active_generation FROM catalog_state WHERE id = 1"
            ).fetchone()
            if active is None or active[0] is None:
                raise RuntimeError("Active Catalog generation is required before publishing decks")
            normalized = self._normalize_decks(conn, raw_decks)
            if raw_decks and not normalized:
                raise ValueError(
                    "No reference decks resolved cleanly against the active Catalog generation"
                )
            active_external_ids: list[str] = []

            for deck in normalized:
                active_external_ids.append(deck.external_id)
                row = conn.execute(
                    """
                    INSERT INTO reference_decks (
                        source, external_id, name, format, archetype,
                        source_url, meta_share, source_updated_at, synced_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source, external_id) DO UPDATE
                    SET name = EXCLUDED.name,
                        format = EXCLUDED.format,
                        archetype = EXCLUDED.archetype,
                        source_url = EXCLUDED.source_url,
                        meta_share = EXCLUDED.meta_share,
                        source_updated_at = EXCLUDED.source_updated_at,
                        synced_at = EXCLUDED.synced_at,
                        updated_at = EXCLUDED.updated_at
                    RETURNING id
                    """,
                    (
                        source,
                        deck.external_id,
                        deck.name,
                        deck.format,
                        deck.archetype,
                        deck.source_url,
                        deck.meta_share,
                        deck.source_updated_at,
                        now,
                        now,
                    ),
                ).fetchone()
                assert row is not None
                deck_id = row[0]

                conn.execute(
                    "DELETE FROM reference_deck_cards WHERE reference_deck_id = %s",
                    (deck_id,),
                )
                with conn.cursor() as cursor:
                    cursor.executemany(
                        """
                        INSERT INTO reference_deck_cards (
                            reference_deck_id, oracle_id, role, quantity, card_name
                        )
                        VALUES (%s, %s::uuid, %s, %s, %s)
                        """,
                        [
                            (deck_id, card.oracle_id, card.role, card.quantity, card.card_name)
                            for card in deck.cards
                        ],
                    )

            if active_external_ids:
                conn.execute(
                    """
                    DELETE FROM reference_decks
                    WHERE source = %s AND NOT (external_id = ANY(%s::text[]))
                    """,
                    (source, active_external_ids),
                )
            else:
                conn.execute("DELETE FROM reference_decks WHERE source = %s", (source,))

            conn.execute(
                """
                INSERT INTO reference_deck_sources (
                    source, enabled, last_synced_at, last_attempt_at,
                    last_status, last_error, deck_count, updated_at
                )
                VALUES (%s, true, %s, %s, 'ok', NULL, %s, %s)
                ON CONFLICT (source) DO UPDATE
                SET enabled = true,
                    last_synced_at = EXCLUDED.last_synced_at,
                    last_attempt_at = EXCLUDED.last_attempt_at,
                    last_status = 'ok',
                    last_error = NULL,
                    deck_count = EXCLUDED.deck_count,
                    updated_at = EXCLUDED.updated_at
                """,
                (source, now, now, len(normalized), now),
            )
            return len(normalized)
