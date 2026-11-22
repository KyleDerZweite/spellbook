"""Linked device sessions: self-reported metadata, sliding lifetime and owner management."""

import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from psycopg.rows import class_row

from .db import ConnectionPool, iso_timestamp, transaction
from .models import Actor
from .validation import js_trim, utf16_length

if TYPE_CHECKING:
    from .auth import SessionAuth

DEVICE_TYPES = ("cardstation", "scanner", "other")
DEVICE_NAME_MAX_LENGTH = 64
DEVICE_IDLE_LIFETIME = timedelta(days=90)
DEVICE_ABSOLUTE_LIFETIME = timedelta(days=365)
DEVICE_RENEWAL_INTERVAL = timedelta(hours=24)
# Control, format (including bidirectional overrides) and line/paragraph separators.
_FORBIDDEN_CATEGORIES = {"Cc", "Cf", "Zl", "Zp"}


class DeviceSessionError(Exception):
    def __init__(self, kind: Literal["ValidationFailed", "NotFound"], message: str):
        self.kind = kind
        super().__init__(message)


def normalize_device_name(value: object) -> str | None:
    """Trim and accept 1 to 64 UTF-16 units without control or formatting characters."""
    if not isinstance(value, str):
        return None
    name = js_trim(value)
    if not 1 <= utf16_length(name) <= DEVICE_NAME_MAX_LENGTH:
        return None
    if any(unicodedata.category(character) in _FORBIDDEN_CATEGORIES for character in name):
        return None
    return name


def device_expiry(created_at: datetime, now: datetime) -> datetime:
    return min(now + DEVICE_IDLE_LIFETIME, created_at + DEVICE_ABSOLUTE_LIFETIME)


def device_renewal(created_at: datetime, last_seen_at: datetime, now: datetime) -> datetime | None:
    """The renewed expiry, or None while the last renewal is younger than the interval."""
    if now - last_seen_at < DEVICE_RENEWAL_INTERVAL:
        return None
    return device_expiry(created_at, now)


@dataclass(frozen=True, slots=True)
class DeviceMetadata:
    name: str | None
    type: str | None


@dataclass(frozen=True, slots=True)
class _DeviceRow:
    device_id: UUID
    device_name: str | None
    device_type: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime

    def to_dto(self) -> dict[str, object]:
        return {
            "id": str(self.device_id),
            "name": self.device_name,
            "type": self.device_type,
            "createdAt": iso_timestamp(self.created_at),
            "lastSeenAt": iso_timestamp(self.last_seen_at),
            "expiresAt": iso_timestamp(self.expires_at),
        }


_COLUMNS = "device_id,device_name,device_type,created_at,last_seen_at,expires_at"


def _device_id(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise DeviceSessionError("NotFound", "Linked device not found.") from None


class DeviceSessions:
    """Account-owned linked devices. The HTTP adapter rejects device sessions as callers."""

    def __init__(self, pool: ConnectionPool, auth: SessionAuth):
        self._pool = pool
        self._auth = auth

    async def list(self, actor: Actor) -> dict[str, object]:
        user = await self._auth.require_actor(actor)
        async with (
            transaction(self._pool, read_only=True) as tx,
            tx.cursor(row_factory=class_row(_DeviceRow)) as cursor,
        ):
            await cursor.execute(
                f"SELECT {_COLUMNS} FROM auth_sessions "
                "WHERE account_id=%s AND device_id IS NOT NULL AND expires_at>%s "
                "ORDER BY created_at DESC, device_id",
                (user.account_id, self._auth.now()),
            )
            rows = await cursor.fetchall()
        return {"devices": [row.to_dto() for row in rows]}

    async def rename(self, actor: Actor, device_id: str, name_input: object) -> dict[str, object]:
        name = normalize_device_name(name_input)
        if name is None:
            raise DeviceSessionError(
                "ValidationFailed", "Use 1 to 64 characters without control characters."
            )
        target = _device_id(device_id)
        user = await self._auth.require_actor(actor)
        async with (
            transaction(self._pool) as tx,
            tx.cursor(row_factory=class_row(_DeviceRow)) as cursor,
        ):
            await cursor.execute(
                "UPDATE auth_sessions SET device_name=%s "
                "WHERE device_id=%s AND account_id=%s AND expires_at>%s "
                f"RETURNING {_COLUMNS}",
                (name, target, user.account_id, self._auth.now()),
            )
            row = await cursor.fetchone()
        if row is None:
            raise DeviceSessionError("NotFound", "Linked device not found.")
        return row.to_dto()

    async def revoke(self, actor: Actor, device_id: str) -> None:
        target = _device_id(device_id)
        user = await self._auth.require_actor(actor)
        async with transaction(self._pool) as tx:
            cursor = await tx.execute(
                "DELETE FROM auth_sessions WHERE device_id=%s AND account_id=%s",
                (target, user.account_id),
            )
            if cursor.rowcount != 1:
                raise DeviceSessionError("NotFound", "Linked device not found.")
