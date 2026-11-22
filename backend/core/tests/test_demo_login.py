"""DEMO_LOGIN_ENABLED gating before any credential read. Postgres coverage verifies hashes."""

import asyncio
from typing import Literal
from unittest.mock import AsyncMock, MagicMock

import pytest

from spellbook_core.auth import LocalAuth, create_local_auth
from spellbook_core.models import Actor


class CredentialLookup(Exception):
    """Raised by the fake pool once a request gets past the in-memory checks."""


def local_auth(*, enabled: bool) -> LocalAuth:
    pool = MagicMock()
    pool.connection.side_effect = CredentialLookup
    return create_local_auth(pool, MagicMock(), demo_login_enabled=enabled)


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
def test_password_change_is_refused_only_for_the_shared_demo_account(enabled: bool) -> None:
    auth = local_auth(enabled=enabled)
    for name in ("demo", "kyle"):
        actor = Actor("account", name, "", "wizard", "grove")
        auth.require_actor = AsyncMock(return_value=actor)  # type: ignore[method-assign]
        change = auth.change_password(actor, "current-password", "replacement-password")
        if name == "demo" and enabled:
            assert asyncio.run(change) is None
        else:
            with pytest.raises(CredentialLookup):
                asyncio.run(change)
