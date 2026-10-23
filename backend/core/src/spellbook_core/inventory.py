"""Inventory/Groups use cases, snapshot reads and composable receipt-protected writes.

The caller owns pool lifetime and composed transactions. Construction performs no IO.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, NotRequired, TypedDict, cast
from uuid import uuid4

from psycopg import errors as pg_errors
from psycopg.rows import class_row
from psycopg.types.json import Jsonb

from .auth import SessionAuth
from .catalog import Catalog
from .db import ConnectionPool, Transaction, transaction
from .errors import (
    ActorError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
    RequestConflictError,
    ValidationError,
)
from .fingerprint import mutation_fingerprint
from .inventory_query import normalize_inventory_query, validate_revision
from .inventory_read import (
    _ENTRY_COLUMNS,
    InventoryLocation,
    InventoryPage,
    RevisionChanged,
    _entry,
    _EntryRow,
    read_location,
    read_page,
)
from .inventory_read import (
    InventoryEntry as InventoryEntry,
)
from .inventory_read import (
    InventoryEntryDetail as InventoryEntryDetail,
)
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
    js_trim,
    js_utf8,
    normalize_quantity,
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


class PatchOperation(TypedDict):
    op: Literal["patch"]
    entryId: str
    floor: Literal[0, 1]
    quantity: NotRequired[int]
    delta: NotRequired[int]
    notes: NotRequired[str]
    notesRevision: NotRequired[str]


class RemoveOperation(TypedDict):
    op: Literal["remove"]
    entryId: str
    expectedQuantity: NotRequired[int]


class CreateGroupOperation(TypedDict):
    op: Literal["group-create"]
    name: str


class RenameGroupOperation(TypedDict):
    op: Literal["group-rename"]
    groupId: str
    name: str


class DeleteGroupOperation(TypedDict):
    op: Literal["group-delete"]
    groupId: str


class MembershipOperation(TypedDict):
    op: Literal["memberships"]
    entryId: str
    groupIds: list[str]


class ReorderOperation(TypedDict):
    op: Literal["reorder"]
    entryId: str
    position: int


type Operation = (
    AddOperation
    | PatchOperation
    | RemoveOperation
    | CreateGroupOperation
    | RenameGroupOperation
    | DeleteGroupOperation
    | MembershipOperation
    | ReorderOperation
)


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


@dataclass(frozen=True, slots=True)
class InventoryIntent:
    request_id: str
    source: InventorySource
    operations: tuple[Operation, ...]


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
    note = _notes(item)
    if "notes" in note:
        operation["notes"] = note["notes"]
    if "notesRevision" in note:
        operation["notesRevision"] = note["notesRevision"]
    return operation


def _notes(item: dict[str, object]) -> dict[str, str]:
    if "notes" not in item:
        return {}
    result = {"notes": assert_bounded_text(item["notes"], "notes", 4000)}
    if item.get("notesRevision", MISSING) is not MISSING:
        revision = assert_bounded_text(item["notesRevision"], "notesRevision", 20)
        if not re.fullmatch(r"0|[1-9][0-9]*", revision):
            raise ValidationError("Invalid Notes revision")
        result["notesRevision"] = revision
    return result


def normalize_patch(value: object, floor: Literal[0, 1] = 1) -> PatchOperation:
    item = _record(value)
    entry_id = assert_uuid(item.get("entryId", MISSING), "entryId")
    has_quantity = item.get("quantity", MISSING) is not MISSING
    has_delta = item.get("delta", MISSING) is not MISSING
    if has_quantity and has_delta:
        raise ValidationError("Supply quantity or delta, not both")
    if not has_quantity and not has_delta and "notes" not in item:
        raise ValidationError("Supply a changed field")
    delta = normalize_quantity(item["delta"]) if has_delta else None
    if delta == 0:
        raise ValidationError("Delta must not be zero")
    operation: PatchOperation = {"op": "patch", "entryId": entry_id, "floor": floor}
    if has_quantity:
        operation["quantity"] = normalize_quantity(item["quantity"])
    if delta is not None:
        operation["delta"] = delta
    note = _notes(item)
    if "notes" in note:
        operation["notes"] = note["notes"]
    if "notesRevision" in note:
        operation["notesRevision"] = note["notesRevision"]
    return operation


def normalize_bulk_operation(value: object) -> Operation:
    item = _record(value)
    if item.get("op") == "add":
        return normalize_add(item)
    entry_id = assert_uuid(_record(item.get("target", MISSING)).get("entryId", MISSING), "entryId")
    if item.get("op") == "remove":
        return {"op": "remove", "entryId": entry_id}
    if item.get("op") == "decrement":
        return normalize_patch(
            {
                **item,
                "entryId": entry_id,
                "quantity": MISSING,
                "delta": -positive_quantity(item.get("quantity", MISSING)),
            },
            0,
        )
    if item.get("op") == "set":
        return normalize_patch({**item, "entryId": entry_id}, 0)
    raise ValidationError("Unsupported Inventory operation")


def _group_name(value: object) -> str:
    name = js_trim(assert_bounded_text(value, "name", 256))
    # Array.from in Node counts Unicode code points, including paired UTF-16 input.
    points = name.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")
    if not 1 <= len(points) <= 64:
        raise ValidationError("Group name must contain 1 to 64 characters")
    return name


def _change(
    entry: _EntryRow, delta: int, quantity: int | None = None, notes_revision: str | None = None
) -> InventoryChange:
    return {
        "entryId": entry.id,
        "catalogCardId": entry.catalog_card_id,
        "finish": entry.finish,
        "condition": entry.condition,
        "quantity": entry.quantity if quantity is None else quantity,
        "delta": delta,
        "notesRevision": entry.notes_revision if notes_revision is None else notes_revision,
    }


def _check_notes(entry: _EntryRow, operation: AddOperation | PatchOperation) -> None:
    if "notes" not in operation:
        return
    if "notesRevision" not in operation:
        raise ValidationError("notesRevision is required when editing Notes")
    if operation["notesRevision"] != entry.notes_revision:
        raise NotesConflictError(
            {"entryId": entry.id, "notes": entry.notes, "notesRevision": entry.notes_revision}
        )


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
            if operation["op"] != "add":
                continue
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
            if operation["op"] in {"patch", "remove", "memberships", "reorder"}:
                entry_ids.add(cast(PatchOperation, operation)["entryId"])
            if operation["op"] != "add":
                continue
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
        group_ids: set[str] = set()
        for operation in prepared.input.operations:
            if operation["op"] in ("group-rename", "group-delete"):
                group_ids.add(operation["groupId"])
            elif operation["op"] == "memberships":
                group_ids.update(operation["groupIds"])
        if group_ids:
            await tx.execute(
                "SELECT id FROM inventory_groups WHERE inventory_id=%s "
                "AND id=ANY(%s::uuid[]) ORDER BY id FOR UPDATE",
                (inventory_id, sorted(group_ids)),
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
        changed = False
        for operation in prepared.input.operations:
            changed = (
                await self._apply_operation(tx, prepared, inventory_id, operation, ack) or changed
            )
        if changed:
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
                _check_notes(existing, operation)
                if "notes" in operation:
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

    async def _apply_operation(
        self,
        tx: Transaction,
        prepared: PreparedInventoryMutation,
        inventory_id: str,
        operation: Operation,
        ack: InventoryAcknowledgement,
    ) -> bool:
        if operation["op"] == "add":
            added = await self._add(tx, prepared, inventory_id, operation)
            ack["changes"].append(_change(added, operation["quantity"]))
            return True
        now = _now()
        if operation["op"] == "group-create":
            row = await (
                await tx.execute(
                    "INSERT INTO inventory_groups(id,inventory_id,name) VALUES (%s,%s,%s) "
                    "RETURNING id::text,name",
                    (uuid4(), inventory_id, _sql_text(operation["name"])),
                )
            ).fetchone()
            if row is None:
                raise RuntimeError("Inventory group unavailable")
            ack["groups"].append({"groupId": str(row[0]), "name": str(row[1])})
            return True
        if operation["op"] in ("group-rename", "group-delete"):
            target = (operation["groupId"], inventory_id)
            row = await (
                await tx.execute(
                    "SELECT id::text,name FROM inventory_groups "
                    "WHERE id=%s AND inventory_id=%s FOR UPDATE",
                    target,
                )
            ).fetchone()
            if row is None:
                raise InventoryNotFoundError("Inventory group not found")
            if operation["op"] == "group-delete":
                await tx.execute(
                    "DELETE FROM inventory_groups WHERE id=%s AND inventory_id=%s", target
                )
                ack["removedGroupIds"].append(str(row[0]))
                return True
            ack["groups"].append({"groupId": str(row[0]), "name": operation["name"]})
            if row[1] == operation["name"]:
                return False
            await tx.execute(
                "UPDATE inventory_groups SET name=%s,updated_at=%s "
                "WHERE id=%s AND inventory_id=%s",
                (_sql_text(operation["name"]), now, *target),
            )
            return True
        assert operation["op"] in ("patch", "remove", "memberships", "reorder")
        target_entry = (operation["entryId"], inventory_id, prepared.account_id)
        where = "id=%s AND inventory_id=%s AND account_id=%s AND game='mtg'"
        async with tx.cursor(row_factory=class_row(_EntryRow)) as cursor:
            await cursor.execute(
                f"SELECT {_ENTRY_COLUMNS} FROM inventory_cards WHERE {where} FOR UPDATE",
                target_entry,
            )
            entry = await cursor.fetchone()
        if entry is None:
            raise InventoryNotFoundError("Inventory entry not found")
        if operation["op"] == "memberships":
            if operation["groupIds"]:
                groups = await (
                    await tx.execute(
                        "SELECT id FROM inventory_groups "
                        "WHERE inventory_id=%s AND id=ANY(%s::uuid[]) "
                        "ORDER BY id FOR KEY SHARE",
                        (inventory_id, operation["groupIds"]),
                    )
                ).fetchall()
                if len(groups) != len(operation["groupIds"]):
                    raise InventoryNotFoundError("Inventory group not found")
            current = await (
                await tx.execute(
                    "SELECT group_id::text FROM inventory_group_memberships WHERE entry_id=%s",
                    (entry.id,),
                )
            ).fetchall()
            ack["memberships"].append({"entryId": entry.id, "groupIds": operation["groupIds"]})
            if sorted(str(g[0]) for g in current) == operation["groupIds"]:
                return False
            await tx.execute(
                "DELETE FROM inventory_group_memberships WHERE entry_id=%s", (entry.id,)
            )
            for group_id in operation["groupIds"]:
                await tx.execute(
                    "INSERT INTO inventory_group_memberships(group_id,entry_id) VALUES (%s,%s)",
                    (group_id, entry.id),
                )
            return True
        if operation["op"] == "remove":
            if "expectedQuantity" in operation and entry.quantity != operation["expectedQuantity"]:
                raise InventoryQuantityChangedError(entry.quantity)
            await tx.execute(f"DELETE FROM inventory_cards WHERE {where}", target_entry)
            ack["removedEntryIds"].append(entry.id)
            ack["changes"].append(_change(entry, -entry.quantity, 0))
            return True
        if operation["op"] == "reorder":
            rows = await (
                await tx.execute(
                    "SELECT id::text,spellbook_position FROM inventory_cards "
                    "WHERE inventory_id=%s "
                    "ORDER BY spellbook_position,id",
                    (inventory_id,),
                )
            ).fetchall()
            ordered = [(str(row[0]), int(str(row[1]))) for row in rows]
            old = next(i for i, row in enumerate(ordered) if row[0] == entry.id)
            target_position = min(operation["position"], len(ordered) - 1)
            ack["changes"].append(_change(entry, 0))
            if old == target_position:
                return False
            ordered.insert(target_position, ordered.pop(old))
            changed = False
            for position, (identifier, previous) in enumerate(ordered):
                if previous != position:
                    changed = True
                    await tx.execute(
                        "UPDATE inventory_cards SET spellbook_position=%s,updated_at=%s "
                        "WHERE id=%s",
                        (position, now, identifier),
                    )
            return changed
        _check_notes(entry, operation)
        quantity = (
            max(operation["floor"], entry.quantity + operation["delta"])
            if "delta" in operation
            else operation.get("quantity", entry.quantity)
        )
        normalize_quantity(quantity)
        if quantity <= 0:
            await tx.execute(f"DELETE FROM inventory_cards WHERE {where}", target_entry)
            ack["removedEntryIds"].append(entry.id)
            ack["changes"].append(_change(entry, -entry.quantity, 0))
            return True
        notes = operation.get("notes", entry.notes)
        changed = quantity != entry.quantity or notes != entry.notes
        notes_revision = (
            str(int(entry.notes_revision) + 1) if notes != entry.notes else entry.notes_revision
        )
        if changed:
            await tx.execute(
                "UPDATE inventory_cards SET quantity=%s,notes=%s,notes_revision=%s,updated_at=%s "
                f"WHERE {where}",
                (quantity, _sql_text(notes), notes_revision, now, *target_entry),
            )
        ack["changes"].append(_change(entry, quantity - entry.quantity, quantity, notes_revision))
        return changed

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
        normalized: list[Operation] = []
        for value in operations:
            item = _record(value)
            if item.get("op") != "add":
                raise ValidationError("Unsupported Inventory operation")
            normalized.append(normalize_add(item))
        return await self._mutate(actor, request_id, normalized, source)

    async def _mutate(
        self,
        actor: Actor,
        request_id: object,
        operations: list[Operation],
        source: object = MISSING,
        game: object = MISSING,
    ) -> InventoryAcknowledgement:
        if game is not MISSING and game != "mtg":
            raise ValidationError("Only MTG Inventory is supported")
        intent = InventoryIntent(
            assert_request_id(request_id),
            normalize_source(source, INVENTORY_SOURCES, "web"),
            tuple(operations),
        )
        hash = mutation_fingerprint(
            {"kind": "inventory", "source": intent.source, "operations": operations}
        )
        prepared = await self.prepare(actor, intent, hash)
        if isinstance(prepared, RecordedInventoryMutation):
            return prepared.acknowledgement
        try:
            async with transaction(self._pool) as tx:
                await self.authorize(tx, prepared)
                recorded = await self.replay(tx, prepared)
                if recorded is not None:
                    return recorded
                acknowledgement = await self.apply(tx, prepared)
                await self.record_receipt(tx, prepared, acknowledgement)
            return acknowledgement
        except pg_errors.UniqueViolation as cause:
            if cause.diag.constraint_name == "inventory_groups_inventory_name_idx":
                raise ValidationError("A group with this name already exists") from None
            raise

    async def add(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [normalize_add(item)],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def bulk(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        operations = item.get("operations")
        if not isinstance(operations, list) or not 1 <= len(operations) <= 1000:
            raise ValidationError("Supply 1 to 1000 Inventory operations")
        normalized = [normalize_bulk_operation(op) for op in operations]
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            normalized,
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def patch_entry(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [normalize_patch(item)],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def remove(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        operation: RemoveOperation = {
            "op": "remove",
            "entryId": assert_uuid(item.get("entryId", MISSING), "entryId"),
            "expectedQuantity": positive_quantity(item.get("expectedQuantity", MISSING)),
        }
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [operation],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def create_group(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [{"op": "group-create", "name": _group_name(item.get("name", MISSING))}],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def rename_group(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        operation: RenameGroupOperation = {
            "op": "group-rename",
            "groupId": assert_uuid(item.get("groupId", MISSING), "groupId"),
            "name": _group_name(item.get("name", MISSING)),
        }
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [operation],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def delete_group(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [
                {
                    "op": "group-delete",
                    "groupId": assert_uuid(item.get("groupId", MISSING), "groupId"),
                }
            ],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def replace_memberships(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        groups = item.get("groupIds")
        if not isinstance(groups, list) or len(groups) > 1000:
            raise ValidationError("Invalid groupIds")
        entry_id = assert_uuid(item.get("entryId", MISSING), "entryId")
        operation: MembershipOperation = {
            "op": "memberships",
            "entryId": entry_id,
            "groupIds": sorted({assert_uuid(group, "groupId") for group in groups}),
        }
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [operation],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def reorder(self, actor: Actor, input: object) -> InventoryAcknowledgement:
        item = _record(input)
        position = normalize_quantity(item.get("position", MISSING))
        if position < 0:
            raise ValidationError("Invalid display position")
        return await self._mutate(
            actor,
            item.get("requestId", MISSING),
            [
                {
                    "op": "reorder",
                    "entryId": assert_uuid(item.get("entryId", MISSING), "entryId"),
                    "position": position,
                }
            ],
            item.get("source", MISSING),
            item.get("game", MISSING),
        )

    async def page(
        self, actor: Actor, input: object, expected_revision: str | None = None
    ) -> InventoryPage | RevisionChanged:
        current = await self._auth.require_actor(actor)
        query = normalize_inventory_query(input)
        validate_revision(expected_revision)
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            inventory_id, revision = await self._snapshot_inventory(tx, current.account_id)
            if expected_revision is not None and expected_revision != revision:
                return {"kind": "RevisionChanged", "revision": revision}
            return await read_page(tx, inventory_id, current.account_id, revision, query)

    async def locate(
        self, actor: Actor, input: object, entry_id: str, expected_revision: str
    ) -> InventoryLocation | RevisionChanged:
        current = await self._auth.require_actor(actor)
        query = normalize_inventory_query(input)
        if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", entry_id):
            raise ValidationError("entryId must be a UUID")
        validate_revision(expected_revision)
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            inventory_id, revision = await self._snapshot_inventory(tx, current.account_id)
            if expected_revision != revision:
                return {"kind": "RevisionChanged", "revision": revision}
            return await read_location(
                tx, inventory_id, current.account_id, revision, query, entry_id.lower()
            )

    async def _snapshot_inventory(
        self, tx: Transaction, account_id: str
    ) -> tuple[str | None, str]:
        row = await (
            await tx.execute(
                "SELECT id::text,revision::text FROM inventories "
                "WHERE account_id=%s AND game='mtg'",
                (account_id,),
            )
        ).fetchone()
        return (str(row[0]), str(row[1])) if row else (None, "0")

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
