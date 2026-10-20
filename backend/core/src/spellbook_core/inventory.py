"""Receipt-protected Inventory adds and snapshot entry readback.

The caller owns pool lifetime and composed transactions. Construction performs no IO.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, NotRequired, TypedDict, cast
from uuid import uuid4

from psycopg.rows import class_row
from psycopg.types.json import Jsonb

from .auth import SessionAuth
from .catalog import Catalog
from .db import ConnectionPool, Transaction, iso_timestamp, transaction
from .errors import ActorError, NotesConflictError, RequestConflictError, ValidationError
from .fingerprint import mutation_fingerprint
from .models import Actor, CardDocument
from .validation import (
    INVENTORY_SOURCES,
    MISSING,
    InventorySource,
    assert_bounded_text,
    assert_condition,
    assert_finish,
    assert_request_id,
    assert_uuid,
    js_utf8,
    normalize_source,
    positive_quantity,
)


class AddOperation(TypedDict):
    op: Literal["add"]
    catalogCardId: str
    finish: str
    condition: str
    quantity: int
    notes: NotRequired[str]
    notesRevision: NotRequired[str]


class InventoryChange(TypedDict):
    entryId: str
    catalogCardId: str
    finish: str
    condition: str
    quantity: int
    delta: int
    notesRevision: str


class InventoryGroup(TypedDict):
    groupId: str
    name: NotRequired[str]


class InventoryMembership(TypedDict):
    entryId: str
    groupIds: list[str]


class InventoryAcknowledgement(TypedDict):
    requestId: str
    inventoryId: str | None
    revision: str
    changes: list[InventoryChange]
    removedEntryIds: list[str]
    groups: list[InventoryGroup]
    removedGroupIds: list[str]
    memberships: list[InventoryMembership]
    legacy: NotRequired[Literal[True]]


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
class InventoryIntent:
    request_id: str
    source: InventorySource
    operations: tuple[AddOperation, ...]


@dataclass(frozen=True, slots=True)
class PreparedInventoryMutation:
    actor: Actor
    account_id: str
    input: InventoryIntent
    hash: str
    printings: dict[str, CardDocument]


@dataclass(frozen=True, slots=True)
class RecordedInventoryMutation:
    acknowledgement: InventoryAcknowledgement


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


def _record(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValidationError("Invalid Inventory operation")
    return cast(dict[str, object], value)


def normalize_add(value: object) -> AddOperation:
    """Normalize the actual add intent, retaining only fields included in its hash."""
    item = _record(value)
    identifier = item.get("catalogCardId", MISSING)
    if identifier is MISSING or identifier is None:
        identifier = _record(item.get("card", MISSING)).get("catalogCardId", MISSING)
    operation: AddOperation = {
        "op": "add",
        "catalogCardId": assert_uuid(identifier, "catalogCardId"),
        "finish": assert_finish(item.get("finish", MISSING)),
        "condition": assert_condition(item.get("condition", MISSING)),
        "quantity": positive_quantity(item.get("quantity", MISSING)),
    }
    if "notes" in item:
        operation["notes"] = assert_bounded_text(item["notes"], "notes", 4000)
        revision = item.get("notesRevision", MISSING)
        if revision is not MISSING:
            normalized = assert_bounded_text(revision, "notesRevision", 20)
            if not re.fullmatch(r"0|[1-9][0-9]*", normalized):
                raise ValidationError("Invalid Notes revision")
            operation["notesRevision"] = normalized
    return operation


def _empty(request_id: str) -> InventoryAcknowledgement:
    return {
        "requestId": request_id,
        "inventoryId": None,
        "revision": "0",
        "changes": [],
        "removedEntryIds": [],
        "groups": [],
        "removedGroupIds": [],
        "memberships": [],
        "legacy": True,
    }


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


def _sql_text(value: str) -> str:
    # Node's PostgreSQL driver encodes isolated UTF-16 surrogates as U+FFFD.
    return js_utf8(value).decode("utf-8")


async def _receipt(
    tx: Transaction, account_id: str, intent: InventoryIntent, fingerprint: str
) -> InventoryAcknowledgement | None:
    row = await (
        await tx.execute(
            "SELECT request_hash,acknowledgement FROM inventory_mutation_requests "
            "WHERE account_id=%s AND request_id=%s LIMIT 1",
            (account_id, _sql_text(intent.request_id)),
        )
    ).fetchone()
    if row is None:
        return None
    if row[0] and row[0] != fingerprint:
        raise RequestConflictError()
    # Stored original receipts are authoritative, including older shapes. Never backfill.
    return (
        cast(InventoryAcknowledgement, row[1]) if row[1] is not None else _empty(intent.request_id)
    )


class Inventory:
    def __init__(self, pool: ConnectionPool, catalog: Catalog, auth: SessionAuth):
        self._pool = pool
        self._catalog = catalog
        self._auth = auth

    async def prepare(
        self, actor: Actor, intent: InventoryIntent, hash: str
    ) -> PreparedInventoryMutation | RecordedInventoryMutation:
        current = await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True) as tx:
            prior = await _receipt(tx, current.account_id, intent, hash)
        if prior is not None:
            return RecordedInventoryMutation(prior)
        printings: dict[str, CardDocument] = {}
        for operation in intent.operations:
            identifier = operation["catalogCardId"]
            if identifier not in printings:
                printings[identifier] = await self._catalog.get_catalog_printing(identifier)
        return PreparedInventoryMutation(actor, current.account_id, intent, hash, printings)

    async def authorize(self, tx: Transaction, prepared: PreparedInventoryMutation) -> str:
        await tx.execute(
            "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
            (prepared.account_id,),
        )
        current = await self._auth.require_actor(prepared.actor, tx)
        if current.account_id != prepared.account_id:
            raise ActorError()
        return current.account_id

    async def replay(
        self, tx: Transaction, prepared: PreparedInventoryMutation
    ) -> InventoryAcknowledgement | None:
        return await _receipt(tx, prepared.account_id, prepared.input, prepared.hash)

    async def apply(
        self, tx: Transaction, prepared: PreparedInventoryMutation
    ) -> InventoryAcknowledgement:
        row = await (
            await tx.execute(
                "SELECT id::text,revision::text FROM inventories "
                "WHERE account_id=%s AND game='mtg' LIMIT 1",
                (prepared.account_id,),
            )
        ).fetchone()
        if row is None:
            row = await (
                await tx.execute(
                    "INSERT INTO inventories(id,account_id,game) VALUES (%s,%s,'mtg') "
                    "ON CONFLICT DO NOTHING RETURNING id::text,revision::text",
                    (uuid4(), prepared.account_id),
                )
            ).fetchone()
            if row is None:
                row = await (
                    await tx.execute(
                        "SELECT id::text,revision::text FROM inventories "
                        "WHERE account_id=%s AND game='mtg' LIMIT 1",
                        (prepared.account_id,),
                    )
                ).fetchone()
        if row is None:
            raise RuntimeError("Inventory unavailable")
        locked = await (
            await tx.execute(
                "SELECT id::text,revision::text FROM inventories WHERE id=%s FOR UPDATE",
                (row[0],),
            )
        ).fetchone()
        if locked is None:
            raise RuntimeError("Inventory unavailable")
        inventory_id, revision = str(locked[0]), str(locked[1])
        entry_ids: set[str] = set()
        for operation in prepared.input.operations:
            matches = await (
                await tx.execute(
                    "SELECT id::text FROM inventory_cards WHERE inventory_id=%s "
                    "AND catalog_card_id=%s AND finish=%s AND condition=%s",
                    (
                        inventory_id,
                        operation["catalogCardId"],
                        operation["finish"],
                        operation["condition"],
                    ),
                )
            ).fetchall()
            entry_ids.update(str(match[0]) for match in matches)
        if entry_ids:
            await tx.execute(
                "SELECT id FROM inventory_cards WHERE inventory_id=%s "
                "AND id=ANY(%s::uuid[]) ORDER BY id FOR UPDATE",
                (inventory_id, sorted(entry_ids)),
            )
        ack: InventoryAcknowledgement = {
            "requestId": prepared.input.request_id,
            "inventoryId": inventory_id,
            "revision": revision,
            "changes": [],
            "removedEntryIds": [],
            "groups": [],
            "removedGroupIds": [],
            "memberships": [],
        }
        for operation in prepared.input.operations:
            entry = await self._add(tx, prepared, inventory_id, operation)
            ack["changes"].append(
                {
                    "entryId": entry.id,
                    "catalogCardId": entry.catalog_card_id,
                    "finish": entry.finish,
                    "condition": entry.condition,
                    "quantity": entry.quantity,
                    "delta": operation["quantity"],
                    "notesRevision": entry.notes_revision,
                }
            )
        if prepared.input.operations:
            await tx.execute(
                "UPDATE inventories SET revision=revision+1,updated_at=%s WHERE id=%s",
                (_now(), inventory_id),
            )
            ack["revision"] = str(int(revision) + 1)
        return ack

    async def _add(
        self,
        tx: Transaction,
        prepared: PreparedInventoryMutation,
        inventory_id: str,
        operation: AddOperation,
    ) -> _EntryRow:
        printing = prepared.printings.get(operation["catalogCardId"])
        if printing is None:
            raise ValidationError("Catalog printing is unavailable")
        if not printing[
            "is_foil_available" if operation["finish"] == "foil" else "is_nonfoil_available"
        ]:
            raise ValidationError("Printing does not support this finish")
        target = (inventory_id, printing["id"], operation["finish"], operation["condition"])
        where = "inventory_id=%s AND catalog_card_id=%s AND finish=%s AND condition=%s"
        now = _now()
        async with tx.cursor(row_factory=class_row(_EntryRow)) as cursor:
            await cursor.execute(
                f"SELECT {_ENTRY_COLUMNS} FROM inventory_cards WHERE {where} FOR UPDATE", target
            )
            existing = await cursor.fetchone()
            if existing:
                next_notes, notes_revision = existing.notes, existing.notes_revision
                if "notes" in operation:
                    if "notesRevision" not in operation:
                        raise ValidationError("notesRevision is required when editing Notes")
                    if operation["notesRevision"] != existing.notes_revision:
                        raise NotesConflictError(
                            {
                                "entryId": existing.id,
                                "notes": existing.notes,
                                "notesRevision": existing.notes_revision,
                            }
                        )
                    next_notes = operation["notes"]
                    if next_notes != existing.notes:
                        notes_revision = str(int(notes_revision) + 1)
                quantity = positive_quantity(existing.quantity + operation["quantity"])
                if "notes" in operation:
                    await cursor.execute(
                        "UPDATE inventory_cards SET "
                        "quantity=%s,notes=%s,notes_revision=%s,updated_at=%s "
                        f"WHERE {where} RETURNING {_ENTRY_COLUMNS}",
                        (quantity, _sql_text(next_notes), notes_revision, now, *target),
                    )
                else:
                    await cursor.execute(
                        "UPDATE inventory_cards SET quantity=%s,updated_at=%s "
                        f"WHERE {where} RETURNING {_ENTRY_COLUMNS}",
                        (quantity, now, *target),
                    )
            else:
                last = await (
                    await tx.execute(
                        "SELECT spellbook_position FROM inventory_cards WHERE inventory_id=%s "
                        "ORDER BY spellbook_position DESC LIMIT 1",
                        (inventory_id,),
                    )
                ).fetchone()
                position = int(str(last[0])) + 1 if last else 0
                if position > 2147483647:
                    raise ValidationError("Inventory display position range exhausted")
                await cursor.execute(
                    "INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,"
                    "canonical_card_id,name,set_code,image_uri,finish,condition,quantity,notes,"
                    "spellbook_position,created_at,updated_at) "
                    "VALUES (%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                    f"RETURNING {_ENTRY_COLUMNS}",
                    (
                        uuid4(),
                        inventory_id,
                        prepared.account_id,
                        printing["id"],
                        printing["oracle_id"],
                        printing["name"],
                        printing["set_code"],
                        printing["image_uri"],
                        operation["finish"],
                        operation["condition"],
                        operation["quantity"],
                        _sql_text(operation.get("notes", "")),
                        position,
                        now,
                        now,
                    ),
                )
            result = await cursor.fetchone()
        if result is None:
            raise RuntimeError("Inventory entry unavailable")
        return result

    async def record_receipt(
        self,
        tx: Transaction,
        prepared: PreparedInventoryMutation,
        ack: InventoryAcknowledgement,
    ) -> None:
        await tx.execute(
            "INSERT INTO inventory_mutation_requests"
            "(account_id,request_id,request_hash,acknowledgement,source,status) "
            "VALUES (%s,%s,%s,%s,%s,'applied')",
            (
                prepared.account_id,
                _sql_text(prepared.input.request_id),
                prepared.hash,
                Jsonb(ack),
                prepared.input.source,
            ),
        )

    async def add_items(
        self,
        actor: Actor,
        *,
        request_id: object,
        operations: object,
        source: object = MISSING,
    ) -> InventoryAcknowledgement:
        if not isinstance(operations, list) or not 1 <= len(operations) <= 1000:
            raise ValidationError("Supply 1 to 1000 Inventory operations")
        normalized: list[AddOperation] = []
        for value in operations:
            item = _record(value)
            if item.get("op") != "add":
                raise ValidationError("Unsupported Inventory operation")
            normalized.append(normalize_add(item))
        # Match Node bulk normalization order: operations precede request/source checks.
        intent = InventoryIntent(
            assert_request_id(request_id),
            normalize_source(source, INVENTORY_SOURCES, "web"),
            tuple(normalized),
        )
        hash = mutation_fingerprint(
            {
                "kind": "inventory",
                "source": intent.source,
                "operations": normalized,
            }
        )
        prepared = await self.prepare(actor, intent, hash)
        if isinstance(prepared, RecordedInventoryMutation):
            return prepared.acknowledgement
        async with transaction(self._pool) as tx:
            await self.authorize(tx, prepared)
            recorded = await self.replay(tx, prepared)
            if recorded is not None:
                return recorded
            acknowledgement = await self.apply(tx, prepared)
            await self.record_receipt(tx, prepared, acknowledgement)
        return acknowledgement

    async def get_entry(self, actor: Actor, entry_id: str) -> InventoryEntryDetail | None:
        current = await self._auth.require_actor(actor)
        if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", entry_id):
            raise ValidationError("entryId must be a UUID")
        identifier = entry_id.lower()
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            inventory = await (
                await tx.execute(
                    "SELECT id::text,revision::text FROM inventories "
                    "WHERE account_id=%s AND game='mtg'",
                    (current.account_id,),
                )
            ).fetchone()
            inventory_id = str(inventory[0]) if inventory else None
            revision = str(inventory[1]) if inventory else "0"
            async with tx.cursor(row_factory=class_row(_EntryRow)) as cursor:
                await cursor.execute(
                    f"SELECT {_ENTRY_COLUMNS} FROM inventory_cards "
                    "WHERE id=%s AND inventory_id=%s AND account_id=%s AND game='mtg'",
                    (identifier, inventory_id, current.account_id),
                )
                row = await cursor.fetchone()
            if row is None:
                return None
            memberships = await (
                await tx.execute(
                    "SELECT m.group_id::text FROM inventory_group_memberships m "
                    "JOIN inventory_groups g ON g.id=m.group_id "
                    "WHERE m.entry_id=%s AND g.inventory_id=%s ORDER BY m.group_id",
                    (identifier, inventory_id),
                )
            ).fetchall()
            return {
                "entry": _entry(row),
                "memberships": [str(m[0]) for m in memberships],
                "revision": revision,
            }


def _now() -> datetime:
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def create_inventory(pool: ConnectionPool, catalog: Catalog, auth: SessionAuth) -> Inventory:
    return Inventory(pool, catalog, auth)
