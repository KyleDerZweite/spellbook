"""Destination decision merge consequences, with compatible frozen token semantics."""

import json

from spellbook_core.db import Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.mtg.categories.common import (
    CategoryMergeConflict,
    CategoryNotFound,
    Document,
    first,
)
from spellbook_core.mtg.categories.models import CategoryMergeInput
from spellbook_core.mtg.categories.persistence import (
    adopted_definitions,
    read_decisions,
    read_entry_category_facts,
)


async def read_category_merge_preview(
    tx: Transaction, input: CategoryMergeInput | Document
) -> Document:
    deck, entry = input["deckId"], input["entryId"]
    source = await first(
        tx, "SELECT id FROM deck_cards WHERE deck_id=%s::uuid AND id=%s::uuid", (deck, entry)
    )
    if not source:
        raise CategoryNotFound()
    destination = await first(
        tx,
        """SELECT id::text,quantity FROM deck_cards WHERE deck_id=%s::uuid
        AND catalog_card_id=%s AND role=%s AND id<>%s::uuid""",
        (deck, input["catalogCardId"], input["role"], entry),
    )
    revisions = await first(
        tx,
        """SELECT d.composition_revision::text,b.decision_revision::text
        FROM decks d LEFT JOIN deck_category_bundles b ON
        b.deck_id=d.id WHERE d.id=%s::uuid""",
        (deck,),
    )
    definitions = await adopted_definitions(tx, deck) or []
    decisions = await read_decisions(tx, deck)
    source_decision = next((d for d in decisions if d["entryId"] == entry), None)
    destination_decision = next(
        (d for d in decisions if d["entryId"] == destination.get("id")), None
    )
    _, tokens, _, _ = await read_entry_category_facts(tx, [input["catalogCardId"]], definitions)
    quantity = input["quantity"] + destination.get("quantity", 0)
    if not 1 <= quantity <= 2147483647:
        raise ValidationError("Merged quantity exceeds the entry quantity range")

    def meaning(d: Document | None) -> Document | None:
        return (
            {
                k: d.get(k)
                for k in (
                    "categoryId",
                    "state",
                    "evidence",
                    "definitionSnapshot",
                    "previousEvaluation",
                )
            }
            if d
            else None
        )

    required = bool(
        destination
        and serialize_json(meaning(source_decision))
        != serialize_json(meaning(destination_decision))
    )
    consequence = mutation_fingerprint(
        dict(
            input=input,
            compositionRevision=revisions["composition_revision"],
            decisionRevision=revisions.get("decision_revision") or "0",
            source=source_decision,
            destination=destination_decision,
            resultingQuantity=quantity,
        )
    )
    return dict(
        required=required,
        token=serialize_json(dict(consequence=consequence, sources=tokens)),
        source=source_decision,
        destination=destination_decision,
        destinationEntryId=destination.get("id"),
        resultingQuantity=quantity,
        compositionRevision=revisions["composition_revision"],
        decisionRevision=revisions.get("decision_revision") or "0",
        sourceTokens=tokens,
    )


def _invalid_constant(value: str) -> object:
    raise ValueError("Invalid JSON constant")


def validate_merge_token(current: Document, token: str | None = None) -> None:
    if not current["required"]:
        return
    try:
        saved = json.loads(token or "", parse_constant=_invalid_constant)
    except ValueError, TypeError:
        raise CategoryMergeConflict(current) from None
    if not isinstance(saved, dict):
        raise CategoryMergeConflict(current)
    fresh = json.loads(current["token"])
    if (
        saved.get("consequence") != fresh["consequence"]
        or (
            saved.get("sources") is None
            or saved["sources"] is False
            or saved["sources"] == ""
            or saved["sources"] == 0
        )
        or (
            current["sourceTokens"].get("combo")
            and mutation_fingerprint(saved["sources"])
            != mutation_fingerprint(current["sourceTokens"])
        )
    ):
        raise CategoryMergeConflict(current)


async def require_category_merge_preview(
    tx: Transaction, input: CategoryMergeInput | Document, token: str | None = None
) -> None:
    validate_merge_token(await read_category_merge_preview(tx, input), token)
