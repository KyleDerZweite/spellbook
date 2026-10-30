"""CLI argument/stdin boundaries without connecting to PostgreSQL."""

import io
import os
from collections.abc import Callable, Sequence
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict
from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import require_demo_database
from spellbook_core.passwords import _derive

from spellbook_api.operators import local_password, replace_inventory, seed
from spellbook_api.operators.common import fixture_directory


@pytest.mark.parametrize("password", ["x" * 12, "x" * 128, "😀" * 64, "界" * 128])
@pytest.mark.parametrize("suffix", ["", "\n", "\r\n"])
def test_password_stdin_accepts_utf16_bounds_and_one_line_ending(
    password: str, suffix: str
) -> None:
    assert local_password.read_password(io.BytesIO((password + suffix).encode())) == password


@pytest.mark.parametrize("password", ["short\n", "x" * 129, "😀" * 65, "界" * 131, "x" * 10000])
def test_password_stdin_refuses_invalid_input_without_echo(password: str) -> None:
    with pytest.raises(OperatorError) as error:
        local_password.read_password(io.BytesIO(password.encode()))
    assert password not in str(error.value)


def test_stdin_read_is_bounded() -> None:
    stream = io.BytesIO(b"x" * 10000)
    with pytest.raises(OperatorError, match="too long"):
        local_password.read_password(stream)
    assert stream.tell() == 391


@pytest.mark.parametrize("main", [local_password.main, seed.main, replace_inventory.main])
def test_unrecognized_argv_does_not_echo_secret(
    main: Callable[[Sequence[str] | None], int],
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as error:
        main(["--protected-password-secret"])
    assert error.value.code == 2
    captured = capsys.readouterr()
    assert "protected-password-secret" not in captured.err


@pytest.mark.parametrize("main", [seed.main, replace_inventory.main])
def test_demo_cli_rejects_target_before_fixture_or_connection_access(
    main: Callable[[Sequence[str] | None], int],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://private:protected-password-secret@host/private"
    )
    assert main([]) == 1
    captured = capsys.readouterr()
    assert "protected-password-secret" not in captured.err
    assert "ending in _demo or _design" in captured.err


def test_password_cli_missing_environment_does_not_read_stdin(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert local_password.main(["account", "owner"]) == 2
    assert "DATABASE_URL" in capsys.readouterr().err


def test_source_fixture_location_is_canonical() -> None:
    canonical = Path(__file__).resolve().parents[2] / "scripts/demo"
    actual = fixture_directory()
    for name in (
        "cards.json",
        "upgrades-unleashed.json",
        "catalog-default-en-20261007.manifest.json",
        "catalog-default-en-20261007.jsonl.gz",
    ):
        assert (actual / name).read_bytes() == (canonical / name).read_bytes()


@pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_OPERATORS_NATIVE_DATABASE"),
    reason="Requires an exclusive empty migrated disposable Demo database assignment",
)
def test_real_password_cli_stdin_update_and_revocation(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    url = os.environ["TEST_DATABASE_URL"]
    require_demo_database(url)
    assert conninfo_to_dict(url).get("dbname") == os.environ["SPELLBOOK_OPERATORS_NATIVE_DATABASE"]
    owner = str(uuid4())
    with psycopg.connect(url, autocommit=True) as client:
        assert client.execute("SELECT 1 FROM user_profiles LIMIT 1").fetchone() is None
        try:
            client.execute(
                "INSERT INTO user_profiles(account_id,username) VALUES(%s,'cli_owner')",
                (owner,),
            )
            client.execute(
                """INSERT INTO auth_sessions(token_hash,account_id,expires_at)
                   VALUES(%s,%s,now()+interval '1 day')""",
                (uuid4().hex, owner),
            )
            monkeypatch.setenv("DATABASE_URL", url)
            password = "p" * 128
            monkeypatch.setattr(
                "sys.stdin", io.TextIOWrapper(io.BytesIO((password + "\r\n").encode()))
            )
            assert local_password.main([owner, " Renamed_Cli "]) == 0
            captured = capsys.readouterr()
            assert captured.out == "Local credentials saved. Existing sessions revoked.\n"
            assert not captured.err
            row = client.execute(
                "SELECT username,password_hash FROM local_credentials WHERE account_id=%s",
                (owner,),
            ).fetchone()
            assert row and row[0] == "renamed_cli"
            _, salt, digest = row[1].split("$")
            assert _derive(password, salt, digest, False)
            assert (
                client.execute(
                    "SELECT 1 FROM auth_sessions WHERE account_id=%s",
                    (owner,),
                ).fetchone()
                is None
            )
        finally:
            client.execute("DELETE FROM user_profiles WHERE account_id=%s", (owner,))


def test_dashboard_option_is_explicit_and_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/cli_demo")

    def fake_seed(*args: object, **kwargs: object) -> dict[str, str]:
        calls.append(kwargs)
        return {"message": "tested"}

    monkeypatch.setattr(seed, "seed_demo", fake_seed)
    assert seed.main(["--dashboard-scenario"]) == 0
    assert calls[-1]["dashboard_scenario"] is True
    assert seed.main([]) == 0
    assert calls[-1]["dashboard_scenario"] is False
