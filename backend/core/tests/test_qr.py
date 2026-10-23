"""Requester credential separation and terminal/expiry semantics without a database."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from spellbook_core.auth import hash_session_token
from spellbook_core.qr import QrAuthError, Requester, _Challenge, _info, _verify_requester

CODE = "a" * 43
SECRET = "b" * 43


def challenge(kind: str = "browser", status: str = "pending") -> _Challenge:
    return _Challenge(
        hash_session_token(CODE),
        hash_session_token(SECRET),
        kind,
        status,
        None,
        None,
        datetime.now(UTC) + timedelta(minutes=1),
    )


@pytest.mark.parametrize(
    "requester,kind,message",
    [
        (Requester(), "browser", "Invalid requester credentials"),
        (
            Requester(requester_secret=SECRET),
            "browser",
            "Browser credentials must use the requester cookie",
        ),
        (
            Requester(requester_secret=SECRET, browser_secret=SECRET),
            "browser",
            "Browser credentials must use the requester cookie",
        ),
        (Requester(browser_secret="x" * 43), "browser", "Invalid requester credentials"),
        (
            Requester(browser_secret=SECRET, browser_authenticated=True),
            "browser",
            "This browser is already signed in.",
        ),
        (Requester(browser_secret=SECRET), "device", "Invalid requester credentials"),
    ],
)
def test_requester_secrets_cannot_cross_channels(
    requester: Requester, kind: str, message: str
) -> None:
    with pytest.raises(QrAuthError, match=message):
        _verify_requester(challenge(kind), requester)
    _verify_requester(challenge("browser"), Requester(browser_secret=SECRET))
    _verify_requester(challenge("device"), Requester(requester_secret=SECRET))


@pytest.mark.parametrize(
    "status,expected",
    [
        ("pending", "expired"),
        ("approved", "expired"),
        ("denied", "denied"),
        ("consumed", "consumed"),
    ],
)
def test_expiry_preserves_terminal_retry_results(status: str, expected: str) -> None:
    row = replace(challenge(status=status), expires_at=datetime(2020, 1, 1, tzinfo=UTC))
    assert _info(CODE, row) == {
        "code": CODE,
        "kind": "browser",
        "status": expected,
        "expiresAt": "2020-01-01T00:00:00.000Z",
    }
