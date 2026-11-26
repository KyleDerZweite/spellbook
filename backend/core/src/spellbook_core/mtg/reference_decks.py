"""Global, account-independent Reference deck reads."""

from datetime import UTC, datetime
from typing import TypedDict, cast

from spellbook_core.db import ConnectionPool, transaction
from spellbook_core.errors import ValidationError
from spellbook_core.mtg.formats import MTG_FORMATS, MtgFormat
from spellbook_core.validation import assert_uuid, js_trim, utf16_length


class ReferenceDeckSourceStatus(TypedDict):
    source: str
    lastSyncedAt: str | None
    deckCount: int


class ReferenceDeckSummary(TypedDict):
    id: str
    source: str
    externalId: str
    name: str
    format: MtgFormat
    archetype: str | None
    sourceUrl: str | None
    metaShare: float | None
    sourceUpdatedAt: str | None
    syncedAt: str
    cardCount: int
    uniqueCardCount: int


class ReferenceDeckCard(TypedDict):
    oracleId: str
    name: str
    quantity: int
    role: str
    representativePrintingId: str | None
    imageUri: str | None
    imageUriSmall: str | None
    manaCost: str | None
    typeLine: str | None
    colors: list[str] | None
    colorIdentity: list[str] | None


class ReferenceDeckDetail(ReferenceDeckSummary):
    cards: list[ReferenceDeckCard]


class ReferenceDeckListResponse(TypedDict):
    decks: list[ReferenceDeckSummary]
    total: int
    limit: int
    offset: int
    availableFormats: list[MtgFormat]
    sources: list[ReferenceDeckSourceStatus]


def _iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return str(value)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _summary_from_row(row: tuple[object, ...]) -> ReferenceDeckSummary:
    synced_at = _iso(row[8])
    assert synced_at is not None
    return {
        "id": str(row[0]),
        "source": cast(str, row[1]),
        "externalId": cast(str, row[2]),
        "name": cast(str, row[3]),
        "format": cast(MtgFormat, row[4]),
        "archetype": cast(str | None, row[5]),
        "sourceUrl": cast(str | None, row[6]),
        "metaShare": float(row[7]) if isinstance(row[7], (int, float)) else None,
        "sourceUpdatedAt": _iso(row[9]),
        "syncedAt": synced_at,
        "cardCount": cast(int, row[10]),
        "uniqueCardCount": cast(int, row[11]),
    }


def _card_from_row(row: tuple[object, ...]) -> ReferenceDeckCard:
    document = row[4] if isinstance(row[4], dict) else None
    return {
        "oracleId": str(row[0]),
        "name": cast(str, row[1]),
        "quantity": cast(int, row[2]),
        "role": cast(str, row[3]),
        "representativePrintingId": str(document["id"]) if document and "id" in document else None,
        "imageUri": cast(str | None, document.get("image_uri")) if document else None,
        "imageUriSmall": cast(str | None, document.get("image_uri_small")) if document else None,
        "manaCost": cast(str | None, document.get("mana_cost")) if document else None,
        "typeLine": cast(str | None, document.get("type_line")) if document else None,
        "colors": cast(list[str] | None, document.get("colors")) if document else None,
        "colorIdentity": cast(list[str] | None, document.get("color_identity"))
        if document
        else None,
    }


class ReferenceDecks:
    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    async def list_reference_decks(
        self,
        *,
        format: str | None = None,
        source: str | None = None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ReferenceDeckListResponse:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValidationError("limit must be an integer between 1 and 100")
        if isinstance(offset, bool) or not isinstance(offset, int) or not 0 <= offset <= 100000:
            raise ValidationError("offset must be an integer between 0 and 100000")

        conditions: list[str] = []
        parameters: list[object] = []

        if format is not None:
            normalized_format = js_trim(format).lower()
            if normalized_format not in MTG_FORMATS:
                raise ValidationError("Unsupported reference deck format")
            conditions.append("d.format = %s")
            parameters.append(normalized_format)

        if source is not None:
            normalized_source = js_trim(source)
            if not normalized_source or len(normalized_source) > 64 or "\x00" in normalized_source:
                raise ValidationError("Invalid reference deck source")
            conditions.append("d.source = %s")
            parameters.append(normalized_source)

        if query is not None:
            if utf16_length(query) > 200 or "\x00" in query:
                raise ValidationError("query must be at most 200 characters")
            trimmed = js_trim(query)
            if trimmed:
                pattern = f"%{_escape_like(trimmed)}%"
                conditions.append(
                    "(d.name ILIKE %s ESCAPE '\\' "
                    "OR COALESCE(d.archetype, '') ILIKE %s ESCAPE '\\')"
                )
                parameters.extend([pattern, pattern])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            count_cursor = await tx.execute(
                f"SELECT count(*)::int FROM reference_decks d {where_clause}",
                tuple(parameters),
            )
            count_row = await count_cursor.fetchone()
            total = cast(int, count_row[0]) if count_row is not None else 0

            list_cursor = await tx.execute(
                f"""
                SELECT
                    d.id,
                    d.source,
                    d.external_id,
                    d.name,
                    d.format,
                    d.archetype,
                    d.source_url,
                    d.meta_share,
                    d.synced_at,
                    d.source_updated_at,
                    COALESCE(stats.card_count, 0)::int,
                    COALESCE(stats.unique_card_count, 0)::int
                FROM reference_decks d
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(c.quantity)::int AS card_count,
                        COUNT(DISTINCT c.oracle_id)::int AS unique_card_count
                    FROM reference_deck_cards c
                    WHERE c.reference_deck_id = d.id
                ) stats ON true
                {where_clause}
                ORDER BY d.meta_share DESC NULLS LAST, d.name ASC, d.id ASC
                LIMIT %s OFFSET %s
                """,
                (*parameters, limit, offset),
            )
            rows = await list_cursor.fetchall()

            sources_cursor = await tx.execute(
                """
                SELECT source, last_synced_at, deck_count
                FROM reference_deck_sources
                WHERE enabled = true OR deck_count > 0 OR last_synced_at IS NOT NULL
                ORDER BY source ASC
                """
            )
            source_rows = await sources_cursor.fetchall()

        return {
            "decks": [_summary_from_row(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "availableFormats": list(MTG_FORMATS),
            "sources": [
                {
                    "source": cast(str, row[0]),
                    "lastSyncedAt": _iso(row[1]),
                    "deckCount": cast(int, row[2]),
                }
                for row in source_rows
            ],
        }

    async def get_reference_deck(self, deck_id: str) -> ReferenceDeckDetail | None:
        identifier = assert_uuid(deck_id, "deckId")
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            deck_cursor = await tx.execute(
                """
                SELECT
                    d.id,
                    d.source,
                    d.external_id,
                    d.name,
                    d.format,
                    d.archetype,
                    d.source_url,
                    d.meta_share,
                    d.synced_at,
                    d.source_updated_at,
                    COALESCE(stats.card_count, 0)::int,
                    COALESCE(stats.unique_card_count, 0)::int
                FROM reference_decks d
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(c.quantity)::int AS card_count,
                        COUNT(DISTINCT c.oracle_id)::int AS unique_card_count
                    FROM reference_deck_cards c
                    WHERE c.reference_deck_id = d.id
                ) stats ON true
                WHERE d.id = %s::uuid
                """,
                (identifier,),
            )
            deck_row = await deck_cursor.fetchone()
            if deck_row is None:
                return None

            cards_cursor = await tx.execute(
                """
                WITH active AS MATERIALIZED (
                    SELECT active_generation AS id FROM catalog_state WHERE id = 1
                )
                SELECT
                    c.oracle_id,
                    c.card_name,
                    c.quantity,
                    c.role,
                    rep.document
                FROM reference_deck_cards c
                LEFT JOIN LATERAL (
                    SELECT p.document
                    FROM catalog_printings p
                    JOIN active a ON a.id = p.generation_id
                    WHERE p.oracle_id = c.oracle_id
                    ORDER BY (p.lang = 'en') DESC, p.document->>'released_at' DESC, p.id ASC
                    LIMIT 1
                ) rep ON true
                WHERE c.reference_deck_id = %s::uuid
                ORDER BY
                    CASE c.role
                        WHEN 'commander' THEN 0
                        WHEN 'companion' THEN 1
                        WHEN 'main' THEN 2
                        WHEN 'sideboard' THEN 3
                        ELSE 4
                    END ASC,
                    c.card_name ASC,
                    c.oracle_id ASC
                """,
                (identifier,),
            )
            card_rows = await cards_cursor.fetchall()

        summary = _summary_from_row(deck_row)
        return {
            **summary,
            "cards": [_card_from_row(row) for row in card_rows],
        }


def create_reference_decks(pool: ConnectionPool) -> ReferenceDecks:
    return ReferenceDecks(pool)
