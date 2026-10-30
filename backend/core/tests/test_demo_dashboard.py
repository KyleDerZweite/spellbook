"""Dashboard planning uses the genuine bundled Catalog, without a database."""

from collections import Counter

import pytest
from test_operator_fixtures import FIXTURES

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo_dashboard import plan_scenario
from spellbook_core.operators.fixtures import Record, load_precon, verify_bundle


def test_real_catalog_plan_has_exact_shares_and_nonuniform_new_sets() -> None:
    precon = load_precon(FIXTURES)
    holdings = [
        dict(
            canonical_card_id=e["card"]["oracle_id"],
            catalog_card_id=e["card"]["id"],
            set_code=e["card"]["set_code"],
            quantity=e["quantity"],
        )
        for e in [*precon.cards, *precon.inventory_extras]
    ]
    catalog = [r["document"] for batch in verify_bundle(FIXTURES).batches() for r in batch]
    owned = {str(h["canonical_card_id"]) for h in holdings}
    representatives: dict[str, Record] = {}
    for card in sorted(catalog, key=lambda c: (c["set_code"], c["id"])):
        if str(card["oracle_id"]) not in owned and card["is_nonfoil_available"]:
            representatives.setdefault(card["set_code"], card)
    catalog = sorted(
        [c for c in catalog if str(c["oracle_id"]) in owned] + list(representatives.values()),
        key=lambda c: (c["set_code"], c["id"]),
    )
    additions, entries = plan_scenario(holdings, catalog)
    assert plan_scenario(holdings, catalog) == (additions, entries)
    assert len({h["set_code"] for h in holdings} | {a["set_code"] for a in additions}) >= 12
    assert [a["quantity"] for a in additions][:3] == [20, 12, 8]
    exact: Counter[str] = Counter()
    canonical: Counter[str] = Counter()
    for row in holdings:
        exact[str(row["catalog_card_id"])] += row["quantity"]
        canonical[str(row["canonical_card_id"])] += row["quantity"]
    for row in additions:
        exact[str(row["id"])] += row["quantity"]
        canonical[str(row["oracle_id"])] += row["quantity"]
    shares: Counter[str] = Counter()
    for e in entries:
        quantity = e["quantity"]
        matched = min(quantity, exact[str(e["id"])])
        alternate = min(quantity - matched, canonical[str(e["oracle_id"])] - matched)
        shares["exact"] += matched
        shares["alternate"] += alternate
        shares["missing"] += quantity - matched - alternate
    assert shares == {"exact": 68, "alternate": 24, "missing": 8}
    assert sum(e["quantity"] for e in entries) == 100
    assert all(e["id"] in {c["id"] for c in catalog} for e in entries + additions)


def test_insufficient_catalog_refuses_without_mutating_inputs() -> None:
    holdings = [
        {
            "canonical_card_id": "oracle",
            "catalog_card_id": "printing",
            "set_code": "real",
            "quantity": 1,
        }
    ]
    with pytest.raises(OperatorError, match="twelve"):
        plan_scenario(holdings, [])
    assert holdings[0]["quantity"] == 1
