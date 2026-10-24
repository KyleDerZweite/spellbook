"""Deck mutations, original receipts and Category effects share one transaction."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import read_transaction_catalog_printing
from spellbook_core.mtg.categories import (
    category_transaction,
    ensure_entry_category_initialization,
    queue_whole_deck_evaluation,
    require_category_merge_preview,
)
from spellbook_core.mtg.categories.common import advance_deck_library_revision
from spellbook_core.mtg.decks.common import (
    authorize_write,
    card_identity,
    deck_dto,
    first,
    game,
    normalize_operations,
    require_deck,
    rows,
    text,
)
from spellbook_core.mtg.decks.models import Change, Deck, DeckAcknowledgement, Document
from spellbook_core.mtg.errors import DeckNotFoundError, DescriptionConflictError
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import (
    DECK_SOURCES,
    MISSING,
    assert_deck_role,
    assert_request_id,
    js_trim,
    normalize_quantity,
    normalize_source,
)


@dataclass
class Applied:
    change: Change
    changed: bool
    removed: str | None = None
    initialize: bool = False


def change(row: Document, quantity: int, delta: int) -> Change:
    return Change(
        entryId=str(row["id"]),
        catalogCardId=row["catalog_card_id"],
        role=row["role"],
        quantity=quantity,
        delta=delta,
    )


async def apply_operation(
    tx: Transaction,
    account: str,
    deck_id: str,
    operation: Document,
    now: datetime,
    resolved: dict[str, CardDocument],
    floor: int,
) -> Applied:
    op = operation["op"]
    if op == "add":
        printing = resolved.get(operation["card"]["catalogCardId"])
        if printing is None:
            raise ValidationError("Printing not found")
        identity: Document = dict(card_identity(printing))
        role = operation.get("role") or "main"
        before = await first(
            tx,
            (
                "SELECT * FROM deck_cards WHERE deck_id=%s::uuid AND "
                "catalog_card_id=%s AND role=%s LIMIT 1"
            ),
            (deck_id, identity["catalogCardId"], role),
        )
        normalize_quantity(before.get("quantity", 0) + operation["quantity"])
        saved = await first(
            tx,
            """INSERT INTO deck_cards(id,account_id,deck_id,game,catalog_card_id,
            canonical_card_id,name,set_code,image_uri,quantity,role,created_at,updated_at)
            VALUES(%s::uuid,%s,%s::uuid,'mtg',%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT(deck_id,catalog_card_id,role) DO UPDATE SET
            canonical_card_id=EXCLUDED.canonical_card_id,name=EXCLUDED.name,
            set_code=EXCLUDED.set_code,image_uri=EXCLUDED.image_uri,
            quantity=deck_cards.quantity+EXCLUDED.quantity,updated_at=EXCLUDED.updated_at
            RETURNING *""",
            (
                str(uuid4()),
                account,
                deck_id,
                identity["catalogCardId"],
                identity["canonicalCardId"],
                identity["name"],
                identity["setCode"],
                identity["imageUri"],
                operation["quantity"],
                role,
                now,
                now,
            ),
        )
        return Applied(
            change(saved, saved["quantity"], saved["quantity"] - before.get("quantity", 0)),
            True,
            initialize=not before and role == "main",
        )
    entry = await first(
        tx,
        (
            "SELECT * FROM deck_cards WHERE id=%s::uuid AND "
            "deck_id=%s::uuid AND account_id=%s LIMIT 1"
        ),
        (operation["target"]["entryId"], deck_id, account),
    )
    if not entry:
        raise DeckNotFoundError()
    if op in ("move", "replace"):
        identity = dict(
            catalogCardId=entry["catalog_card_id"],
            canonicalCardId=entry["canonical_card_id"],
            name=entry["name"],
            setCode=entry["set_code"],
            imageUri=entry["image_uri"],
        )
        if op == "replace":
            printing = resolved.get(operation["catalogCardId"])
            if printing is None:
                raise ValidationError("Printing not found")
            if printing["oracle_id"] != entry["canonical_card_id"]:
                raise ValidationError("Choose a printing of the same card")
            identity = dict(card_identity(printing))
        quantity = operation["quantity"] if op == "replace" else entry["quantity"]
        role = operation["role"]
        destination = await first(
            tx,
            (
                "SELECT * FROM deck_cards WHERE deck_id=%s::uuid AND "
                "catalog_card_id=%s AND role=%s LIMIT 1"
            ),
            (deck_id, identity["catalogCardId"], role),
        )
        if destination and destination["id"] != entry["id"]:
            await require_category_merge_preview(
                tx,
                dict(
                    deckId=deck_id,
                    entryId=str(entry["id"]),
                    catalogCardId=identity["catalogCardId"],
                    role=role,
                    quantity=quantity,
                ),
                operation.get("categoryPreview"),
            )
            normalize_quantity(destination["quantity"] + quantity)
            saved = await first(
                tx,
                "UPDATE deck_cards SET quantity=%s,updated_at=%s WHERE id=%s::uuid RETURNING *",
                (destination["quantity"] + quantity, now, destination["id"]),
            )
            await tx.execute("DELETE FROM deck_cards WHERE id=%s::uuid", (entry["id"],))
            return Applied(
                change(saved, saved["quantity"], quantity), True, removed=str(entry["id"])
            )
        saved = await first(
            tx,
            (
                "UPDATE deck_cards SET "
                "catalog_card_id=%s,canonical_card_id=%s,name=%s,set_code=%s,image_uri=%s,quantity=%s,role=%s,updated_at=%s"
                " WHERE id=%s::uuid RETURNING *"
            ),
            (
                identity["catalogCardId"],
                identity["canonicalCardId"],
                identity["name"],
                identity["setCode"],
                identity["imageUri"],
                quantity,
                role,
                now,
                entry["id"],
            ),
        )
        changed = (
            quantity != entry["quantity"]
            or saved["catalog_card_id"] != entry["catalog_card_id"]
            or role != entry["role"]
        )
        return Applied(
            change(saved, quantity, quantity - entry["quantity"]),
            changed,
            initialize=entry["role"] != "main" and role == "main",
        )
    if op == "remove":
        quantity = 0
    elif op == "increment":
        quantity = entry["quantity"] + operation["quantity"]
    elif op == "decrement":
        quantity = max(floor, entry["quantity"] - operation["quantity"])
    else:
        quantity = operation["quantity"]
    normalize_quantity(quantity)
    if quantity <= 0:
        await tx.execute("DELETE FROM deck_cards WHERE id=%s::uuid", (entry["id"],))
    elif quantity != entry["quantity"]:
        await tx.execute(
            "UPDATE deck_cards SET quantity=%s,updated_at=%s WHERE id=%s::uuid",
            (quantity, now, entry["id"]),
        )
    return Applied(
        change(entry, max(0, quantity), max(0, quantity) - entry["quantity"]),
        max(0, quantity) != entry["quantity"],
        removed=str(entry["id"]) if quantity <= 0 else None,
    )


class DeckMutations:
    pool: ConnectionPool
    auth: SessionAuth

    async def create_deck_record(self, actor: Actor, input: Document) -> Deck:
        game(input["game"])
        async with category_transaction(self.pool) as tx:
            account = await authorize_write(tx, self.auth, actor)
            deck = await first(
                tx,
                (
                    "INSERT INTO decks(id,account_id,game,name,description,format) "
                    "VALUES(%s::uuid,%s,'mtg',%s,%s,%s) RETURNING *"
                ),
                (
                    str(uuid4()),
                    account,
                    text(input.get("name"), "name", 200),
                    text(input.get("description"), "description", 4000, ""),
                    text(input.get("format"), "format", 100, "Commander"),
                ),
            )
            await ensure_entry_category_initialization(tx, str(deck["id"]))
            await advance_deck_library_revision(tx, account)
            return deck_dto(deck)

    async def update_deck(self, actor: Actor, input: Document) -> Deck:
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool) as tx:
            await authorize_write(tx, self.auth, actor)
            deck = await require_deck(tx, account, input["deckId"], lock=True)
            if "description" in input and input.get("descriptionRevision") != str(
                deck["description_revision"]
            ):
                raise DescriptionConflictError(
                    dict(
                        description=deck["description"],
                        descriptionRevision=str(deck["description_revision"]),
                    )
                )
            name = text(input["name"], "name", 200) if "name" in input else deck["name"]
            format = (
                text(input["format"], "format", 100, "Commander")
                if "format" in input
                else deck["format"]
            )
            description = (
                text(input["description"], "description", 4000, "")
                if "description" in input
                else deck["description"]
            )
            if (name, format, description) == (deck["name"], deck["format"], deck["description"]):
                return deck_dto(deck)
            updated = await first(
                tx,
                (
                    "UPDATE decks SET "
                    "name=%s,format=%s,description=%s,"
                    "description_revision=description_revision+%s,updated_at=%s"
                    " WHERE id=%s::uuid RETURNING *"
                ),
                (
                    name,
                    format,
                    description,
                    int(description != deck["description"]),
                    datetime.now(UTC),
                    deck["id"],
                ),
            )
            await advance_deck_library_revision(tx, account)
            return deck_dto(updated)

    async def delete_deck(self, actor: Actor, deck_id: str) -> None:
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool) as tx:
            await authorize_write(tx, self.auth, actor)
            await require_deck(tx, account, deck_id, lock=True)
            await tx.execute(
                "DELETE FROM decks WHERE id=%s::uuid AND account_id=%s", (deck_id, account)
            )
            await advance_deck_library_revision(tx, account)

    async def _mutation(
        self,
        actor: Actor,
        input: Document,
        *,
        create: Document | None = None,
        intent: Document | None = None,
        floor: int = 0,
        catalog_add: Document | None = None,
    ) -> DeckAcknowledgement:
        game(input["game"])
        request = assert_request_id(input.get("requestId", MISSING))
        source = normalize_source(input.get("source", MISSING), DECK_SOURCES, "web")
        normalized = [] if catalog_add else normalize_operations(input.get("operations"))
        fingerprint = mutation_fingerprint(
            intent
            if intent is not None
            else {
                "kind": "deck.import" if create else "deck.bulk",
                **({"create": create} if create else {"deckId": input["deckId"].lower()}),
                "game": input["game"],
                "source": source,
                "operations": normalized,
                **({"decrementFloor": floor} if floor else {}),
            }
        )
        async with category_transaction(self.pool) as tx:
            account = await authorize_write(tx, self.auth, actor)
            await tx.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (serialize_json([account, request]),),
            )
            previous = await first(
                tx,
                (
                    "SELECT * FROM deck_mutation_requests WHERE account_id=%s "
                    "AND request_id=%s LIMIT 1"
                ),
                (account, request),
            )
            if previous:
                if previous["request_hash"] != fingerprint or previous["acknowledgement"] is None:
                    raise RequestConflictError()
                return cast(DeckAcknowledgement, previous["acknowledgement"])
            resolved: dict[str, CardDocument] = {}
            if catalog_add:
                card = await read_transaction_catalog_printing(tx, catalog_add["catalogCardId"])
                resolved[card["id"]] = card
                normalized.extend(
                    normalize_operations(
                        [
                            dict(
                                op="add",
                                card=card_identity(card),
                                quantity=catalog_add["quantity"],
                                role=catalog_add["role"],
                            )
                        ]
                    )
                )
            for operation in normalized:
                printing_id = (
                    operation["card"]["catalogCardId"]
                    if operation["op"] == "add"
                    else operation["catalogCardId"]
                    if operation["op"] == "replace"
                    else None
                )
                if printing_id and printing_id not in resolved:
                    resolved[printing_id] = await read_transaction_catalog_printing(
                        tx, printing_id
                    )
            if create:
                deck = await first(
                    tx,
                    (
                        "INSERT INTO decks(id,account_id,game,name,description,format) "
                        "VALUES(%s::uuid,%s,'mtg',%s,%s,%s) RETURNING *"
                    ),
                    (
                        str(uuid4()),
                        account,
                        create["name"],
                        create["description"],
                        create["format"],
                    ),
                )
            else:
                deck = await require_deck(tx, account, input["deckId"], lock=True)
            deck_id = str(deck["id"])
            before = await rows(
                tx,
                (
                    "SELECT entry_id::text FROM deck_entry_category_decisions "
                    "WHERE deck_id=%s::uuid"
                ),
                (deck_id,),
            )
            now = datetime.now(UTC)
            changes: list[Change] = []
            removed: list[str] = []
            semantic = False
            initialize = bool(create)
            for operation in normalized:
                applied = await apply_operation(
                    tx, account, deck_id, operation, now, resolved, floor
                )
                changes.append(applied.change)
                semantic |= applied.changed
                initialize |= applied.initialize
                if applied.removed:
                    removed.append(applied.removed)
            category_ids = (
                await ensure_entry_category_initialization(tx, deck_id) if initialize else []
            )
            removed_categories = [r["entry_id"] for r in before if r["entry_id"] in removed]
            if removed_categories:
                await tx.execute(
                    (
                        "UPDATE deck_category_bundles SET "
                        "decision_revision=decision_revision+1 WHERE "
                        "deck_id=%s::uuid"
                    ),
                    (deck_id,),
                )
            category_revision = await first(
                tx,
                (
                    "SELECT decision_revision::text FROM deck_category_bundles "
                    "WHERE deck_id=%s::uuid"
                ),
                (deck_id,),
            )
            revision = int(deck["composition_revision"]) + int(semantic)
            if semantic:
                await tx.execute(
                    "UPDATE decks SET composition_revision=%s,updated_at=%s WHERE id=%s::uuid",
                    (revision, now, deck_id),
                )
                await queue_whole_deck_evaluation(tx, deck_id)
                await advance_deck_library_revision(tx, account)
            acknowledgement = DeckAcknowledgement(
                requestId=request,
                deckId=deck_id,
                revision=str(revision),
                changes=changes,
                removedEntryIds=removed,
            )
            if category_revision:
                acknowledgement["categoryDecisionRevision"] = str(
                    category_revision["decision_revision"]
                )
                acknowledgement["categoryEntryIds"] = [*category_ids, *removed_categories]
            await tx.execute(
                """INSERT INTO deck_mutation_requests(account_id,request_id,request_hash,
            deck_id,source,status,acknowledgement,created_at,updated_at)
            VALUES(%s,%s,%s,%s::uuid,%s,'applied',%s::jsonb,%s,%s)""",
                (
                    account,
                    request,
                    fingerprint,
                    deck_id,
                    source,
                    serialize_json(acknowledgement),
                    now,
                    now,
                ),
            )
            return acknowledgement

    async def bulk_mutate_deck_cards(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        return await self._mutation(actor, input)

    async def _entry_deck(self, actor: Actor, entry_id: str, request_id: str) -> str:
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool, read_only=True) as tx:
            previous = await first(
                tx,
                (
                    "SELECT deck_id::text FROM deck_mutation_requests WHERE "
                    "account_id=%s AND request_id=%s LIMIT 1"
                ),
                (account, request_id),
            )
            if previous:
                return str(previous["deck_id"])
            entry = await first(
                tx,
                (
                    "SELECT deck_id::text FROM deck_cards WHERE id=%s::uuid AND"
                    " account_id=%s LIMIT 1"
                ),
                (entry_id, account),
            )
            if not entry:
                raise DeckNotFoundError()
            return str(entry["deck_id"])

    async def update_deck_card(
        self,
        actor: Actor,
        entry_id: str,
        quantity: int | None,
        role: str | None,
        request_id: str,
        delta: int | float | None = None,
        source: str = "web",
        category_preview: str | None = None,
    ) -> DeckAcknowledgement:
        deck_id = await self._entry_deck(actor, entry_id, request_id)
        operations: list[Document] = []
        if quantity is not None or delta is not None:
            operations.append(
                dict(
                    op="set" if delta is None else "increment" if delta > 0 else "decrement",
                    target=dict(entryId=entry_id),
                    quantity=quantity if delta is None else abs(delta),
                )
            )
        if role:
            operations.append(
                dict(
                    op="move",
                    target=dict(entryId=entry_id),
                    role=assert_deck_role(role),
                    **(
                        {"categoryPreview": category_preview}
                        if category_preview is not None
                        else {}
                    ),
                )
            )
        return await self._mutation(
            actor,
            dict(
                deckId=deck_id,
                requestId=request_id,
                source=source,
                game="mtg",
                operations=operations,
            ),
            floor=1 if delta is not None and delta < 0 else 0,
        )

    async def remove_deck_card(
        self, actor: Actor, entry_id: str, request_id: str, source: str = "web"
    ) -> DeckAcknowledgement:
        deck_id = await self._entry_deck(actor, entry_id, request_id)
        return await self._mutation(
            actor,
            dict(
                deckId=deck_id,
                requestId=request_id,
                source=source,
                game="mtg",
                operations=[dict(op="remove", target=dict(entryId=entry_id))],
            ),
        )

    async def add_catalog_card_to_deck(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        normalized = dict(
            kind="deck.catalog.add",
            deckId=input["deckId"].lower(),
            catalogCardId=js_trim(input["catalogCardId"]).lower(),
            quantity=normalize_quantity(input["quantity"]),
            role=assert_deck_role(input["role"]),
            source=normalize_source(input.get("source", MISSING), DECK_SOURCES, "web"),
        )
        return await self._mutation(
            actor,
            dict(
                deckId=input["deckId"],
                requestId=input["requestId"],
                source=normalized["source"],
                game="mtg",
                operations=[],
            ),
            intent=normalized,
            catalog_add=normalized,
        )

    async def add_deck_card(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        return await self.add_catalog_card_to_deck(actor, {**input, "source": "mobile"})

    async def change_deck_printing(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        deck_id = await self._entry_deck(actor, input["entryId"], input["requestId"])
        operation = dict(
            op="replace",
            target=dict(entryId=input["entryId"]),
            catalogCardId=input["catalogCardId"],
            quantity=input["quantity"],
            role=assert_deck_role(input["role"]),
        )
        if "categoryPreview" in input:
            operation["categoryPreview"] = input["categoryPreview"]
        return await self._mutation(
            actor,
            dict(
                deckId=deck_id,
                requestId=input["requestId"],
                source="web",
                game="mtg",
                operations=[operation],
            ),
        )
