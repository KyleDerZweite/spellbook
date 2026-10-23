"""Concrete Category application shared by HTTP and the closed web command bridge."""

import re
from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor
from spellbook_core.validation import js_trim

from .changes import ChangesApplication
from .common import (
    ROLES,
    CategoryConflict,
    CategoryNotFound,
    Document,
    category_transaction,
    first,
    integer,
    lock_account,
    owned,
    publish_category_change,
    receipt,
    rows,
    store_receipt,
    strict,
    timestamp,
    uuid,
)
from .jobs import touch_whole_deck_job
from .library import LibraryApplication
from .merge import read_category_merge_preview
from .models import CategoryAcknowledgement, CategoryMergePreview, DeckEntryCategories
from .persistence import (
    adopted_definitions,
    ensure_entry_category_initialization,
    read_decisions,
    store_entry_decision,
)
from .previews import PreviewsApplication
from .rules import STARTER_DEFINITIONS
from .whole import WholeApplication


def request_uuid(value: object) -> str:
    try:
        return uuid(value)
    except ValidationError:
        raise ValidationError("Invalid category request UUID") from None


async def read_deck_entry_categories(tx: Transaction, deck_id: str) -> Document:
    bundle = await first(
        tx,
        """SELECT definitions,decision_revision::text,library_revision::text,
        whole_deck_definitions,suppressed_origins::text[] FROM
        deck_category_bundles WHERE deck_id=%s::uuid""",
        (deck_id,),
    )
    suppressed = bundle.get("suppressed_origins", [])
    labels = await rows(
        tx,
        """SELECT o.id::text,v.definition->>'name' AS name
        FROM category_definition_origins o JOIN category_definition_versions v
        ON v.origin_id=o.id AND v.version=o.current_version JOIN decks d
        ON d.account_id=o.account_id AND d.id=%s::uuid WHERE o.id=ANY(%s::uuid[])""",
        (deck_id, suppressed),
    )
    labels_by_id = {r["id"]: r["name"] for r in labels}
    labels_by_id = {**{d["id"]: d["name"] for d in STARTER_DEFINITIONS}, **labels_by_id}
    source = await first(
        tx,
        """SELECT s.refresh_status,p.source_updated_at FROM oracle_tag_state s
        LEFT JOIN oracle_tag_publications p ON p.id=s.active_publication WHERE s.id=1""",
    )
    status = (source.get("refresh_status") or {}).get("kind")
    return dict(
        deckId=deck_id,
        initialized=bool(bundle),
        decisionRevision=bundle.get("decision_revision", "0"),
        definitions=bundle.get("definitions", []),
        libraryRevision=bundle.get("library_revision", "0"),
        wholeDeckDefinitions=bundle.get("whole_deck_definitions", []),
        suppressedOrigins=[
            dict(originId=i, name=labels_by_id.get(i, "Unavailable historical origin"))
            for i in suppressed
        ],
        decisions=await read_decisions(tx, deck_id),
        sourceStatus=dict(
            kind=status if status in ("Succeeded", "Failed") else "NeverAttempted",
            sourceTime=timestamp(source.get("source_updated_at")),
        ),
    )


class Categories(LibraryApplication, ChangesApplication, WholeApplication, PreviewsApplication):
    def __init__(self, pool: ConnectionPool, auth: SessionAuth):
        self.pool = pool
        self.auth = auth

    async def get_deck_entry_categories(self, actor: Actor, deck_id: str) -> DeckEntryCategories:
        deck = request_uuid(deck_id)
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            await owned(tx, account, deck)
            return cast(DeckEntryCategories, await read_deck_entry_categories(tx, deck))

    async def preview_entry_merge(self, actor: Actor, value: Document) -> CategoryMergePreview:
        raw = strict(value, ["deckId", "entryId", "catalogCardId", "role", "quantity"])
        deck = request_uuid(raw.get("deckId"))
        entry = request_uuid(raw.get("entryId"))
        printing = request_uuid(raw.get("catalogCardId"))
        role = raw.get("role", "")
        if not isinstance(role, str):
            raise ValidationError("value must be a string")
        role = js_trim(role)
        if role not in ROLES:
            raise ValidationError(f"Invalid role: {role}")
        quantity = integer(
            raw.get("quantity"),
            -2147483647,
            2147483647,
            "Quantity must be a finite 32-bit integer",
        )
        if quantity < 1:
            raise ValidationError("Quantity must be positive")
        normalized: Document = dict(
            deckId=deck,
            entryId=entry,
            catalogCardId=printing,
            role=role,
            quantity=quantity,
        )
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            await owned(tx, account, normalized["deckId"])
            return cast(CategoryMergePreview, await read_category_merge_preview(tx, normalized))

    async def initialize_deck_categories(
        self, actor: Actor, value: Document
    ) -> CategoryAcknowledgement:
        return cast(
            CategoryAcknowledgement,
            await self._mutate_entry(actor, strict(value, ["deckId", "requestId"]), False),
        )

    async def set_entry_category(self, actor: Actor, value: Document) -> CategoryAcknowledgement:
        return cast(
            CategoryAcknowledgement,
            await self._mutate_entry(
                actor,
                strict(
                    value,
                    ["deckId", "entryId", "categoryId", "expectedDecisionRevision", "requestId"],
                ),
                True,
            ),
        )

    async def _mutate_entry(self, actor: Actor, raw: Document, manual: bool) -> Document:
        deck, request = request_uuid(raw.get("deckId")), request_uuid(raw.get("requestId"))
        entry = request_uuid(raw.get("entryId")) if manual else None
        category = (
            request_uuid(raw.get("categoryId"))
            if manual and raw.get("categoryId", False) is not None
            else None
        )
        expected = raw.get("expectedDecisionRevision") if manual else None
        if manual and (not isinstance(expected, str) or not re.fullmatch(r"[0-9]+", expected)):
            raise ValidationError("Category decision revision is required")
        fingerprint = mutation_fingerprint(
            dict(
                kind="category.manual" if manual else "category.initialize",
                deckId=deck,
                entryId=entry,
                categoryId=category,
                expectedDecisionRevision=expected,
            )
        )
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            await tx.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (serialize_json([account, request]),),
            )
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return replay
            await owned(tx, account, deck, lock=True)
            definitions = await adopted_definitions(tx, deck)
            initialized = manual or definitions is not None
            entry_ids = []
            if not manual:
                entry_ids = await ensure_entry_category_initialization(tx, deck)
            else:
                if definitions is None or (
                    category and not any(d["id"] == category for d in definitions)
                ):
                    raise CategoryNotFound()
                found = await first(
                    tx,
                    "SELECT id FROM deck_cards WHERE id=%s::uuid AND deck_id=%s::uuid "
                    "AND account_id=%s",
                    (entry, deck, account),
                )
                if not found:
                    raise CategoryNotFound()
                latest = await read_deck_entry_categories(tx, deck)
                if latest["decisionRevision"] != expected:
                    raise CategoryConflict(latest)
                existing: Document = next(
                    (d for d in latest["decisions"] if d["entryId"] == entry), {}
                )
                if (
                    existing.get("state") != "Manual"
                    or existing.get("categoryId") != category
                    or existing.get("evidence") is not None
                ):
                    selected = next((d for d in definitions if d["id"] == category), None)
                    snapshot = (
                        (selected.get("definitionSnapshot") or selected) if selected else None
                    )
                    decision = dict(
                        entryId=entry,
                        categoryId=category,
                        state="Manual",
                        revision=str(int(existing.get("revision", "0")) + 1),
                        evidence=None,
                        definitionSnapshot=snapshot,
                        previousEvaluation=existing.get("evidence")
                        if existing.get("evidence") is not None
                        else existing.get("previousEvaluation"),
                    )
                    await store_entry_decision(tx, deck, decision)
                    await tx.execute(
                        "UPDATE deck_category_bundles SET "
                        "decision_revision=decision_revision+1 WHERE deck_id=%s::uuid",
                        (deck,),
                    )
                    assert entry is not None
                    entry_ids = [entry]
            bundle = await first(
                tx,
                "SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=%s::uuid",
                (deck,),
            )
            ack = dict(
                requestId=request,
                deckId=deck,
                decisionRevision=bundle["decision_revision"],
                entryIds=entry_ids,
            )
            await store_receipt(tx, account, request, fingerprint, ack)
            if entry_ids or not initialized:
                await touch_whole_deck_job(tx, deck)
                await publish_category_change(tx, account)
            return ack


def create_categories(pool: ConnectionPool, auth: SessionAuth) -> Categories:
    return Categories(pool, auth)
