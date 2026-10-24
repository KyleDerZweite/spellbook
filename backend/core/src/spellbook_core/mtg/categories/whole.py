"""Version-bound whole-deck categories, retained evidence and Manual decisions."""

from copy import deepcopy
from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor
from spellbook_core.mtg.categories.combo import read_combo_facts
from spellbook_core.mtg.categories.common import (
    CategoryNotFound,
    Document,
    LibraryConflict,
    advance_deck_library_revision,
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
    timestamp,
    uuid,
)
from spellbook_core.mtg.categories.jobs import touch_whole_deck_job
from spellbook_core.mtg.categories.models import DeckWholeCategories, WholeCategoryAcknowledgement
from spellbook_core.mtg.categories.persistence import (
    adopt_custom_definition,
    combo_composition,
    read_category_composition,
    read_entry_category_facts,
)
from spellbook_core.mtg.categories.rules import collect_deck_rule_predicates, evaluate_deck_rule


async def read_whole_categories(tx: Transaction, deck_id: str) -> list[Document]:
    found = await rows(
        tx,
        """SELECT c.version_id::text,c.origin_id::text,c.definition_snapshot,
        c.name,c.display_order,c.suppressed,c.automatic_active,d.state,d.manual,d.truth,
        d.attempted_truth,d.revision::text,d.evidence,d.previous_evaluation
        FROM deck_whole_categories c LEFT JOIN deck_whole_category_decisions d
        USING(deck_id,version_id)
        WHERE c.deck_id=%s::uuid ORDER BY c.display_order,c.name,c.version_id""",
        (deck_id,),
    )
    return [
        dict(
            versionId=r["version_id"],
            originId=r["origin_id"],
            definition=r["definition_snapshot"],
            name=r["name"],
            displayOrder=r["display_order"],
            suppressed=r["suppressed"],
            automaticActive=r["automatic_active"],
            decision=dict(
                versionId=r["version_id"],
                state=r["state"],
                manual=r["manual"],
                truth=r["truth"],
                attemptedTruth=r["attempted_truth"],
                revision=r["revision"],
                evidence=r["evidence"],
                previousEvaluation=r["previous_evaluation"],
            )
            if r["state"]
            else None,
        )
        for r in found
    ]


async def store_whole_categories(
    tx: Transaction, deck_id: str, categories: list[Document]
) -> None:
    await tx.execute(
        "DELETE FROM deck_whole_categories WHERE deck_id=%s::uuid AND "
        "NOT(version_id=ANY(%s::uuid[]))",
        (deck_id, [c["versionId"] for c in categories]),
    )
    for c in categories:
        await tx.execute(
            """INSERT INTO deck_whole_categories(deck_id,version_id,origin_id,
            definition_snapshot,name,display_order,suppressed,automatic_active)
            VALUES(%s::uuid,%s::uuid,%s::uuid,%s::jsonb,%s,%s,%s,%s)
            ON CONFLICT(deck_id,version_id) DO UPDATE SET
            definition_snapshot=EXCLUDED.definition_snapshot,
            name=EXCLUDED.name,display_order=EXCLUDED.display_order,suppressed=EXCLUDED.suppressed,
            automatic_active=EXCLUDED.automatic_active""",
            (
                deck_id,
                c["versionId"],
                c["originId"],
                serialize_json(c["definition"]),
                c["name"],
                c["displayOrder"],
                c["suppressed"],
                c["automaticActive"],
            ),
        )
        d = c["decision"]
        if d is None:
            await tx.execute(
                "DELETE FROM deck_whole_category_decisions WHERE deck_id=%s::uuid AND "
                "version_id=%s::uuid",
                (deck_id, c["versionId"]),
            )
        else:
            await tx.execute(
                """INSERT INTO deck_whole_category_decisions(deck_id,version_id,state,
                manual,truth,attempted_truth,revision,evidence,previous_evaluation)
                VALUES(%s::uuid,%s::uuid,%s,%s,%s,%s,%s::bigint,%s::jsonb,%s::jsonb)
                ON CONFLICT(deck_id,version_id) DO UPDATE SET
                state=EXCLUDED.state,manual=EXCLUDED.manual,
truth=EXCLUDED.truth,attempted_truth=EXCLUDED.attempted_truth,revision=EXCLUDED.revision,
                evidence=EXCLUDED.evidence,previous_evaluation=EXCLUDED.previous_evaluation""",
                (
                    deck_id,
                    d["versionId"],
                    d["state"],
                    d["manual"],
                    d["truth"],
                    d["attemptedTruth"],
                    d["revision"],
                    serialize_json(d["evidence"]) if d["evidence"] is not None else None,
                    serialize_json(d["previousEvaluation"])
                    if d["previousEvaluation"] is not None
                    else None,
                ),
            )


def whole_semantics(category: Document) -> Document:
    return {
        **category,
        "decision": {**category["decision"], "revision": None} if category["decision"] else None,
    }


def apply_whole_evaluation(category: Document, evidence: Document) -> Document:
    """Unknown retains valid prior truth/evidence, separately exposing the latest attempt."""
    c = deepcopy(category)
    if (
        c["suppressed"]
        or not c["automaticActive"]
        or (c["decision"] or {}).get("state") == "Manual"
    ):
        return c
    old = c["decision"] or {}
    truth = evidence["attemptedTruth"]
    decision = dict(
        versionId=c["versionId"],
        state="Pending" if truth == "Unknown" else "Automatic",
        manual=None,
        truth=old.get("truth") if truth == "Unknown" else truth,
        attemptedTruth=truth,
        revision=old.get("revision", "0"),
        evidence=old.get("evidence") if truth == "Unknown" else evidence,
        previousEvaluation=evidence if truth == "Unknown" else None,
    )
    c["decision"] = decision
    if mutation_fingerprint(whole_semantics(category)) != mutation_fingerprint(whole_semantics(c)):
        decision["revision"] = str(int(old.get("revision", "0")) + 1)
    return c


async def evaluate_whole_categories(
    tx: Transaction, deck_id: str, composition_revision: str, categories: list[Document]
) -> Document:
    composition = await read_category_composition(tx, deck_id)
    combo_definitions = [
        dict(id=c["versionId"], roles=c["definition"]["roles"], rule=c["definition"]["rule"])
        for c in categories
        if not c["suppressed"]
        and c["automaticActive"]
        and (c["decision"] or {}).get("state") != "Manual"
    ]
    fact_definitions = [
        {**adopt_custom_definition(c["definition"]), "rule": p}
        for c in categories
        if not c["suppressed"] and c["automaticActive"]
        for p in collect_deck_rule_predicates(c["definition"]["rule"])
    ]
    facts, tokens, source, combo_source = await read_entry_category_facts(
        tx, [e["printingId"] for e in composition], fact_definitions, combo_definitions
    )
    combos = (
        await read_combo_facts(
            tx, combo_composition(composition, facts), combo_definitions, combo_source
        )
        if combo_source
        else None
    )
    next_categories: list[Document] = []
    for c in categories:
        if (
            c["suppressed"]
            or not c["automaticActive"]
            or (c["decision"] or {}).get("state") == "Manual"
        ):
            next_categories.append(c)
            continue
        definition = dict(
            id=c["versionId"], roles=c["definition"]["roles"], rule=c["definition"]["rule"]
        )
        combo_evaluations = combos.for_definition(definition) if combos else []
        inputs = []
        for e in composition:
            f = facts.get(e["printingId"], {})
            inputs.append(
                {
                    **e,
                    "facts": dict(
                        types=f.get("types"),
                        keywords=f.get("keywords"),
                        oracleId=f.get("raw_oracle_id") if f.get("canonical") else None,
                        roots=f.get("roots", {}),
                        comboParticipants={
                            v["outcomeId"]: v["participants"].get(e["entryId"], "Unknown")
                            for v in combo_evaluations
                        },
                    ),
                }
            )
        evaluated = evaluate_deck_rule(
            c["definition"]["rule"],
            inputs,
            c["definition"]["roles"],
            {v["outcomeId"]: v["truth"] for v in combo_evaluations},
        )
        evidence = dict(
            definitionVersionId=c["versionId"],
            rule=c["definition"]["rule"],
            roles=c["definition"]["roles"],
            compositionRevision=composition_revision,
            attemptedTruth=evaluated["truth"],
            bounds=evaluated["evidence"],
            catalogGenerationId=tokens["catalogGenerationId"],
            oraclePublicationId=tokens["oraclePublicationId"],
            sourceTime=timestamp(source.get("source_time")),
            payloadDigest=source.get("payload_digest"),
            parserVersion=source.get("parser_version"),
            transformVersions=sorted(
                {
                    f["transform_version"]
                    for f in facts.values()
                    if f.get("transform_version") is not None
                }
            ),
        )
        if combos and combo_evaluations:
            evidence["combo"] = combos.evidence(definition)
        next_categories.append(apply_whole_evaluation(c, evidence))
    return dict(
        categories=next_categories,
        sources=tokens,
        factDefinitions=fact_definitions,
        changed=mutation_fingerprint([whole_semantics(c) for c in categories])
        != mutation_fingerprint([whole_semantics(c) for c in next_categories]),
    )


async def evaluate_whole_deck(
    tx: Transaction, deck_id: str, composition_revision: str
) -> Document:
    result = await evaluate_whole_categories(
        tx, deck_id, composition_revision, await read_whole_categories(tx, deck_id)
    )
    if result["changed"]:
        await store_whole_categories(tx, deck_id, result["categories"])
        await tx.execute(
            "UPDATE deck_category_bundles SET decision_revision=decision_revision+1 "
            "WHERE deck_id=%s::uuid",
            (deck_id,),
        )
        owner = await first(tx, "SELECT account_id FROM decks WHERE id=%s::uuid", (deck_id,))
        await advance_deck_library_revision(tx, owner["account_id"])
        await publish_category_change(tx, owner["account_id"])
    return {"changed": result["changed"]}


class WholeApplication:
    pool: ConnectionPool
    auth: SessionAuth

    async def get_deck_whole_categories(self, actor: Actor, value: str) -> DeckWholeCategories:
        deck = uuid(value)
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            await owned(tx, account, deck)
            bundle = await first(
                tx,
                "SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=%s::uuid",
                (deck,),
            )
            return cast(
                DeckWholeCategories,
                dict(
                    deckId=deck,
                    initialized=bool(bundle),
                    decisionRevision=bundle.get("decision_revision", "0"),
                    categories=await read_whole_categories(tx, deck),
                ),
            )

    async def set_whole_category(
        self, actor: Actor, value: Document
    ) -> WholeCategoryAcknowledgement:
        return cast(
            WholeCategoryAcknowledgement,
            await self._mutate_whole(
                actor,
                strict(
                    value,
                    ["requestId", "deckId", "versionId", "manual", "expectedDecisionRevision"],
                ),
                "manual",
            ),
        )

    async def rename_whole_category(
        self, actor: Actor, value: Document
    ) -> WholeCategoryAcknowledgement:
        return cast(
            WholeCategoryAcknowledgement,
            await self._mutate_whole(
                actor,
                strict(
                    value, ["requestId", "deckId", "versionId", "name", "expectedDecisionRevision"]
                ),
                "rename",
            ),
        )

    async def remove_whole_category(
        self, actor: Actor, value: Document
    ) -> WholeCategoryAcknowledgement:
        return cast(
            WholeCategoryAcknowledgement,
            await self._mutate_whole(
                actor,
                strict(value, ["requestId", "deckId", "versionId", "expectedDecisionRevision"]),
                "remove",
            ),
        )

    async def _mutate_whole(self, actor: Actor, raw: Document, kind: str) -> Document:
        deck, version, request = (
            uuid(raw.get("deckId")),
            uuid(raw.get("versionId")),
            uuid(raw.get("requestId")),
        )
        expected = revision(raw.get("expectedDecisionRevision"))
        label = name(raw.get("name")) if kind == "rename" else None
        if kind == "manual" and raw.get("manual") not in ("Include", "Exclude"):
            raise ValidationError("Select Include or Exclude")
        fingerprint = mutation_fingerprint(
            dict(
                kind="category.whole." + kind,
                deckId=deck,
                versionId=version,
                expected=expected,
                name=label,
                manual=raw.get("manual") if kind == "manual" else None,
            )
        )
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return replay
            await owned(tx, account, deck, lock=True)
            bundle = await first(
                tx,
                "SELECT decision_revision::text FROM deck_category_bundles WHERE "
                "deck_id=%s::uuid FOR UPDATE",
                (deck,),
            )
            if not bundle:
                raise CategoryNotFound()
            if bundle["decision_revision"] != expected:
                raise LibraryConflict()
            categories = await read_whole_categories(tx, deck)
            selected = next((c for c in categories if c["versionId"] == version), None)
            if selected is None:
                raise CategoryNotFound()
            original = mutation_fingerprint(whole_semantics(selected))
            if kind == "rename":
                assert label is not None
                if any(
                    c["originId"] != selected["originId"]
                    and not c["suppressed"]
                    and normalized_name(c["name"]) == normalized_name(label)
                    for c in categories
                ):
                    raise ValidationError("A local category already uses this name")
                selected["name"] = label
            elif kind == "remove":
                for c in categories:
                    if c["originId"] == selected["originId"]:
                        c["suppressed"] = True
            else:
                old = selected["decision"] or {}
                selected["decision"] = dict(
                    versionId=version,
                    state="Manual",
                    manual=raw["manual"],
                    truth=old.get("truth"),
                    attemptedTruth=old.get("attemptedTruth"),
                    revision=old.get("revision", "0"),
                    evidence=None,
                    previousEvaluation=old.get("evidence")
                    if old.get("evidence") is not None
                    else old.get("previousEvaluation"),
                )
            changed = original != mutation_fingerprint(whole_semantics(selected))
            if changed:
                if selected["decision"]:
                    selected["decision"]["revision"] = str(
                        int(selected["decision"]["revision"]) + 1
                    )
                await store_whole_categories(tx, deck, categories)
                await tx.execute(
                    "UPDATE deck_category_bundles SET "
                    "decision_revision=decision_revision+1 WHERE deck_id=%s::uuid",
                    (deck,),
                )
                await touch_whole_deck_job(tx, deck)
                await advance_deck_library_revision(tx, account)
                await publish_category_change(tx, account)
            ack = dict(
                requestId=request,
                deckId=deck,
                scope="deck",
                decisionRevision=str(int(expected) + 1) if changed else expected,
                versionIds=[version] if changed else [],
                changed=changed,
            )
            await store_receipt(tx, account, request, fingerprint, ack)
            return ack
