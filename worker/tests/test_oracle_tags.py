import json

import pytest

from worker.oracle_tags import read_taxonomy


def write_tags(tmp_path, records):
    path = tmp_path / "tags.jsonl"
    path.write_text("\n".join(json.dumps(record) for record in records))
    return path


def tag(identifier, parents=(), children=(), oracle_ids=()):
    return {
        "object": "tag",
        "type": "oracle",
        "id": identifier,
        "label": "Mutable label",
        "parent_ids": list(parents),
        "child_ids": list(children),
        "taggings": [{"oracle_id": identifier, "weight": "median"} for identifier in oracle_ids],
    }


ROOT = "2f3e4ad7-5e60-41b4-bdbc-653f16869cf6"
CHILD = "b6448c45-ce65-4848-aa98-2151e4e07437"
CARD = "00c0543c-2a1f-4425-8283-4062d74a1637"


def test_descendants_include_self_and_validate_redundant_edges(tmp_path):
    taxonomy = read_taxonomy(
        write_tags(
            tmp_path, [tag(ROOT, children=[CHILD]), tag(CHILD, parents=[ROOT], oracle_ids=[CARD])]
        )
    )
    assert taxonomy.descendants[ROOT] == {ROOT, CHILD}
    assert taxonomy.descendants[CHILD] == {CHILD}


def test_cycle_and_missing_graph_endpoint_are_rejected(tmp_path):
    for records in (
        [
            tag(ROOT, parents=[CHILD], children=[CHILD]),
            tag(CHILD, parents=[ROOT], children=[ROOT]),
        ],
        [tag(ROOT, children=[CHILD])],
    ):
        with pytest.raises(ValueError):
            read_taxonomy(write_tags(tmp_path, records))


@pytest.fixture
def publisher():
    import os
    from pathlib import Path
    from uuid import uuid4

    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    from worker.oracle_tags import OracleTagsPublisher

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for real Oracle Tags publication")
    schema = "oracle_test_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            migration = (
                (Path(__file__).parents[2] / "frontend/drizzle/0016_deck_entry_categories.sql")
                .read_text()
                .split("CREATE TABLE catalog_oracle_facts")[0]
            )
            with psycopg.connect(scoped) as conn:
                conn.execute(migration)
            yield OracleTagsPublisher(scoped)
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def complete_tags(tmp_path, version=1):
    from worker.oracle_tags import ROOTS

    records = [
        tag(root, oracle_ids=[CARD] if key == "ramp" else []) for key, root in ROOTS.items()
    ]
    records[0]["label"] = f"Renamable label {version}"
    return write_tags(tmp_path, records)


def descriptor():
    return {
        "id": "bd8df61e-5d0a-47a2-9086-40137a645b98",
        "type": "oracle_tags",
        "updated_at": "2026-10-06T09:00:32.767Z",
        "download_uri": "https://data.scryfall.io/oracle-tags/fixture.jsonl.gz",
    }


def test_failed_refresh_retains_complete_publication_and_successful_retry_recovers(
    publisher, tmp_path
):
    import psycopg

    path = complete_tags(tmp_path)
    first = publisher.publish(path, descriptor())
    path.write_text(path.read_text() + "\n{truncated")
    with pytest.raises(ValueError):
        publisher.publish(path, descriptor())
    with psycopg.connect(publisher.database_url) as conn:
        active, status = conn.execute(
            "SELECT active_publication,refresh_status->>'kind' FROM oracle_tag_state"
        ).fetchone()
        assert str(active) == first["publicationId"]
        assert status == "Failed"
        assert conn.execute("SELECT count(*) FROM oracle_tag_publications").fetchone()[0] == 1
    path = complete_tags(tmp_path)
    assert publisher.publish(path, descriptor())["unchanged"] is True
    with psycopg.connect(publisher.database_url) as conn:
        assert (
            conn.execute("SELECT refresh_status->>'kind' FROM oracle_tag_state").fetchone()[0]
            == "Succeeded"
        )


def test_source_identity_missing_root_and_truncated_gzip_cannot_activate(publisher, tmp_path):
    import gzip

    path = complete_tags(tmp_path)
    first = publisher.publish(path, descriptor())
    for wrong in (
        {**descriptor(), "id": CARD},
        {**descriptor(), "updated_at": "2026-10-06"},
        {**descriptor(), "download_uri": "http://data.scryfall.io/file"},
    ):
        with pytest.raises(ValueError):
            publisher.publish(path, wrong)
    path = write_tags(tmp_path, [tag(ROOT)])
    with pytest.raises(ValueError, match="Missing starter"):
        publisher.publish(path, descriptor())
    path = complete_tags(tmp_path)
    path.write_bytes(gzip.compress(path.read_bytes())[:-7])
    with pytest.raises((ValueError, EOFError)):
        publisher.publish(path, descriptor())
    import psycopg

    with psycopg.connect(publisher.database_url) as conn:
        assert (
            str(conn.execute("SELECT active_publication FROM oracle_tag_state").fetchone()[0])
            == first["publicationId"]
        )


def test_concurrent_publishers_and_pruning_keep_only_current_previous(publisher, tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    import psycopg

    path = complete_tags(tmp_path)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: publisher.publish(path, descriptor()), range(2)))
    assert len({result["publicationId"] for result in results}) == 1
    second = publisher.publish(complete_tags(tmp_path, 2), descriptor())
    third = publisher.publish(complete_tags(tmp_path, 3), descriptor())
    with psycopg.connect(publisher.database_url) as conn:
        active, previous = conn.execute(
            "SELECT active_publication,previous_publication FROM oracle_tag_state"
        ).fetchone()
        assert str(active) == third["publicationId"]
        assert str(previous) == second["publicationId"]
        assert conn.execute("SELECT count(*) FROM oracle_tag_publications").fetchone()[0] == 2


def test_mapping_version_rebuilds_unchanged_payload(publisher, tmp_path, monkeypatch):
    import worker.oracle_tags as source

    path = complete_tags(tmp_path)
    first = publisher.publish(path, descriptor())
    monkeypatch.setattr(source, "MAPPING_VERSION", 2)
    second = publisher.publish(path, descriptor())
    assert second["publicationId"] != first["publicationId"]
    assert second["unchanged"] is False


def test_sync_records_publication_failure_once_and_download_failure_once(publisher, tmp_path):
    import psycopg

    from worker.main import sync_oracle_tags
    from worker.scryfall import BulkDataInfo

    class Source:
        fail_download = False

        def get_download_info(self, bulk_type):
            assert bulk_type == "oracle_tags"
            return BulkDataInfo(
                "oracle_tags",
                descriptor()["download_uri"],
                descriptor()["updated_at"],
                1,
                descriptor()["id"],
            )

        def download_bulk_file(self, info, path):
            if self.fail_download:
                raise ValueError("source download unavailable")
            path.write_text('{"truncated":')

    with psycopg.connect(publisher.database_url) as conn:
        conn.execute("CREATE TABLE status_attempts(kind text)")
        conn.execute(
            "CREATE FUNCTION audit_status() RETURNS trigger LANGUAGE plpgsql AS "
            "$$ BEGIN INSERT INTO status_attempts VALUES(NEW.refresh_status->>'kind'); "
            "RETURN NEW; END $$"
        )
        conn.execute(
            "CREATE TRIGGER audit_status AFTER UPDATE ON oracle_tag_state "
            "FOR EACH ROW EXECUTE FUNCTION audit_status()"
        )
    source = Source()
    with pytest.raises(ValueError):
        sync_oracle_tags(source, publisher, tmp_path)
    source.fail_download = True
    with pytest.raises(ValueError):
        sync_oracle_tags(source, publisher, tmp_path)
    with psycopg.connect(publisher.database_url) as conn:
        assert (
            conn.execute("SELECT count(*) FROM status_attempts WHERE kind='Failed'").fetchone()[0]
            == 2
        )
