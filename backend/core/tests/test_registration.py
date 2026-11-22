import asyncio
from unittest.mock import MagicMock

import pytest
from spellbook_core.auth import create_local_auth


@pytest.mark.parametrize(
    "demo_mode,registration_enabled,expected",
    [(False, True, True), (False, False, False), (True, True, False), (True, False, False)],
)
def test_demo_mode_and_operator_switch_share_one_registration_check(
    demo_mode: bool, registration_enabled: bool, expected: bool
) -> None:
    auth = create_local_auth(MagicMock(), MagicMock(), demo_mode, registration_enabled)
    assert auth.registration_open is expected


def test_closed_registration_returns_before_hashing_or_database_writes() -> None:
    pool, passwords = MagicMock(), MagicMock()
    auth = create_local_auth(pool, passwords, registration_enabled=False)
    result = asyncio.run(auth.authenticate("register", "new_owner", "valid-password-123"))
    assert result is None
    passwords.hash.assert_not_called()
    pool.connection.assert_not_called()
