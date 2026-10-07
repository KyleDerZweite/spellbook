import json
from pathlib import Path

import pytest

from worker.optional_prices import CardmarketAdapter, MTGJSONAdapter
from worker.price_artifacts import PriceLimits


def test_cardmarket_preserves_exact_numeric_token_and_known_zero(tmp_path: Path):
    products = tmp_path / "products.json"
    guide = tmp_path / "guide.json"
    products.write_text(
        json.dumps(
            {"version": 1, "createdAt": "2026-10-06T13:30:57+0200", "products": [{"idProduct": 7}]}
        )
    )
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T02:49:35+0200","priceGuides":[{"idProduct":7,"trend":0,"trend-foil":1.234567890123456789}]}'
    )
    with CardmarketAdapter(products, guide, tmp_path / "staging.sqlite") as source:
        references = list(source.current_points())
        assert references == [
            {
                "providerId": "7",
                "finish": "nonfoil",
                "measure": "trend",
                "amount": "0",
                "rawValue": "0",
            },
            {
                "providerId": "7",
                "finish": "foil",
                "measure": "trend-foil",
                "amount": "1.234567890123456789",
                "rawValue": "1.234567890123456789",
            },
        ]
        assert source.metadata["sourceTime"] == "2026-10-07T00:49:35+00:00"
        assert source.metadata["mappingTime"] == "2026-10-06T11:30:57+00:00"


@pytest.mark.parametrize("token", ["1e129", "1e-19", "-1", "NaN", "Infinity", "1" * 129])
def test_cardmarket_rejects_malformed_selected_money_before_publication(tmp_path, token):
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        '{"version":1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}'
    )
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":'
        + token
        + "}]}"
    )
    with (
        pytest.raises(ValueError),
        CardmarketAdapter(products, guide, tmp_path / "staging.sqlite"),
    ):
        pass


def test_cardmarket_rejects_duplicate_keys_and_bounded_records(tmp_path):
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        '{"version":1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}'
    )
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":1,"trend":2}]}'
    )
    with (
        pytest.raises(ValueError, match="Duplicate"),
        CardmarketAdapter(products, guide, tmp_path / "duplicate.sqlite"),
    ):
        pass
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":1,"extra":"'
        + "x" * 100
        + '"}]}'
    )
    with (
        pytest.raises(ValueError, match="record byte"),
        CardmarketAdapter(
            products, guide, tmp_path / "limited.sqlite", PriceLimits(record_bytes=80)
        ),
    ):
        pass


def test_cardmarket_validates_root_keys_and_source_versions(tmp_path):
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text('{1:1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}')
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":1}]}'
    )
    with (
        pytest.raises(ValueError, match="root key"),
        CardmarketAdapter(products, guide, tmp_path / "invalid-key.sqlite"),
    ):
        pass
    products.write_text('{"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}')
    with (
        pytest.raises(ValueError, match="version"),
        CardmarketAdapter(products, guide, tmp_path / "missing-version.sqlite"),
    ):
        pass


def test_mtgjson_current_uses_only_release_date_and_never_history(tmp_path):
    product = "01b47f91-ffff-5954-af7a-add84b7c513c"
    printing = "46ca0b66-a000-4483-b916-f5b89e710244"
    meta = {"date": "2026-10-06", "version": "5.3.0+20261006"}
    identifiers, today, history = (
        tmp_path / name for name in ("ids.json", "today.json", "history.json")
    )
    identifiers.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {product: {"uuid": product, "identifiers": {"scryfallId": printing}}},
            }
        )
    )
    today.write_text(
        '{"meta":{"date":"2026-10-06","version":"5.3.0+20261006"},"data":{"'
        + product
        + '":{"paper":{"cardmarket":{"currency":"EUR","retail":'
        '{"normal":{"2026-10-05":1.01},"foil":{"2026-10-06":0}}}}}}}'
    )
    history.write_text(
        '{"meta":{"date":"2026-10-06","version":"5.3.0+20261006"},"data":{"'
        + product
        + '":{"paper":{"cardmarket":{"currency":"EUR","retail":'
        '{"normal":{"2026-10-06":99.99}}}}}}}'
    )
    with MTGJSONAdapter(identifiers, today, history, tmp_path / "staging.sqlite") as source:
        assert list(source.current_points()) == [
            {
                "providerId": product,
                "printingId": printing,
                "finish": "foil",
                "measure": "paper.cardmarket.retail.foil",
                "amount": "0",
                "rawValue": "0",
                "sourceDate": "2026-10-06",
            }
        ]
        assert list(source.history_points()) == [
            {
                "providerId": product,
                "printingId": printing,
                "finish": "nonfoil",
                "measure": "paper.cardmarket.retail.normal",
                "amount": "99.99",
                "rawValue": "99.99",
                "sourceDate": "2026-10-06",
            }
        ]
        assert source.metadata["sourceDate"] == "2026-10-06"


def test_mtgjson_declines_duplicate_crosswalk_without_repairing_names(tmp_path):
    product, other = "01b47f91-ffff-5954-af7a-add84b7c513c", "00010d56-fe38-5e35-8aed-518019aa36a5"
    printing = "46ca0b66-a000-4483-b916-f5b89e710244"
    meta = {"date": "2026-10-06", "version": "fixture"}
    identifiers, today, history = (
        tmp_path / name for name in ("ids.json", "today.json", "history.json")
    )
    identifiers.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {
                    key: {"uuid": key, "name": "Sol Ring", "identifiers": {"scryfallId": printing}}
                    for key in (product, other)
                },
            }
        )
    )
    value = {
        "paper": {"cardmarket": {"currency": "EUR", "retail": {"normal": {"2026-10-06": 1.01}}}}
    }
    today.write_text(json.dumps({"meta": meta, "data": {product: value}}))
    history.write_text(today.read_text())
    with MTGJSONAdapter(identifiers, today, history, tmp_path / "stage.sqlite") as source:
        assert list(source.current_points()) == []
        assert list(source.history_points()) == []


@pytest.mark.parametrize(
    "problem", ["duplicate-date", "future-date", "truncated-gzip", "staging-limit"]
)
def test_mtgjson_rejects_incomplete_or_invalid_complete_inputs(tmp_path, problem):
    import gzip

    product = "01b47f91-ffff-5954-af7a-add84b7c513c"
    printing = "46ca0b66-a000-4483-b916-f5b89e710244"
    meta = {"date": "2026-10-06", "version": "fixture"}
    identifiers, today, history = (
        tmp_path / name for name in ("ids.json", "today.json", "history.json")
    )
    identifiers.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {product: {"uuid": product, "identifiers": {"scryfallId": printing}}},
            }
        )
    )
    token = (
        '"2026-10-06":1,"2026-10-06":2'
        if problem == "duplicate-date"
        else '"2099-01-01":1'
        if problem == "future-date"
        else '"2026-10-06":1'
    )
    today.write_text(
        '{"meta":{"date":"2026-10-06","version":"fixture"},"data":{"'
        + product
        + '":{"paper":{"cardmarket":{"currency":"EUR","retail":{"normal":{'
        + token
        + "}}}}}}}"
    )
    history.write_text(today.read_text())
    if problem == "truncated-gzip":
        compressed = tmp_path / "today.json.gz"
        compressed.write_bytes(gzip.compress(today.read_bytes())[:-5])
        today = compressed
    limits = PriceLimits(staging_bytes=1) if problem == "staging-limit" else PriceLimits()
    with (
        pytest.raises((ValueError, EOFError)),
        MTGJSONAdapter(identifiers, today, history, tmp_path / "stage.sqlite", limits),
    ):
        pass


@pytest.mark.parametrize(
    "field,value",
    [
        ("compressed_bytes", 1),
        ("decompressed_bytes", 1),
        ("record_bytes", 1),
        ("staging_bytes", 1),
    ],
)
def test_cardmarket_byte_limits_fail_complete_adapter(tmp_path, field, value):
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        '{"version":1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}'
    )
    guide.write_text(
        '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":1}]}'
    )
    with (
        pytest.raises(ValueError),
        CardmarketAdapter(
            products, guide, tmp_path / "stage.sqlite", PriceLimits(**{field: value})
        ),
    ):
        pass
