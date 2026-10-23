"""Deck-local names and suppression, preserving reusable meanings and receipts."""

from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor

from .common import (
    CategoryNotFound,
    Document,
    LibraryConflict,
    category_transaction,
    first,
    lock_account,
    name,
    normalized_name,
    owned,
    publish_category_change,
    receipt,
    revision,
    rows,
    store_receipt,
    strict,
    uuid,
)
from .jobs import touch_whole_deck_job
from .models import CategoryAcknowledgement
from .persistence import adopted_definitions, origin_identity


class ChangesApplication:
    pool: ConnectionPool
    auth: SessionAuth

    async def rename_local_category(
        self, actor: Actor, value: Document
    ) -> CategoryAcknowledgement:
        return cast(
            CategoryAcknowledgement,
            await self._mutate_local(
                actor,
                strict(
                    value,
                    ["requestId", "deckId", "categoryId", "name", "expectedDecisionRevision"],
                ),
                False,
            ),
        )

    async def remove_local_category(
        self, actor: Actor, value: Document
    ) -> CategoryAcknowledgement:
        return cast(
            CategoryAcknowledgement,
            await self._mutate_local(
                actor,
                strict(
                    value,
                    [
                        "requestId",
                        "deckId",
                        "categoryId",
                        "replacementCategoryId",
                        "expectedDecisionRevision",
                    ],
                ),
                True,
            ),
        )

    async def _mutate_local(self, actor: Actor, raw: Document, remove: bool) -> Document:
        deck, request, category = (
            uuid(raw.get("deckId")),
            uuid(raw.get("requestId")),
            uuid(raw.get("categoryId")),
        )
        expected = revision(raw.get("expectedDecisionRevision"))
        label = None if remove else name(raw.get("name"))
        replacement = (
            uuid(raw.get("replacementCategoryId"))
            if remove and raw.get("replacementCategoryId", False) is not None
            else None
        )
        if replacement == category:
            raise ValidationError("Choose another replacement category or Uncategorized")
        fingerprint = mutation_fingerprint(
            dict(
                kind="category.local.remove" if remove else "category.local.rename",
                deckId=deck,
                categoryId=category,
                expected=expected,
                name=label,
                replacement=replacement,
            )
        )
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return replay
            await owned(tx, account, deck, lock=True)
            definitions = await adopted_definitions(tx, deck)
            selected = next((d for d in definitions or [] if d["id"] == category), None)
            target = next((d for d in definitions or [] if d["id"] == replacement), None)
            if definitions is None or selected is None or (replacement and target is None):
                raise CategoryNotFound()
            bundle = await first(
                tx,
                "SELECT decision_revision::text,suppressed_origins::text[] FROM "
                "deck_category_bundles WHERE deck_id=%s::uuid",
                (deck,),
            )
            if bundle["decision_revision"] != expected:
                raise LibraryConflict()
            entry_ids = []
            changed = False
            if remove:
                snapshot = (target.get("definitionSnapshot") or target) if target else None
                moved = await rows(
                    tx,
                    """UPDATE deck_entry_category_decisions SET category_id=%s::uuid,
                    state='Manual',revision=revision+1,previous_evaluation=COALESCE(evidence,previous_evaluation),
                    evidence=NULL,definition_snapshot=%s::jsonb WHERE deck_id=%s::uuid AND
                    category_id=%s::uuid
                    RETURNING entry_id::text""",
                    (replacement, serialize_json(snapshot) if snapshot else None, deck, category),
                )
                entry_ids = [r["entry_id"] for r in moved]
                suppressed = sorted(
                    set([*bundle["suppressed_origins"], origin_identity(selected)])
                )
                await tx.execute(
                    """UPDATE deck_category_bundles SET definitions=%s::jsonb,
                    suppressed_origins=%s::uuid[],decision_revision=decision_revision+1
                    WHERE deck_id=%s::uuid""",
                    (
                        serialize_json([d for d in definitions if d["id"] != category]),
                        suppressed,
                        deck,
                    ),
                )
                changed = True
            elif selected["name"] != label:
                assert label is not None
                if any(
                    d["id"] != category and normalized_name(d["name"]) == normalized_name(label)
                    for d in definitions
                ):
                    raise ValidationError("A local category already uses this name")
                selected["name"] = label
                await tx.execute(
                    "UPDATE deck_category_bundles SET "
                    "definitions=%s::jsonb,decision_revision=decision_revision+1 WHERE"
                    " deck_id=%s::uuid",
                    (serialize_json(definitions), deck),
                )
                changed = True
            ack = dict(
                requestId=request,
                deckId=deck,
                decisionRevision=str(int(expected) + 1) if changed else expected,
                entryIds=entry_ids,
            )
            await store_receipt(tx, account, request, fingerprint, ack)
            if changed:
                await touch_whole_deck_job(tx, deck)
                await publish_category_change(tx, account)
            return ack
