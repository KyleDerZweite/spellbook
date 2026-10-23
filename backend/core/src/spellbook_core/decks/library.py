"""Account-scoped Deck Library pages, category filters, revisions and stable choices."""

import re
import unicodedata

from spellbook_core.auth import SessionAuth
from spellbook_core.db import (
    ConnectionPool,
    Transaction,
    database_integer,
    iso_timestamp,
    transaction,
)
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import serialize_json
from spellbook_core.models import Actor
from spellbook_core.validation import assert_uuid, js_trim, utf16_length

from .common import first, game, rows
from .models import DeckChoice, DeckChoicePage, Document

MEMBERSHIP = (
    "NOT c.suppressed AND (c.automatic_active OR w.state='Manual') AND "
    "(w.manual='Include' OR (w.manual IS NULL AND w.truth='True'))"
)


class DeckLibraryRevisionChanged(Exception):
    kind = "RevisionChanged"

    def __init__(self, revision: str):
        self.revision = revision
        super().__init__("Deck Library changed. Read the latest directory and retry.")


def integer(value: object, lower: int, upper: int, message: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not lower <= value <= upper
        or int(value) != value
    ):
        raise ValidationError(message)
    return int(value)


def parse_library_input(value: object = None, *, categories: bool = False) -> Document:
    if value is None:
        value = {}
    allowed = {
        "query",
        "format",
        "categoryVersionIds",
        "sort",
        "offset",
        "limit",
        "expectedRevision",
    }
    if categories:
        allowed.add("selectedVersionIds")
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValidationError("Invalid Deck Library options")
    query: Document = {}
    for key, maximum in (("query", 200), ("format", 100)):
        raw = value.get(key) if value.get(key) is not None else ""
        if not isinstance(raw, str) or utf16_length(raw) > maximum or "\0" in raw:
            raise ValidationError(f"Invalid {key}")
        query[key] = unicodedata.normalize("NFC", js_trim(raw))
    versions = value.get("categoryVersionIds")
    versions = [] if versions is None else versions
    if not isinstance(versions, list) or len(versions) > 100:
        raise ValidationError("Invalid category versions")
    try:
        query["categoryVersionIds"] = sorted(
            {assert_uuid(v, "category version") for v in versions}
        )
    except ValidationError:
        raise ValidationError("Invalid category versions") from None
    sort = "updated:desc" if value.get("sort") is None else value["sort"]
    if sort not in ("updated:desc", "name:asc", "name:desc"):
        raise ValidationError("Invalid Deck Library sort")
    query["sort"] = sort
    expected = value.get("expectedRevision")
    if "expectedRevision" in value and (
        not isinstance(expected, str)
        or not re.fullmatch(r"0|[1-9][0-9]*", expected)
        or len(expected) > 19
    ):
        raise ValidationError("Invalid Deck Library revision")
    return dict(
        query=query,
        offset=integer(
            0 if value.get("offset") is None else value["offset"],
            0,
            1000000,
            "Invalid Deck Library offset",
        ),
        limit=integer(
            40 if value.get("limit") is None else value["limit"],
            1,
            200,
            "Invalid Deck Library limit",
        ),
        expectedRevision=expected,
    )


def matching(account: str, query: Document) -> tuple[str, tuple[object, ...]]:
    sql = "d.account_id=%s AND d.game='mtg'"
    params: list[object] = [account]
    if query["query"]:
        sql += " AND d.name ILIKE %s ESCAPE E'\\\\'"
        params.append("%" + re.sub(r"[\\%_]", lambda m: "\\" + m[0], query["query"]) + "%")
    if query["format"]:
        sql += " AND d.format=%s"
        params.append(query["format"])
    if query["categoryVersionIds"]:
        sql += (
            (
                " AND EXISTS(SELECT 1 FROM deck_whole_categories c JOIN "
                "deck_whole_category_decisions w USING(deck_id,version_id) WHERE "
                "c.deck_id=d.id AND "
            )
            + MEMBERSHIP
            + " AND c.version_id=ANY(%s::uuid[]))"
        )
        params.append(query["categoryVersionIds"])
    return sql, tuple(params)


def ordering(query: Document) -> str:
    if query["sort"] == "updated:desc":
        return 'd.updated_at DESC,d.name COLLATE "inventory_root",d.id'
    return (
        'd.name COLLATE "inventory_root" '
        + ("DESC" if query["sort"] == "name:desc" else "ASC")
        + ",d.id"
    )


async def revision(tx: Transaction, account: str, expected: str | None) -> str:
    row = await first(
        tx,
        "SELECT revision::text FROM deck_library_state WHERE account_id=%s",
        (account,),
    )
    current = str(row.get("revision", "0"))
    if expected is not None and expected != current:
        raise DeckLibraryRevisionChanged(current)
    return current


class DeckLibrary:
    pool: ConnectionPool
    auth: SessionAuth

    async def get_deck_library(self, actor: Actor, input: object = None) -> Document:
        account = (await self.auth.require_actor(actor)).account_id
        parsed = parse_library_input(input)
        query, offset, limit = parsed["query"], parsed["offset"], parsed["limit"]
        where, params = matching(account, query)
        order = ordering(query)
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            current = await revision(tx, account, parsed["expectedRevision"])
            totals = await first(
                tx,
                f"""SELECT count(*)::text AS global_total,
                count(*) FILTER(WHERE {where})::text AS matching_total
                FROM decks d WHERE d.account_id=%s AND d.game='mtg'""",
                (*params, account),
            )
            items = await rows(
                tx,
                f"""SELECT d.id,d.name,d.format,d.created_at,d.updated_at,
            COALESCE(s.quantity,'0') AS quantity,COALESCE(s.image_uri,'') AS image_uri,
            COALESCE(b.badges,'[]'::jsonb) AS badges,COALESCE(b.total,0)::text AS category_total
            FROM (SELECT d.id,d.name,d.format,d.created_at,d.updated_at
            FROM decks d WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s) d
            LEFT JOIN LATERAL(SELECT sum(e.quantity)::text AS quantity,
            (array_agg(e.image_uri ORDER BY CASE WHEN e.role='commander' THEN 0 ELSE 1
            END,e.name,e.id))[1] AS image_uri
            FROM deck_cards e WHERE e.deck_id=d.id AND e.account_id=%s) s ON true
            LEFT JOIN LATERAL(SELECT count(*) AS total,jsonb_agg(m.badge ORDER BY
            m.display_order,m.version_id) FILTER(WHERE m.position<=3) AS badges FROM (
            SELECT c.display_order,c.version_id,row_number() OVER(ORDER BY
            c.display_order,c.version_id) AS position,
            jsonb_build_object('versionId',c.version_id,'originId',c.origin_id,
            'name',c.name,'historical',COALESCE(v.id<>c.version_id,true))
            AS badge
            FROM deck_whole_categories c JOIN deck_whole_category_decisions w
            USING(deck_id,version_id)
            LEFT JOIN category_definition_origins o ON o.id=c.origin_id AND o.account_id=%s
            LEFT JOIN category_definition_versions v ON v.origin_id=o.id AND
            v.version=o.current_version
            WHERE c.deck_id=d.id AND {MEMBERSHIP}) m) b ON true ORDER BY {order}""",
                (*params, limit, offset, account, account),
            )
            return dict(
                query=query,
                queryKey=serialize_json(query),
                revision=current,
                offset=offset,
                limit=limit,
                matchingTotal=database_integer(totals["matching_total"]),
                globalTotal=database_integer(totals["global_total"]),
                items=[
                    dict(
                        id=str(r["id"]),
                        name=r["name"],
                        format=r["format"],
                        createdAt=iso_timestamp(r["created_at"]),
                        updatedAt=iso_timestamp(r["updated_at"]),
                        quantity=database_integer(r["quantity"]),
                        imageUri=r["image_uri"],
                        categories=r["badges"],
                        remainingCategoryCount=max(0, database_integer(r["category_total"]) - 3),
                    )
                    for r in items
                ],
            )

    async def locate_deck(self, actor: Actor, deck_id: str, input: object = None) -> Document:
        account = (await self.auth.require_actor(actor)).account_id
        assert_uuid(deck_id, "deckId")
        parsed = parse_library_input(input)
        query = parsed["query"]
        where, params = matching(account, query)
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            current = await revision(tx, account, parsed["expectedRevision"])
            result = await first(
                tx,
                f"""WITH ranked AS(SELECT d.id,
                row_number() OVER(ORDER BY {ordering(query)})-1 AS position
                FROM decks d WHERE {where})
            SELECT count(*)::text AS total,max(position) FILTER(WHERE id=%s::uuid)::text AS
            "offset" FROM ranked""",
                (*params, deck_id),
            )
            return dict(
                query=query,
                queryKey=serialize_json(query),
                revision=current,
                deckId=deck_id,
                offset=None if result["offset"] is None else database_integer(result["offset"]),
                matchingTotal=database_integer(result["total"]),
            )

    async def get_deck_library_categories(self, actor: Actor, input: object = None) -> Document:
        account = (await self.auth.require_actor(actor)).account_id
        parsed = parse_library_input(input, categories=True)
        query, offset, limit = parsed["query"], parsed["offset"], parsed["limit"]
        raw = input if isinstance(input, dict) else {}
        selected = parse_library_input(
            dict(
                categoryVersionIds=raw.get("selectedVersionIds")
                if raw.get("selectedVersionIds") is not None
                else query["categoryVersionIds"]
            )
        )["query"]["categoryVersionIds"]
        where, params = matching(account, {**query, "categoryVersionIds": []})
        versions = """WITH versions AS(SELECT DISTINCT ON(c.version_id) c.version_id,c.origin_id,
        c.definition_snapshot->>'name' AS name,c.definition_snapshot->>'meaning' AS meaning,
        (c.definition_snapshot->>'version')::integer AS version FROM deck_whole_categories c
            JOIN decks d ON d.id=c.deck_id WHERE d.account_id=%s ORDER BY
            c.version_id,c.deck_id),
        choices AS(SELECT * FROM versions UNION ALL SELECT
            v.id,o.id,v.definition->>'name',v.definition->>'meaning',v.version FROM
            category_definition_origins o JOIN category_definition_versions v ON
            v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=%s AND
            o.scope='deck' AND NOT o.archived AND NOT EXISTS(SELECT 1 FROM versions s WHERE
            s.version_id=v.id))
        """
        fields = f"""SELECT x.*,COALESCE(v.id<>x.version_id,true) AS historical,
        (SELECT count(*)::text FROM decks d WHERE {where} AND EXISTS(
            SELECT 1 FROM deck_whole_categories c JOIN deck_whole_category_decisions w
            USING(deck_id,version_id) WHERE c.deck_id=d.id AND c.version_id=x.version_id
            AND {MEMBERSHIP})) AS count
        FROM choices x LEFT JOIN category_definition_origins o ON o.id=x.origin_id AND
            o.account_id=%s
        LEFT JOIN category_definition_versions v ON v.origin_id=o.id AND
            v.version=o.current_version
        """
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            current = await revision(tx, account, parsed["expectedRevision"])
            total = await first(
                tx, versions + "SELECT count(*)::text AS total FROM choices", (account, account)
            )
            values = await rows(
                tx,
                versions
                + fields
                + 'ORDER BY x.name COLLATE "inventory_root",x.version_id LIMIT %s OFFSET %s',
                (account, account, *params, account, limit, offset),
            )
            selected_rows = (
                await rows(
                    tx,
                    versions
                    + fields
                    + (
                        "WHERE x.version_id=ANY(%s::uuid[]) ORDER BY x.name COLLATE"
                        ' "inventory_root",x.version_id'
                    ),
                    (account, account, *params, account, selected),
                )
                if selected
                else []
            )

            def dto(row: Document) -> Document:
                return dict(
                    versionId=str(row["version_id"]),
                    originId=str(row["origin_id"]),
                    name=row["name"],
                    meaning=row["meaning"] or "",
                    version=database_integer(row["version"]),
                    historical=row["historical"] is True,
                    count=database_integer(row["count"]),
                )

            return dict(
                query=query,
                queryKey=serialize_json(query),
                revision=current,
                offset=offset,
                limit=limit,
                total=database_integer(total["total"]),
                items=[dto(r) for r in values],
                selected=[dto(r) for r in selected_rows],
            )

    async def get_deck_choices(self, actor: Actor, input: object = None) -> DeckChoicePage:
        account = (await self.auth.require_actor(actor)).account_id
        value = {} if input is None else input
        if not isinstance(value, dict) or set(value) - {
            "query",
            "offset",
            "limit",
            "selectedDeckId",
        }:
            raise ValidationError("Invalid Deck choice options")
        query = value.get("query", "")
        if not isinstance(query, str) or utf16_length(query) > 200 or "\0" in query:
            raise ValidationError("query must be a string of at most 200 characters")
        offset = integer(
            value.get("offset", 0), 0, 1000000, "offset must be an integer between 0 and 1000000"
        )
        limit = integer(value.get("limit", 20), 1, 50, "limit must be an integer between 1 and 50")
        selected = (
            assert_uuid(value["selectedDeckId"], "selectedDeckId")
            if "selectedDeckId" in value
            else None
        )
        pattern = "%" + re.sub(r"[\\%_]", lambda m: "\\" + m[0], query) + "%"
        async with transaction(self.pool, read_only=True) as tx:
            page = await rows(
                tx,
                (
                    "SELECT id::text,name,format FROM decks WHERE account_id=%s AND "
                    "game='mtg' AND name ILIKE %s ESCAPE E'\\\\' ORDER BY name COLLATE "
                    '"inventory_root",id LIMIT %s OFFSET %s'
                ),
                (account, pattern, limit + 1, offset),
            )
            chosen = (
                await first(
                    tx,
                    (
                        "SELECT id::text,name,format FROM decks WHERE account_id=%s"
                        " AND game='mtg' AND id=%s::uuid"
                    ),
                    (account, selected),
                )
                if selected
                else {}
            )
            return DeckChoicePage(
                items=[
                    DeckChoice(id=r["id"], name=r["name"], format=r["format"])
                    for r in page[:limit]
                ],
                nextOffset=next_deck_choice_offset(offset, limit, len(page) > limit),
                selected=DeckChoice(id=chosen["id"], name=chosen["name"], format=chosen["format"])
                if chosen
                else None,
            )

    async def get_recent_decks(
        self, actor: Actor, requested_game: str = "mtg"
    ) -> list[DeckChoice]:
        account = (await self.auth.require_actor(actor)).account_id
        game(requested_game)
        async with transaction(self.pool, read_only=True) as tx:
            return [
                DeckChoice(id=r["id"], name=r["name"], format=r["format"])
                for r in await rows(
                    tx,
                    "SELECT id::text,name,format FROM decks WHERE account_id=%s "
                    "AND game=%s ORDER BY updated_at DESC,name LIMIT 4",
                    (account, requested_game),
                )
            ]


def next_deck_choice_offset(offset: int, limit: int, has_more: bool) -> int | None:
    return offset + limit if has_more and offset + limit <= 1000000 else None
