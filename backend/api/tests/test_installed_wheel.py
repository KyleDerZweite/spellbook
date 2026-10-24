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
from zipfile import ZipFile

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("SPELLBOOK_TEST_WHEEL") != "1", reason="Explicit installed-wheel build check"
)
ROOT = Path(__file__).resolve().parents[3]


def test_installed_migrator_operators_and_assets_from_external_cwd(tmp_path: Path) -> None:
    uv = shutil.which("uvx")
    assert uv is not None
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "DATABASE_URL"}
        and not key.startswith("PG")
    }

    def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        if args and args[0] == uv:
            args = (uv, "--from", "uv==0.12.23", "uv", *args[1:])
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
    operator_assets = {
        name: hashlib.sha256((ROOT / "backend/scripts/demo" / name).read_bytes()).hexdigest()
        for name in (
            "cards.json",
            "upgrades-unleashed.json",
            "catalog-default-en-20261007.manifest.json",
            "catalog-default-en-20261007.jsonl.gz",
        )
    }

    def check_operator_assets(wheel: Path) -> None:
        with ZipFile(wheel) as archive:
            packaged = {
                path.removeprefix("spellbook_api/operators/assets/"): hashlib.sha256(
                    archive.read(path)
                ).hexdigest()
                for path in archive.namelist()
                if path.startswith("spellbook_api/operators/assets/")
            }
        assert packaged == operator_assets

    check_operator_assets(next(wheels.glob("spellbook_api-*.whl")))
    # Build again from the sdist to prove both distributions carry the canonical assets.
    run(uv, "build", "--project", str(ROOT / "backend/api"), "--sdist", "--out-dir", str(tmp_path))
    sdist = next(tmp_path.glob("spellbook_api-*.tar.gz"))
    run(uv, "build", str(sdist), "--wheel", "--out-dir", str(wheels))
    check_operator_assets(next(wheels.glob("spellbook_api-*.whl")))
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
    for command in (
        "spellbook-operator-password",
        "spellbook-demo-seed",
        "spellbook-demo-replace-inventory",
    ):
        assert run(str(installed / "bin" / command), "--help").returncode == 0
    cli = str(installed / "bin/spellbook-migrate")
    assert run(cli, "--help").returncode == 0
    missing = run(cli, check=False)
    assert missing.returncode == 2 and "DATABASE_URL is required" in missing.stderr
    assert missing.stdout == ""
    script = tmp_path / "check_installed.py"
    script.write_text("""
import asyncio, hashlib, json, os, re
from contextlib import contextmanager
from importlib.metadata import distribution
from importlib.resources import files
from importlib.util import find_spec
from pathlib import Path
import spellbook_api, spellbook_core
from spellbook_api import migrate as cli
from spellbook_core.migrations import read_migrations
from spellbook_core.operators.fixtures import verify_bundle, load_precon, legacy_inventory
from spellbook_api.operators import local_password, seed, replace_inventory
from spellbook_api.operators.common import fixture_directory
entrypoints = {entry.name: entry.value for entry in distribution('spellbook-api').entry_points}
assert entrypoints['spellbook-operator-password'] == 'spellbook_api.operators.local_password:main'
assert entrypoints['spellbook-demo-seed'] == 'spellbook_api.operators.seed:main'
assert entrypoints['spellbook-demo-replace-inventory'] == (
    'spellbook_api.operators.replace_inventory:main'
)
import boto3, python_multipart, httpx2
from spellbook_api.scan_storage import ScanStorageConfiguration, create_scan_storage
from spellbook_api.scan_worker import HttpScanWorker
for package in (spellbook_api, spellbook_core):
    assert '/site-packages/' in package.__file__
assert find_spec('spellbook_api.http.compatibility') is None
assert find_spec('spellbook_api.http.paths') is None
from spellbook_api.application import create_application
from spellbook_api.http.types import Configuration
lifetime = create_application(Configuration(
    'https://candidate.example', database_url='postgresql://localhost/unused'
))
try:
    schema = json.loads(files('spellbook_api').joinpath('openapi.json').read_text())
    expected = {
        (method.upper(), path)
        for path, item in schema['paths'].items()
        if path.startswith('/api/')
        for method in item
        if method in {'get', 'post', 'put', 'patch', 'delete'}
    }
    from fastapi.routing import iter_route_contexts
    actual = {
        (method, route.path)
        for route in iter_route_contexts(lifetime.http.routes)
        for method in route.methods or ()
    }
    assert actual == expected | {('GET', '/openapi.json')}
finally:
    asyncio.run(lifetime.close())
directory = cli._default_directory()
assert '/site-packages/' in str(directory)
migrations = read_migrations(directory)
assert len(migrations) == 25
print(json.dumps({str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in directory.rglob('*') if p.is_file()}, sort_keys=True))
for module in (local_password, seed, replace_inventory):
    assert '/site-packages/' in module.__file__
fixtures = fixture_directory()
assert '/site-packages/' in str(fixtures)
assert seed.fixture_directory() == replace_inventory.fixture_directory() == fixtures
bundle = verify_bundle(fixtures)
assert sum(len(batch) for batch in bundle.batches()) == bundle.manifest.documents == 109393
assert sum(card['quantity'] for card in load_precon(fixtures).cards) == 100
assert sum(card['quantity'] for card in legacy_inventory(fixtures)) == 72
print(json.dumps({p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in fixtures.iterdir() if p.is_file()}, sort_keys=True))
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
    assert json.loads(output[1]) == operator_assets
    assert output[2:] == ["Migrations are up to date."] * 2
