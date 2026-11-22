"""DEMO_LOGIN_ENABLED gating, stored-credential lock checks and demo seeder guards."""

import asyncio
from contextlib import asynccontextmanager, contextmanager
from typing import Any, Literal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from spellbook_core.auth import LocalAuth, create_local_auth
from spellbook_core.models import Actor
from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import seed_demo_account
from spellbook_core.passwords import hash_password, verify_password_hash


class CredentialLookup(Exception):
    """Raised by the fake pool once a request gets past the in-memory checks."""


def local_auth(*, enabled: bool, demo_mode: bool = False) -> LocalAuth:
    pool = MagicMock()
    pool.connection.side_effect = CredentialLookup
    return create_local_auth(
        pool, MagicMock(), demo_mode=demo_mode, demo_login_enabled=enabled
    )


def auth_with_stored_hash(stored_hash: str | None, *, enabled: bool) -> LocalAuth:
    cursor = MagicMock()
    cursor.fetchone = AsyncMock(return_value=(stored_hash,) if stored_hash is not None else None)
    conn = MagicMock()
    conn.execute = AsyncMock(return_value=cursor)

    @asynccontextmanager
    async def tx() -> Any:
        yield conn

    @asynccontextmanager
    async def connection(*_args: Any, **_kwargs: Any) -> Any:
        yield conn

    conn.transaction = tx
    pool = MagicMock()
    pool.connection = connection
    passwords = MagicMock()
    passwords.verify = AsyncMock(side_effect=verify_password_hash)
    return create_local_auth(pool, passwords, demo_login_enabled=enabled)


@pytest.mark.parametrize(
    "enabled,mode,username,password",
    [
        (False, "login", "demo", "demo"),
        (True, "login", "kyle", "demo"),
        (True, "login", "demo", "demo1"),
        (True, "register", "demo", "demo"),
    ],
)
def test_short_passwords_stay_rejected_outside_the_exact_enabled_demo_login(
    enabled: bool, mode: Literal["login", "register"], username: str, password: str
) -> None:
    assert asyncio.run(local_auth(enabled=enabled).authenticate(mode, username, password)) is None


def test_enabled_demo_login_proceeds_to_the_stored_hash() -> None:
    with pytest.raises(CredentialLookup):
        asyncio.run(local_auth(enabled=True).authenticate("login", " Demo ", "demo"))


@pytest.mark.parametrize("enabled", [True, False])
def test_password_change_lock_distinguishes_shared_and_ordinary_demo_accounts(
    enabled: bool,
) -> None:
    shared_hash = hash_password("demo")
    ordinary_hash = hash_password("ordinary-user-password")
    demo_actor = Actor("demo-id", "demo", "", "wizard", "grove")
    kyle_actor = Actor("kyle-id", "kyle", "", "wizard", "grove")

    assert asyncio.run(local_auth(enabled=False, demo_mode=True).password_change_locked(kyle_actor))
    assert not asyncio.run(local_auth(enabled=enabled).password_change_locked(kyle_actor))
    # Shared demo account stays locked whether DEMO_LOGIN_ENABLED is on or off.
    assert asyncio.run(
        auth_with_stored_hash(shared_hash, enabled=enabled).password_change_locked(demo_actor)
    )
    # An ordinary account named `demo` with its own password is never locked.
    assert not asyncio.run(
        auth_with_stored_hash(ordinary_hash, enabled=enabled).password_change_locked(demo_actor)
    )
    assert not asyncio.run(
        auth_with_stored_hash(None, enabled=enabled).password_change_locked(demo_actor)
    )


def test_change_password_blocks_shared_demo_password_and_allows_ordinary_demo_password() -> None:
    auth = local_auth(enabled=True)
    demo_actor = Actor("demo-id", "demo", "", "wizard", "grove")
    auth.require_actor = AsyncMock(return_value=demo_actor)  # type: ignore[method-assign]
    assert asyncio.run(auth.change_password(demo_actor, "demo", "replacement-password")) is None
    with pytest.raises(CredentialLookup):
        asyncio.run(
            auth.change_password(demo_actor, "ordinary-user-password", "replacement-password")
        )


def test_seed_demo_account_refuses_ordinary_demo_account_and_preserves_shared_demo() -> None:
    def run_with(profiles: list[dict[str, Any]], credentials: list[dict[str, Any]]) -> Any:
        client = MagicMock()

        @contextmanager
        def tx() -> Any:
            yield

        client.transaction = tx

        def execute(sql: str, *_args: Any) -> MagicMock:
            result = MagicMock()
            if "FROM user_profiles" in sql:
                result.fetchall.return_value = profiles
            elif "FROM local_credentials" in sql:
                result.fetchall.return_value = credentials
            return result

        client.execute.side_effect = execute

        @contextmanager
        def connect(_url: str) -> Any:
            yield client

        with patch("spellbook_core.operators.demo._connect", connect):
            return seed_demo_account("postgresql://unused/spellbook", MagicMock())

    shared = hash_password("demo")
    assert run_with(
        [{"account_id": "a1"}], [{"account_id": "a1", "password_hash": shared}]
    )["status"] == "preserved"

    ordinary = hash_password("ordinary-user-password")
    with pytest.raises(OperatorError, match="does not use the shared demo password"):
        run_with([{"account_id": "a1"}], [{"account_id": "a1", "password_hash": ordinary}])

    with pytest.raises(OperatorError, match="does not use the shared demo password"):
        run_with([{"account_id": "a1"}], [])


def test_seed_demo_account_holds_catalog_publisher_lock_across_validation_and_insert() -> None:
    events: list[str] = []
    client = MagicMock()

    @contextmanager
    def tx() -> Any:
        events.append("tx_enter")
        yield
        events.append("tx_exit")

    client.transaction = tx

    def execute(sql: str, params: Any = None) -> MagicMock:
        result = MagicMock()
        if "FROM user_profiles" in sql or "FROM local_credentials" in sql:
            result.fetchall.return_value = []
        elif "hashtext('spellbook-demo-seed')" in sql:
            events.append("demo_lock")
        elif "pg_advisory_xact_lock" in sql and params == (1936747619, 1):
            events.append("catalog_lock")
        return result

    client.execute.side_effect = execute

    @contextmanager
    def connect(_url: str) -> Any:
        yield client

    with (
        patch("spellbook_core.operators.demo._connect", connect),
        patch(
            "spellbook_core.operators.demo.require_precon_catalog",
            side_effect=lambda *_a: events.append("validate_catalog"),
        ),
        patch(
            "spellbook_core.operators.demo.insert_demo_account",
            side_effect=lambda *_a: events.append("insert_demo"),
        ),
    ):
        assert seed_demo_account("postgresql://unused/spellbook", MagicMock())["status"] == "seeded"

    assert events == [
        "tx_enter",
        "demo_lock",
        "catalog_lock",
        "validate_catalog",
        "insert_demo",
        "tx_exit",
    ]
