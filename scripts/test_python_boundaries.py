"""Negative fixtures exercise real Python syntax and the worker package roots."""

import tempfile
import unittest
from pathlib import Path

from check_python_boundaries import check_boundaries


class BoundaryTests(unittest.TestCase):
    def check(self, file: str, code: str, expected: str | None) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / file
            path.parent.mkdir(parents=True)
            path.write_text(code, encoding="utf-8")
            errors = check_boundaries(root)
            if expected:
                self.assertIn(expected, [error.rule for error in errors])
            else:
                self.assertEqual(errors, [])

    def test_core_rejects_framework_api_worker_and_client_imports(self) -> None:
        for code in (
            "import fastapi as framework",
            "from starlette.requests import Request",
            "from spellbook_api import http",
            "from backend import api",
            "from worker.catalog import CatalogPublisher",
            "from backend.workers import state",
            "import spellbook_state.value_history",
            "if TYPE_CHECKING:\n from spellbook_api.http.types import Configuration",
            "from . import uvicorn",
        ):
            # Relative imports resolve inside core; an external framework is absolute.
            expected = None if code == "from . import uvicorn" else "core-independent"
            with self.subTest(code=code):
                self.check("backend/core/src/spellbook_core/query.py", code, expected)
        self.check(
            "backend/core/src/spellbook_core/query.py",
            "import frontend",
            "server-client",
        )

    def test_dynamic_imports_cannot_bypass_direction_checks(self) -> None:
        for code in (
            "import importlib as loader\nloader.import_module('spellbook_api.http')",
            "from importlib import import_module as load\nload('fastapi')",
            "__import__('backend.api')",
        ):
            with self.subTest(code=code):
                self.check("backend/core/src/spellbook_core/query.py", code, "core-independent")
        self.check(
            "backend/core/src/spellbook_core/query.py",
            "__import__(name)",
            "dynamic-import",
        )

    def test_worker_packages_reject_http(self) -> None:
        for package in (
            "backend/workers/catalog",
            "backend/workers/scan",
            "backend/workers/state",
        ):
            with self.subTest(package=package):
                self.check(
                    f"{package}/src/worker/main.py",
                    "import spellbook_api",
                    "worker-http",
                )

    def test_permitted_dependencies_remain_usable(self) -> None:
        for file, code in (
            (
                "backend/api/src/spellbook_api/main.py",
                "from spellbook_core import application\nimport fastapi",
            ),
            (
                "backend/core/src/spellbook_core/query.py",
                "import psycopg\nfrom . import numbers",
            ),
            ("backend/workers/state/src/state/main.py", "import spellbook_core"),
            ("backend/workers/scan/src/scan_worker/main.py", "import fastapi"),
        ):
            with self.subTest(file=file):
                self.check(file, code, None)
        self.check("backend/api/src/spellbook_api/main.py", "import worker", "api-worker")
        self.check("backend/api/src/spellbook_api/main.py", "import spellbook_state", "api-worker")

    def test_syntax_errors_fail_closed(self) -> None:
        with self.assertRaises(SyntaxError):
            self.check("backend/core/src/spellbook_core/query.py", "import (", None)

    def test_mtg_consumers_use_explicit_namespace(self) -> None:
        for code in (
            "from spellbook_core.inventory import Inventory",
            "from spellbook_core import catalog",
            "import spellbook_core.scan.application",
            "from spellbook_api.http import routes_decks",
        ):
            with self.subTest(code=code):
                self.check("backend/api/src/spellbook_api/query.py", code, "mtg-namespace")
        for file, code in (
            ("backend/core/src/spellbook_core/mtg/decks/query.py", "from ... import inventory"),
            ("backend/api/src/spellbook_api/query.py", "from spellbook_core.mtg import inventory"),
            (
                "backend/workers/state/src/spellbook_state/main.py",
                "from spellbook_core.mtg.value_history import ValueHistory",
            ),
        ):
            with self.subTest(file=file, code=code):
                self.check(file, code, "mtg-namespace" if "..." in code else None)


if __name__ == "__main__":
    unittest.main()
