"""Physical Box name and Sort Rule v1 predicate validation."""

import json
from pathlib import Path

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.cardstation_sort_rule import parse_sort_predicates
from spellbook_core.mtg.physical_boxes import normalize_box_name

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT / "contracts/schemas/cardstation-sort-rule.v1.schema.json").read_text())


def test_sort_predicates_accept_canonical_fields_and_values() -> None:
    options = SCHEMA["properties"]["rules"]["items"]["properties"]["when"]["items"]["oneOf"]
    predicates = [
        {
            "field": option["properties"]["field"]["const"],
            "oneOf": option["properties"]["oneOf"]["items"].get("enum", ["lea", "mh3"]),
        }
        for option in options
    ]
    assert parse_sort_predicates(predicates) == predicates


@pytest.mark.parametrize(
    "condition",
    [
        None,
        [],
        {"when": [{"field": "setCode", "oneOf": ["lea"]}], "slot": 1},
        [{"field": "setCode", "oneOf": ["lea"], "slot": 1}],
        [{"field": "setCode", "oneOf": ["lea"]}, {"field": "setCode", "oneOf": ["leb"]}],
        [{"field": "setCode", "oneOf": ["lea", "lea"]}],
        [{"field": "setCode", "oneOf": ["LEA"]}],
        [{"field": "setCode", "oneOf": ["lea\n"]}],
        [{"field": "printedColor", "oneOf": ["teal"]}],
        [{"field": "rarity", "oneOf": [None]}],
        [{"field": "colorIdentity", "oneOf": ["blue"]}],
        [{"field": "rarity", "oneOf": []}],
    ],
)
def test_sort_predicates_reject_unsupported_values(condition: object) -> None:
    with pytest.raises(ValidationError):
        parse_sort_predicates(condition)


def test_names_are_trimmed_bounded_and_printable() -> None:
    assert normalize_box_name("  Küche 🃏 ") == "Küche 🃏"
    for value in ("", " ", "x" * 65, "x\x00y", "x\u202ey", "x\ufffe", "x\uffff", None):
        with pytest.raises(ValidationError):
            normalize_box_name(value)
