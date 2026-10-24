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


def test_shipped_bundle_has_complete_identity_facts_and_bounded_batches() -> None:
    bundle = verify_bundle(FIXTURES)
    count = faces = 0
    for batch in bundle.batches():
        assert 0 < len(batch) <= 500
        count += len(batch)
        for record in batch:
            d = record["document"]
            assert d["lang"] == "en"
            assert record["raw_oracle_id"] == d["oracle_id"]
            assert record["types"] == d["card_types"]
            assert d["image_uri"]
            if d.get("back_face_name"):
                faces += 1
    assert count == bundle.manifest.documents == 109393
    assert bundle.manifest.canonical_count == 34948
    assert faces > 0


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
    with gzip.open(FIXTURES / "catalog-default-en-20261007.jsonl.gz", "rb") as stream:
        record = json.loads(stream.readline())
    if payload is None:
        payload = json.dumps(record).encode() + b"\n"
    digest = hashlib.sha256(payload).hexdigest()
    compressed = gzip.compress(payload)
    filename = "catalog-default-en-20261007.jsonl.gz"
    (directory / filename).write_bytes(compressed)
    (directory / "cards.json").write_text(json.dumps([record["document"]]))
    manifest = {
        "formatVersion": 1,
        "bundleVersion": "2026-10-07T00:00:00Z",
        "file": filename,
        "generationId": str(uuid5(NAMESPACE_URL, f"spellbook-demo-catalog:1:2:{digest}")),
        "sourceType": "demo-bundle",
        "providerUpdatedAt": None,
        "catalogTransformVersion": 2,
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
