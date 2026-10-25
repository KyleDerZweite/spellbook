"""Opt-in production installation outside the repository, with no database access."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("SPELLBOOK_TEST_STATE_WHEEL") != "1",
    reason="Explicit installed-wheel build check",
)
ROOT = Path(__file__).resolve().parents[4]


def test_installed_state_entrypoint_and_core_from_sdist(tmp_path: Path) -> None:
    uv = shutil.which("uv")
    assert uv
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "DATABASE_URL"}
        and not key.startswith("PG")
    }

    def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            cwd=tmp_path,
            env=environment,
            check=check,
            capture_output=True,
            text=True,
            timeout=120,
        )

    package = ROOT / "backend/workers/state"
    wheels = tmp_path / "wheels"
    run(uv, "build", "--project", str(ROOT / "backend/core"), "--wheel", "--out-dir", str(wheels))
    run(uv, "build", "--project", str(package), "--sdist", "--out-dir", str(tmp_path))
    run(
        uv,
        "build",
        str(next(tmp_path.glob("spellbook_state_worker-*.tar.gz"))),
        "--wheel",
        "--out-dir",
        str(wheels),
    )
    requirements = tmp_path / "requirements.txt"
    requirements.write_text(
        run(
            uv,
            "export",
            "--project",
            str(package),
            "--frozen",
            "--no-dev",
            "--no-emit-project",
            "--no-emit-package",
            "spellbook-core",
        ).stdout
    )
    installed = tmp_path / "installed"
    run(uv, "venv", "--python", sys.executable, str(installed))
    python = str(installed / "bin/python")
    run(
        uv,
        "pip",
        "install",
        "--offline",
        "--python",
        python,
        "-r",
        str(requirements),
        *(str(path) for path in sorted(wheels.glob("*.whl"))),
    )
    command = str(installed / "bin/spellbook-state-worker")
    assert "WholeDeckCategory" in run(command, "--help").stdout
    missing = run(command, check=False)
    assert missing.returncode == 2 and "DATABASE_URL" in missing.stderr
    script = tmp_path / "check_installed.py"
    script.write_text("""
import asyncio
from importlib.metadata import distribution
from importlib.util import find_spec
import spellbook_state, spellbook_core
from spellbook_state.main import Configuration, StateResources
from spellbook_core.mtg.categories.collation import locale_sort_key
from spellbook_core.mtg.categories.common import combo_enabled
for package in (spellbook_state, spellbook_core):
    assert '/site-packages/' in package.__file__
assert find_spec('spellbook_api') is None and find_spec('fastapi') is None
entry = next(e for e in distribution('spellbook-state-worker').entry_points
             if e.name == 'spellbook-state-worker')
assert entry.value == 'spellbook_state.main:main'
assert sorted(['z', 'A', 'a'], key=locale_sort_key) == ['a', 'A', 'z']
async def check():
    resources = StateResources(Configuration('postgresql://fixture/unused', False, 'UTC', True))
    assert resources.pool.closed and combo_enabled(resources.pool)
    assert resources.values.timezone == 'UTC'
    assert resources.categories._task is None and resources.history._timer is None
    await resources.close()
    assert resources.pool.closed
asyncio.run(check())
""")
    run(python, str(script))
