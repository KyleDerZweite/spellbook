"""Coherent published facts, adopted definitions and primary entry decisions."""

from spellbook_core.db import Transaction
from spellbook_core.fingerprint import mutation_fingerprint, serialize_json
from spellbook_core.mtg.categories.combo import (
    ComboFacts,
    combo_outcomes,
    combo_source_token,
    read_combo_facts,
    read_combo_source,
)
from spellbook_core.mtg.categories.common import (
    UUID_PATTERN,
    Document,
    first,
    new_id,
    rows,
    timestamp,
    transaction_read_only,
)
from spellbook_core.mtg.categories.library import assert_unique_names, read_library
from spellbook_core.mtg.categories.rules import STARTER_DEFINITIONS, evaluate_primary, rule_roots


def proven_transform(fact: Document) -> bool:
    return (
        fact.get("catalog_generation_id") is not None
        and fact.get("transform_version") is not None
        and fact["transform_version"] >= 2
        and fact["transform_version"] == fact.get("schema_version")
    )


def canonical_identity(fact: Document) -> bool:
    return (
        proven_transform(fact)
        and isinstance(fact.get("raw_oracle_id"), str)
        and bool(UUID_PATTERN.fullmatch(fact["raw_oracle_id"]))
    )


def entry_combo_definitions(definitions: list[Document]) -> list[Document]:
    return [
        dict(
            id=d["id"],
            roles=(d.get("definitionSnapshot") or {}).get("roles", ["main"]),
            rule=d["rule"],
        )
        for d in definitions
        if d.get("rule") and combo_outcomes(d["rule"])
    ]


async def read_entry_category_facts(
    tx: Transaction,
    printing_ids: list[str],
    definitions: list[Document],
    combo_definitions: list[Document] | None = None,
) -> tuple[dict[str, Document], Document, Document, Document | None]:
    combo_definitions = (
        entry_combo_definitions(definitions) if combo_definitions is None else combo_definitions
    )
    applicable = any(combo_outcomes(d["rule"]) for d in combo_definitions)
    if applicable and not transaction_read_only(tx):
        await tx.execute("SELECT id FROM catalog_state WHERE id=1 FOR SHARE")
        await tx.execute("SELECT id FROM oracle_tag_state WHERE id=1 FOR SHARE")
        await tx.execute("SELECT pg_advisory_xact_lock_shared(1936747619,23)")
        await tx.execute("SELECT id FROM combo_state WHERE id=1 FOR SHARE")
    combo_source = await read_combo_source(tx) if applicable else None
    ids = list(dict.fromkeys(i for i in printing_ids if UUID_PATTERN.fullmatch(i)))
    roots = list(
        dict.fromkeys(
            root
            for d in definitions
            for root in (
                rule_roots(d["rule"])
                if d.get("rule")
                else [d["rootId"]]
                if d.get("rootId")
                else []
            )
        )
    )
    found = await rows(
        tx,
        """WITH source AS (
        SELECT cs.active_generation AS catalog_generation_id,g.schema_version,
        os.active_publication AS
        oracle_publication_id,op.source_updated_at AS source_time,
        op.payload_digest,op.parser_version FROM catalog_state cs
        LEFT JOIN catalog_generations g ON g.id=cs.active_generation
        CROSS JOIN oracle_tag_state os
        LEFT JOIN oracle_tag_publications op ON
        op.id=os.active_publication WHERE cs.id=1 AND
        os.id=1),
        requests AS (SELECT unnest(%s::uuid[]) AS printing_id)
        SELECT
        r.printing_id::text,f.raw_oracle_id::text,f.types,f.keywords,f.transform_version,
        s.catalog_generation_id::text,s.schema_version,s.oracle_publication_id::text,
        s.source_time,s.payload_digest,s.parser_version,
        COALESCE((SELECT jsonb_object_agg(root.id::text,CASE WHEN t.id IS
        NULL THEN NULL ELSE
        COALESCE((SELECT jsonb_agg(DISTINCT m.tag_id::text) FROM oracle_tag_closure c
        JOIN oracle_tag_memberships m ON m.publication_id=c.publication_id AND
        m.tag_id=c.descendant_id
        WHERE c.publication_id=s.oracle_publication_id AND c.ancestor_id=root.id
        AND m.oracle_id=f.raw_oracle_id),'[]'::jsonb) END)
        FROM unnest(%s::uuid[]) root(id) LEFT JOIN oracle_tags t
        ON t.publication_id=s.oracle_publication_id AND
        t.id=root.id),'{}'::jsonb) AS roots
        FROM source s LEFT JOIN requests r ON true LEFT JOIN catalog_oracle_facts f
        ON f.generation_id=s.catalog_generation_id AND f.printing_id=r.printing_id""",
        (ids, roots),
    )
    facts: dict[str, Document] = {}
    for r in found:
        if r["printing_id"] is None:
            continue
        facts[r["printing_id"]] = {
            **r,
            "canonical": canonical_identity(r),
            "types": r["types"] if proven_transform(r) else None,
            "keywords": r["keywords"]
            if proven_transform(r) and r["transform_version"] >= 3
            else None,
        }
    source = found[0] if found else {}
    tokens: Document = dict(
        catalogGenerationId=source.get("catalog_generation_id"),
        oraclePublicationId=source.get("oracle_publication_id"),
        policy=mutation_fingerprint(definitions),
    )
    if combo_source:
        tokens["combo"] = combo_source_token(combo_source)
    return facts, tokens, source, combo_source


async def adopted_definitions(tx: Transaction, deck_id: str) -> list[Document] | None:
    row = await first(
        tx, "SELECT definitions FROM deck_category_bundles WHERE deck_id=%s::uuid", (deck_id,)
    )
    return row["definitions"] if row else None


def adopt_custom_definition(version: Document, local_id: str | None = None) -> Document:
    return dict(
        id=local_id or new_id(),
        origin="custom",
        originId=version["originId"],
        definitionVersionId=version["id"],
        definitionSnapshot=version,
        name=version["name"],
        meaning=version["meaning"],
        rule=version["rule"],
        version=version["version"],
        priority=version["priority"],
        displayOrder=version["displayOrder"],
        policyVersion=1,
        mappingVersion=1,
        rootId=None,
        descendants=True,
        excludeLand=False,
        automaticEligible="main" in version["roles"],
    )


def origin_identity(definition: Document) -> str:
    if definition.get("originId"):
        return str(definition["originId"])
    return str(
        next(
            (d["id"] for d in STARTER_DEFINITIONS if d["origin"] == definition["origin"]),
            definition["id"],
        )
    )


async def read_category_composition(tx: Transaction, deck_id: str) -> list[Document]:
    found = await rows(
        tx,
        "SELECT id::text,catalog_card_id,role,quantity FROM deck_cards WHERE "
        "deck_id=%s::uuid ORDER BY id",
        (deck_id,),
    )
    return [
        dict(
            entryId=r["id"],
            printingId=r["catalog_card_id"],
            role=r["role"],
            quantity=r["quantity"],
        )
        for r in found
    ]


def combo_composition(composition: list[Document], facts: dict[str, Document]) -> list[Document]:
    return [
        {
            **e,
            "oracleId": facts.get(e["printingId"], {}).get("raw_oracle_id")
            if facts.get(e["printingId"], {}).get("canonical")
            else None,
        }
        for e in composition
    ]


def evaluate_category_fact(
    definitions: list[Document],
    printing_id: str,
    fact: Document | None,
    combos: ComboFacts | None = None,
    entry_id: str | None = None,
) -> Document:
    f = fact or {}
    combo_by_definition = {}
    if combos:
        for d in entry_combo_definitions(definitions):
            combo_by_definition[d["id"]] = {
                e["outcomeId"]: e["participants"].get(entry_id, "Unknown")
                for e in combos.for_definition(d)
            }
    outcome = evaluate_primary(
        definitions,
        dict(
            types=f.get("types"),
            keywords=f.get("keywords"),
            canonical=f.get("canonical", False),
            oracleId=f.get("raw_oracle_id"),
            roots=f.get("roots", {}),
            comboForDefinition=combo_by_definition,
        ),
    )
    by_id = {d["id"]: d for d in definitions}
    selected = by_id.get(outcome["definitionId"])
    predicates = [
        {
            **p,
            "definitionName": by_id[p["definitionId"]]["name"],
            "definitionVersion": by_id[p["definitionId"]]["version"],
        }
        for p in outcome["predicates"]
    ]
    evidence = dict(
        predicates=predicates,
        catalogGenerationId=f.get("catalog_generation_id"),
        oraclePublicationId=f.get("oracle_publication_id"),
        sourceTime=timestamp(f.get("source_time")),
        payloadDigest=f.get("payload_digest"),
        parserVersion=f.get("parser_version"),
        printingId=printing_id,
        rawOracleId=f.get("raw_oracle_id") if f.get("canonical") else None,
        types=f.get("types"),
        transformVersion=f.get("transform_version"),
    )
    evaluated = [by_id[p["definitionId"]] for p in predicates]
    if combos and entry_combo_definitions(evaluated):
        evidence["combo"] = dict(
            source=combos.source,
            evaluations=[
                v
                for d in entry_combo_definitions(evaluated)
                for v in combos.evidence(d, entry_id)["evaluations"]
            ],
        )
    return dict(
        state=outcome["state"],
        categoryId=selected["id"] if selected else None,
        evidence=evidence,
        definitionSnapshot=(selected.get("definitionSnapshot") or selected) if selected else None,
    )


async def read_decisions(tx: Transaction, deck_id: str) -> list[Document]:
    found = await rows(
        tx,
        """SELECT entry_id::text,category_id::text,state,revision::text,
        evidence,definition_snapshot,previous_evaluation FROM
        deck_entry_category_decisions
        WHERE deck_id=%s::uuid ORDER BY entry_id""",
        (deck_id,),
    )
    return [
        dict(
            entryId=r["entry_id"],
            categoryId=r["category_id"],
            state=r["state"],
            revision=r["revision"],
            evidence=r["evidence"],
            definitionSnapshot=r["definition_snapshot"],
            previousEvaluation=r["previous_evaluation"],
        )
        for r in found
    ]


async def store_entry_decision(tx: Transaction, deck_id: str, decision: Document) -> None:
    await tx.execute(
        """INSERT INTO deck_entry_category_decisions(entry_id,deck_id,category_id,state,
        revision,evidence,definition_snapshot,previous_evaluation)
        VALUES(%s::uuid,%s::uuid,%s::uuid,
        %s,%s::bigint,%s::jsonb,%s::jsonb,%s::jsonb) ON CONFLICT(entry_id) DO UPDATE SET
        category_id=EXCLUDED.category_id,state=EXCLUDED.state,revision=EXCLUDED.revision,
        evidence=EXCLUDED.evidence,definition_snapshot=EXCLUDED.definition_snapshot,
        previous_evaluation=EXCLUDED.previous_evaluation""",
        (
            decision["entryId"],
            deck_id,
            decision["categoryId"],
            decision["state"],
            decision["revision"],
            serialize_json(decision["evidence"]) if decision.get("evidence") is not None else None,
            serialize_json(decision["definitionSnapshot"])
            if decision.get("definitionSnapshot") is not None
            else None,
            serialize_json(decision["previousEvaluation"])
            if decision.get("previousEvaluation") is not None
            else None,
        ),
    )


async def ensure_entry_category_initialization(tx: Transaction, deck_id: str) -> list[str]:
    """Adopt once and classify missing Main decisions under caller-held Deck locks."""
    from spellbook_core.mtg.categories.jobs import queue_whole_deck_evaluation

    definitions = await adopted_definitions(tx, deck_id)
    if definitions is None:
        owner = await first(tx, "SELECT account_id FROM decks WHERE id=%s::uuid", (deck_id,))
        library = await read_library(tx, owner["account_id"], True)
        active = [d["current"] for d in library["definitions"] if not d["archived"]]
        definitions = [adopt_custom_definition(v) for v in active if v["scope"] == "entry"] + [
            {**d, "originId": d["id"], "id": new_id()} for d in STARTER_DEFINITIONS
        ]
        assert_unique_names(definitions)
        whole = [v for v in active if v["scope"] == "deck"]
        await tx.execute(
            """INSERT INTO deck_category_bundles
            (deck_id,definitions,whole_deck_definitions,library_revision)
            VALUES(%s::uuid,%s::jsonb,%s::jsonb,%s::bigint)""",
            (deck_id, serialize_json(definitions), serialize_json(whole), library["revision"]),
        )
        await tx.execute(
            """INSERT INTO deck_whole_categories
            (deck_id,version_id,origin_id,definition_snapshot,name,display_order)
            SELECT
            deck_id,(v->>'id')::uuid,(v->>'originId')::uuid,v,v->>'name',(v->>'displayOrder')::integer
            FROM deck_category_bundles CROSS JOIN LATERAL
            jsonb_array_elements(whole_deck_definitions) v
            WHERE deck_id=%s::uuid""",
            (deck_id,),
        )
        await queue_whole_deck_evaluation(tx, deck_id)
    missing = await rows(
        tx,
        """SELECT c.id::text,c.catalog_card_id FROM deck_cards c
        LEFT JOIN deck_entry_category_decisions d ON d.entry_id=c.id
        WHERE c.deck_id=%s::uuid
        AND c.role='main' AND d.entry_id IS NULL""",
        (deck_id,),
    )
    if not missing:
        return []
    composition = await read_category_composition(tx, deck_id)
    facts, _, _, source = await read_entry_category_facts(
        tx, [e["printingId"] for e in composition], definitions
    )
    combos = (
        await read_combo_facts(
            tx, combo_composition(composition, facts), entry_combo_definitions(definitions), source
        )
        if source
        else None
    )
    for row in missing:
        evaluated = evaluate_category_fact(
            definitions,
            row["catalog_card_id"],
            facts.get(row["catalog_card_id"]),
            combos,
            row["id"],
        )
        await store_entry_decision(
            tx,
            deck_id,
            {**evaluated, "entryId": row["id"], "revision": "1", "previousEvaluation": None},
        )
    await tx.execute(
        "UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE "
        "deck_id=%s::uuid",
        (deck_id,),
    )
    return [r["id"] for r in missing]
