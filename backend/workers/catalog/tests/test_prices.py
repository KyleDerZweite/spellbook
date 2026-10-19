import json
from pathlib import Path

import pytest

from worker import prices
from worker.prices import project_printing

FIXTURE = Path(__file__).parent / "fixtures" / "price_variants.json"


def sample(lang="de", collector="703"):
    return next(
        x["present_fields"]
        for x in json.loads(FIXTURE.read_text())["requests"]
        if x.get("http_status") == 200
        and x["present_fields"].get("set") == "cmm"
        and x["present_fields"]["lang"] == lang
        and x["present_fields"]["collector_number"] == collector
    )


def test_real_complete_language_pair_matches_without_price_filter():
    de = project_printing(sample())
    en = project_printing(sample("en"))
    assert de["variant_key"] is not None
    assert de["variant_key"] == en["variant_key"]
    assert de["amounts"] == {"nonfoil": None, "foil": None}
    assert project_printing(sample(collector="410"))["variant_key"] is None


def test_exact_decimal_zero_and_supplied_links_are_independent():
    card = dict(
        sample(),
        prices={"eur": "0.000", "eur_foil": "0.005"},
        purchase_uris={
            "cardmarket": "https://www.cardmarket.com/en/Magic/Products?id=3",
            "tcgplayer": "https://evil.example/item",
        },
    )
    result = project_printing(card)
    assert result["amounts"] == {"nonfoil": "0", "foil": "0.005"}
    assert len(result["links"]) == 1
    assert result["links"][0]["provider"] == "Cardmarket"
    assert project_printing(dict(card, prices={}))["links"] == result["links"]


@pytest.mark.parametrize(
    "amount", ["-1", "NaN", "Infinity", "1e3", 1.5, True, "", "1" * 129, "0." + "1" * 19]
)
def test_malformed_selected_decimal_rejects_publication(amount):
    with pytest.raises(ValueError):
        project_printing(dict(sample(), prices={"eur": amount}))


def test_oversized_source_literals_are_rejected_before_decimal_parse(monkeypatch):
    def unexpected_parse(_):
        pytest.fail("Rejected input reached Decimal parsing")

    monkeypatch.setattr(prices, "Decimal", unexpected_parse)
    for amount in ("1" * 1_000_000, "0." + "1" * 19):
        with pytest.raises(ValueError, match="Invalid EUR decimal"):
            project_printing(dict(sample(), prices={"eur": amount}))


def test_explicit_empty_finishes_are_valid_unknown_availability():
    # Actual all_cards case record 4c2abf39-90f5-46c2-b52c-49f2f43fce22 has finishes [].
    result = project_printing(dict(sample(), layout="case", finishes=[]))
    assert result["supported"] == {"nonfoil": False, "foil": False}
    assert result["variant_key"] is None


def test_explicit_foil_with_etched_uses_typed_foil_price_without_changing_identity():
    card = dict(sample(), finishes=["nonfoil", "foil", "etched"], prices={"eur_foil": "0.005"})
    result = project_printing(card)
    assert result["supported"]["foil"] is True
    assert result["amounts"]["foil"] == "0.005"
    assert result["identity"]["finishes"] == ["nonfoil", "foil", "etched"]
    assert project_printing(dict(card, finishes=["etched"]))["supported"]["foil"] is False


@pytest.mark.parametrize(
    "change",
    [
        {"variation": True},
        {"frame_effects": None},
        {"promo_types": None},
        {"illustration_id": None},
        {"full_art": None},
        {"layout": "reversible_card"},
    ],
)
def test_missing_or_unsupported_variant_evidence_declines_fallback(change):
    assert project_printing(dict(sample(), **change))["variant_key"] is None


def test_explicit_arrays_are_sets_but_collector_suffixes_and_art_remain_identity():
    original = dict(sample(), frame_effects=["inverted", "extendedart"])
    swapped = dict(original, frame_effects=["extendedart", "inverted"])
    assert project_printing(original)["variant_key"] == project_printing(swapped)["variant_key"]
    assert (
        project_printing(original)["variant_key"]
        != project_printing(dict(original, collector_number="703a"))["variant_key"]
    )
    assert (
        project_printing(original)["variant_key"]
        != project_printing(sample("en", "410"))["variant_key"]
    )


def test_multiface_art_is_ordered_and_missing_face_evidence_stays_unknown():
    face = dict(
        sample(),
        layout="transform",
        illustration_id=None,
        card_faces=[
            {"illustration_id": "1c2fee9b-89ea-4ab1-a751-451c3cd65a88"},
            {"illustration_id": "c2b5f731-771b-4949-90f3-0ad40d676100"},
        ],
    )
    assert project_printing(face)["variant_key"] is not None
    assert (
        project_printing(face)["variant_key"]
        != project_printing(dict(face, card_faces=list(reversed(face["card_faces"]))))[
            "variant_key"
        ]
    )
    assert (
        project_printing(dict(face, card_faces=[face["card_faces"][0], None]))["variant_key"]
        is None
    )


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "http://www.cardmarket.com/item",
        "https://user:password@www.cardmarket.com/item",
        "https://www.cardmarket.com.evil.example/item",
        "https://www.cardmarket.com:444/item",
        "https://www.cardmarket.com/\nitem",
    ],
)
def test_unsafe_supplied_product_links_are_absent(url):
    assert project_printing(dict(sample(), purchase_uris={"cardmarket": url}))["links"] == []
