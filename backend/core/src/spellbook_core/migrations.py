"""Execute preserved Drizzle SQL with validated history and atomic publication.

The caller owns an idle, autocommit Psycopg connection. No HTTP or worker startup
calls this module. All pending SQL and its ledger entries commit together, matching
Drizzle's PostgreSQL transaction scope. Failed runs may leave serial ID gaps.
"""

import hashlib
import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection
from psycopg.pq import TransactionStatus

# Dedicated transaction lock for the one-shot migration owner, independent of
# application/worker advisory locks. PostgreSQL releases it on rollback or close.
MIGRATION_LOCK_KEY = 0x5350454C4C4D4947
_BREAKPOINT = "--> statement-breakpoint"


class MigrationError(Exception):
    """A safe operator message, containing neither SQL nor connection details."""


@dataclass(frozen=True)
class Migration:
    tag: str
    created_at: int
    hash: str
    statements: tuple[str, ...]


def read_migrations(directory: Path) -> tuple[Migration, ...]:
    """Validate journal order and hash exact UTF-8 SQL bytes before any SQL runs."""
    try:
        journal = json.loads((directory / "meta/_journal.json").read_bytes())
    except (OSError, ValueError, UnicodeError) as exc:
        raise MigrationError("Cannot read the migration journal.") from exc
    if (
        not isinstance(journal, dict)
        or journal.get("version") != "7"
        or journal.get("dialect") != "postgresql"
        or not isinstance(journal.get("entries"), list)
        or not journal["entries"]
    ):
        raise MigrationError("Unsupported migration journal.")

    migrations: list[Migration] = []
    tags: set[str] = set()
    previous_when = 0
    for index, entry in enumerate(journal["entries"]):
        if not isinstance(entry, dict):
            raise MigrationError(f"Invalid migration journal entry {index}.")
        tag, when = entry.get("tag"), entry.get("when")
        if (
            type(entry.get("idx")) is not int
            or entry["idx"] != index
            or entry.get("version") != "7"
            or type(entry.get("breakpoints")) is not bool
            or not isinstance(tag, str)
            or not re.fullmatch(rf"{index:04d}_[a-z0-9_]+", tag)
            or tag in tags
            or type(when) is not int
            or not previous_when < when <= 9007199254740991
        ):
            raise MigrationError(f"Invalid migration journal entry {index}.")
        try:
            raw = (directory / f"{tag}.sql").read_bytes()
            sql = raw.decode("utf-8")
        except (OSError, UnicodeError) as exc:
            raise MigrationError(f"Cannot read SQL for migration {index}.") from exc
        if not sql.strip():
            raise MigrationError(f"Empty SQL for migration {index}.")
        migrations.append(
            Migration(tag, when, hashlib.sha256(raw).hexdigest(), tuple(sql.split(_BREAKPOINT)))
        )
        tags.add(tag)
        previous_when = when
    if {path.stem for path in directory.glob("*.sql")} != tags:
        raise MigrationError("SQL files do not match the migration journal.")
    return tuple(migrations)


def validate_ledger(migrations: Sequence[Migration], rows: Sequence[tuple[object, ...]]) -> int:
    """Return the applied prefix length; never infer or stamp missing history.

    Rows are id/hash/created_at ordered by id. Serial IDs may have gaps after a
    rolled-back run, but hashes and timestamps must exactly match the journal.
    """
    if len(rows) > len(migrations):
        raise MigrationError("Migration ledger contains unknown history.")
    previous_id = 0
    for index, row in enumerate(rows):
        expected = migrations[index]
        if (
            len(row) != 3
            or type(row[0]) is not int
            or row[0] <= previous_id
            or row[1] != expected.hash
            or type(row[2]) is not int
            or row[2] != expected.created_at
        ):
            raise MigrationError(f"Migration ledger differs from the journal at entry {index}.")
        previous_id = row[0]
    return len(rows)


def migrate(connection: Connection[tuple[object, ...]], directory: Path) -> tuple[str, ...]:
    """Apply pending migrations once, returning their tags after confirmed commit.

    Concurrent Python runners fail immediately and may be retried normally.
    Execution errors propagate to the adapter, which must redact driver details.
    The caller must not run the legacy Drizzle owner during this ownership handoff.
    """
    migrations = read_migrations(directory)
    if not connection.autocommit or connection.info.transaction_status != TransactionStatus.IDLE:
        raise MigrationError("Migrator requires an idle autocommit connection.")
    with connection.transaction():
        locked = connection.execute(
            "SELECT pg_try_advisory_xact_lock(%s)", (MIGRATION_LOCK_KEY,)
        ).fetchone()
        if locked != (True,):
            raise MigrationError("Another migration runner is active; retry after it finishes.")
        connection.execute("CREATE SCHEMA IF NOT EXISTS drizzle")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations "
            "(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)"
        )
        # Exclude non-cooperating ledger writes while validating and applying SQL.
        connection.execute("LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE")
        rows = connection.execute(
            "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id"
        ).fetchall()
        applied = validate_ledger(migrations, rows)
        for migration in migrations[applied:]:
            for statement in migration.statements:
                # No parameters: simple protocol accepts a whole Drizzle fragment,
                # including function bodies and multiple semicolon-separated SQLs.
                connection.execute(statement, prepare=False)
            connection.execute(
                "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (%s, %s)",
                (migration.hash, migration.created_at),
            )
    return tuple(migration.tag for migration in migrations[applied:])
