"""Explicit Demo Catalog and starter seed. Never invokes migrations or a service."""

import os
import sys
from collections.abc import Sequence
from pathlib import Path

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import require_demo_database, seed_demo
from spellbook_core.operators.fixtures import load_precon, verify_bundle

from .common import Parser, fixture_directory


def main(argv: Sequence[str] | None = None) -> int:
    parser = Parser(description="Publish the versioned Demo Catalog and seed missing Demo data.")
    parser.add_argument(
        "--reset-users", action="store_true", help="Delete disposable Demo accounts"
    )
    parser.add_argument(
        "--dashboard-scenario",
        action="store_true",
        help="Add the once-only Printing mix Demo Deck and twelve-Set Inventory scenario",
    )
    parser.add_argument("--fixtures-dir", type=Path, help="Directory of canonical Demo assets")
    args = parser.parse_args(argv)
    try:
        url = os.environ.get("DATABASE_URL", "")
        require_demo_database(url)
        directory = args.fixtures_dir if args.fixtures_dir is not None else fixture_directory()
        bundle = verify_bundle(directory)
        result = seed_demo(
            url,
            bundle,
            load_precon(directory),
            reset=args.reset_users,
            dashboard_scenario=args.dashboard_scenario,
            timezone=os.environ.get("VALUE_HISTORY_TIMEZONE", "Europe/Berlin"),
        )
    except OperatorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Demo seed interrupted.", file=sys.stderr)
        return 130
    print(result["message"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
