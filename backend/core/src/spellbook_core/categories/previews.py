"""Durable scoped Review/Reset plans, explicit commit and conflict fences."""

from datetime import UTC, datetime
from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor

from .combo import read_combo_facts
from .common import (
    CategoryNotFound,
    CategoryPreviewCapacity,
    CategoryPreviewExpired,
    Document,
    LibraryConflict,
    advance_deck_library_revision,
    category_transaction,
    first,
    lock_account,
    new_id,
    normalized_name,
    owned,
    page_values,
    publish_category_change,
    receipt,
    rows,
    store_receipt,
    strict,
    timestamp,
    uuid,
)
from .jobs import touch_whole_deck_job
from .library import read_library
from .models import CategoryAcknowledgement, CategoryPreview, WholeCategoryAcknowledgement
from .persistence import (
    adopt_custom_definition,
    adopted_definitions,
    combo_composition,
    entry_combo_definitions,
    evaluate_category_fact,
    origin_identity,
    read_category_composition,
    read_decisions,
    read_entry_category_facts,
    store_entry_decision,
)
from .rules import STARTER_DEFINITIONS
from .whole import (
    evaluate_whole_categories,
    read_whole_categories,
    store_whole_categories,
    whole_semantics,
)

PREVIEW_COLUMNS = """id::text,deck_id::text,scope,mode,expires_at,acknowledgement,
    difference_total,blocked,plan IS NOT NULL AS has_plan"""


def definition_semantics(definition: Document) -> Document:
    return {
        **definition,
        "originId": origin_identity(definition),
        "automaticEligible": definition.get("automaticEligible") is not False,
    }


def proposed_definitions(
    current: list[Document], library: Document, suppressed: list[str], manual: list[Document]
) -> list[Document]:
    by_origin = {origin_identity(d): d for d in current}
    manual_ids = {d["categoryId"] for d in manual}
    eligible = [
        adopt_custom_definition(d["current"], by_origin.get(d["originId"], {}).get("id"))
        for d in library["definitions"]
        if not d["archived"] and d["current"]["scope"] == "entry"
    ]
    eligible.extend(
        {
            **d,
            "originId": d["id"],
            "id": by_origin.get(d["id"], {}).get("id") or new_id(),
            "automaticEligible": True,
        }
        for d in STARTER_DEFINITIONS
    )
    eligible = [d for d in eligible if origin_identity(d) not in suppressed]
    ids = {d["id"] for d in eligible}
    return eligible + [
        {**d, "automaticEligible": False}
        for d in current
        if d["id"] not in ids and d["id"] in manual_ids
    ]


def _difference(kind: str, entity: str, message: str, **values: object) -> Document:
    return dict(kind=kind, entityId=entity, message=message, **values)


def _decision_semantics(decision: Document | None) -> Document | None:
    return (
        {
            k: decision.get(k)
            for k in (
                "categoryId",
                "state",
                "evidence",
                "definitionSnapshot",
                "previousEvaluation",
            )
        }
        if decision
        else None
    )


async def build_entry_plan(tx: Transaction, account: str, intent: Document) -> Document:
    deck = intent["deckId"]
    composition_revision = await owned(tx, account, deck, lock=True)
    current = await adopted_definitions(tx, deck)
    if current is None:
        raise ValidationError("Initialize deck categories before requesting Review or Reset")
    bundle = await first(
        tx,
        "SELECT decision_revision::text,suppressed_origins::text[] FROM "
        "deck_category_bundles WHERE deck_id=%s::uuid",
        (deck,),
    )
    old_suppressed = bundle["suppressed_origins"]
    if any(i not in old_suppressed for i in intent["restoreOriginIds"]):
        raise ValidationError("Only suppressed origins may be explicitly restored")
    suppressed = [i for i in old_suppressed if i not in intent["restoreOriginIds"]]
    entries = await rows(
        tx,
        """SELECT c.id::text,c.catalog_card_id FROM deck_cards c
        LEFT JOIN deck_entry_category_decisions d ON d.entry_id=c.id
        WHERE c.deck_id=%s::uuid
        AND (c.role='main' OR d.entry_id IS NOT NULL) ORDER BY c.id""",
        (deck,),
    )
    existing = await read_decisions(tx, deck)
    manual = [d for d in existing if d["state"] == "Manual"] if intent["mode"] == "Review" else []
    library = await read_library(tx, account, True)
    definitions = proposed_definitions(current, library, suppressed, manual)
    old_by_id = {d["id"]: d for d in current}
    existing_by_id = {d["entryId"]: d for d in existing}
    differences: list[Document] = []
    names: set[str] = set()
    blocked = False
    for d in definitions:
        label = normalized_name(d["name"])
        if label in names:
            blocked = True
            differences.append(
                _difference(
                    "NameConflict",
                    d["id"],
                    f"The name {d['name']} is used by distinct origins. "
                    "Rename the retained local category and preview again.",
                    after=d,
                )
            )
        names.add(label)
        before = old_by_id.get(d["id"])
        if before is None:
            differences.append(
                _difference("DefinitionAdded", d["id"], f"Adopt {d['name']}", before=None, after=d)
            )
        elif mutation_fingerprint(definition_semantics(before)) != mutation_fingerprint(
            definition_semantics(d)
        ):
            differences.append(
                _difference(
                    "DefinitionChanged",
                    d["id"],
                    f"Review the adopted definition of {d['name']}",
                    before=before,
                    after=d,
                )
            )
        if d.get("automaticEligible") is False:
            differences.append(
                _difference(
                    "RetainedManual",
                    d["id"],
                    f"Retain historical Manual category {d['name']}",
                    before=before,
                    after=d,
                )
            )
    ids = {d["id"] for d in definitions}
    for d in current:
        if d["id"] not in ids:
            differences.append(
                _difference(
                    "DefinitionRemoved",
                    d["id"],
                    f"Remove {d['name']} from automatic adoption",
                    before=d,
                    after=None,
                )
            )
    for origin in intent["restoreOriginIds"]:
        differences.append(
            _difference("OriginRestored", origin, "Explicitly restore this suppressed origin")
        )
    composition = await read_category_composition(tx, deck)
    facts, tokens, _, source = await read_entry_category_facts(
        tx, [e["printingId"] for e in composition], definitions
    )
    combos = (
        await read_combo_facts(
            tx, combo_composition(composition, facts), entry_combo_definitions(definitions), source
        )
        if source
        else None
    )
    decisions = []
    for entry in entries:
        eid = entry["id"]
        before = existing_by_id.get(eid)
        if before and before["state"] == "Manual" and intent["mode"] == "Review":
            differences.append(
                _difference(
                    "EntryPreserved",
                    eid,
                    "Preserve your Manual choice and its historical meaning.",
                    before=before,
                    after=before,
                )
            )
            continue
        after = dict(
            entryId=eid,
            revision=before["revision"] if before else "0",
            **evaluate_category_fact(
                definitions,
                entry["catalog_card_id"],
                facts.get(entry["catalog_card_id"]),
                combos,
                eid,
            ),
            previousEvaluation=None,
        )
        if mutation_fingerprint(_decision_semantics(before)) != mutation_fingerprint(
            _decision_semantics(after)
        ):
            after["revision"] = str(int(before["revision"] if before else "0") + 1)
            decisions.append(after)
            differences.append(
                _difference(
                    "EntryChanged",
                    eid,
                    "Missing facts leave this entry Pending"
                    if after["state"] == "Pending"
                    else "Apply the reviewed primary category",
                    before=before,
                    after=after,
                )
            )
    differences.sort(key=lambda d: (d["kind"], d["entityId"]))
    return dict(
        definitions=definitions,
        decisions=decisions,
        suppressed=suppressed,
        libraryRevision=library["revision"],
        decisionRevision=bundle["decision_revision"],
        compositionRevision=composition_revision,
        sources=tokens,
        differences=differences,
        blocked=blocked,
        changed=bool(decisions)
        or mutation_fingerprint([definition_semantics(d) for d in current])
        != mutation_fingerprint([definition_semantics(d) for d in definitions])
        or old_suppressed != suppressed,
    )


def release_manual(decision: Document | None, mode: str) -> Document | None:
    if mode != "Reset" or not decision or decision["state"] != "Manual":
        return decision
    return {
        **decision,
        "state": "Automatic",
        "manual": None,
        "evidence": decision["previousEvaluation"],
        "previousEvaluation": None,
        "revision": str(int(decision["revision"]) + 1),
    }


def _ordered_semantics(categories: list[Document]) -> list[Document]:
    return [whole_semantics(c) for c in sorted(categories, key=lambda c: c["versionId"])]


async def build_whole_plan(tx: Transaction, account: str, intent: Document) -> Document:
    deck = intent["deckId"]
    composition_revision = await owned(tx, account, deck, lock=True)
    bundle = await first(
        tx,
        "SELECT decision_revision::text FROM deck_category_bundles WHERE "
        "deck_id=%s::uuid FOR UPDATE",
        (deck,),
    )
    if not bundle:
        raise ValidationError("Initialize deck categories before Review or Reset")
    old = await read_whole_categories(tx, deck)
    suppressed = sorted({c["originId"] for c in old if c["suppressed"]})
    if any(i not in suppressed for i in intent["restoreOriginIds"]):
        raise ValidationError("Only suppressed origins may be explicitly restored")
    remaining = [i for i in suppressed if i not in intent["restoreOriginIds"]]
    library = await read_library(tx, account, True)
    by_version = {c["versionId"]: c for c in old}
    proposed = []
    for d in library["definitions"]:
        version = d["current"]
        if d["archived"] or version["scope"] != "deck" or d["originId"] in remaining:
            continue
        previous = by_version.get(version["id"], {})
        proposed.append(
            dict(
                versionId=version["id"],
                originId=d["originId"],
                definition=version,
                name=previous.get("name", version["name"]),
                displayOrder=version["displayOrder"],
                suppressed=False,
                automaticActive=True,
                decision=release_manual(previous.get("decision"), intent["mode"]),
            )
        )
    current_ids = {c["versionId"] for c in proposed}
    for previous in old:
        if previous["versionId"] in current_ids:
            continue
        if previous["suppressed"] and previous["originId"] in remaining:
            proposed.append(
                {**previous, "decision": release_manual(previous["decision"], intent["mode"])}
            )
        elif intent["mode"] == "Review" and (previous["decision"] or {}).get("state") == "Manual":
            proposed.append({**previous, "automaticActive": False, "suppressed": False})
    names: dict[str, str] = {}
    differences: list[Document] = []
    blocked = False
    for c in proposed:
        if not c["suppressed"]:
            label = normalized_name(c["name"])
            other = names.get(label)
            if other and other != c["originId"]:
                blocked = True
                differences.append(
                    _difference(
                        "NameConflict",
                        c["versionId"],
                        f"Rename the local category {c['name']} before adopting "
                        "a distinct origin with this name.",
                        after=c,
                    )
                )
            names[label] = c["originId"]
        if c["versionId"] not in by_version:
            differences.append(
                _difference(
                    "DefinitionAdded",
                    c["versionId"],
                    f"Adopt {c['name']}, version {c['definition']['version']}.",
                    before=None,
                    after=c,
                )
            )
        if not c["automaticActive"] and (c["decision"] or {}).get("state") == "Manual":
            differences.append(
                _difference(
                    "RetainedManual",
                    c["versionId"],
                    f"Retain the historical Manual meaning of {c['name']}.",
                    before=by_version.get(c["versionId"]),
                    after=c,
                )
            )
    for c in old:
        if not any(p["versionId"] == c["versionId"] for p in proposed):
            differences.append(
                _difference(
                    "DefinitionRemoved",
                    c["versionId"],
                    f"Remove version {c['definition']['version']} of {c['name']}.",
                    before=c,
                    after=None,
                )
            )
    evaluated = await evaluate_whole_categories(tx, deck, composition_revision, proposed)
    after_by_id = {c["versionId"]: c for c in evaluated["categories"]}
    for d in differences:
        if d.get("after") and "definition" in d["after"]:
            d["after"] = after_by_id.get(d["after"]["versionId"], d["after"])
    for c in evaluated["categories"]:
        before = by_version.get(c["versionId"])
        preserved = (c["decision"] or {}).get("state") == "Manual"
        if preserved or mutation_fingerprint(
            whole_semantics(before) if before else None
        ) != mutation_fingerprint(whole_semantics(c)):
            message = (
                "Preserve this version-bound Manual choice."
                if preserved
                else "Keep the retained valid result visibly Pending."
                if (c["decision"] or {}).get("state") == "Pending"
                else "Apply this reviewed whole-deck result."
            )
            differences.append(
                _difference(
                    "DeckPreserved" if preserved else "DeckChanged",
                    c["versionId"],
                    message,
                    before=before,
                    after=c,
                )
            )
    for origin in intent["restoreOriginIds"]:
        differences.append(
            _difference(
                "OriginRestored", origin, "Restore this explicitly selected whole-deck origin."
            )
        )
    return dict(
        definitions=evaluated["factDefinitions"],
        decisions=[],
        wholeCategories=evaluated["categories"],
        suppressed=remaining,
        libraryRevision=library["revision"],
        decisionRevision=bundle["decision_revision"],
        compositionRevision=composition_revision,
        sources=evaluated["sources"],
        blocked=blocked,
        changed=mutation_fingerprint(_ordered_semantics(old))
        != mutation_fingerprint(_ordered_semantics(evaluated["categories"])),
        differences=differences,
    )


def preview_page(
    row: Document, differences: list[Document], offset: int = 0, limit: int = 50
) -> Document:
    expires_at = row["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    status = (
        "Committed"
        if row.get("acknowledgement")
        else "Expired"
        if datetime.now(UTC) >= expires_at or not row["has_plan"]
        else "BlockedByNameConflict"
        if row["blocked"]
        else "Ready"
    )
    return dict(
        id=row["id"],
        deckId=row["deck_id"],
        scope=row["scope"],
        mode=row["mode"],
        status=status,
        expiresAt=timestamp(expires_at),
        total=row["difference_total"] if row["has_plan"] else 0,
        offset=offset,
        limit=limit,
        differences=differences if row["has_plan"] else [],
        acknowledgement=row.get("acknowledgement"),
    )


async def _read_page(tx: Transaction, row: Document, offset: int = 0, limit: int = 50) -> Document:
    differences = (
        await rows(
            tx,
            "SELECT difference FROM category_preview_differences WHERE "
            "preview_id=%s::uuid AND position>=%s ORDER BY position LIMIT %s",
            (row["id"], offset, limit),
        )
        if row["has_plan"]
        else []
    )
    return preview_page(row, [d["difference"] for d in differences], offset, limit)


async def _cleanup_expired(tx: Transaction, account: str) -> None:
    await tx.execute(
        """WITH batch AS (SELECT d.preview_id,d.position FROM category_change_previews p
        JOIN category_preview_differences d ON d.preview_id=p.id WHERE
        p.account_id=%s AND p.plan IS NOT NULL
        AND p.expires_at<=clock_timestamp() ORDER BY
        p.expires_at,p.id,d.position LIMIT 1000)
        DELETE FROM category_preview_differences d USING batch b WHERE
        d.preview_id=b.preview_id
        AND d.position=b.position""",
        (account,),
    )
    await tx.execute(
        """WITH batch AS (SELECT p.id FROM category_change_previews p WHERE p.account_id=%s
        AND p.expires_at<=clock_timestamp() AND p.plan IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM category_preview_differences d WHERE d.preview_id=p.id)
        ORDER BY p.expires_at,p.id LIMIT 8) UPDATE
        category_change_previews p SET plan=NULL FROM
        batch b WHERE p.id=b.id""",
        (account,),
    )


def normalize_intent(value: object) -> Document:
    raw = strict(value, ["requestId", "deckId", "scope", "mode", "restoreOriginIds"])
    request, deck = uuid(raw.get("requestId")), uuid(raw.get("deckId"))
    if raw.get("scope") not in ("entry", "deck") or raw.get("mode") not in ("Review", "Reset"):
        raise ValidationError("Select scope and Review or Reset")
    restores = raw.get("restoreOriginIds")
    if not isinstance(restores, list) or len(restores) > 1000:
        raise ValidationError("Invalid suppressed-origin selections")
    origins = sorted(uuid(i) for i in restores)
    if len(set(origins)) != len(origins):
        raise ValidationError("Duplicate restoration origin")
    return dict(
        requestId=request,
        deckId=deck,
        scope=raw["scope"],
        mode=raw["mode"],
        restoreOriginIds=origins,
    )


class PreviewsApplication:
    pool: ConnectionPool
    auth: SessionAuth

    async def preview_category_change(self, actor: Actor, value: Document) -> CategoryPreview:
        intent = normalize_intent(value)
        request, deck = intent["requestId"], intent["deckId"]
        fingerprint = mutation_fingerprint(intent)
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            old = await first(
                tx,
                f"SELECT {PREVIEW_COLUMNS},request_hash FROM category_change_previews "
                "WHERE account_id=%s AND request_id=%s::uuid",
                (account, request),
            )
            if old:
                if old["request_hash"] != fingerprint:
                    raise RequestConflictError()
                return cast(CategoryPreview, await _read_page(tx, old))
            await owned(tx, account, deck, lock=True)
            await _cleanup_expired(tx, account)
            live = await first(
                tx,
                "SELECT count(*)::int AS count FROM category_change_previews WHERE "
                "account_id=%s AND expires_at>clock_timestamp() AND acknowledgement IS"
                " NULL",
                (account,),
            )
            if live["count"] >= 4:
                raise CategoryPreviewCapacity()
            complete = await (
                build_whole_plan(tx, account, intent)
                if intent["scope"] == "deck"
                else build_entry_plan(tx, account, intent)
            )
            plan = {k: v for k, v in complete.items() if k != "differences"}
            differences = complete["differences"]
            identifier = new_id()
            result = await first(
                tx,
                """INSERT INTO category_change_previews(id,account_id,request_id,
                request_hash,deck_id,scope,mode,expires_at,plan,difference_total,blocked)
                VALUES(%s::uuid,%s,%s::uuid,%s,%s::uuid,%s,%s,clock_timestamp()+interval
                '15
                minutes',%s::jsonb,%s,%s)
                RETURNING """
                + PREVIEW_COLUMNS,
                (
                    identifier,
                    account,
                    request,
                    fingerprint,
                    deck,
                    intent["scope"],
                    intent["mode"],
                    serialize_json(plan),
                    len(differences),
                    plan["blocked"],
                ),
            )
            for offset in range(0, len(differences), 100):
                chunk = [
                    dict(position=i + offset, difference=d)
                    for i, d in enumerate(differences[offset : offset + 100])
                ]
                await tx.execute(
                    """INSERT INTO category_preview_differences(preview_id,position,difference)
                    SELECT %s::uuid,x.position,x.difference FROM
                    jsonb_to_recordset(%s::jsonb) x(position integer,difference
                    jsonb)""",
                    (identifier, serialize_json(chunk)),
                )
            return cast(CategoryPreview, await _read_page(tx, result))

    async def get_category_preview(self, actor: Actor, value: Document) -> CategoryPreview:
        raw = strict(value, ["previewId", "offset", "limit"])
        identifier = uuid(raw.get("previewId"))
        offset, limit = page_values(raw, "preview")
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            row = await first(
                tx,
                f"SELECT {PREVIEW_COLUMNS} FROM category_change_previews "
                "WHERE id=%s::uuid AND account_id=%s",
                (identifier, account),
            )
            if not row:
                raise CategoryNotFound()
            return cast(CategoryPreview, await _read_page(tx, row, offset, limit))

    async def commit_category_change(
        self, actor: Actor, value: Document
    ) -> CategoryAcknowledgement | WholeCategoryAcknowledgement:
        raw = strict(value, ["requestId", "previewId"])
        request, identifier = uuid(raw.get("requestId")), uuid(raw.get("previewId"))
        fingerprint = mutation_fingerprint(
            dict(kind="category.preview.commit", previewId=identifier)
        )
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return cast(CategoryAcknowledgement | WholeCategoryAcknowledgement, replay)
            candidate = await first(
                tx,
                f"SELECT {PREVIEW_COLUMNS} FROM category_change_previews "
                "WHERE id=%s::uuid AND account_id=%s",
                (identifier, account),
            )
            if not candidate:
                raise CategoryNotFound()
            if candidate["acknowledgement"]:
                await store_receipt(
                    tx, account, request, fingerprint, candidate["acknowledgement"]
                )
                return cast(
                    CategoryAcknowledgement | WholeCategoryAcknowledgement,
                    candidate["acknowledgement"],
                )
            deck = candidate["deck_id"]
            composition_revision = await owned(tx, account, deck, lock=True)
            row = await first(
                tx,
                "SELECT plan,expires_at,scope FROM category_change_previews WHERE "
                "id=%s::uuid AND account_id=%s FOR UPDATE",
                (identifier, account),
            )
            clock = await first(
                tx, "SELECT clock_timestamp()>=%s::timestamptz AS expired", (row["expires_at"],)
            )
            plan = row["plan"]
            if clock["expired"] or not plan:
                raise CategoryPreviewExpired()
            if plan["blocked"]:
                raise LibraryConflict()
            library = await first(
                tx,
                "SELECT revision::text FROM category_library_state WHERE account_id=%s",
                (account,),
            )
            bundle = await first(
                tx,
                "SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=%s::uuid",
                (deck,),
            )
            if (
                not bundle
                or composition_revision != plan["compositionRevision"]
                or library.get("revision", "0") != plan["libraryRevision"]
                or bundle["decision_revision"] != plan["decisionRevision"]
            ):
                raise LibraryConflict()
            await tx.execute("SELECT id FROM catalog_state WHERE id=1 FOR SHARE")
            await tx.execute("SELECT id FROM oracle_tag_state WHERE id=1 FOR SHARE")
            combo_definitions = None
            if row["scope"] == "deck":
                combo_definitions = [
                    dict(
                        id=c["versionId"],
                        roles=c["definition"]["roles"],
                        rule=c["definition"]["rule"],
                    )
                    for c in plan.get("wholeCategories", [])
                    if not c["suppressed"]
                    and c["automaticActive"]
                    and (c["decision"] or {}).get("state") != "Manual"
                ]
            _, tokens, _, _ = await read_entry_category_facts(
                tx, [], plan["definitions"], combo_definitions
            )
            if mutation_fingerprint(tokens) != mutation_fingerprint(plan["sources"]):
                raise LibraryConflict()
            changed = plan["changed"]
            rev = str(int(plan["decisionRevision"]) + 1) if changed else plan["decisionRevision"]
            if row["scope"] == "deck":
                if "wholeCategories" not in plan:
                    raise CategoryPreviewExpired()
                categories = plan["wholeCategories"]
                if changed:
                    await store_whole_categories(tx, deck, categories)
                    await tx.execute(
                        """UPDATE deck_category_bundles SET whole_deck_definitions=%s::jsonb,
                        library_revision=%s::bigint,decision_revision=decision_revision+1
                        WHERE deck_id=%s::uuid""",
                        (
                            serialize_json(
                                [c["definition"] for c in categories if not c["suppressed"]]
                            ),
                            plan["libraryRevision"],
                            deck,
                        ),
                    )
                    await advance_deck_library_revision(tx, account)
                ack = dict(
                    requestId=request,
                    deckId=deck,
                    scope="deck",
                    decisionRevision=rev,
                    versionIds=[c["versionId"] for c in categories],
                    changed=changed,
                )
            else:
                for d in sorted(plan["decisions"], key=lambda d: d["entryId"]):
                    await store_entry_decision(tx, deck, {**d, "previousEvaluation": None})
                if changed:
                    await tx.execute(
                        """UPDATE deck_category_bundles SET definitions=%s::jsonb,
                        suppressed_origins=%s::uuid[],library_revision=%s::bigint,
                        decision_revision=decision_revision+1 WHERE deck_id=%s::uuid""",
                        (
                            serialize_json(plan["definitions"]),
                            plan["suppressed"],
                            plan["libraryRevision"],
                            deck,
                        ),
                    )
                ack = dict(
                    requestId=request,
                    deckId=deck,
                    decisionRevision=rev,
                    entryIds=[d["entryId"] for d in plan["decisions"]],
                )
            await store_receipt(tx, account, request, fingerprint, ack)
            await tx.execute(
                "UPDATE category_change_previews SET acknowledgement=%s::jsonb WHERE id=%s::uuid",
                (serialize_json(ack), identifier),
            )
            if changed:
                await touch_whole_deck_job(tx, deck)
                await publish_category_change(tx, account)
            return cast(CategoryAcknowledgement | WholeCategoryAcknowledgement, ack)
