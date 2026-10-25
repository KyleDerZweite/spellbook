"""CLI configuration/error checks. These tests never connect to PostgreSQL."""

from pathlib import Path

import psycopg
import pytest
from spellbook_core.migrations import MigrationError

from spellbook_api import migrate as cli


def test_missing_url(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert cli.main([]) == 2
    assert "DATABASE_URL is required" in capsys.readouterr().err


def test_source_default() -> None:
    canonical = Path(__file__).resolve().parents[2] / "drizzle"
    actual = cli._default_directory()
    assert {p.relative_to(actual): p.read_bytes() for p in actual.rglob("*") if p.is_file()} == {
        p.relative_to(canonical): p.read_bytes() for p in canonical.rglob("*") if p.is_file()
    }


def test_uninstalled_assets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(cli, "__file__", str(tmp_path / "site-packages/spellbook_api/migrate.py"))
    with pytest.raises(MigrationError, match="--migrations-dir"):
        cli._default_directory()


@pytest.mark.parametrize("error", [psycopg.OperationalError, psycopg.ProgrammingError, ValueError])
def test_driver_details_redacted(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], error: type[Exception]
) -> None:
    secret = "postgresql://someone:private-password@private-host/private-db"
    monkeypatch.setenv("DATABASE_URL", secret)

    def connect(*args: object, **kwargs: object) -> None:
        raise error(secret)

    monkeypatch.setattr(psycopg, "connect", connect)
    assert cli.main([]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "PostgreSQL connection or SQL execution failed" in captured.err
    assert "private" not in captured.err


def test_cli_refuses_url_argument(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SystemExit) as error:
        cli.main(["--url", "postgresql://private-user:private-password@private-host/private-db"])
    assert error.value.code == 2
    assert "private" not in capsys.readouterr().err


def test_installed_assets_take_precedence_over_source_search(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    package = tmp_path / "spellbook_api"
    journal = package / "drizzle/meta/_journal.json"
    journal.parent.mkdir(parents=True)
    journal.write_text("{}")
    monkeypatch.setattr(cli, "__file__", str(package / "migrate.py"))
    assert cli._default_directory() == package / "drizzle"


def test_explicit_assets_bypass_default_lookup(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    from collections.abc import Iterator
    from contextlib import contextmanager

    monkeypatch.setenv("DATABASE_URL", "postgresql://fixture/unused")

    def missing() -> Path:
        raise AssertionError("Default assets must not be inspected")

    @contextmanager
    def connect(*args: object, **kwargs: object) -> Iterator[object]:
        yield object()

    def no_op(connection: object, directory: Path) -> tuple[str, ...]:
        assert directory == tmp_path
        return ()

    monkeypatch.setattr(cli, "_default_directory", missing)
    monkeypatch.setattr(psycopg, "connect", connect)
    monkeypatch.setattr(cli, "migrate", no_op)
    assert cli.main(["--migrations-dir", str(tmp_path)]) == 0
    captured = capsys.readouterr()
    assert captured.out == "Migrations are up to date.\n" and captured.err == ""
