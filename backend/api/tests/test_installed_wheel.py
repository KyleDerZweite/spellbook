"""Opt-in build/install rehearsal outside the checkout, without PostgreSQL.

Run SPELLBOOK_TEST_WHEEL=1 pytest tests/test_installed_wheel.py in the API env.
Dependencies come from the frozen API lock and the existing uv cache.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("SPELLBOOK_TEST_WHEEL") != "1", reason="Explicit installed-wheel build check"
)
ROOT = Path(__file__).resolve().parents[3]


def test_installed_migrator_and_assets_from_external_cwd(tmp_path: Path) -> None:
    uv = shutil.which("uv")
    assert uv is not None
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
            capture_output=True,
            text=True,
            check=check,
            timeout=120,
        )

    wheels = tmp_path / "wheels"
    for package in ("core", "api"):
        run(
            uv,
            "build",
            "--project",
            str(ROOT / "backend" / package),
            "--wheel",
            "--out-dir",
            str(wheels),
        )
    # Build again from the sdist to prove both distributions carry the canonical assets.
    run(uv, "build", "--project", str(ROOT / "backend/api"), "--sdist", "--out-dir", str(tmp_path))
    sdist = next(tmp_path.glob("spellbook_api-*.tar.gz"))
    run(uv, "build", str(sdist), "--wheel", "--out-dir", str(wheels))
    requirements = run(
        uv,
        "export",
        "--project",
        str(ROOT / "backend/api"),
        "--frozen",
        "--no-dev",
        "--no-emit-project",
        "--no-emit-package",
        "spellbook-core",
    ).stdout
    locked = tmp_path / "requirements.txt"
    locked.write_text(requirements)
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
        str(locked),
        str(next(wheels.glob("spellbook_core-*.whl"))),
        str(next(wheels.glob("spellbook_api-*.whl"))),
    )
    cli = str(installed / "bin/spellbook-migrate")
    assert run(cli, "--help").returncode == 0
    missing = run(cli, check=False)
    assert missing.returncode == 2 and "DATABASE_URL is required" in missing.stderr
    assert missing.stdout == ""
    script = tmp_path / "check_installed.py"
    script.write_text("""
import hashlib, json, os
from contextlib import contextmanager
from pathlib import Path
import spellbook_api, spellbook_core
from spellbook_api import migrate as cli
from spellbook_core.migrations import read_migrations
for package in (spellbook_api, spellbook_core):
    assert '/site-packages/' in package.__file__
directory = cli._default_directory()
assert '/site-packages/' in str(directory)
migrations = read_migrations(directory)
assert len(migrations) == 25
print(json.dumps({str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in directory.rglob('*') if p.is_file()}, sort_keys=True))
@contextmanager
def connection(*args, **kwargs):
    assert kwargs == dict(autocommit=True, connect_timeout=10)
    yield object()
seen = []
def no_op(connection, assets):
    assert read_migrations(assets) == migrations
    seen.append(assets)
    return ()
cli.psycopg.connect = connection
cli.migrate = no_op
os.environ['DATABASE_URL'] = 'postgresql://fixture/unused'
assert cli.main([]) == 0
assert seen == [directory]
assert cli.main(['--migrations-dir', str(directory)]) == 0
assert seen == [directory, directory]
""")
    output = run(python, str(script)).stdout.splitlines()
    expected = {
        str(path.relative_to(ROOT / "backend/drizzle")): hashlib.sha256(
            path.read_bytes()
        ).hexdigest()
        for path in (ROOT / "backend/drizzle").rglob("*")
        if path.is_file()
    }
    assert json.loads(output[0]) == expected
    assert output[1:] == ["Migrations are up to date."] * 2
