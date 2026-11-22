"""Device metadata validation, QR device fields and sliding lifetime without a database."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from test_qr import CODE, challenge

from spellbook_core.devices import (
    DeviceMetadata,
    device_expiry,
    device_renewal,
    normalize_device_name,
)
from spellbook_core.qr import QrAuthError, _info, device_metadata

CREATED = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("  Cardstation  ", "Cardstation"),
        ("x" * 64, "x" * 64),
        ("Küche 🃏", "Küche 🃏"),
        ("", None),
        ("   ", None),
        ("x" * 65, None),
        ("🃏" * 33, None),
        ("bad\nname", None),
        ("bad\x00name", None),
        ("evil\u202egnp.exe", None),
        ("zero\u200bwidth", None),
        ("line\u2028sep", None),
        (None, None),
        (42, None),
    ],
)
def test_device_name_normalization(value: object, expected: str | None) -> None:
    assert normalize_device_name(value) == expected


def test_device_metadata_defaults_and_browser_rejection() -> None:
    assert device_metadata("device", None, None) == DeviceMetadata(None, None)
    assert device_metadata("device", " Station ", None) == DeviceMetadata("Station", "other")
    assert device_metadata("device", "Station", "cardstation") == DeviceMetadata(
        "Station", "cardstation"
    )
    assert device_metadata("device", None, "scanner") == DeviceMetadata(None, "scanner")
    assert device_metadata("browser", None, None) == DeviceMetadata(None, None)
    for kind, name, device_type in [
        ("browser", "Station", None),
        ("browser", None, "other"),
        ("device", "", None),
        ("device", "a\tb", None),
        ("device", 5, None),
        ("device", "Station", "robot"),
        ("device", "Station", 1),
    ]:
        with pytest.raises(QrAuthError) as error:
            device_metadata(kind, name, device_type)
        assert error.value.kind == "ValidationFailed"


def test_inspection_returns_device_fields_only_for_device_requests() -> None:
    device = replace(challenge("device"), device_name="Station", device_type="cardstation")
    assert _info(CODE, device)["deviceName"] == "Station"
    assert _info(CODE, device)["deviceType"] == "cardstation"
    assert "deviceName" not in _info(CODE, challenge("browser"))
    assert _info(CODE, challenge("device"))["deviceName"] is None
    created = replace(device, created_at=datetime(2026, 1, 1, tzinfo=UTC))
    assert _info(CODE, created)["createdAt"] == "2026-01-01T00:00:00.000Z"


def test_sliding_renewal_throttle_and_absolute_cap() -> None:
    assert device_expiry(CREATED, CREATED) == CREATED + timedelta(days=90)
    seen = CREATED + timedelta(days=10)
    assert device_renewal(CREATED, seen, seen + timedelta(hours=23, minutes=59)) is None
    later = seen + timedelta(hours=24)
    assert device_renewal(CREATED, seen, later) == later + timedelta(days=90)
    near_cap = CREATED + timedelta(days=300)
    assert device_renewal(CREATED, near_cap - timedelta(days=2), near_cap) == CREATED + timedelta(
        days=365
    )


def test_device_renewal_failure_is_best_effort(caplog: pytest.LogCaptureFixture) -> None:
    import asyncio
    from uuid import uuid4

    from psycopg import OperationalError

    from spellbook_core.auth import SessionAuth, _SessionRow

    now = CREATED + timedelta(days=5)
    auth = SessionAuth(None, clock=lambda: now)  # type: ignore[arg-type]

    async def failing(*_: object) -> bool:
        raise OperationalError("connection lost")

    auth._write_renewal = failing  # type: ignore[assignment]
    row = _SessionRow(
        "account",
        "user",
        "",
        "wizard",
        "grove",
        CREATED + timedelta(days=90),
        CREATED,
        uuid4(),
        "Station",
        "cardstation",
        CREATED,
    )
    with caplog.at_level("WARNING"):
        assert asyncio.run(auth._renew_device("secret-digest", row)) is row
    assert "Device session renewal failed" in caplog.text
    assert "secret-digest" not in caplog.text
