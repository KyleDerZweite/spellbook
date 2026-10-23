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
    assert cli._source_directory() == Path(__file__).resolve().parents[2] / "drizzle"


def test_uninstalled_assets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(cli, "__file__", str(tmp_path / "site-packages/spellbook_api/migrate.py"))
    with pytest.raises(MigrationError, match="--migrations-dir"):
        cli._source_directory()


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
