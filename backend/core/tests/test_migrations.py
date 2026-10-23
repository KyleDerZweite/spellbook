"""Pure migration parsing/history tests. No environment or database access."""

import hashlib
import json
from pathlib import Path

import pytest

from spellbook_core.migrations import MigrationError, read_migrations, validate_ledger

SQL_DIRECTORY = Path(__file__).resolve().parents[2] / "drizzle"


def write_journal(directory: Path, sqls: tuple[bytes, ...]) -> None:
    (directory / "meta").mkdir(parents=True)
    entries = []
    for index, sql in enumerate(sqls):
        tag = f"{index:04d}_test"
        (directory / f"{tag}.sql").write_bytes(sql)
        entries.append(
            {"idx": index, "version": "7", "when": 1000 + index, "tag": tag, "breakpoints": True}
        )
    (directory / "meta/_journal.json").write_text(
        json.dumps({"version": "7", "dialect": "postgresql", "entries": entries})
    )


def test_real_history_hashes_timestamps_and_breakpoints() -> None:
    migrations = read_migrations(SQL_DIRECTORY)
    journal = json.loads((SQL_DIRECTORY / "meta/_journal.json").read_bytes())
    assert len(migrations) == 25
    for migration, entry in zip(migrations, journal["entries"], strict=True):
        raw = (SQL_DIRECTORY / f"{entry['tag']}.sql").read_bytes()
        assert migration.created_at == entry["when"]
        assert migration.hash == hashlib.sha256(raw).hexdigest()
        assert "--> statement-breakpoint".join(migration.statements).encode() == raw


def test_exact_bytes_and_function_bodies(tmp_path: Path) -> None:
    raw = (
        "-- Æther 卡牌\r\nCREATE FUNCTION test() RETURNS void LANGUAGE plpgsql AS $$\r\n"
        "BEGIN PERFORM 1; PERFORM 2; END $$;\r\n--> statement-breakpoint\r\nSELECT 100 % 3;"
    ).encode()
    write_journal(tmp_path, (raw,))
    migration = read_migrations(tmp_path)[0]
    assert migration.hash == hashlib.sha256(raw).hexdigest()
    assert len(migration.statements) == 2
    assert "BEGIN PERFORM 1; PERFORM 2; END $$;\r\n" in migration.statements[0]
    assert migration.statements[1] == "\r\nSELECT 100 % 3;"
    assert migration.hash != hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("idx", 1),
        ("idx", False),
        ("tag", "../escape"),
        ("tag", "0001_test"),
        ("when", 0),
        ("when", True),
        ("when", 1000.0),
        ("when", 9007199254740992),
        ("version", "6"),
        ("breakpoints", "true"),
    ],
)
def test_invalid_journal_entry(tmp_path: Path, field: str, value: object) -> None:
    write_journal(tmp_path, (b"SELECT 1;",))
    journal_path = tmp_path / "meta/_journal.json"
    journal = json.loads(journal_path.read_text())
    journal["entries"][0][field] = value
    journal_path.write_text(json.dumps(journal))
    with pytest.raises(MigrationError, match="entry 0"):
        read_migrations(tmp_path)


def test_non_increasing_journal_time(tmp_path: Path) -> None:
    write_journal(tmp_path, (b"SELECT 1;", b"SELECT 2;"))
    journal_path = tmp_path / "meta/_journal.json"
    journal = json.loads(journal_path.read_text())
    journal["entries"][1]["when"] = 999
    journal_path.write_text(json.dumps(journal))
    with pytest.raises(MigrationError, match="entry 1"):
        read_migrations(tmp_path)


@pytest.mark.parametrize("raw", [b"", b" \r\n", b"SELECT '\xff';"])
def test_empty_or_invalid_utf8_sql(tmp_path: Path, raw: bytes) -> None:
    write_journal(tmp_path, (raw,))
    with pytest.raises(MigrationError):
        read_migrations(tmp_path)


def test_missing_sql_and_unknown_sql(tmp_path: Path) -> None:
    write_journal(tmp_path, (b"SELECT 1;",))
    sql = tmp_path / "0000_test.sql"
    sql.rename(tmp_path / "0001_unknown.sql")
    with pytest.raises(MigrationError, match="Cannot read SQL"):
        read_migrations(tmp_path)
    sql.write_bytes(b"SELECT 1;")
    with pytest.raises(MigrationError, match="do not match"):
        read_migrations(tmp_path)


@pytest.mark.parametrize("raw", [b"{", b"[]", b"null", b'{"entries": []}', b'"text"'])
def test_invalid_journal(tmp_path: Path, raw: bytes) -> None:
    (tmp_path / "meta").mkdir()
    (tmp_path / "meta/_journal.json").write_bytes(raw)
    with pytest.raises(MigrationError):
        read_migrations(tmp_path)


def test_applied_prefix_and_serial_gaps() -> None:
    migrations = read_migrations(SQL_DIRECTORY)
    assert validate_ledger(migrations, []) == 0
    rows = [(3 + index * 2, item.hash, item.created_at) for index, item in enumerate(migrations)]
    assert validate_ledger(migrations, rows[:7]) == 7
    assert validate_ledger(migrations, rows) == 25


@pytest.mark.parametrize("corruption", ["hash", "time", "gap", "reorder", "duplicate", "unknown"])
def test_reject_changed_unknown_or_noncontiguous_history(corruption: str) -> None:
    migrations = read_migrations(SQL_DIRECTORY)
    rows: list[tuple[object, ...]] = [
        (index + 1, item.hash, item.created_at) for index, item in enumerate(migrations)
    ]
    if corruption == "hash":
        rows[0] = (1, "changed", migrations[0].created_at)
    elif corruption == "time":
        rows[0] = (1, migrations[0].hash, None)
    elif corruption == "gap":
        del rows[1]
    elif corruption == "reorder":
        rows[0], rows[1] = rows[1], rows[0]
    elif corruption == "duplicate":
        rows[1] = rows[0]
    else:
        rows.append((26, "unknown", 9999999999999))
    with pytest.raises(MigrationError, match="ledger"):
        validate_ledger(migrations, rows)
