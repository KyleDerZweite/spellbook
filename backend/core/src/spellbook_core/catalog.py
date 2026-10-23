"""Active-generation Catalog search, printing projection and exact import resolution."""

import re
import time
from collections.abc import Mapping
from typing import cast

from psycopg import AsyncRawCursor

from .catalog_query import parse_catalog_search_request, search_sql
from .db import ConnectionPool, Transaction, transaction
from .errors import CatalogPrintingNotFoundError, ValidationError
from .models import CardDocument
from .validation import js_trim

_FIELDS = (
    "id",
    "game",
    "oracle_id",
    "name",
    "printed_name",
    "normalized_name",
    "lang",
    "released_at",
    "layout",
    "mana_cost",
    "cmc",
    "type_line",
    "oracle_text",
    "colors",
    "color_identity",
    "keywords",
    "card_types",
    "power",
    "toughness",
    "rarity",
    "set_code",
    "set_name",
    "collector_number",
    "image_uri",
    "image_uri_small",
    "is_foil_available",
    "is_nonfoil_available",
    "legalities",
    "back_face_name",
    "back_face_image_uri",
)


def _uuid(value: str) -> str:
    if not re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", value):
        raise ValidationError("Invalid catalog card ID")
    return value


def printing_dto(document: object) -> CardDocument:
    if not isinstance(document, dict):
        raise TypeError("Stored Catalog document must be an object")
    # Publication owns document validation. Preserve values and optional-field absence;
    # explicit projection prevents internal publication fields escaping the application.
    return cast(CardDocument, {field: document[field] for field in _FIELDS if field in document})


async def read_transaction_catalog_printing(tx: Transaction, printing_id: str) -> CardDocument:
    cursor = await tx.execute(
        "SELECT p.document FROM catalog_printings p "
        "JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id "
        "WHERE p.id=%s::uuid",
        (_uuid(printing_id),),
    )
    row = await cursor.fetchone()
    if not row:
        raise CatalogPrintingNotFoundError()
    return printing_dto(row[0])


class Catalog:
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    async def get_catalog_printing(self, printing_id: str) -> CardDocument:
        identifier = _uuid(printing_id)
        async with transaction(self._pool, read_only=True) as tx:
            return await read_transaction_catalog_printing(tx, identifier)

    async def search_catalog_request(self, request: object) -> dict[str, object]:
        input = parse_catalog_search_request(request)
        started = time.monotonic()
        sql, parameters = search_sql(input)
        async with transaction(self._pool, read_only=True) as tx, AsyncRawCursor(tx) as cursor:
            await cursor.execute(sql, parameters)
            row = await cursor.fetchone()
        assert row is not None
        result = _result(row, input.query, started)
        if input.facets:
            result["facets"] = row[3]
        return result

    async def search_catalog(
        self, query: str, limit: int = 20, offset: int = 0
    ) -> dict[str, object]:
        return await self.search_catalog_request(
            {"query": query, "limit": limit, "offset": offset}
        )

    async def get_printings(
        self, oracle_id: str, limit: int = 100, offset: int = 0
    ) -> dict[str, object]:
        identifier = _uuid(oracle_id)
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValidationError("Printing limit must be an integer between 1 and 100")
        parse_catalog_search_request({"limit": limit, "offset": offset})
        started = time.monotonic()
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                """
                WITH active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state
                WHERE id=1), matched AS MATERIALIZED (SELECT p.generation_id, p.id, p.set_code,
                p.collector_number, p.lang FROM catalog_printings p JOIN active a ON
                a.id=p.generation_id WHERE p.oracle_id=%s::uuid), page AS (SELECT generation_id,
                id, row_number() OVER(ORDER BY set_code, collector_number, lang, id) AS position
                FROM matched ORDER BY set_code, collector_number, lang, id LIMIT %s OFFSET %s)
                SELECT COALESCE((SELECT jsonb_agg(p.document ORDER BY page.position) FROM page
                JOIN catalog_printings p ON p.generation_id=page.generation_id AND p.id=page.id),
                '[]' ::jsonb), (SELECT count(*)::int FROM matched), (SELECT id FROM active)
                """,
                (identifier, limit, offset),
            )
            row = await cursor.fetchone()
        assert row is not None
        return _result(row, "", started)

    async def get_catalog_set_names(self, set_codes: list[str]) -> dict[str, str]:
        codes = list(dict.fromkeys(js_trim(code).lower() for code in set_codes if js_trim(code)))
        if not codes:
            return {}
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                """
                SELECT p.set_code, MIN(NULLIF(BTRIM(p.document->> 'set_name' ), '' )) AS set_name
                FROM catalog_printings p JOIN catalog_state s ON s.id=1 AND
                s.active_generation=p.generation_id WHERE p.set_code=ANY(%s::text[]) GROUP BY
                p.set_code
                """,
                (codes,),
            )
            rows = await cursor.fetchall()
        return {str(row[0]): str(row[1]) for row in rows if row[1]}

    async def resolve_catalog_candidates(self, line: Mapping[str, object]) -> list[CardDocument]:
        parameters: list[object] = [line["normalizedName"], str(line["name"]).lower()]
        printing = ""
        for key, column in [("setCode", "set_code"), ("collectorNumber", "collector_number")]:
            if value := line.get(key):
                parameters.append(str(value).lower() if key == "setCode" else value)
                printing += f" AND p.{column}=${len(parameters)}"
        selection = (
            "SELECT document FROM matched ORDER BY lang,id LIMIT 100"
            if line.get("setCode")
            else """
            SELECT document FROM (SELECT DISTINCT ON (oracle_id) document, oracle_id FROM matched
            ORDER BY oracle_id, (lang= 'en' ) DESC, document->> 'released_at' DESC, id) cards
            LIMIT 100
            """
        )
        async with transaction(self._pool, read_only=True) as tx, AsyncRawCursor(tx) as cursor:
            await cursor.execute(
                f"""
                WITH matched AS (
                    SELECT p.* FROM catalog_printings p
                    JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id
                    WHERE (p.normalized_name=$1
                        OR $1=ANY(string_to_array(p.normalized_name,' // '))
                        OR lower(p.printed_name)=$2
                        OR $2=ANY(string_to_array(lower(p.printed_name),' // ')))
                    {printing}
                ) {selection}
                """,
                parameters,
            )
            rows = await cursor.fetchall()
        return [printing_dto(row[0]) for row in rows]


def _result(row: tuple[object, ...], query: str, started: float) -> dict[str, object]:
    return {
        "hits": [printing_dto(document) for document in cast(list[object], row[0])],
        "query": query,
        "processingTimeMs": int((time.monotonic() - started) * 1000 + 0.5),
        "estimatedTotalHits": row[1],
        "generationId": str(row[2]) if row[2] is not None else None,
    }


def create_catalog(pool: ConnectionPool) -> Catalog:
    return Catalog(pool)
