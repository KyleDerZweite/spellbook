"""Account-scoped Deck Library pages, revisions and stable choices."""

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
from spellbook_core.mtg.decks.common import first, game, rows
from spellbook_core.mtg.decks.models import (
    AvailabilityRequirement,
    DeckChoice,
    DeckChoicePage,
    Document,
)
from spellbook_core.mtg.decks.read import owned
from spellbook_core.mtg.decks.rules import allocate_deck_availability
from spellbook_core.validation import assert_uuid, js_trim, utf16_length


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


def parse_library_input(value: object = None) -> Document:
    if value is None:
        value = {}
    allowed = {
        "query",
        "format",
        "sort",
        "ownership",
        "offset",
        "limit",
        "expectedRevision",
    }
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValidationError("Invalid Deck Library options")
    query: Document = {}
    for key, maximum in (("query", 200), ("format", 100)):
        raw = value.get(key) if value.get(key) is not None else ""
        if not isinstance(raw, str) or utf16_length(raw) > maximum or "\0" in raw:
            raise ValidationError(f"Invalid {key}")
        query[key] = unicodedata.normalize("NFC", js_trim(raw))
    sort = "updated:desc" if value.get("sort") is None else value["sort"]
    if sort not in ("updated:desc", "name:asc", "name:desc"):
        raise ValidationError("Invalid Deck Library sort")
    query["sort"] = sort
    ownership = value.get("ownership", "all")
    if ownership not in ("all", "complete", "in-progress"):
        raise ValidationError("Invalid ownership")
    if ownership != "all":
        query["ownership"] = ownership
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
    if query.get("ownership", "all") != "all":
        # Canonical quantities establish completeness; exact-first allocation below owns segments.
        complete = """NOT EXISTS (SELECT 1 FROM deck_cards e WHERE e.deck_id=d.id
        AND e.account_id=d.account_id GROUP BY e.canonical_card_id
        HAVING sum(e.quantity) > COALESCE((SELECT sum(i.quantity) FROM inventory_cards i
        WHERE i.account_id=d.account_id AND i.game='mtg'
        AND i.canonical_card_id=e.canonical_card_id),0))"""
        sql += " AND " + (complete if query["ownership"] == "complete" else f"NOT ({complete})")
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
    inventory = await first(
        tx, "SELECT revision::text FROM inventories WHERE account_id=%s AND game='mtg'", (account,)
    )
    current = str(int(row.get("revision", "0")) + int(inventory.get("revision", "0")))
    if expected is not None and expected != current:
        raise DeckLibraryRevisionChanged(current)
    return current


async def advance_deck_library_revision(tx: Transaction, account: str) -> None:
    await tx.execute(
        "INSERT INTO deck_library_state(account_id,revision) VALUES(%s,1) "
        "ON CONFLICT(account_id) DO UPDATE SET revision=deck_library_state.revision+1",
        (account,),
    )


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
            COALESCE(s.quantity,'0') AS quantity,COALESCE(s.image_uri,'') AS image_uri
            FROM (SELECT d.id,d.name,d.format,d.created_at,d.updated_at
            FROM decks d WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s) d
            LEFT JOIN LATERAL(SELECT sum(e.quantity)::text AS quantity,
            (array_agg(e.image_uri ORDER BY CASE WHEN e.role='commander' THEN 0 ELSE 1
            END,e.name,e.id))[1] AS image_uri
            FROM deck_cards e WHERE e.deck_id=d.id AND e.account_id=%s) s ON true
            ORDER BY {order}""",
                (*params, limit, offset, account),
            )
            requirements = await rows(
                tx,
                "SELECT id,deck_id,catalog_card_id,canonical_card_id,quantity FROM deck_cards "
                "WHERE account_id=%s AND deck_id=ANY(%s::uuid[])",
                (account, [r["id"] for r in items]),
            )
            holdings = await owned(
                tx, account, list({r["canonical_card_id"] for r in requirements})
            )
            availability = {}
            for item in items:
                cards: list[AvailabilityRequirement] = [
                    AvailabilityRequirement(
                        id=str(r["id"]),
                        catalogCardId=r["catalog_card_id"],
                        canonicalCardId=r["canonical_card_id"],
                        quantity=r["quantity"],
                    )
                    for r in requirements
                    if r["deck_id"] == item["id"]
                ]
                allocations = allocate_deck_availability(cards, holdings)
                availability[str(item["id"])] = dict(
                    required=sum(c["quantity"] for c in cards),
                    exact=sum(a["exact"] for a in allocations.values()),
                    alternate=sum(a["alternate"] for a in allocations.values()),
                    missing=sum(a["missing"] for a in allocations.values()),
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
                        availability=availability[str(r["id"])],
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
