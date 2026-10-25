"""Secret-free argument errors and canonical Demo asset discovery."""

import argparse
import sys
from pathlib import Path
from typing import Never

from spellbook_core.operators import OperatorError
from spellbook_core.operators.fixtures import MANIFEST_NAME


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> Never:
        self.print_usage(sys.stderr)
        self.exit(2, "Invalid operator arguments; use --help.\n")


def fixture_directory() -> Path:
    bundled = Path(__file__).parent / "assets"
    if (bundled / MANIFEST_NAME).is_file():
        return bundled
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "backend/scripts/demo"
        if (candidate / MANIFEST_NAME).is_file():
            return candidate
    raise OperatorError("Demo fixtures are not packaged; supply --fixtures-dir.")
