"""Add the shared demo account to any migrated database, including multi-user Production."""

import os
import sys
from collections.abc import Sequence
from pathlib import Path

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import seed_demo_account
from spellbook_core.operators.fixtures import load_precon

from .common import Parser, fixture_directory


def main(argv: Sequence[str] | None = None) -> int:
    parser = Parser(
        description=(
            "Add the shared demo account with its starter Deck and Inventory. "
            "Other accounts and the Catalog stay unchanged; an existing demo account is preserved."
        )
    )
    parser.add_argument("--fixtures-dir", type=Path, help="Directory of canonical Demo assets")
    args = parser.parse_args(argv)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL environment is required.", file=sys.stderr)
        return 2
    try:
        directory = args.fixtures_dir if args.fixtures_dir is not None else fixture_directory()
        result = seed_demo_account(
            url,
            load_precon(directory),
            timezone=os.environ.get("VALUE_HISTORY_TIMEZONE", "Europe/Berlin"),
        )
    except OperatorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Demo account seed interrupted.", file=sys.stderr)
        return 130
    print(result["message"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
