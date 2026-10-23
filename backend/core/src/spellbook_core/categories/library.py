"""Account-owned immutable definition versions and bounded Library choices."""

import re
from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, database_integer
from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.models import Actor
from spellbook_core.validation import js_trim

from .combo import read_combo_source
from .common import (
    ROLES,
    CategoryNotFound,
    Document,
    LibraryConflict,
    advance_deck_library_revision,
    category_transaction,
    first,
    integer,
    lock_account,
    name,
    new_id,
    normalized_name,
    now,
    page_values,
    publish_category_change,
    receipt,
    revision,
    rows,
    store_receipt,
    strict,
    utf16_length,
    uuid,
)
from .models import (
    CategoryLibraryPage,
    CategoryRuleChoices,
    LibraryAcknowledgement,
    LibraryDefinitionDetail,
)
from .rules import STARTER_DEFINITIONS, validate_rule


async def read_library(tx: Transaction, account: str, active_only: bool = False) -> Document:
    state = await first(
        tx, "SELECT revision::text FROM category_library_state WHERE account_id=%s", (account,)
    )
    definitions = await rows(
        tx,
        """SELECT o.id::text,o.archived,v.definition
        FROM category_definition_origins o JOIN category_definition_versions v
        ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=%s"""
        + (" AND NOT o.archived" if active_only else "")
        + " ORDER BY o.scope,o.id",
        (account,),
    )
    return dict(
        revision=state.get("revision", "0"),
        definitions=[
            dict(originId=r["id"], archived=r["archived"], current=r["definition"])
            for r in definitions
        ],
    )


async def _current(
    tx: Transaction, account: str, origin: str | None
) -> tuple[str, Document | None]:
    state = await first(
        tx, "SELECT revision::text FROM category_library_state WHERE account_id=%s", (account,)
    )
    row = (
        await first(
            tx,
            """SELECT o.id::text,o.archived,v.definition
        FROM category_definition_origins o JOIN category_definition_versions v
        ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=%s AND
        o.id=%s::uuid""",
            (account, origin),
        )
        if origin
        else {}
    )
    return str(state.get("revision", "0")), (
        dict(originId=row["id"], archived=row["archived"], current=row["definition"])
        if row
        else None
    )


async def _name_in_use(
    tx: Transaction, account: str, scope: str, label: str, origin: str | None
) -> bool:
    return bool(
        await first(
            tx,
            """SELECT id FROM category_definition_origins
        WHERE account_id=%s AND scope=%s AND normalized_name=%s AND NOT archived
        AND id IS DISTINCT FROM %s::uuid LIMIT 1""",
            (account, scope, normalized_name(label), origin),
        )
    )


async def _advance(tx: Transaction, account: str) -> str:
    result = await first(
        tx,
        """INSERT INTO category_library_state(account_id,revision) VALUES(%s,1)
        ON CONFLICT(account_id) DO UPDATE SET revision=category_library_state.revision+1
        RETURNING revision::text""",
        (account,),
    )
    return str(result["revision"])


def assert_unique_names(definitions: list[Document]) -> None:
    names = [normalized_name(name(d["name"])) for d in definitions]
    if len(set(names)) != len(names):
        raise ValidationError(
            "Distinct Category origins share a local name. "
            "Rename the reusable definition before adoption."
        )


def normalize_definition(value: object) -> Document:
    raw = strict(
        value,
        [
            "requestId",
            "originId",
            "expectedLibraryRevision",
            "scope",
            "name",
            "meaning",
            "priority",
            "displayOrder",
            "roles",
            "rule",
            "confirmRetainedRule",
        ],
    )
    request = uuid(raw.get("requestId"))
    origin = None if raw.get("originId", False) is None else uuid(raw.get("originId"))
    expected = revision(raw.get("expectedLibraryRevision"))
    if raw.get("scope") not in ("entry", "deck"):
        raise ValidationError("Category scope is required")
    label = name(raw.get("name"))
    if not isinstance(raw.get("meaning"), str) or utf16_length(raw["meaning"]) > 4000:
        raise ValidationError("Meaning is limited to 4000 characters")
    for field in ("priority", "displayOrder"):
        integer(
            raw.get(field),
            -2147483648,
            2147483647,
            "Category order must be a signed 32-bit integer",
        )
    roles = raw.get("roles")
    if (
        not isinstance(roles, list)
        or not roles
        or any(r not in ROLES for r in roles)
        or len(set(roles)) != len(roles)
    ):
        raise ValidationError("Select distinct valid category roles")
    if not isinstance(raw.get("confirmRetainedRule"), bool):
        raise ValidationError("Rule confirmation is required")
    return {
        **raw,
        "requestId": request,
        "originId": origin,
        "name": label,
        "expectedLibraryRevision": expected,
        "rule": validate_rule(raw.get("rule"), raw["scope"]),
        "roles": sorted(roles),
    }


class LibraryApplication:
    pool: ConnectionPool
    auth: SessionAuth

    async def get_library(
        self, actor: Actor, value: Document | None = None
    ) -> CategoryLibraryPage:
        raw = strict(value or {}, ["scope", "offset", "limit"])
        scope = raw.get("scope")
        if "scope" in raw and scope not in ("entry", "deck"):
            raise ValidationError("Invalid Library scope")
        offset, limit = page_values(raw, "Library")
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            state = await first(
                tx,
                "SELECT revision::text FROM category_library_state WHERE account_id=%s",
                (account,),
            )
            params: tuple[object, ...] = (account, scope) if scope else (account,)
            where = " WHERE o.account_id=%s" + (" AND o.scope=%s" if scope else "")
            count = await first(
                tx,
                "SELECT count(*)::text AS total FROM category_definition_origins o" + where,
                params,
            )
            found = await rows(
                tx,
                """SELECT o.id::text,o.archived,v.definition
                FROM category_definition_origins o JOIN category_definition_versions v
                ON v.origin_id=o.id AND v.version=o.current_version"""
                + where
                + " ORDER BY o.scope,o.id OFFSET %s LIMIT %s",
                (*params, offset, limit),
            )
            return cast(
                CategoryLibraryPage,
                dict(
                    revision=str(state.get("revision", "0")),
                    total=database_integer(count["total"]),
                    offset=offset,
                    limit=limit,
                    definitions=[
                        dict(originId=r["id"], archived=r["archived"], current=r["definition"])
                        for r in found
                    ],
                ),
            )

    async def get_definition(self, actor: Actor, origin_id: str) -> LibraryDefinitionDetail:
        origin = uuid(origin_id)
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            account = (await self.auth.require_actor(actor, tx)).account_id
            rev, existing = await _current(tx, account, origin)
            if existing is None:
                raise CategoryNotFound()
            return cast(LibraryDefinitionDetail, {**existing, "libraryRevision": rev})

    async def get_rule_choices(self, actor: Actor, value: Document) -> CategoryRuleChoices:
        raw = strict(
            value, ["tagQuery", "cardQuery", "outcomeQuery", "tagIds", "oracleIds", "outcomeIds"]
        )
        queries = [
            "" if raw.get(k) is None else raw[k] for k in ("tagQuery", "cardQuery", "outcomeQuery")
        ]
        if any(not isinstance(q, str) or utf16_length(q) > 200 for q in queries):
            raise ValidationError("Rule search is limited to 200 characters")
        selections: list[list[str]] = []
        for key in ("tagIds", "oracleIds"):
            ids = raw.get(key, [])
            if not isinstance(ids, list) or len(ids) > 100:
                raise ValidationError("Rule selections exceed 100")
            selections.append([uuid(i) for i in ids])
        outcomes = [] if raw.get("outcomeIds") is None else raw["outcomeIds"]
        if (
            not isinstance(outcomes, list)
            or len(outcomes) > 100
            or any(
                not isinstance(i, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", i)
                for i in outcomes
            )
        ):
            raise ValidationError("Invalid documented combo selections")
        tags, cards = selections
        tq, cq, oq = [js_trim(q) for q in queries]
        async with category_transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            await self.auth.require_actor(actor, tx)
            tag_rows = await rows(
                tx,
                """SELECT t.id::text,t.label AS name FROM oracle_tags t
                JOIN oracle_tag_state s ON
                s.active_publication=t.publication_id WHERE s.id=1
                AND (t.id=ANY(%s::uuid[]) OR (%s AND strpos(lower(t.label),lower(%s))>0))
                ORDER BY CASE WHEN t.id=ANY(%s::uuid[]) THEN 0 ELSE 1
                END,t.label,t.id LIMIT
                100""",
                (tags, bool(tq), tq, tags),
            )
            card_rows = await rows(
                tx,
                """SELECT DISTINCT p.oracle_id::text AS oracle_id,p.name,
                CASE WHEN p.oracle_id=ANY(%s::uuid[]) THEN 0 ELSE 1 END AS priority
                FROM catalog_printings p JOIN catalog_state s ON
                s.active_generation=p.generation_id
                JOIN catalog_generations g ON g.id=s.active_generation JOIN
                catalog_oracle_facts f
                ON f.generation_id=p.generation_id AND f.printing_id=p.id AND
                f.raw_oracle_id=p.oracle_id
                WHERE s.id=1 AND p.lang='en' AND f.transform_version>=2 AND
                f.transform_version=g.schema_version
                AND (p.oracle_id=ANY(%s::uuid[]) OR (%s AND
                strpos(lower(p.name),lower(%s))>0))
                ORDER BY priority,p.name,oracle_id LIMIT 100""",
                (cards, cards, bool(cq), cq),
            )
            source = await read_combo_source(tx)
            outcome_rows = selected = []
            if source["availability"] == "Available":
                outcome_rows = await rows(
                    tx,
                    """SELECT id,name FROM combo_outcomes
                    WHERE publication_id=%s::uuid AND %s AND
                    strpos(lower(name),lower(%s))>0
                    ORDER BY name,id LIMIT 50""",
                    (source["publicationId"], bool(oq), oq),
                )
                if outcomes:
                    selected = await rows(
                        tx,
                        """SELECT id,name FROM combo_outcomes
                        WHERE publication_id=%s::uuid AND id=ANY(%s::text[]) ORDER BY
                        name,id""",
                        (source["publicationId"], outcomes),
                    )
            return cast(
                CategoryRuleChoices,
                dict(
                    tags=tag_rows,
                    cards=[dict(oracleId=r["oracle_id"], name=r["name"]) for r in card_rows],
                    combo=dict(source=source, outcomes=outcome_rows, selectedOutcomes=selected),
                ),
            )

    async def save_definition(self, actor: Actor, value: Document) -> LibraryAcknowledgement:
        raw = normalize_definition(value)
        request, origin, expected = (
            raw["requestId"],
            raw["originId"],
            raw["expectedLibraryRevision"],
        )
        fingerprint = mutation_fingerprint({"kind": "category.library.save", **raw})
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return cast(LibraryAcknowledgement, replay)
            current_revision, existing = await _current(tx, account, origin)
            if origin and existing is None:
                raise CategoryNotFound()
            if current_revision != expected:
                raise LibraryConflict()
            current = existing["current"] if existing else None
            if current and current["scope"] != raw["scope"]:
                raise ValidationError("Definition scope is immutable")
            if raw["scope"] == "entry" and any(
                normalized_name(d["name"]) == normalized_name(raw["name"])
                for d in STARTER_DEFINITIONS
            ):
                raise ValidationError(
                    "This name belongs to an independent starter. Choose a distinct reusable name."
                )
            if (
                current
                and current["meaning"] != raw["meaning"]
                and mutation_fingerprint(current["rule"]) == mutation_fingerprint(raw["rule"])
                and not raw["confirmRetainedRule"]
            ):
                raise ValidationError(
                    "Confirm that the current rule still expresses the changed meaning"
                )
            if not (existing and existing["archived"]) and await _name_in_use(
                tx, account, raw["scope"], raw["name"], origin
            ):
                raise ValidationError("Category name is already used in this scope")
            captured = {
                k: raw[k]
                for k in ("scope", "name", "meaning", "priority", "displayOrder", "roles", "rule")
            }
            unchanged = bool(
                current
                and all(
                    mutation_fingerprint(current[k]) == mutation_fingerprint(v)
                    for k, v in captured.items()
                )
            )
            if unchanged:
                assert current is not None
                ack = dict(
                    requestId=request,
                    libraryRevision=current_revision,
                    originId=origin,
                    versionId=current["id"],
                    changed=False,
                )
            else:
                identifier = origin or new_id()
                definition = {
                    **captured,
                    "id": new_id(),
                    "originId": identifier,
                    "version": current["version"] + 1 if current else 1,
                    "createdAt": now(),
                }
                if current:
                    await tx.execute(
                        "UPDATE category_definition_origins SET "
                        "current_version=%s,normalized_name=%s WHERE id=%s::uuid",
                        (definition["version"], normalized_name(raw["name"]), identifier),
                    )
                else:
                    await tx.execute(
                        """INSERT INTO category_definition_origins
                        (id,account_id,scope,current_version,normalized_name)
                        VALUES(%s::uuid,%s,%s,%s,%s)""",
                        (
                            identifier,
                            account,
                            raw["scope"],
                            definition["version"],
                            normalized_name(raw["name"]),
                        ),
                    )
                await tx.execute(
                    "INSERT INTO "
                    "category_definition_versions(id,origin_id,version,definition) "
                    "VALUES(%s::uuid,%s::uuid,%s,%s::jsonb)",
                    (
                        definition["id"],
                        identifier,
                        definition["version"],
                        serialize_json(definition),
                    ),
                )
                ack = dict(
                    requestId=request,
                    libraryRevision=await _advance(tx, account),
                    originId=identifier,
                    versionId=definition["id"],
                    changed=True,
                )
            await store_receipt(tx, account, request, fingerprint, ack)
            if ack["changed"]:
                if raw["scope"] == "deck":
                    await advance_deck_library_revision(tx, account)
                await publish_category_change(tx, account)
            return cast(LibraryAcknowledgement, ack)

    async def archive_definition(self, actor: Actor, value: Document) -> LibraryAcknowledgement:
        raw = strict(value, ["requestId", "originId", "expectedLibraryRevision", "archived"])
        request, origin, expected = (
            uuid(raw.get("requestId")),
            uuid(raw.get("originId")),
            revision(raw.get("expectedLibraryRevision")),
        )
        archived = raw.get("archived")
        if not isinstance(archived, bool):
            raise ValidationError("Archive choice is required")
        fingerprint = mutation_fingerprint(
            dict(
                kind="category.library.archive",
                originId=origin,
                expected=expected,
                archived=archived,
            )
        )
        async with category_transaction(self.pool) as tx:
            account = await lock_account(tx, self.auth, actor)
            replay = await receipt(tx, account, request, fingerprint)
            if replay is not None:
                return cast(LibraryAcknowledgement, replay)
            rev, existing = await _current(tx, account, origin)
            if not existing:
                raise CategoryNotFound()
            if rev != expected:
                raise LibraryConflict()
            current = existing["current"]
            if not archived:
                if current["scope"] == "entry" and any(
                    normalized_name(d["name"]) == normalized_name(current["name"])
                    for d in STARTER_DEFINITIONS
                ):
                    raise ValidationError(
                        "This name belongs to an independent starter. Rename the "
                        "archived reusable definition before restoring it."
                    )
                if await _name_in_use(tx, account, current["scope"], current["name"], origin):
                    raise ValidationError("Category name is already used in this scope")
            changed = existing["archived"] != archived
            if changed:
                await tx.execute(
                    "UPDATE category_definition_origins SET archived=%s WHERE id=%s::uuid",
                    (archived, origin),
                )
            ack = dict(
                requestId=request,
                originId=origin,
                versionId=current["id"],
                changed=changed,
                libraryRevision=await _advance(tx, account) if changed else rev,
            )
            await store_receipt(tx, account, request, fingerprint, ack)
            if changed:
                if current["scope"] == "deck":
                    await advance_deck_library_revision(tx, account)
                await publish_category_change(tx, account)
            return cast(LibraryAcknowledgement, ack)
