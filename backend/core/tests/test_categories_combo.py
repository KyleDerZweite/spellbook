"""Recorded public Oak/Denizen vectors and pure Combo participation regressions."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from spellbook_core.categories.collation import locale_sort_key
from spellbook_core.categories.combo import ComboFacts, evaluate_combo_variants
from spellbook_core.categories.common import Document
from spellbook_core.categories.rules import evaluate_deck_rule

# Exact recorded variant from frontend/tests/unit/combo-matcher.test.ts,
# official variant 2850-4186, retrieved 2026-10-08.
OAK: Document = json.loads(
    (Path(__file__).parent / "fixtures/category-combo-oak.json").read_text()
)
A = OAK["ingredients"][0]["oracleId"]
B = OAK["ingredients"][1]["oracleId"]
OTHER = "00000000-0000-4000-8000-000000000099"
PUBLICATION: Document = dict(
    publicationId="p", parserVersion=1, complete=True, outcomePresent=True
)


def entry(identifier: str, oracle: str | None, role: str = "main", quantity: int = 1) -> Document:
    return dict(
        entryId=identifier,
        printingId=oracle or identifier,
        oracleId=oracle,
        role=role,
        quantity=quantity,
    )


def run(
    entries: list[Document], variants: list[Document] | None = None, **values: object
) -> Document:
    return evaluate_combo_variants(
        dict(
            entries=entries,
            variants=[OAK] if variants is None else variants,
            roles=["main", "commander"],
            outcomeId="2244",
            publication=PUBLICATION,
            **values,
        )
    )


def test_recorded_oak_denizen_and_near_miss_keep_inspectable_prerequisites() -> None:
    result = run([entry("oak", A), entry("denizen", B)])
    assert result["truth"] == "True"
    assert result["participants"] == dict(oak="True", denizen="True")
    assert result["proof"]["variant"] == OAK
    assert result["proof"]["variant"]["mana"] == "{2}{G}"
    assert [i["zones"] for i in OAK["ingredients"]] == [["H"], ["B"]]
    assert run([entry("oak", A)])["truth"] == "False"
    assert run([entry("oak", A), entry("denizen", B, "sideboard")])["truth"] == "False"


def test_commander_only_ingredient_does_not_make_same_identity_main_participant() -> None:
    variant = deepcopy(OAK)
    variant["ingredients"][0]["mustBeCommander"] = True
    entries = [entry("commander-a", A, "commander"), entry("main-a", A), entry("main-b", B)]
    result = run(entries, [variant])
    assert result["truth"] == "True"
    assert result["participants"] == {"commander-a": "True", "main-a": "False", "main-b": "True"}
    assert set(result["participantProofs"]) == {"commander-a", "main-b"}
    predicate = dict(op="comboParticipant", outcomeId="2244", policyVersion="ingredients-v1")
    inputs = [
        {
            **e,
            "facts": dict(
                oracleId=e["oracleId"],
                comboParticipants={"2244": result["participants"][e["entryId"]]},
            ),
        }
        for e in entries
    ]
    rule: Document = dict(op="minimumCopies", minimum=3, predicate=predicate)
    assert evaluate_deck_rule(rule, inputs, ["main", "commander"])["truth"] == "False"
    rule = dict(op="percentage", predicate=predicate, denominator="all-cards", basisPoints=6667)
    assert evaluate_deck_rule(rule, inputs, ["main", "commander"])["truth"] == "False"
    assert run([entry("main-a", A), entry("main-b", B)], [variant])["truth"] == "False"


def test_unknown_copies_share_total_and_commander_deficit_allowances() -> None:
    variant = deepcopy(OAK)
    variant["ingredients"][0].update(mustBeCommander=True, quantity="2")
    assert run([entry("a", A), entry("b", B), entry("u", None)], [variant])["truth"] == "False"
    assert (
        run([entry("a", A), entry("b", B), entry("u", None, "commander", 2)], [variant])["truth"]
        == "Unknown"
    )
    huge = deepcopy(OAK)
    huge["ingredients"][0]["quantity"] = "9007199254740993"
    assert run([entry("a", A), entry("b", B)], [huge])["truth"] == "False"


@pytest.mark.parametrize(
    "change", ["identity", "face", "zones", "state", "status", "reason", "template"]
)
def test_unsupported_candidates_unknown_but_mandatory_deficits_disprove(change: str) -> None:
    candidate = deepcopy(OAK)
    ingredient = candidate["ingredients"][0]
    if change == "identity":
        ingredient["oracleId"] = None
    elif change == "face":
        ingredient["usedFace"] = 1
    elif change == "zones":
        ingredient["zones"] = ["unrecognized"]
    elif change == "state":
        ingredient["states"] = dict(battlefieldCardState="tapped")
    elif change == "status":
        candidate["status"] = "DRAFT"
    elif change == "reason":
        candidate["unsupportedReasons"] = ["unknown-field"]
    else:
        candidate["templates"] = [dict(id="template", mustBeCommander=False)]
    assert run([entry("a", A), entry("b", B)], [candidate])["truth"] == "Unknown"
    assert run([entry("a", A)], [candidate])["truth"] == "False"


@pytest.mark.parametrize(
    "publication",
    [None, {**PUBLICATION, "complete": False}, {**PUBLICATION, "outcomePresent": False}],
)
def test_unavailable_publication_keeps_eligible_participation_unknown(
    publication: Document | None,
) -> None:
    result = evaluate_combo_variants(
        dict(
            entries=[entry("a", A), entry("excluded", A, "sideboard")],
            variants=[],
            roles=["main"],
            outcomeId="2244",
            publication=publication,
        )
    )
    assert result["truth"] == "Unknown"
    assert result["participants"] == dict(a="Unknown", excluded="False")
    assert run([], [])["truth"] == "False"


def test_multiple_variant_proofs_and_grouped_witnesses_are_stable() -> None:
    second = deepcopy(OAK)
    second.update(id="aaa", ingredients=[{**OAK["ingredients"][0], "oracleId": OTHER}])
    entries = [entry("a", A), entry("b", B), entry("other", OTHER)]
    result = run(entries, [second, OAK])
    assert result["proof"]["variant"]["id"] == "2850-4186"
    assert result["participantProofs"]["other"]["variant"]["id"] == "aaa"
    assert run(entries, [OAK, second]) == result
    facts = ComboFacts(dict(availability="Available"), {(("commander", "main"), "2244"): result})
    definition: Document = dict(
        id="d", roles=["main", "commander"], rule=dict(op="comboParticipant", outcomeId="2244")
    )
    evidence = facts.evidence(definition)
    witnesses = evidence["evaluations"][0]["participantWitnesses"]
    assert [w["entryIds"] for w in witnesses] == [["a", "b"], ["other"]]
    assert facts.evidence(definition, "other")["evaluations"][0]["proof"]["variant"]["id"] == "aaa"


def test_icu_order_matches_recorded_node_locale_compare_vector() -> None:
    values = ["Z", "a", "A", "ä", "a-b", "a_b", "1-2", "11", "2", "10", "é", "e", "E", "中", "😀"]
    # Node v24.19.0, default en-US Intl collation, 2026-10-23.
    assert sorted(values, key=locale_sort_key) == [
        "😀",
        "1-2",
        "10",
        "11",
        "2",
        "a",
        "A",
        "ä",
        "a_b",
        "a-b",
        "e",
        "E",
        "é",
        "Z",
        "中",
    ]
