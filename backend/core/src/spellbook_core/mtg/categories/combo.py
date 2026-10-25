"""Optional local Commander Spellbook facts and pure documented-ingredient matching."""

import re

from spellbook_core.db import Transaction
from spellbook_core.fingerprint import serialize_json
from spellbook_core.mtg.categories.collation import locale_sort_key
from spellbook_core.mtg.categories.common import (
    ROLES,
    UUID_PATTERN,
    Document,
    combo_enabled,
    first,
    integer,
    rows,
    timestamp,
)
from spellbook_core.mtg.categories.rules import Truth


def combo_outcomes(rule: Document) -> list[str]:
    op = rule["op"]
    if op in ("comboParticipant", "comboOutcome"):
        return [rule["outcomeId"]]
    if op in ("all", "any"):
        return list(dict.fromkeys(o for c in rule["children"] for o in combo_outcomes(c)))
    if op == "not":
        return combo_outcomes(rule["child"])
    return combo_outcomes(rule["predicate"]) if "predicate" in rule else []


def _participant_rule(rule: Document) -> bool:
    op = rule["op"]
    if op == "comboParticipant":
        return True
    if op in ("all", "any"):
        return any(_participant_rule(c) for c in rule["children"])
    if op == "not":
        return _participant_rule(rule["child"])
    return "predicate" in rule and _participant_rule(rule["predicate"])


def _valid_oracle(value: object) -> bool:
    return isinstance(value, str) and bool(UUID_PATTERN.fullmatch(value))


def _variant_truth(
    variant: Document,
    available: dict[str, list[int]],
    unknown: list[int],
    total: int,
    commander_total: int,
) -> Truth:
    ingredients = variant["ingredients"]
    supported = (
        variant["status"] == "OK"
        and bool(ingredients)
        and not variant["templates"]
        and not variant["unsupportedReasons"]
    )
    required: dict[str, list[int]] = {}
    rt = rc = 0
    for ingredient in ingredients:
        if not re.fullmatch(r"[1-9][0-9]*", ingredient["quantity"]):
            supported = False
            continue
        qty = int(ingredient["quantity"])
        commander = ingredient["mustBeCommander"]
        rt += qty
        rc += qty if commander else 0
        identity = ingredient["oracleId"]
        if not _valid_oracle(identity):
            supported = False
        else:
            amounts = required.setdefault(identity, [0, 0])
            amounts[0] += qty
            amounts[1] += qty if commander else 0
        if (
            ingredient["usedFace"] is not None
            or not ingredient["zones"]
            or any(z not in {"H", "B", "C", "E", "G", "L"} for z in ingredient["zones"])
            or any(s != "" for s in ingredient["states"].values())
        ):
            supported = False
    if rt > total or rc > commander_total:
        return "False"
    deficit = commander_deficit = 0
    for identity, amounts in required.items():
        held = available.get(identity, [0, 0])
        ordinary = max(0, amounts[0] - held[0])
        commander = max(0, amounts[1] - held[1])
        deficit += max(ordinary, commander)
        commander_deficit += commander
    if deficit > unknown[0] or commander_deficit > unknown[1]:
        return "False"
    return "True" if supported and deficit == 0 else "Unknown"


def _uncertain_identities(variant: Document, role: str) -> bool:
    def eligible(ingredient: Document) -> bool:
        return not ingredient["mustBeCommander"] or role == "commander"

    preserving = {"used-face", "card-state", "status", "zones", "oracle-id", "templates"}
    return (
        any(eligible(t) for t in variant["templates"])
        or (not variant["ingredients"] and not variant["templates"])
        or any(eligible(i) and not _valid_oracle(i["oracleId"]) for i in variant["ingredients"])
        or any(
            r not in preserving and (r != "empty-ingredients" or variant["ingredients"])
            for r in variant["unsupportedReasons"]
        )
    )


def evaluate_combo_variants(input: Document) -> Document:
    roles = [r for r in ROLES if r in input["roles"]]
    participants: dict[str, Truth] = {}
    available: dict[str, list[int]] = {}
    unknown = [0, 0]
    total = commander_total = 0
    for entry in input["entries"]:
        qty = integer(
            entry["quantity"],
            1,
            2147483647,
            "Combo matcher integrity: quantity must be a positive PostgreSQL integer",
        )
        participants[entry["entryId"]] = "False"
        if entry["role"] not in roles:
            continue
        commander = entry["role"] == "commander"
        total += qty
        commander_total += qty if commander else 0
        amounts = (
            available.setdefault(entry["oracleId"], [0, 0])
            if _valid_oracle(entry["oracleId"])
            else unknown
        )
        amounts[0] += qty
        amounts[1] += qty if commander else 0
    result: Document = dict(
        outcomeId=input["outcomeId"],
        roles=roles,
        truth="Unknown",
        participants=participants,
        participantProofs={},
        proof=None,
    )
    publication = input["publication"]
    if not publication or not publication["complete"] or not publication["outcomePresent"]:
        for e in input["entries"]:
            if e["role"] in roles:
                participants[e["entryId"]] = "Unknown"
        return result
    result["truth"] = "False"
    for variant in sorted(input["variants"], key=lambda v: locale_sort_key(v["id"])):
        if input["outcomeId"] not in variant["outcomeIds"]:
            continue
        truth = _variant_truth(variant, available, unknown, total, commander_total)
        if truth == "False":
            continue
        proof = None
        if truth == "True":
            result["truth"] = "True"
            proof = dict(
                variant=variant,
                publicationId=publication["publicationId"],
                outcomeId=input["outcomeId"],
                roles=roles,
                policyVersion="ingredients-v1",
                parserVersion=publication["parserVersion"],
            )
            if result["proof"] is None:
                result["proof"] = proof
        elif result["truth"] != "True":
            result["truth"] = "Unknown"
        for entry in input["entries"]:
            identity, eid, role = entry["oracleId"], entry["entryId"], entry["role"]
            if role not in roles or participants[eid] == "True":
                continue
            compatible = any(
                (not i["mustBeCommander"] or role == "commander")
                and (
                    not _valid_oracle(identity)
                    or not _valid_oracle(i["oracleId"])
                    or i["oracleId"] == identity
                )
                for i in variant["ingredients"]
            )
            if compatible:
                participants[eid] = (
                    "True" if truth == "True" and _valid_oracle(identity) else "Unknown"
                )
                if participants[eid] == "True" and proof:
                    result["participantProofs"][eid] = proof
            elif _uncertain_identities(variant, role):
                participants[eid] = "Unknown"
    return result


async def read_combo_source(tx: Transaction) -> Document:
    row = await first(
        tx,
        """SELECT s.active_publication::text,s.refresh_status,
        p.source_updated_at,p.source_version,p.payload_digest,p.decoded_digest,
        p.parser_version,p.policy_version FROM combo_state s
        LEFT JOIN combo_publications p ON p.id=s.active_publication WHERE s.id=1""",
    )
    enabled = combo_enabled(tx)
    return dict(
        enabled=enabled,
        publicationId=row.get("active_publication"),
        policyVersion="ingredients-v1",
        availability="Disabled"
        if not enabled
        else "Available"
        if row.get("active_publication") and row.get("policy_version") == "ingredients-v1"
        else "Unavailable",
        refreshStatus=row.get("refresh_status") or {"kind": "NeverAttempted"},
        sourceTime=timestamp(row.get("source_updated_at")),
        sourceVersion=row.get("source_version"),
        payloadDigest=row.get("payload_digest"),
        decodedDigest=row.get("decoded_digest"),
        parserVersion=row.get("parser_version"),
    )


def combo_source_token(source: Document) -> Document:
    return {k: source[k] for k in ("enabled", "publicationId", "policyVersion")}


class ComboFacts:
    def __init__(self, source: Document, evaluations: dict[tuple[tuple[str, ...], str], Document]):
        self.source = source
        self.evaluations = evaluations

    def for_definition(self, definition: Document) -> list[Document]:
        key = tuple(sorted(set(definition["roles"])))
        return [self.evaluations[(key, o)] for o in combo_outcomes(definition["rule"])]

    def evidence(self, definition: Document, entry_id: str | None = None) -> Document:
        evaluations: list[Document] = []
        for evaluation in self.for_definition(definition):
            rest = {
                k: v
                for k, v in evaluation.items()
                if k not in ("participants", "participantProofs")
            }
            if entry_id is not None:
                rest.update(
                    participantTruth=evaluation["participants"].get(entry_id, "False"),
                    proof=evaluation["participantProofs"].get(entry_id),
                )
            elif _participant_rule(definition["rule"]):
                witnesses: dict[str, Document] = {}
                for eid, proof in sorted(evaluation["participantProofs"].items()):
                    witnesses.setdefault(proof["variant"]["id"], dict(proof=proof, entryIds=[]))[
                        "entryIds"
                    ].append(eid)
                rest["participantWitnesses"] = [
                    witnesses[k] for k in sorted(witnesses, key=locale_sort_key)
                ]
            evaluations.append(rest)
        return dict(source=self.source, evaluations=evaluations)


async def read_combo_facts(
    tx: Transaction, entries: list[Document], definitions: list[Document], source: Document
) -> ComboFacts:
    groups: dict[tuple[str, ...], set[str]] = {}
    for d in definitions:
        outcomes = combo_outcomes(d["rule"])
        if outcomes:
            groups.setdefault(tuple(sorted(set(d["roles"]))), set()).update(outcomes)
    evaluations: dict[tuple[tuple[str, ...], str], Document] = {}
    publication = source["publicationId"] if source["availability"] == "Available" else None
    for roles, group_outcomes in groups.items():
        known: dict[str, list[int]] = {}
        unknown = unknown_commander = 0
        for e in entries:
            if e["role"] not in roles:
                continue
            quantity = e["quantity"]
            if e["oracleId"]:
                available = known.setdefault(e["oracleId"], [0, 0])
                available[0] += quantity
                available[1] += quantity if e["role"] == "commander" else 0
            else:
                unknown += quantity
                unknown_commander += quantity if e["role"] == "commander" else 0
        available_json = serialize_json(
            [
                dict(id=identity, total=str(q[0]), commander=str(q[1]))
                for identity, q in known.items()
            ]
        )
        for outcome in sorted(group_outcomes):
            present = bool(
                publication
                and await first(
                    tx,
                    "SELECT 1 FROM combo_outcomes WHERE publication_id=%s::uuid AND id=%s",
                    (publication, outcome),
                )
            )
            variants: list[Document] = []
            if present:
                # Prune only mandatory known-identity deficits at the possible
                # upper bound. Unsupported but potentially satisfiable rows remain.
                after = ""
                while True:
                    page = await rows(
                        tx,
                        """WITH available AS (
                        SELECT * FROM jsonb_to_recordset(%s::jsonb)
                        AS a(id text,total numeric,commander numeric))
                        SELECT v.id,v.document FROM combo_variant_outcomes o
                        JOIN combo_variants v ON v.publication_id=o.publication_id
                        AND v.id=o.variant_id WHERE o.publication_id=%s::uuid
                        AND o.outcome_id=%s AND v.id>%s AND NOT EXISTS (
                        SELECT i.oracle_id FROM combo_variant_ingredients i
                        LEFT JOIN available a ON a.id=i.oracle_id::text
                        WHERE i.publication_id=v.publication_id AND i.variant_id=v.id
                        AND i.oracle_id IS NOT NULL
                        GROUP BY i.oracle_id,a.total,a.commander
                        HAVING sum(i.quantity)>coalesce(a.total,0)+%s::numeric
                        OR coalesce(sum(i.quantity) FILTER (WHERE i.must_be_commander),0)
                        >coalesce(a.commander,0)+%s::numeric)
                        ORDER BY v.id LIMIT 100""",
                        (
                            available_json,
                            publication,
                            outcome,
                            after,
                            str(unknown),
                            str(unknown_commander),
                        ),
                    )
                    variants.extend(r["document"] for r in page)
                    if len(page) < 100:
                        break
                    after = page[-1]["id"]
            evaluations[(roles, outcome)] = evaluate_combo_variants(
                dict(
                    entries=entries,
                    roles=list(roles),
                    outcomeId=outcome,
                    variants=variants,
                    publication=dict(
                        publicationId=publication,
                        parserVersion=source["parserVersion"],
                        complete=True,
                        outcomePresent=present,
                    )
                    if publication and source["parserVersion"] is not None
                    else None,
                )
            )
    return ComboFacts(source, evaluations)
