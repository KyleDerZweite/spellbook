"""Explicit one-shot SQL migrator. DATABASE_URL comes only from the environment.

Run ``python -m spellbook_api.migrate [--migrations-dir PATH]``. This source-mode
entrypoint finds backend/drizzle relative to its own checkout; installed builds
must supply --migrations-dir until migration asset packaging is integrated.
"""

import argparse
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Never

import psycopg
from spellbook_core.migrations import MigrationError, migrate


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> Never:
        # argparse normally echoes rejected argument values, including a URL
        # accidentally supplied on the command line.
        self.print_usage(sys.stderr)
        self.exit(2, "Invalid migration arguments; use --help.\n")


def _source_directory() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "backend/drizzle"
        if (candidate / "meta/_journal.json").is_file():
            return candidate
    raise MigrationError("SQL assets were not found; supply --migrations-dir.")


def main(argv: Sequence[str] | None = None) -> int:
    parser = _Parser(description="Apply preserved Spellbook SQL migrations once.")
    parser.add_argument(
        "--migrations-dir", type=Path, help="Directory containing meta/_journal.json"
    )
    args = parser.parse_args(argv)
    url = os.environ.get("DATABASE_URL")
    if not url or not url.strip():
        print("Migration failed: DATABASE_URL is required in the environment.", file=sys.stderr)
        return 2
    try:
        directory = args.migrations_dir if args.migrations_dir is not None else _source_directory()
        # Dedicated connection, no pool, no environment-file loading or startup hook.
        with psycopg.connect(url, autocommit=True, connect_timeout=10) as connection:
            applied = migrate(connection, directory)
    except MigrationError as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    except psycopg.Error, ValueError:
        # Driver errors can contain connection strings, SQL, data and credentials.
        print("Migration failed: PostgreSQL connection or SQL execution failed.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Migration interrupted; inspect the ledger before retrying.", file=sys.stderr)
        return 130
    print(f"Applied {len(applied)} migration(s)." if applied else "Migrations are up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
