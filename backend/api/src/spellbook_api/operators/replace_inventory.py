"""Read-only preview by default; --apply replaces only the untouched legacy starter."""

import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import replace_demo_inventory, require_demo_database
from spellbook_core.operators.fixtures import legacy_inventory, load_precon

from .common import Parser, fixture_directory


def main(argv: Sequence[str] | None = None) -> int:
    parser = Parser(description="Preview replacement of the untouched legacy Demo Inventory.")
    parser.add_argument("--apply", action="store_true", help="Commit the guarded replacement")
    parser.add_argument("--fixtures-dir", type=Path, help="Directory of canonical Demo assets")
    args = parser.parse_args(argv)
    try:
        url = os.environ.get("DATABASE_URL", "")
        require_demo_database(url)
        directory = args.fixtures_dir if args.fixtures_dir is not None else fixture_directory()
        result = replace_demo_inventory(
            url,
            load_precon(directory),
            legacy_inventory(directory),
            apply=args.apply,
        )
    except OperatorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Demo Inventory replacement interrupted.", file=sys.stderr)
        return 130
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
