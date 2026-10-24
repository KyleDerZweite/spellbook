"""Inventory snapshot queries. The application owns authentication and transactions."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, TypedDict

from psycopg.rows import class_row

from spellbook_core.db import Transaction, database_integer, iso_timestamp
from spellbook_core.errors import DatabaseIntegerRangeError, ValidationError
from spellbook_core.mtg.errors import InventoryCountError
from spellbook_core.mtg.inventory_query import InventoryQuery, inventory_query_key, selection


class InventoryEntry(TypedDict):
    id: str
    accountId: str
    inventoryId: str
    game: str
    catalogCardId: str
    canonicalCardId: str
    name: str
    setCode: str
    imageUri: str
    quantity: int
    finish: str
    condition: str
    notes: str
    notesRevision: str
    spellbookPosition: int
    createdAt: str
    updatedAt: str


class InventoryEntryDetail(TypedDict):
    entry: InventoryEntry
    memberships: list[str]
    revision: str


@dataclass(frozen=True, slots=True)
class _EntryRow:
    id: str
    inventory_id: str
    account_id: str
    game: str
    catalog_card_id: str
    canonical_card_id: str
    name: str
    set_code: str
    image_uri: str
    quantity: int
    finish: str
    condition: str
    notes: str
    notes_revision: str
    spellbook_position: int
    created_at: datetime
    updated_at: datetime


_ENTRY_COLUMNS = (
    "id::text,inventory_id::text,account_id,game,catalog_card_id,canonical_card_id,"
    "name,set_code,image_uri,quantity,finish,condition,notes,notes_revision::text,"
    "spellbook_position,created_at,updated_at"
)


def _entry(row: _EntryRow) -> InventoryEntry:
    return {
        "id": row.id,
        "accountId": row.account_id,
        "inventoryId": row.inventory_id,
        "game": row.game,
        "catalogCardId": row.catalog_card_id,
        "canonicalCardId": row.canonical_card_id,
        "name": row.name,
        "setCode": row.set_code,
        "imageUri": row.image_uri,
        "quantity": row.quantity,
        "finish": row.finish,
        "condition": row.condition,
        "notes": row.notes,
        "notesRevision": row.notes_revision,
        "spellbookPosition": row.spellbook_position,
        "createdAt": iso_timestamp(row.created_at),
        "updatedAt": iso_timestamp(row.updated_at),
    }


class InventoryGroupCount(TypedDict):
    id: str
    name: str
    entryCount: int
    quantity: int


class InventoryCounts(TypedDict):
    entryCount: int
    copyCount: int


class InventoryTotals(InventoryCounts):
    canonicalCardCount: int
    foilEntryCount: int
    setCount: int


class InventorySet(TypedDict):
    code: str
    name: str


class InventorySetProgress(TypedDict):
    setCode: str
    ownedCanonicalCount: int
    catalogCanonicalCount: int


class EntryMembership(TypedDict):
    entryId: str
    groupId: str


class RevisionChanged(TypedDict):
    kind: Literal["RevisionChanged"]
    revision: str


class InventoryLocation(TypedDict):
    kind: Literal["Location"]
    revision: str
    index: int | None


class InventoryPage(TypedDict):
    kind: Literal["Page"]
    query: InventoryQuery
    queryKey: str
    revision: str
    entries: list[InventoryEntry]
    memberships: list[EntryMembership]
    groups: list[InventoryGroupCount]
    groupPage: list[InventoryGroupCount]
    groupCount: int
    matching: InventoryCounts
    totals: InventoryTotals
    sets: list[InventorySet]
    setProgress: InventorySetProgress | None
    viewedAt: str


def count(value: object) -> int:
    try:
        result = database_integer(value)
        if result < 0:
            raise DatabaseIntegerRangeError()
        return result
    except DatabaseIntegerRangeError:
        raise InventoryCountError() from None


async def validate_group(tx: Transaction, inventory_id: str | None, query: InventoryQuery) -> None:
    if (
        query["group"]
        and await (
            await tx.execute(
                "SELECT id FROM inventory_groups WHERE id=%s AND inventory_id=%s",
                (query["group"], inventory_id),
            )
        ).fetchone()
        is None
    ):
        raise ValidationError("Inventory group not found")


async def read_location(
    tx: Transaction,
    inventory_id: str | None,
    account_id: str,
    revision: str,
    query: InventoryQuery,
    entry_id: str,
) -> InventoryLocation:
    await validate_group(tx, inventory_id, query)
    where, order, values = selection(query, inventory_id, account_id)
    rows = await (
        await tx.execute(
            f"SELECT position::text FROM (SELECT c.id,row_number() OVER(ORDER BY {order})-1 "
            f"AS position FROM inventory_cards c WHERE {where}) ordered WHERE id=%s",
            [*values, entry_id],
        )
    ).fetchall()
    return {"kind": "Location", "revision": revision, "index": count(rows[0][0]) if rows else None}


async def read_page(
    tx: Transaction,
    inventory_id: str | None,
    account_id: str,
    revision: str,
    query: InventoryQuery,
) -> InventoryPage:
    await validate_group(tx, inventory_id, query)
    where, order, values = selection(query, inventory_id, account_id)
    # Qualify the common projection because filtered reads alias the card table.
    columns = ",".join("c." + column for column in _ENTRY_COLUMNS.split(","))
    async with tx.cursor(row_factory=class_row(_EntryRow)) as cursor:
        await cursor.execute(
            f"SELECT {columns} FROM inventory_cards c WHERE {where} ORDER BY {order} "
            "LIMIT %s OFFSET %s",
            [*values, query["limit"], query["offset"]],
        )
        entries = [_entry(row) for row in await cursor.fetchall()]
    matching = await (
        await tx.execute(
            "SELECT count(*)::text,COALESCE(sum(c.quantity),0)::text "
            f"FROM inventory_cards c WHERE {where}",
            values,
        )
    ).fetchone()
    totals = await (
        await tx.execute(
            "SELECT count(*)::text,COALESCE(sum(quantity),0)::text,"
            'count(DISTINCT canonical_card_id COLLATE "C")::text,'
            "count(*) FILTER(WHERE finish='foil')::text,"
            'count(DISTINCT set_code COLLATE "C")::text FROM inventory_cards '
            "WHERE inventory_id=%s AND account_id=%s AND game='mtg'",
            (inventory_id, account_id),
        )
    ).fetchone()
    if matching is None or totals is None:
        raise RuntimeError("Inventory totals unavailable")
    group_rows = await (
        await tx.execute(
            "SELECT g.id::text,g.name,count(c.id)::text,COALESCE(sum(c.quantity),0)::text "
            "FROM inventory_groups g LEFT JOIN inventory_group_memberships m ON m.group_id=g.id "
            "LEFT JOIN inventory_cards c ON c.id=m.entry_id AND c.inventory_id=g.inventory_id "
            "AND c.account_id=%s AND c.game='mtg' WHERE g.inventory_id=%s GROUP BY g.id "
            'ORDER BY g.name COLLATE "inventory_root",g.id',
            (account_id, inventory_id),
        )
    ).fetchall()
    groups: list[InventoryGroupCount] = [
        {
            "id": str(row[0]),
            "name": str(row[1]),
            "entryCount": count(row[2]),
            "quantity": count(row[3]),
        }
        for row in group_rows
    ]
    memberships = await (
        await tx.execute(
            "SELECT m.entry_id::text,m.group_id::text FROM inventory_group_memberships m "
            "JOIN inventory_groups g ON g.id=m.group_id WHERE g.inventory_id=%s "
            "AND m.entry_id=ANY(%s::uuid[]) ORDER BY m.entry_id,m.group_id",
            (inventory_id, [e["id"] for e in entries]),
        )
    ).fetchall()
    sets = await (
        await tx.execute(
            'WITH owned AS (SELECT DISTINCT lower(set_code) COLLATE "C" AS code '
            "FROM inventory_cards WHERE inventory_id=%s AND account_id=%s AND game='mtg'), "
            "active AS MATERIALIZED (SELECT active_generation AS id "
            "FROM catalog_state WHERE id=1) "
            "SELECT o.code,COALESCE((CASE WHEN EXISTS(SELECT 1 FROM catalog_printings p "
            "WHERE p.generation_id=(SELECT id FROM active) "
            'AND p.set_code=o.code COLLATE "default") '
            "THEN (SELECT NULLIF(btrim(p.document->>'set_name'),'') FROM catalog_printings p "
            "WHERE p.generation_id=(SELECT id FROM active) "
            'AND p.set_code=o.code COLLATE "default" '
            "ORDER BY p.id LIMIT 1) END),(SELECT NULLIF(btrim(p.document->>'set_name'),'') "
            "FROM catalog_printings p JOIN active a ON a.id=p.generation_id "
            'WHERE p.set_code=o.code COLLATE "default" '
            "AND NULLIF(btrim(p.document->>'set_name'),'') IS NOT NULL ORDER BY p.id LIMIT 1),"
            'upper(o.code)) AS name FROM owned o ORDER BY o.code COLLATE "inventory_root"',
            (inventory_id, account_id),
        )
    ).fetchall()
    progress: InventorySetProgress | None = None
    if len(query["sets"]) == 1:
        code = query["sets"][0]
        row = await (
            await tx.execute(
                'SELECT count(DISTINCT canonical_card_id COLLATE "C")::text FROM inventory_cards '
                "WHERE inventory_id=%s AND lower(set_code)=%s AND account_id=%s AND game='mtg'",
                (inventory_id, code, account_id),
            )
        ).fetchone()
        # Both queries observe the same Inventory/Catalog snapshot.
        catalog = await (
            await tx.execute(
                "SELECT count(DISTINCT p.oracle_id)::text FROM catalog_printings p "
                "JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id "
                "WHERE p.set_code=%s",
                (code,),
            )
        ).fetchone()
        if row is None or catalog is None:
            raise RuntimeError("Inventory set progress unavailable")
        progress = {
            "setCode": code,
            "ownedCanonicalCount": count(row[0]),
            "catalogCanonicalCount": count(catalog[0]),
        }
    directory = [g for g in groups if not query["q"] or query["q"].lower() in g["name"].lower()]
    return {
        "kind": "Page",
        "query": query,
        "queryKey": inventory_query_key(query),
        "revision": revision,
        "entries": entries,
        "memberships": [{"entryId": str(m[0]), "groupId": str(m[1])} for m in memberships],
        "groups": groups,
        "groupPage": directory[query["offset"] : query["offset"] + query["limit"]],
        "groupCount": len(directory),
        "matching": {"entryCount": count(matching[0]), "copyCount": count(matching[1])},
        "totals": {
            "entryCount": count(totals[0]),
            "copyCount": count(totals[1]),
            "canonicalCardCount": count(totals[2]),
            "foilEntryCount": count(totals[3]),
            "setCount": count(totals[4]),
        },
        "sets": [{"code": str(s[0]), "name": str(s[1])} for s in sets],
        "setProgress": progress,
        "viewedAt": iso_timestamp(datetime.now(UTC)),
    }
