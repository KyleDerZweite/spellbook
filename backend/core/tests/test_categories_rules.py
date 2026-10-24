"""Functional transfer of entry and whole-deck rule cases from the Node oracle."""

from copy import deepcopy
from itertools import product

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.categories.common import Document, name, page_values
from spellbook_core.mtg.categories.library import assert_unique_names, normalize_definition
from spellbook_core.mtg.categories.persistence import canonical_identity, evaluate_category_fact
from spellbook_core.mtg.categories.previews import proposed_definitions, release_manual
from spellbook_core.mtg.categories.rules import (
    STARTER_DEFINITIONS,
    collect_deck_rule_predicates,
    evaluate_deck_rule,
    evaluate_entry_rule,
    evaluate_primary,
    rule_roots,
    validate_rule,
)
from spellbook_core.mtg.categories.whole import apply_whole_evaluation

FLYING: Document = dict(op="keyword", value="Flying")
LAND: Document = dict(op="type", value="Land")
RAMP = STARTER_DEFINITIONS[4]["rootId"]
ID = "00000000-0000-4000-8000-000000000001"


def entry(
    facts: Document, quantity: int | float = 1, printing: str = "p", role: str = "main"
) -> Document:
    return dict(facts=facts, quantity=quantity, printingId=printing, role=role)


def run(rule: Document, entries: list[Document]) -> Document:
    return evaluate_deck_rule(rule, entries, ["main"])


def test_primary_priority_unknown_barrier_and_land_ramp_exclusion() -> None:
    facts: Document = dict(types=["Land"], canonical=True, roots={RAMP: [RAMP]})
    result = evaluate_primary(STARTER_DEFINITIONS, facts)
    assert result["origin"] == "lands"
    assert len(result["predicates"]) == 1
    facts["types"] = ["Creature"]
    assert evaluate_primary(STARTER_DEFINITIONS, facts)["state"] == "Pending"
    facts["roots"] = {d["rootId"]: [] for d in STARTER_DEFINITIONS if d["rootId"]}
    facts["roots"][RAMP] = [RAMP]
    assert evaluate_primary(STARTER_DEFINITIONS, facts)["origin"] == "ramp"
    ramp = dict(op="mappedTrait", traitId="ramp", mappingVersion=1)
    assert (
        evaluate_entry_rule(ramp, dict(types=["Land"], oracleId=ID, roots={RAMP: [RAMP]}))
        == "False"
    )
    assert evaluate_entry_rule(ramp, dict(oracleId=ID, roots={RAMP: [RAMP]})) == "Unknown"
    assert evaluate_entry_rule({**ramp, "mappingVersion": 2}, facts) == "Unknown"


def test_custom_priority_origin_identity_and_ineligible_definitions() -> None:
    custom = {
        **STARTER_DEFINITIONS[0],
        "id": "custom",
        "origin": "custom",
        "priority": 100,
        "rule": LAND,
        "originId": "z",
    }
    assert (
        evaluate_primary([*STARTER_DEFINITIONS, custom], dict(types=["Land"]))["definitionId"]
        == "custom"
    )
    other = {**custom, "id": "other", "originId": "a"}
    assert evaluate_primary([custom, other], dict(types=["Land"]))["definitionId"] == "other"
    other["automaticEligible"] = False
    assert evaluate_primary([other, custom], dict(types=["Land"]))["definitionId"] == "custom"


def test_null_facts_and_boolean_rules_remain_three_valued() -> None:
    unknown: Document = dict(op="comboParticipant", outcomeId="42", policyVersion="ingredients-v1")
    for op, expected in [("all", "False"), ("any", "Unknown")]:
        assert (
            evaluate_entry_rule(dict(op=op, children=[unknown, FLYING]), dict(keywords=[]))
            == expected
        )
    assert evaluate_entry_rule(dict(op="not", child=unknown), {}) == "Unknown"
    assert evaluate_entry_rule(dict(op="canonicalCards", oracleIds=[ID]), {}) == "Unknown"
    tag: Document = dict(op="oracleTag", tagId=RAMP, includeDescendants=False)
    assert evaluate_entry_rule(tag, dict(oracleId=ID, roots={RAMP: [ID]})) == "False"
    assert (
        evaluate_entry_rule(
            {**tag, "includeDescendants": True}, dict(oracleId=ID, roots={RAMP: [ID]})
        )
        == "True"
    )
    assert evaluate_entry_rule(tag, dict(roots={RAMP: []})) == "Unknown"


def test_fact_identity_requires_raw_oracle_and_matching_publication_transform() -> None:
    fact: Document = dict(
        catalog_generation_id=ID, transform_version=3, schema_version=3, raw_oracle_id=ID
    )
    assert canonical_identity(fact)
    changes: list[Document] = [
        dict(raw_oracle_id=None),
        dict(schema_version=2),
        dict(transform_version=1),
        dict(catalog_generation_id=None),
    ]
    for change in changes:
        assert not canonical_identity({**fact, **change})
    result = evaluate_category_fact(STARTER_DEFINITIONS, ID, None)
    assert result["state"] == "Pending"
    assert result["evidence"]["types"] is None
    assert result["evidence"]["rawOracleId"] is None


def test_copy_and_distinct_bounds_deduplicate_identities_and_exclude_roles() -> None:
    rule: Document = dict(op="minimumCopies", minimum=3, predicate=FLYING)
    entries = [
        entry(dict(keywords=["Flying"]), 2),
        entry({}, 2, "unknown"),
        entry(dict(keywords=["Flying"]), 100, "side", "sideboard"),
    ]
    assert run(rule, entries) == dict(
        truth="Unknown", evidence=dict(op="minimumCopies", truth="Unknown", lower="2", upper="4")
    )
    assert run({**rule, "minimum": 2}, entries)["truth"] == "True"
    assert run({**rule, "minimum": 5}, entries)["truth"] == "False"
    rule["op"] = "minimumDistinct"
    rule["minimum"] = 2
    entries = [
        entry(dict(oracleId="a", keywords=["Flying"]), 30),
        entry(dict(oracleId="a", keywords=["Flying"]), 20, "other"),
        entry(dict(keywords=["Flying"]), 10, "unknown"),
        entry(dict(keywords=["Flying"]), 10, "unknown", "commander"),
    ]
    result = evaluate_deck_rule(rule, entries, ["main", "commander"])
    assert result["truth"] == "Unknown"
    assert (result["evidence"]["lower"], result["evidence"]["upper"]) == ("1", "2")


@pytest.mark.parametrize("quantity", [0, -1, 0.5, float("nan"), float("inf"), 2147483648, True])
def test_corrupt_quantities_fail_even_outside_participating_roles(quantity: int | float) -> None:
    with pytest.raises(ValidationError, match="integrity"):
        run(
            dict(op="minimumCopies", minimum=1, predicate=FLYING),
            [entry({}, quantity, role="sideboard")],
        )


def test_percentage_empty_denominator_and_exact_large_integer_evidence() -> None:
    rule: Document = dict(op="percentage", predicate=LAND, denominator="nonland", basisPoints=1)
    assert run(rule, [entry({})])["truth"] == "False"
    assert run({**rule, "basisPoints": 0}, [entry({})])["truth"] == "Unknown"
    assert run({**rule, "basisPoints": 0}, [entry(dict(types=["Land"]))])["truth"] == "False"
    entries = [entry(dict(keywords=["Flying"]), 2147483647, str(i)) for i in range(500)]
    result = run(
        dict(op="percentage", predicate=FLYING, denominator="all-cards", basisPoints=0.0), entries
    )
    assert result["evidence"]["nonemptyContributionLower"] == "10737418235000000"
    entries = [
        entry(dict(keywords=["Flying"]), 2147483647),
        entry(dict(keywords=[]), 2147483647, "other"),
    ]
    rule = dict(op="percentage", predicate=FLYING, denominator="all-cards", basisPoints=5000.0)
    assert run(rule, entries)["truth"] == "True"
    assert run({**rule, "basisPoints": 5001.0}, entries)["truth"] == "False"


def test_percentage_exhaustive_small_completion_oracle() -> None:
    """Complete facts independently evaluate every decisive bound result."""
    predicates = [
        LAND,
        FLYING,
        dict(op="not", child=LAND),
        dict(op="all", children=[LAND, FLYING]),
        dict(op="any", children=[LAND, FLYING]),
    ]
    profiles: list[Document] = [
        {},
        dict(types=[]),
        dict(types=["Land"]),
        dict(keywords=[]),
        dict(keywords=["Flying"]),
    ]
    for a, b, predicate, denominator, bp in product(
        profiles, profiles, predicates, ["all-cards", "nonland"], [0, 1, 3333, 5000, 6667, 10000]
    ):
        rule = dict(op="percentage", predicate=predicate, denominator=denominator, basisPoints=bp)
        result = run(rule, [entry(a), entry(b, 2, "other")])["truth"]
        if result == "Unknown":
            continue
        completions = []
        for profile in (a, b):
            completions.append(
                [
                    dict(types=t, keywords=k)
                    for t, k in product(
                        [profile["types"]] if "types" in profile else [[], ["Land"]],
                        [profile["keywords"]] if "keywords" in profile else [[], ["Flying"]],
                    )
                ]
            )
        for ca, cb in product(*completions):
            d = n = 0
            for quantity, facts in [(1, ca), (2, cb)]:
                if denominator == "nonland" and "Land" in facts["types"]:
                    continue
                d += quantity
                n += quantity if evaluate_entry_rule(predicate, facts) == "True" else 0
            assert result == ("True" if d and 10000 * n >= bp * d else "False")


@pytest.mark.parametrize(
    "rule,scope",
    [
        (dict(op="all", children=[]), "entry"),
        (dict(op="type", value="Land", extra=True), "entry"),
        (dict(op="type", value="Land"), "deck"),
        (dict(op="minimumCopies", predicate=LAND, minimum=0), "deck"),
        (dict(op="canonicalCards", oracleIds=[ID, ID]), "entry"),
        (
            dict(op="canonicalCards", oracleIds=["abcd0000-0000-4000-8000-000000000001".upper()]),
            "entry",
        ),
        (dict(op="comboParticipant", outcomeId="01", policyVersion="ingredients-v1"), "entry"),
    ],
)
def test_invalid_rules_fail_closed(rule: Document, scope: str) -> None:
    with pytest.raises(ValidationError):
        validate_rule(rule, scope)


def test_rule_depth_node_and_selection_limits_and_root_collection() -> None:
    rule = LAND
    for _ in range(7):
        rule = dict(op="not", child=rule)
    assert validate_rule(rule, "entry") == rule
    with pytest.raises(ValidationError, match="depth"):
        validate_rule(dict(op="not", child=rule), "entry")
    with pytest.raises(ValidationError, match="nodes"):
        validate_rule(dict(op="all", children=[LAND] * 128), "entry")
    with pytest.raises(ValidationError, match="exceed 100"):
        validate_rule(dict(op="canonicalCards", oracleIds=[ID] * 101), "entry")
    predicate = dict(op="mappedTrait", traitId="ramp", mappingVersion=1)
    rule = dict(op="minimumCopies", predicate=predicate, minimum=1)
    assert collect_deck_rule_predicates(rule) == [predicate]
    assert rule_roots(predicate) == [RAMP]


def version(**values: object) -> Document:
    return dict(
        id=ID,
        originId=ID,
        scope="entry",
        version=1,
        name="Flying cards",
        meaning="Purpose",
        rule=FLYING,
        priority=0,
        displayOrder=0,
        roles=["main"],
        createdAt="2026-10-23T00:00:00.000Z",
        **values,
    )


def test_definition_normalization_unicode_and_historical_manual_retention() -> None:
    value = {k: v for k, v in version().items() if k not in ("id", "version", "createdAt")}
    value.update(
        requestId=ID,
        originId=None,
        expectedLibraryRevision="0",
        confirmRetainedRule=False,
        name=" Cafe\u0301 ",
        roles=["commander", "main"],
    )
    assert normalize_definition(value)["name"] == "Café"
    assert normalize_definition(value)["roles"] == ["commander", "main"]
    assert name("\ufeffx\ufeff") == "x"
    assert name("\x85x\x85") == "\x85x\x85"
    with pytest.raises(ValidationError):
        name("😀" * 65)
    with pytest.raises(ValidationError):
        assert_unique_names([dict(name="É"), dict(name="e\u0301")])
    current = [{**STARTER_DEFINITIONS[0], "originId": "old", "id": "local"}]
    manual = [dict(categoryId="local")]
    library: Document = dict(revision="0", definitions=[])
    proposed = proposed_definitions(current, library, [], manual)
    assert next(d for d in proposed if d["id"] == "local")["automaticEligible"] is False
    assert not any(d["id"] == "local" for d in proposed_definitions(current, library, [], []))
    assert page_values(dict(offset=None, limit=None), "Library") == (0, 50)


def test_whole_unknown_retains_valid_evidence_and_manual_choice_wins() -> None:
    category: Document = dict(versionId=ID, suppressed=False, automaticActive=True, decision=None)
    good = dict(attemptedTruth="True", compositionRevision="1")
    evaluated = apply_whole_evaluation(category, good)
    pending = apply_whole_evaluation(
        evaluated, dict(attemptedTruth="Unknown", compositionRevision="2")
    )
    assert pending["decision"]["truth"] == "True"
    assert pending["decision"]["evidence"] == good
    assert pending["decision"]["previousEvaluation"]["compositionRevision"] == "2"
    assert pending["decision"]["state"] == "Pending"
    assert apply_whole_evaluation(pending, pending["decision"]["previousEvaluation"]) == pending
    manual = deepcopy(pending)
    manual["decision"].update(state="Manual", manual="Include")
    assert apply_whole_evaluation(manual, dict(attemptedTruth="False")) == manual
    assert release_manual(manual["decision"], "Review") == manual["decision"]
    released = release_manual(manual["decision"], "Reset")
    assert released and released["manual"] is None
    assert released["evidence"] == manual["decision"]["previousEvaluation"]
