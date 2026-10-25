"""Opt-in native migration rehearsal, never selected implicitly for database access.

Root must assign an EXCLUSIVE DISPOSABLE PostgreSQL 18 database, with ICU and
permission to create pg_trgm, schemas, tables, functions and triggers. No API,
worker, Drizzle runner or other test may use it during this suite. Set through the
protected environment:

* TEST_DATABASE_URL to the assigned database, no .env loading;
* SPELLBOOK_MIGRATIONS_TEST_DATABASE to its exact database name;
* SPELLBOOK_MIGRATIONS_ALLOW_RESET=yes to authorize dropping public and drizzle.

Run from the repository root, using the own API dev environment:
PYTHONPATH=backend/core/src backend/api/.venv/bin/pytest -q \
    backend/core/tests/test_migrations_postgres.py

Every test drops public/drizzle before and after execution. Use only the assigned
disposable target. These tests establish native behavior only when actually run.
The upgrade case constructs the historical ledger and executes original SQL as
Drizzle did; a retained Node database copy and full schema comparison remain
Root's separate integration rehearsal.
"""

import json
import os
import shutil
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import pytest
from psycopg import Connection
from psycopg.conninfo import conninfo_to_dict
from psycopg.pq import TransactionStatus

from spellbook_core.migrations import (
    MIGRATION_LOCK_KEY,
    MigrationError,
    migrate,
    read_migrations,
    validate_ledger,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_MIGRATIONS_TEST_DATABASE"),
    reason="Requires an exclusive assigned disposable migration database and reset opt-in",
)
SQL_DIRECTORY = Path(__file__).resolve().parents[2] / "drizzle"
type Database = Connection[tuple[object, ...]]


@pytest.fixture
def database() -> Iterator[Database]:
    target = os.environ["SPELLBOOK_MIGRATIONS_TEST_DATABASE"]
    assert target and target not in {"postgres", "template0", "template1"}
    assert os.environ.get("SPELLBOOK_MIGRATIONS_ALLOW_RESET") == "yes", "Explicit reset opt-in"
    dsn = os.environ["TEST_DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target, "Assigned database mismatch"
    with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as connection:
        assert connection.execute("SELECT current_database()").fetchone() == (target,)
        version = connection.execute("SHOW server_version_num").fetchone()
        assert version is not None and int(str(version[0])) // 10000 == 18
        _reset(connection)
        try:
            yield connection
        finally:
            _reset(connection)


def _reset(connection: Database) -> None:
    with connection.transaction():
        connection.execute("DROP SCHEMA IF EXISTS public CASCADE")
        connection.execute("DROP SCHEMA IF EXISTS drizzle CASCADE")
        connection.execute("CREATE SCHEMA public")


def _ledger(connection: Database) -> list[tuple[object, ...]]:
    return connection.execute(
        "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id"
    ).fetchall()


def _copy_history(directory: Path, count: int) -> None:
    (directory / "meta").mkdir(parents=True)
    journal = json.loads((SQL_DIRECTORY / "meta/_journal.json").read_bytes())
    journal["entries"] = journal["entries"][:count]
    (directory / "meta/_journal.json").write_text(json.dumps(journal))
    for entry in journal["entries"]:
        filename = entry["tag"] + ".sql"
        shutil.copyfile(SQL_DIRECTORY / filename, directory / filename)


def _add_migration(directory: Path, sql: str) -> None:
    path = directory / "meta/_journal.json"
    journal = json.loads(path.read_bytes())
    index = len(journal["entries"])
    tag = f"{index:04d}_rehearsal"
    journal["entries"].append(
        {
            "idx": index,
            "version": "7",
            "when": journal["entries"][-1]["when"] + 1,
            "tag": tag,
            "breakpoints": True,
        }
    )
    path.write_text(json.dumps(journal))
    (directory / f"{tag}.sql").write_text(sql)


def test_fresh_all_25_and_noop(database: Database) -> None:
    migrations = read_migrations(SQL_DIRECTORY)
    assert migrate(database, SQL_DIRECTORY) == tuple(item.tag for item in migrations)
    before = _ledger(database)
    assert validate_ledger(migrations, before) == 25
    assert migrate(database, SQL_DIRECTORY) == ()
    assert _ledger(database) == before
    assert database.execute("SELECT extname FROM pg_extension WHERE extname='pg_trgm'").fetchone()
    assert database.execute(
        "SELECT collprovider FROM pg_collation WHERE collname='inventory_root'"
    ).fetchone() == ("i",)
    assert database.execute(
        "SELECT attgenerated FROM pg_attribute "
        "WHERE attrelid='catalog_printings'::regclass AND attname='search_vector'"
    ).fetchone() == ("s",)
    assert database.execute(
        "SELECT to_regprocedure('spellbook_saved_state_notify()'), "
        "to_regclass('inventory_cards_window_name_idx')"
    ).fetchone() == ("spellbook_saved_state_notify()", "inventory_cards_window_name_idx")
    assert database.execute(
        "SELECT count(*) FROM pg_trigger WHERE tgname='saved_state_profile' AND NOT tgisinternal"
    ).fetchone() == (1,)


def test_upgrade_existing_drizzle_prefix_preserves_data(database: Database) -> None:
    migrations = read_migrations(SQL_DIRECTORY)
    # Construct the real legacy layout and execution scope, without using the
    # Python migrator to establish the starting ledger that it must recognize.
    database.execute("CREATE SCHEMA drizzle")
    database.execute(
        "CREATE TABLE drizzle.__drizzle_migrations "
        "(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)"
    )
    with database.transaction():
        for item in migrations[:6]:
            for statement in item.statements:
                database.execute(statement, prepare=False)
            database.execute(
                "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES (%s,%s)",
                (item.hash, item.created_at),
            )
        database.execute(
            "INSERT INTO user_profiles(account_id,username) VALUES ('migration-test','Æther 卡牌')"
        )
        database.execute(
            "INSERT INTO inventory_mutation_requests "
            "(account_id,request_id,source,status,request_hash) "
            "VALUES ('migration-test','legacy','web','applied',NULL)"
        )
    before = _ledger(database)
    assert migrate(database, SQL_DIRECTORY) == tuple(item.tag for item in migrations[6:])
    assert _ledger(database)[:6] == before
    assert database.execute(
        "SELECT username FROM user_profiles WHERE account_id='migration-test'"
    ).fetchone() == ("Æther 卡牌",)
    assert database.execute(
        "SELECT request_hash FROM inventory_mutation_requests WHERE request_id='legacy'"
    ).fetchone() == (None,)


@pytest.mark.parametrize("corruption", ["hash", "time", "gap", "unknown"])
def test_invalid_ledger_fails_without_changes(database: Database, corruption: str) -> None:
    migrate(database, SQL_DIRECTORY)
    if corruption == "hash":
        database.execute("UPDATE drizzle.__drizzle_migrations SET hash='changed' WHERE id=3")
    elif corruption == "time":
        database.execute("UPDATE drizzle.__drizzle_migrations SET created_at=NULL WHERE id=3")
    elif corruption == "gap":
        database.execute("DELETE FROM drizzle.__drizzle_migrations WHERE id=3")
    else:
        database.execute(
            "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) "
            "VALUES ('unknown',9999999999999)"
        )
    before = _ledger(database)
    with pytest.raises(MigrationError, match="ledger"):
        migrate(database, SQL_DIRECTORY)
    assert _ledger(database) == before
    assert database.info.transaction_status == TransactionStatus.IDLE


def test_failed_pending_batch_rolls_back_and_restarts(database: Database, tmp_path: Path) -> None:
    _copy_history(tmp_path, 1)
    migrate(database, tmp_path)
    before = _ledger(database)
    _add_migration(
        tmp_path, "CREATE TABLE migration_probe(id int); INSERT INTO migration_probe VALUES (1);"
    )
    _add_migration(tmp_path, "SELECT 1/0;")
    with pytest.raises(psycopg.errors.DivisionByZero):
        migrate(database, tmp_path)
    assert database.info.transaction_status == TransactionStatus.IDLE
    assert _ledger(database) == before
    assert database.execute("SELECT to_regclass('migration_probe')").fetchone() == (None,)
    (tmp_path / "0002_rehearsal.sql").write_text("INSERT INTO migration_probe VALUES (2);")
    assert migrate(database, tmp_path) == ("0001_rehearsal", "0002_rehearsal")
    assert database.execute("SELECT id FROM migration_probe ORDER BY id").fetchall() == [
        (1,),
        (2,),
    ]
    assert migrate(database, tmp_path) == ()


def test_failed_fresh_install_rolls_back_schema_and_ledger(
    database: Database, tmp_path: Path
) -> None:
    _copy_history(tmp_path, 1)
    _add_migration(tmp_path, "SELECT 1/0;")
    with pytest.raises(psycopg.errors.DivisionByZero):
        migrate(database, tmp_path)
    assert database.info.transaction_status == TransactionStatus.IDLE
    assert database.execute(
        "SELECT to_regnamespace('drizzle'), to_regclass('user_profiles')"
    ).fetchone() == (None, None)
    (tmp_path / "0001_rehearsal.sql").write_text("SELECT 1;")
    assert migrate(database, tmp_path) == ("0000_sleepy_maximus", "0001_rehearsal")


def test_concurrent_and_interrupted_runner_recovery(database: Database, tmp_path: Path) -> None:
    _copy_history(tmp_path, 1)
    migrate(database, tmp_path)
    before = _ledger(database)
    blocker_key = MIGRATION_LOCK_KEY + 1
    _add_migration(
        tmp_path,
        f"CREATE TABLE migration_probe(id int); SELECT pg_advisory_xact_lock({blocker_key});",
    )
    with (
        psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as runner,
        ThreadPoolExecutor(max_workers=1) as executor,
    ):
        with database.transaction():
            database.execute("SELECT pg_advisory_xact_lock(%s)", (blocker_key,))
            future = executor.submit(migrate, runner, tmp_path)
            try:
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    waiting = database.execute(
                        "SELECT EXISTS (SELECT 1 FROM pg_locks "
                        "WHERE pid=%s AND locktype='advisory' AND NOT granted)",
                        (runner.info.backend_pid,),
                    ).fetchone()
                    if waiting == (True,):
                        break
                    time.sleep(0.01)
                else:
                    pytest.fail("Migration runner did not acquire its lock")
                with (
                    psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as other,
                    pytest.raises(MigrationError, match="Another migration runner"),
                ):
                    migrate(other, tmp_path)
                runner.cancel()
                with pytest.raises(psycopg.errors.QueryCanceled):
                    future.result(timeout=10)
            finally:
                if not future.done():
                    runner.cancel()
        assert _ledger(database) == before
        assert runner.info.transaction_status == TransactionStatus.IDLE
        assert database.execute("SELECT to_regclass('migration_probe')").fetchone() == (None,)
        assert migrate(runner, tmp_path) == ("0001_rehearsal",)
        assert migrate(database, tmp_path) == ()


def test_reject_caller_transaction(database: Database) -> None:
    with database.transaction(), pytest.raises(MigrationError, match="idle autocommit"):
        migrate(database, SQL_DIRECTORY)
    assert database.execute("SELECT to_regnamespace('drizzle')").fetchone() == (None,)
