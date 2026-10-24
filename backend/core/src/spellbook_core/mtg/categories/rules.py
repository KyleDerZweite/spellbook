"""Pure entry and whole-deck three-valued rules, independent of SQL and HTTP."""

import re
from typing import Literal

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.categories.common import UUID_PATTERN, Document, integer, utf16_length
from spellbook_core.validation import js_trim

type Truth = Literal["True", "False", "Unknown"]
SEEDS = [
    ("lands", "Lands", None),
    ("board-wipes", "Board wipes", "3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0"),
    ("counterspells", "Counterspells", "690fc968-48ba-4854-a948-3db6bf19d3a9"),
    ("removal", "Removal", "cc12d27d-1d0e-4849-9551-71caead74d24"),
    ("ramp", "Ramp", "2f3e4ad7-5e60-41b4-bdbc-653f16869cf6"),
    ("draw", "Draw", "b6448c45-ce65-4848-aa98-2151e4e07437"),
    ("protection", "Protection", "6e2cdc7c-b02c-4b59-a171-f93723721b79"),
    ("recursion", "Recursion", "82b824ad-648f-467f-a190-2e0fa9a795d2"),
]
STARTER_DEFINITIONS: list[Document] = [
    dict(
        id=f"15ca0000-0000-4000-8000-{i + 1:012}",
        origin=origin,
        name=label,
        rootId=root,
        version=1,
        policyVersion=1,
        mappingVersion=1,
        priority=i,
        displayOrder=i,
        descendants=True,
        excludeLand=origin == "ramp",
    )
    for i, (origin, label, root) in enumerate(SEEDS)
]


def validate_rule(value: object, scope: str) -> Document:
    stack = [(value, 1, scope)]
    nodes = selections = 0
    while stack:
        raw, depth, current_scope = stack.pop()
        if depth > 8:
            raise ValidationError("Rule depth exceeds 8")
        nodes += 1
        if nodes > 128:
            raise ValidationError("Rule nodes exceed 128")
        if not isinstance(raw, dict):
            raise ValidationError("Rule must be an object")
        r: Document = raw
        op = r.get("op")
        fields: list[str]
        expected_scope = current_scope
        match op:
            case "all" | "any":
                fields = ["op", "children"]
                children = r.get("children")
                if not isinstance(children, list) or not children:
                    raise ValidationError("Rule groups require children")
                if nodes + len(stack) + len(children) > 128:
                    raise ValidationError("Rule nodes exceed 128")
                stack.extend((child, depth + 1, current_scope) for child in children)
            case "not":
                fields = ["op", "child"]
                stack.append((r.get("child"), depth + 1, current_scope))
            case "type" | "keyword":
                expected_scope, fields = "entry", ["op", "value"]
                text = r.get("value")
                if (
                    not isinstance(text, str)
                    or js_trim(text) != text
                    or not 1 <= utf16_length(text) <= 128
                ):
                    raise ValidationError("Rule value must contain 1 to 128 characters")
            case "oracleTag":
                expected_scope, fields = "entry", ["op", "tagId", "includeDescendants"]
                _canonical_uuid(r.get("tagId"))
                if not isinstance(r.get("includeDescendants"), bool):
                    raise ValidationError("Tag descendants must be explicit")
            case "mappedTrait":
                expected_scope, fields = "entry", ["op", "traitId", "mappingVersion"]
                if not any(d["origin"] == r.get("traitId") for d in STARTER_DEFINITIONS):
                    raise ValidationError("Unknown mapped trait")
                integer(
                    r.get("mappingVersion"),
                    1,
                    2147483647,
                    "Rule number is outside its allowed range",
                )
            case "canonicalCards":
                expected_scope, fields = "entry", ["op", "oracleIds"]
                ids = r.get("oracleIds")
                if not isinstance(ids, list) or not ids:
                    raise ValidationError("Select at least one canonical card")
                selections += len(ids)
                if selections > 100:
                    raise ValidationError("Rule canonical selections exceed 100")
                for item in ids:
                    _canonical_uuid(item)
                if len(set(ids)) != len(ids):
                    raise ValidationError("Duplicate canonical selection")
            case "minimumCopies" | "minimumDistinct" | "percentage":
                expected_scope = "deck"
                fields = (
                    ["op", "predicate", "basisPoints", "denominator"]
                    if op == "percentage"
                    else ["op", "predicate", "minimum"]
                )
                integer(
                    r.get("basisPoints" if op == "percentage" else "minimum"),
                    0 if op == "percentage" else 1,
                    10000 if op == "percentage" else 2147483647,
                    "Rule number is outside its allowed range",
                )
                if op == "percentage" and r.get("denominator") not in ("all-cards", "nonland"):
                    raise ValidationError("Unknown percentage denominator")
                stack.append((r.get("predicate"), depth + 1, "entry"))
            case "comboParticipant" | "comboOutcome":
                expected_scope = "entry" if op == "comboParticipant" else "deck"
                fields = ["op", "outcomeId", "policyVersion"]
                if (
                    not isinstance(r.get("outcomeId"), str)
                    or not re.fullmatch(r"[1-9][0-9]{0,19}", r["outcomeId"])
                    or r.get("policyVersion") != "ingredients-v1"
                ):
                    raise ValidationError("Invalid documented combo identity or policy")
            case _:
                raise ValidationError("Unknown rule operator")
        if set(r) != set(fields):
            raise ValidationError("Rule fields do not match its operator")
        if current_scope != expected_scope:
            raise ValidationError(
                "Entry rule requires entry scope"
                if expected_scope == "entry"
                else "Aggregate rule requires deck scope"
            )
    assert isinstance(value, dict)
    return value


def _canonical_uuid(value: object) -> None:
    if not isinstance(value, str) or not UUID_PATTERN.fullmatch(value) or value.lower() != value:
        raise ValidationError("Invalid canonical UUID")


def negate(value: Truth) -> Truth:
    return "Unknown" if value == "Unknown" else "False" if value == "True" else "True"


def combine(op: str, values: list[Truth]) -> Truth:
    dominant: Truth = "False" if op == "all" else "True"
    default: Truth = "True" if op == "all" else "False"
    return dominant if dominant in values else "Unknown" if "Unknown" in values else default


def evaluate_entry_rule(
    rule: Document, facts: Document, land_assumption: bool | None = None
) -> Truth:
    op = rule["op"]
    if op in ("all", "any"):
        return combine(
            op, [evaluate_entry_rule(r, facts, land_assumption) for r in rule["children"]]
        )
    if op == "not":
        return negate(evaluate_entry_rule(rule["child"], facts, land_assumption))
    if op == "type" and rule["value"] == "Land" and land_assumption is not None:
        return "True" if land_assumption else "False"
    if op in ("type", "keyword"):
        values = facts.get("types" if op == "type" else "keywords")
        return "Unknown" if values is None else "True" if rule["value"] in values else "False"
    if op == "canonicalCards":
        identity = facts.get("oracleId")
        return "Unknown" if not identity else "True" if identity in rule["oracleIds"] else "False"
    if op == "oracleTag":
        matches = (facts.get("roots") or {}).get(rule["tagId"]) if facts.get("oracleId") else None
        if matches is None:
            return "Unknown"
        return (
            "True"
            if (bool(matches) if rule["includeDescendants"] else rule["tagId"] in matches)
            else "False"
        )
    if op == "mappedTrait":
        if rule["mappingVersion"] != 1:
            return "Unknown"
        d = next(d for d in STARTER_DEFINITIONS if d["origin"] == rule["traitId"])
        land = land_assumption
        if land is None and facts.get("types") is not None:
            land = "Land" in facts["types"]
        if d["origin"] == "lands":
            return "Unknown" if land is None else "True" if land else "False"
        if d["excludeLand"] and land is not False:
            return "False" if land else "Unknown"
        return evaluate_entry_rule(
            dict(op="oracleTag", tagId=d["rootId"], includeDescendants=d["descendants"]), facts
        )
    if op == "comboParticipant":
        result: Truth = (facts.get("comboParticipants") or {}).get(rule["outcomeId"], "Unknown")
        return result
    raise ValueError(f"Invalid entry operator {op}")


def rule_roots(rule: Document) -> list[str]:
    if rule["op"] == "oracleTag":
        return [rule["tagId"]]
    if rule["op"] == "mappedTrait":
        d = next((d for d in STARTER_DEFINITIONS if d["origin"] == rule["traitId"]), {})
        return [d["rootId"]] if rule["mappingVersion"] == 1 and d.get("rootId") else []
    if rule["op"] == "not":
        return rule_roots(rule["child"])
    if rule["op"] in ("all", "any"):
        return [root for child in rule["children"] for root in rule_roots(child)]
    return []


def collect_deck_rule_predicates(rule: Document) -> list[Document]:
    if rule["op"] in ("all", "any"):
        return [p for child in rule["children"] for p in collect_deck_rule_predicates(child)]
    if rule["op"] == "not":
        return collect_deck_rule_predicates(rule["child"])
    return [rule["predicate"]] if "predicate" in rule else []


def order_category_definitions(bundle: list[Document]) -> list[Document]:
    return sorted(
        (d for d in bundle if d.get("automaticEligible") is not False),
        key=lambda d: (d["origin"] != "custom", d["priority"], d.get("originId", d["id"])),
    )


def evaluate_primary(bundle: list[Document], facts: Document) -> Document:
    predicates: list[Document] = []
    for d in order_category_definitions(bundle):
        matches = (facts.get("roots") or {}).get(d["rootId"]) if facts.get("canonical") else None
        if d.get("rule"):
            result = evaluate_entry_rule(
                d["rule"],
                {
                    **facts,
                    "comboParticipants": (facts.get("comboForDefinition") or {}).get(d["id"], {}),
                    "oracleId": facts.get("oracleId") if facts.get("canonical") else None,
                },
            )
        elif d["origin"] == "lands":
            result = evaluate_entry_rule({"op": "type", "value": "Land"}, facts)
        elif d["excludeLand"] and "Land" in (facts.get("types") or []):
            result = "False"
        elif (
            not facts.get("canonical")
            or matches is None
            or (d["excludeLand"] and facts.get("types") is None)
        ):
            result = "Unknown"
        else:
            result = "True" if matches else "False"
        predicates.append(
            dict(
                origin=d["origin"],
                definitionId=d["id"],
                result=result,
                matchedTagIds=matches or [],
            )
        )
        if result != "False":
            return dict(
                state="Pending" if result == "Unknown" else "Automatic",
                origin=d["origin"] if result == "True" else None,
                definitionId=d["id"] if result == "True" else None,
                predicates=predicates,
            )
    return dict(state="Automatic", origin=None, definitionId=None, predicates=predicates)


def evaluate_deck_rule(
    rule: Document,
    entries: list[Document],
    roles: list[str],
    combo_outcomes: dict[str, Truth] | None = None,
) -> Document:
    for e in entries:
        integer(
            e["quantity"],
            1,
            2147483647,
            "Deck rule integrity: quantity must be a positive PostgreSQL integer",
        )
    selected = [e for e in entries if e["role"] in roles]
    evidence = _evaluate_deck(rule, selected, combo_outcomes or {})
    return dict(truth=evidence["truth"], evidence=evidence)


def _evaluate_deck(
    rule: Document, entries: list[Document], outcomes: dict[str, Truth]
) -> Document:
    op = rule["op"]
    if op in ("all", "any", "not"):
        children = [
            _evaluate_deck(child, entries, outcomes)
            for child in ([rule["child"]] if op == "not" else rule["children"])
        ]
        return dict(
            op=op,
            truth=negate(children[0]["truth"])
            if op == "not"
            else combine(op, [c["truth"] for c in children]),
            children=children,
        )
    if op == "comboOutcome":
        return dict(op=op, truth=outcomes.get(rule["outcomeId"], "Unknown"))
    if op == "percentage":
        return _percentage(rule, entries)
    proven: set[str] = set()
    possible: set[str] = set()
    unknown: set[str] = set()
    lower = upper = 0
    for e in entries:
        truth = evaluate_entry_rule(rule["predicate"], e["facts"])
        if op == "minimumCopies":
            lower += e["quantity"] if truth == "True" else 0
            upper += e["quantity"] if truth != "False" else 0
        elif e["facts"].get("oracleId"):
            if truth == "True":
                proven.add(e["facts"]["oracleId"])
            if truth != "False":
                possible.add(e["facts"]["oracleId"])
        elif truth != "False":
            unknown.add(e["printingId"])
    if op == "minimumDistinct":
        lower, upper = len(proven), len(possible) + len(unknown)
    truth = (
        "True" if lower >= rule["minimum"] else "False" if upper < rule["minimum"] else "Unknown"
    )
    return dict(op=op, truth=truth, lower=str(lower), upper=str(upper))


def _percentage(rule: Document, entries: list[Document]) -> Document:
    empty: tuple[int, int] | None = (0, 0)
    nonempty: tuple[int, int] | None = None
    lower = upper = dl = du = 0
    for e in entries:
        facts = e["facts"]
        lands = [False, True] if facts.get("types") is None else ["Land" in facts["types"]]
        states: list[tuple[bool, bool]] = []
        for land in lands:
            denominator = rule["denominator"] == "all-cards" or not land
            if not denominator:
                states.append((False, False))
                continue
            truth = evaluate_entry_rule(rule["predicate"], facts, land)
            if truth != "True":
                states.append((True, False))
            if truth != "False":
                states.append((True, True))
        quantity = e["quantity"]
        lower += quantity if all(n for _, n in states) else 0
        upper += quantity if any(n for _, n in states) else 0
        dl += quantity if all(d for d, _ in states) else 0
        du += quantity if any(d for d, _ in states) else 0
        next_empty: list[int] = []
        next_nonempty: list[int] = []
        for d, n in states:
            contribution = quantity * (10000 * n - int(rule["basisPoints"]) * d)
            if nonempty is not None:
                next_nonempty.extend(x + contribution for x in nonempty)
            if empty is not None:
                target = next_nonempty if d else next_empty
                target.extend(x + contribution for x in empty)
        empty = (min(next_empty), max(next_empty)) if next_empty else None
        nonempty = (min(next_nonempty), max(next_nonempty)) if next_nonempty else None
    truth = (
        "False"
        if nonempty is None or nonempty[1] < 0
        else "True"
        if empty is None and nonempty[0] >= 0
        else "Unknown"
    )
    return dict(
        op=rule["op"],
        truth=truth,
        lower=str(lower),
        upper=str(upper),
        denominatorLower=str(dl),
        denominatorUpper=str(du),
        nonemptyContributionLower=str(nonempty[0]) if nonempty else None,
        nonemptyContributionUpper=str(nonempty[1]) if nonempty else None,
        emptyDenominatorPossible=empty is not None,
    )


def collect_deck_rule_roots(rule: Document) -> list[str]:
    return list(
        dict.fromkeys(root for p in collect_deck_rule_predicates(rule) for root in rule_roots(p))
    )
