"""Functional fixture and integrity transfer from the Node operator consumers."""

import copy
import gzip
import hashlib
import json
from dataclasses import replace
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import pytest

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import require_demo_database
from spellbook_core.operators.fixtures import (
    MANIFEST_NAME,
    DemoBundle,
    legacy_inventory,
    load_precon,
    matches_legacy,
    verify_bundle,
)

FIXTURES = Path(__file__).resolve().parents[2] / "scripts/demo"


def test_shipped_bundle_has_token_metadata_and_bounded_batches() -> None:
    bundle = verify_bundle(FIXTURES)
    count = faces = aang = 0
    for batch in bundle.batches():
        assert 0 < len(batch) <= 500
        count += len(batch)
        for record in batch:
            d = record["document"]
            assert d["lang"] == "en"
            assert set(record) == {"document", "search_name", "search_text"}
            assert set(d["related_tokens"]) == {"items", "unresolved"}
            assert d["image_uri"]
            if d.get("back_face_name"):
                faces += 1
            if d["oracle_id"] == "96e5d4a1-e59f-4140-823f-a17e15ee5d8d":
                assert d["colors"] == ["W", "U", "G"]
                aang += 1
    assert count == bundle.manifest.documents == 109393
    assert bundle.manifest.canonical_count == 34948
    assert faces > 0
    assert aang == 4


def test_shipped_precon_and_legacy_deterministic_selection() -> None:
    precon = load_precon(FIXTURES)
    assert len(precon.cards) == 75
    assert sum(e["quantity"] for e in precon.cards) == 100
    assert len(precon.inventory_extras) == 1
    extra = precon.inventory_extras[0]
    assert extra["card"]["id"] == precon.cards[0]["card"]["id"]
    assert extra["finish"] == "nonfoil" and extra["quantity"] == 1
    assert "Owner confirmed" in extra["provenance"]
    assert next(e for e in precon.cards if e["name"] == "Mossfire Valley")["quantity"] == 2
    assert sum(e["finish"] == "foil" for e in precon.cards) == 2
    commander = next(e for e in precon.cards if e["role"] == "commander")
    assert commander["card"]["id"] == "bffa36ac-137d-481c-b1b7-76a88ef15d54"
    legacy = legacy_inventory(FIXTURES)
    assert len(legacy) == 43
    assert sum(e["quantity"] for e in legacy) == 72
    assert matches_legacy(legacy, legacy)
    assert legacy[0]["name"] == "Lathril, Blade of the Elves"
    assert legacy[-1]["name"] == "Forest"
    assert legacy[-2]["name"] == "Sol Ring"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("quantity", 2),
        ("notes", "owned edit"),
        ("notes_revision", "1"),
        ("finish", "foil"),
        ("condition", "LP"),
        ("spellbook_position", 99),
        ("catalog_card_id", "other"),
        ("canonical_card_id", "other"),
        ("image_uri", "other"),
    ],
)
def test_legacy_replacement_refuses_edited_fields(field: str, value: object) -> None:
    expected = legacy_inventory(FIXTURES)
    changed = copy.deepcopy(expected)
    changed[0][field] = value
    assert not matches_legacy(changed, expected)
    assert not matches_legacy(expected[1:], expected)
    assert not matches_legacy(expected[::-1], expected)


@pytest.mark.parametrize(
    "url",
    [
        None,
        "",
        "postgresql://host/spellbook",
        "not a URL",
        "postgresql://private:secret@[broken/spellbook_design",
        "postgresql://host/spellbook_demo?dbname=private",
    ],
)
def test_demo_rejection_is_secret_free(url: str | None) -> None:
    with pytest.raises(OperatorError) as error:
        require_demo_database(url)
    assert str(error.value) == "Requires a database name ending in _demo or _design."


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://localhost/spellbook_demo",
        "postgres://localhost/spellbook_design",
        "postgresql:///spellbook_demo",
    ],
)
def test_demo_guard_accepts_disposable_targets(url: str) -> None:
    require_demo_database(url)


def small_bundle(directory: Path, *, payload: bytes | None = None) -> DemoBundle:
    # Real gzip/JSON/digest validation, using one unchanged versioned record.
    with gzip.open(FIXTURES / "catalog-default-en-20261102.jsonl.gz", "rb") as stream:
        record = json.loads(stream.readline())
    if payload is None:
        payload = json.dumps(record).encode() + b"\n"
    digest = hashlib.sha256(payload).hexdigest()
    compressed = gzip.compress(payload)
    filename = "catalog-default-en-20261102.jsonl.gz"
    (directory / filename).write_bytes(compressed)
    (directory / "cards.json").write_text(json.dumps([record["document"]]))
    manifest = {
        "formatVersion": 2,
        "bundleVersion": "2026-10-07T00:00:00Z",
        "file": filename,
        "generationId": str(uuid5(NAMESPACE_URL, f"spellbook-demo-catalog:2:5:{digest}")),
        "sourceType": "demo-bundle",
        "providerUpdatedAt": None,
        "catalogTransformVersion": 5,
        "counts": {"documents": 1},
        "canonicalCount": 1,
        "starterPrintingCount": 1,
        "jsonlBytes": len(payload),
        "jsonlSHA256": digest,
        "gzipBytes": len(compressed),
        "gzipSHA256": hashlib.sha256(compressed).hexdigest(),
    }
    (directory / MANIFEST_NAME).write_text(json.dumps(manifest))
    return verify_bundle(directory)


def test_corrupt_compressed_bytes_fail_before_publication(tmp_path: Path) -> None:
    bundle = small_bundle(tmp_path)
    bundle.file.write_bytes(b"corrupt")
    with pytest.raises(OperatorError, match="gzip integrity"):
        verify_bundle(tmp_path)


def test_final_decoded_digest_and_counts_are_checked(tmp_path: Path) -> None:
    bundle = small_bundle(tmp_path)
    batches = list(bundle.batches())
    assert len(batches) == 1 and len(batches[0]) == 1
    broken = replace(bundle, manifest=replace(bundle.manifest, jsonl_sha256="0" * 64))
    iterator = broken.batches()
    assert len(next(iterator)) == 1
    with pytest.raises(OperatorError, match="payload integrity"):
        next(iterator)
    broken = replace(bundle, manifest=replace(bundle.manifest, canonical_count=2))
    with pytest.raises(OperatorError, match="payload integrity"):
        list(broken.batches())


def test_missing_final_lf_and_duplicate_printings_fail(tmp_path: Path) -> None:
    bundle = small_bundle(tmp_path)
    with gzip.open(bundle.file, "rb") as stream:
        line = stream.read()
    bad = small_bundle(tmp_path, payload=line.rstrip(b"\n"))
    with pytest.raises(OperatorError, match="end with LF"):
        list(bad.batches())
    bad = small_bundle(tmp_path, payload=line * 2)
    with pytest.raises(OperatorError, match="Invalid Demo Catalog printing"):
        list(bad.batches())


@pytest.mark.parametrize("field", ["jsonlSHA256", "generationId", "file", "bundleVersion"])
def test_manifest_identity_cannot_be_substituted(tmp_path: Path, field: str) -> None:
    small_bundle(tmp_path)
    path = tmp_path / MANIFEST_NAME
    manifest = json.loads(path.read_text())
    manifest[field] = "protected-value"
    path.write_text(json.dumps(manifest))
    with pytest.raises(OperatorError, match="Invalid Demo Catalog manifest"):
        verify_bundle(tmp_path)


@pytest.mark.parametrize(
    "metadata",
    [
        None,
        {},
        {"items": [], "unresolved": "bad"},
        {"items": [{"catalogCardId": "bad"}], "unresolved": []},
        {"items": [], "unresolved": [], "extra": []},
    ],
)
def test_malformed_nested_token_metadata_fails(tmp_path, metadata):
    with gzip.open(FIXTURES / "catalog-default-en-20261102.jsonl.gz", "rb") as stream:
        record = json.loads(stream.readline())
    record["document"]["related_tokens"] = metadata
    bundle = small_bundle(tmp_path, payload=json.dumps(record).encode() + b"\n")
    with pytest.raises(OperatorError, match="Invalid Demo Catalog printing"):
        list(bundle.batches())


@pytest.mark.parametrize("field,value", [("formatVersion", 1), ("catalogTransformVersion", 4)])
def test_replaced_bundle_formats_fail(tmp_path, field, value):
    small_bundle(tmp_path)
    path = tmp_path / MANIFEST_NAME
    manifest = json.loads(path.read_text())
    manifest[field] = value
    path.write_text(json.dumps(manifest))
    with pytest.raises(OperatorError, match="Invalid Demo Catalog manifest"):
        verify_bundle(tmp_path)


def test_precon_links_resolve_to_nine_exact_token_printings():
    precon_ids = {e["card"]["id"] for e in load_precon(FIXTURES).cards}
    seen, tokens, links, unresolved = set(), {}, 0, set()
    for batch in verify_bundle(FIXTURES).batches():
        for record in batch:
            doc = record["document"]
            relation = doc["related_tokens"]
            unresolved.update(r["catalogCardId"] for r in relation["unresolved"])
            if doc["id"] in precon_ids:
                seen.add(doc["id"])
                assert relation["unresolved"] == []
                links += len(relation["items"])
                tokens.update((t["catalogCardId"], t) for t in relation["items"])
    assert seen == precon_ids
    assert links == 10
    assert set(tokens) == {
        "c20e427c-efa5-476c-aa33-e3149648d207",
        "ca20548f-6324-4858-adbe-87303ff1ca52",
        "7dfd481c-94ad-4a2e-a396-3d4a10bacc33",
        "686d9c3d-41dc-476d-93b7-75857b48b1b6",
        "98966946-de7a-4a96-b8c5-875f6e453f94",
        "2aa672bb-60f3-4601-8c14-f486a54f615b",
        "6911181d-573b-41eb-96a4-799c96e008fc",
        "5eb01bef-8989-4b38-a303-0aafab1b33e5",
        "4b02577e-62ec-4716-8e4c-51630cf1d49e",
    }
    # The three globally missing targets are referenced only by non-English printings.
    assert unresolved == set()
    assert tokens["c20e427c-efa5-476c-aa33-e3149648d207"]["faces"][0]["colors"] == ["R"]
    assert tokens["ca20548f-6324-4858-adbe-87303ff1ca52"]["faces"][0]["colors"] == []
