import copy
import gzip
import json
import sqlite3
import time
from dataclasses import replace
from unittest.mock import MagicMock

import pytest

from worker.combo import (
    DEFAULT_COMBO_LIMITS,
    ComboAdapter,
    ComboRecords,
    reduce_variant,
    sync_combo,
)
from worker.config import WorkerConfig, load_config


def variant():
    return {
        "id": "oak-denizen",
        "status": "OK",
        "manaNeeded": "{2}{G}",
        "easyPrerequisites": "",
        "notablePrerequisites": "",
        "description": "Cast Oak.",
        "notes": "",
        "requires": [],
        "uses": [
            {
                "card": {"oracleId": "eee6c02b-7d6a-4445-ad27-8b03176147d4", "name": "Scurry Oak"},
                "quantity": 1,
                "usedFace": None,
                "zoneLocations": ["H"],
                "mustBeCommander": False,
                "battlefieldCardState": "",
                "exileCardState": "",
                "libraryCardState": "",
                "graveyardCardState": "",
            }
        ],
        "produces": [
            {
                "feature": {
                    "id": 2244,
                    "name": "Infinite counters",
                    "status": "C",
                    "uncountable": True,
                },
                "quantity": 1,
            }
        ],
    }


def artifact(tmp_path, *, variants=None, aliases=None):
    path = tmp_path / "source.json.gz"
    path.write_bytes(
        gzip.compress(
            json.dumps(
                {
                    "timestamp": "2026-10-08T09:33:33+00:00",
                    "version": "7.1.8",
                    "variants": [variant()] if variants is None else variants,
                    "aliases": [] if aliases is None else aliases,
                }
            ).encode()
        )
    )
    return path


def test_complete_streams_aliases_without_root_materialization(tmp_path):
    path = artifact(tmp_path, aliases=[{"id": "alias", "variant": "oak-denizen"}])
    records = ComboRecords(path)
    assert [name for name, _ in records] == ["variants", "aliases"]
    assert "aliases" not in records.metadata
    with ComboAdapter(path, tmp_path / "stage.sqlite") as adapter:
        assert adapter.metadata["aliasCount"] == 1
        assert adapter.metadata["variantCount"] == 1
        assert adapter.metadata["outcomeCount"] == 1
        reduced = next(adapter.rows("variants", time.monotonic() + 10))
        assert reduced["mana"] == "{2}{G}"
        assert reduced["ingredients"][0]["zones"] == ["H"]
        assert reduced["producedOutcomes"][0]["quantity"] == "1"


@pytest.mark.parametrize(
    "change", ["duplicate", "alias", "outcome", "empty", "truncated", "trailing"]
)
def test_invalid_complete_publications_fail(tmp_path, change):
    one = variant()
    other = copy.deepcopy(one)
    other["id"] = "other"
    other["produces"][0]["feature"]["name"] = "inconsistent"
    path = artifact(
        tmp_path,
        variants=[one, one]
        if change == "duplicate"
        else [one, other]
        if change == "outcome"
        else []
        if change == "empty"
        else [one],
        aliases=[{"id": "bad", "variant": "missing"}] if change == "alias" else [],
    )
    if change == "truncated":
        path.write_bytes(path.read_bytes()[:-5])
    if change == "trailing":
        path.write_bytes(gzip.compress(gzip.decompress(path.read_bytes()) + b" true"))
    with (
        pytest.raises((ValueError, EOFError, sqlite3.IntegrityError)),
        ComboAdapter(path, tmp_path / "stage.sqlite"),
    ):
        pass


@pytest.mark.parametrize("quantity", [True, 0, -1, 1.5, "1", 10**100])
def test_malformed_quantity_never_becomes_supported(quantity):
    raw = variant()
    raw["uses"][0]["quantity"] = quantity
    with pytest.raises(ValueError):
        reduce_variant(raw)


def test_unknown_constraints_are_retained_and_unsupported():
    raw = variant()
    raw["uses"][0].update(
        usedFace=2, battlefieldCardState="tapped", zoneLocations=["X"], extraConstraint=True
    )
    reduced = reduce_variant(raw)
    assert reduced["unsupportedReasons"] == [
        "card-state",
        "ingredient-shape",
        "used-face",
        "zones",
    ]
    assert reduced["ingredients"][0]["states"]["battlefieldCardState"] == "tapped"


@pytest.mark.parametrize(
    "limits",
    [
        replace(DEFAULT_COMBO_LIMITS, compressed_bytes=1),
        replace(DEFAULT_COMBO_LIMITS, decompressed_bytes=1),
        replace(DEFAULT_COMBO_LIMITS, record_bytes=8),
        replace(DEFAULT_COMBO_LIMITS, staging_bytes=1),
    ],
)
def test_resource_limits_fail_without_result(tmp_path, limits):
    with (
        pytest.raises(ValueError),
        ComboAdapter(artifact(tmp_path), tmp_path / "stage.sqlite", limits),
    ):
        pass


def test_disabled_sync_has_no_dependency_or_fetch(tmp_path):
    config = WorkerConfig("unused", "all_cards", "manual", "unused", tmp_path)
    publisher = MagicMock()
    assert sync_combo(config, publisher)
    publisher.publish.assert_not_called()
    publisher.record_failure.assert_not_called()
    assert not tmp_path.joinpath("stage.sqlite").exists()


def test_combo_config_validation(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "unused")
    assert not load_config().commander_spellbook_enabled
    monkeypatch.setenv("COMMANDER_SPELLBOOK_ENABLED", "true")
    assert load_config().commander_spellbook_enabled
    monkeypatch.setenv("COMBO_IMPORT_SECONDS", "0")
    with pytest.raises(ValueError, match="COMBO_IMPORT_SECONDS"):
        load_config()


def test_parser_expired_import_never_opens_staging(tmp_path):
    with (
        pytest.raises(ValueError, match="deadline"),
        ComboAdapter(
            artifact(tmp_path), tmp_path / "stage.sqlite", import_deadline=time.monotonic() - 1
        ),
    ):
        pass
    assert not (tmp_path / "stage.sqlite").exists()


def test_empty_source_outcomes_remain_irrelevant(tmp_path):
    raw = variant()
    raw["produces"] = []
    with ComboAdapter(artifact(tmp_path, variants=[raw]), tmp_path / "stage.sqlite") as adapter:
        assert adapter.metadata["variantCount"] == 1
        assert adapter.metadata["outcomeCount"] == 0
        assert next(adapter.rows("variants", time.monotonic() + 10))["outcomeIds"] == []


def test_template_constraints_are_retained():
    raw = variant()
    requirement = {key: value for key, value in raw["uses"][0].items() if key != "card"}
    requirement["template"] = {"id": 42, "name": "Creature", "scryfallQuery": "t:creature"}
    requirement["mustBeCommander"] = True
    raw["requires"] = [requirement]
    reduced = reduce_variant(raw)
    assert reduced["templates"][0]["mustBeCommander"] is True
    assert reduced["templates"][0]["zones"] == ["H"]
    assert reduced["unsupportedReasons"] == ["templates"]


def test_download_timeout_stops_and_reaps_owned_child(monkeypatch, tmp_path):
    import subprocess

    from worker.combo import download_combo

    process = MagicMock()
    process.poll.return_value = None
    process.communicate.side_effect = [subprocess.TimeoutExpired("fixture", 0.01), ("", "")]
    monkeypatch.setattr("worker.combo.subprocess.Popen", MagicMock(return_value=process))
    with pytest.raises(ValueError, match="deadline"):
        download_combo(tmp_path / "download.gz", DEFAULT_COMBO_LIMITS, time.monotonic() + 0.01)
    process.poll.return_value = None
    process.kill.assert_not_called()
    process.terminate.assert_called_once()
    assert process.communicate.call_count == 2


@pytest.fixture
def combo_publisher():
    import os
    from pathlib import Path
    from uuid import uuid4

    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    from worker.combo import ComboPublisher

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for real Combo publication")
    schema = "combo_test_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            migration = (
                Path(__file__).parents[2] / "frontend/drizzle/0023_commander_spellbook.sql"
            ).read_text()
            with psycopg.connect(scoped) as conn:
                conn.execute(migration.replace('"public".', f'"{schema}".'))
            yield ComboPublisher(scoped)
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_real_complete_unchanged_previous_pruning_and_failed_copy(combo_publisher, tmp_path):
    import psycopg

    first = None
    for index in range(3):
        raw = variant()
        raw["notes"] = str(index)
        with ComboAdapter(
            artifact(tmp_path, variants=[raw]), tmp_path / f"stage{index}.sqlite"
        ) as adapter:
            publication = combo_publisher.publish(adapter)
            if index == 0:
                first = publication
                unchanged = combo_publisher.publish(adapter)
                assert unchanged["unchanged"]
                assert unchanged["publicationId"] == first["publicationId"]
    with psycopg.connect(combo_publisher.database_url) as conn:
        assert conn.execute("SELECT count(*) FROM combo_publications").fetchone() == (2,)
        assert not conn.execute(
            "SELECT 1 FROM combo_publications WHERE id=%s", (first["publicationId"],)
        ).fetchone()
        active = conn.execute("SELECT active_publication FROM combo_state").fetchone()[0]
    raw = variant()
    raw["notes"] = "failed"
    with ComboAdapter(artifact(tmp_path, variants=[raw]), tmp_path / "bad.sqlite") as adapter:
        document = next(adapter.rows("variants", time.monotonic() + 10))
        document["producedOutcomes"][0]["id"] = "99999"
        adapter.db.execute("UPDATE variants SET document=?", (json.dumps(document),))
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            combo_publisher.publish(adapter)
    with psycopg.connect(combo_publisher.database_url) as conn:
        assert conn.execute(
            "SELECT active_publication,refresh_status->>'kind' FROM combo_state"
        ).fetchone() == (active, "Failed")
        assert conn.execute("SELECT count(*) FROM combo_publications").fetchone() == (2,)
