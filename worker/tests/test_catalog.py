import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from worker.catalog import PUBLISH_LOCK, CatalogPublisher
from worker.scryfall import BulkDataInfo

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def publisher():
    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL to run PostgreSQL publication integration tests")
    schema = "worker_test_" + uuid4().hex
    migration = next((Path(__file__).parents[2] / "frontend/drizzle").glob("0006*.sql"))
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public")
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            with psycopg.connect(scoped) as conn:
                conn.execute(migration.read_text().replace('"public".', f'"{schema}".'))
            yield CatalogPublisher(scoped)
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def snapshot(tmp_path, *, version=1, cards=None):
    if cards is None:
        cards = [json.loads((FIXTURES / "normal_card.json").read_text())]
    path = tmp_path / f"cards-{version}.jsonl"
    path.write_text("\n".join(json.dumps(card) for card in cards))
    info = BulkDataInfo(
        "all_cards", "fixture://catalog", f"2026-10-0{version}T00:00:00Z", path.stat().st_size
    )
    return path, info


def state(publisher):
    with publisher._connect() as conn:
        return conn.execute(
            "SELECT active_generation, previous_generation FROM catalog_state WHERE id=1"
        ).fetchone()


def test_publish_localized_records_and_replay_is_idempotent(publisher, tmp_path):
    normal = json.loads((FIXTURES / "normal_card.json").read_text())
    local = dict(
        normal,
        id=str(uuid4()),
        lang="ja",
        printed_name="ラノワールのエルフ",
        printed_text="好きな色のマナ",
    )
    path, info = snapshot(tmp_path, cards=[normal, local])
    assert publisher.publish(path, info) == 2
    first = state(publisher)
    assert publisher.is_current(info)
    assert publisher.publish(path, info) == 2
    assert state(publisher) == first
    with publisher._connect() as conn:
        rows = conn.execute(
            "SELECT id, document->>'id', search_name, search_text "
            "FROM catalog_printings ORDER BY lang"
        ).fetchall()
        assert all(str(row[0]) == row[1] for row in rows)
        assert "ラノワールのエルフ" in rows[1][2]
        assert "好きな色のマナ" in rows[1][3]
        assert conn.execute(
            "SELECT document_count, published_at IS NOT NULL FROM catalog_generations"
        ).fetchone() == (2, True)


@pytest.mark.parametrize("failure", ["malformed", "empty", "duplicate", "invalid_id", "nonfinite"])
def test_failure_retains_last_good_catalog(publisher, tmp_path, failure):
    publisher.publish(*snapshot(tmp_path))
    before = state(publisher)
    card = json.loads((FIXTURES / "normal_card.json").read_text())
    if failure == "invalid_id":
        card["id"] = "not-a-uuid"
    if failure == "nonfinite":
        card["cmc"] = float("nan")
    path, info = snapshot(
        tmp_path, version=2, cards=[card, card] if failure == "duplicate" else [card]
    )
    if failure == "empty":
        path.write_text("[]")
    if failure == "malformed":
        path.write_text(path.read_text() + "\n{broken")
    with pytest.raises((ValueError, psycopg.Error)):
        publisher.publish(path, info)
    assert state(publisher) == before
    with publisher._connect() as conn:
        assert conn.execute("SELECT count(*) FROM catalog_generations").fetchone()[0] == 1
        assert conn.execute("SELECT count(*) FROM catalog_printings").fetchone()[0] == 1


def test_missing_publication_cannot_be_skipped_by_local_timestamp(publisher, tmp_path):
    _, info = snapshot(tmp_path)
    assert not publisher.is_current(info)


def test_explicit_source_switch_and_forced_rebuild(publisher, tmp_path):
    path, info = snapshot(tmp_path)
    publisher.publish(path, info)
    default = BulkDataInfo("default_cards", info.download_uri, info.updated_at, info.size)
    assert not publisher.is_current(default)
    publisher.publish(path, default)
    before = state(publisher)[0]
    with publisher._connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
        conn.execute("UPDATE catalog_generations SET schema_version = 0 WHERE id=%s", (before,))
    assert not publisher.is_current(default)
    publisher.publish(path, default)
    assert state(publisher)[0] != before


def test_previous_generation_rollback(publisher, tmp_path):
    publisher.publish(*snapshot(tmp_path))
    original = state(publisher)[0]
    publisher.publish(*snapshot(tmp_path, version=2))
    new = state(publisher)[0]
    with publisher._connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
        conn.execute(
            "UPDATE catalog_state SET active_generation = previous_generation, "
            "previous_generation = active_generation, updated_at = now() "
            "WHERE id=1 AND previous_generation IS NOT NULL"
        )
    assert state(publisher) == (original, new)


def test_previous_generation_retained_and_old_reader_survives_cleanup(publisher, tmp_path):
    publisher.publish(*snapshot(tmp_path))
    original = state(publisher)[0]
    with publisher._connect() as reader:
        reader.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        assert (
            reader.execute("SELECT active_generation FROM catalog_state").fetchone()[0] == original
        )
        publisher.publish(*snapshot(tmp_path, version=2))
        second = state(publisher)[0]
        publisher.publish(*snapshot(tmp_path, version=3))
        assert state(publisher)[1] == second
        assert (
            reader.execute("SELECT active_generation FROM catalog_state").fetchone()[0] == original
        )
        assert (
            reader.execute(
                "SELECT count(*) FROM catalog_printings WHERE generation_id=%s", (original,)
            ).fetchone()[0]
            == 1
        )
    with publisher._connect() as conn:
        assert conn.execute("SELECT count(*) FROM catalog_generations").fetchone()[0] == 2
        assert (
            conn.execute(
                "SELECT count(*) FROM catalog_printings WHERE generation_id=%s", (original,)
            ).fetchone()[0]
            == 0
        )


def test_concurrent_publishers_serialize_and_newest_snapshot_wins(publisher, tmp_path):
    old = snapshot(tmp_path)
    new = snapshot(tmp_path, version=2)
    started = [threading.Event(), threading.Event()]

    def publish(index, data):
        started[index].set()
        return publisher.publish(*data)

    with ThreadPoolExecutor(max_workers=2) as pool:
        with publisher._connect() as blocker:
            blocker.execute("SELECT pg_advisory_xact_lock(%s, %s)", PUBLISH_LOCK)
            futures = [pool.submit(publish, index, data) for index, data in enumerate((old, new))]
            assert all(event.wait(2) for event in started)
            assert all(not future.done() for future in futures)
        assert [future.result(timeout=10) for future in futures] == [1, 1]
    with publisher._connect() as conn:
        row = conn.execute(
            "SELECT g.source_updated_at FROM catalog_generations g "
            "JOIN catalog_state s ON s.active_generation = g.id"
        ).fetchone()
        assert row[0].day == 2
    newest = state(publisher)
    publisher.publish(*old)
    assert state(publisher) == newest
