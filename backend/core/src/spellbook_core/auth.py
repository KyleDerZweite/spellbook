"""Session-bound actors issued only after a fresh PostgreSQL session/profile read."""

import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from weakref import WeakKeyDictionary

from psycopg.rows import class_row

from .db import ConnectionPool, Transaction, iso_timestamp, transaction
from .errors import ActorError
from .models import Actor, SessionInfo
from .validation import js_utf8


@dataclass(frozen=True, slots=True)
class _SessionRow:
    account_id: str
    username: str
    email: str
    avatar_id: str
    artwork_id: str
    expires_at: datetime


def _now() -> datetime:
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(js_utf8(token)).hexdigest()


def valid_session_token(token: object) -> bool:
    return isinstance(token, str) and re.fullmatch(r"[A-Za-z0-9_-]{43}", token) is not None


class SessionAuth:
    def __init__(self, pool: ConnectionPool):
        self._pool = pool
        # Like Node's WeakMap: identity, not DTO fields, establishes the issuer binding.
        # Only a digest is retained, and neither the digest nor token enters Actor/SessionInfo.
        self.__actors: WeakKeyDictionary[Actor, str] = WeakKeyDictionary()

    def _trust(self, row: _SessionRow, digest: str) -> SessionInfo:
        actor = Actor(row.account_id, row.username, row.email, row.avatar_id, row.artwork_id)
        self.__actors[actor] = digest
        return SessionInfo(actor, iso_timestamp(row.expires_at))

    async def _read(self, digest: str, tx: Transaction) -> SessionInfo | None:
        async with tx.cursor(row_factory=class_row(_SessionRow)) as cursor:
            await cursor.execute(
                "SELECT p.account_id, p.username, p.email, p.avatar_id, p.artwork_id, "
                "s.expires_at "
                "FROM auth_sessions s JOIN user_profiles p ON p.account_id=s.account_id "
                "WHERE s.token_hash=%s AND s.expires_at>%s LIMIT 1",
                (digest, _now()),
            )
            row = await cursor.fetchone()
        return self._trust(row, digest) if row else None

    async def _inspect(self, digest: str, tx: Transaction | None = None) -> SessionInfo | None:
        if tx is not None:
            return await self._read(digest, tx)
        async with transaction(self._pool, read_only=True) as connection:
            return await self._read(digest, connection)

    async def inspect_session(self, token: str | None) -> SessionInfo | None:
        if token is None or not valid_session_token(token):
            return None
        return await self._inspect(hash_session_token(token))

    async def validate_session(self, token: str | None) -> Actor | None:
        session = await self.inspect_session(token)
        return session.user if session else None

    def _digest(self, actor: Actor) -> str:
        # Avoid dataclass equality, copied attributes, and foreign issuer authority.
        if not isinstance(actor, Actor) or (digest := self.__actors.get(actor)) is None:
            raise ActorError()
        return digest

    async def actor_session(self, actor: Actor) -> SessionInfo:
        session = await self._inspect(self._digest(actor))
        # Node actorSession checks expiry again after the database read has returned.
        if session is None or datetime.fromisoformat(session.expires_at) <= _now():
            raise ActorError()
        return session

    async def require_actor(self, actor: Actor, tx: Transaction | None = None) -> Actor:
        session = await self._inspect(self._digest(actor), tx)
        if session is None:
            raise ActorError()
        return session.user

    async def require_actor_for_write(self, actor: Actor, tx: Transaction) -> Actor:
        """Owning Profile lock must precede this session fence. Inventory uses require_actor."""
        digest = self._digest(actor)
        cursor = await tx.execute(
            "SELECT expires_at FROM auth_sessions WHERE token_hash=%s FOR SHARE", (digest,)
        )
        row = await cursor.fetchone()
        if not row or not isinstance(row[0], datetime):
            raise ActorError()
        expiry = row[0].replace(microsecond=row[0].microsecond // 1000 * 1000)
        if expiry <= _now():
            raise ActorError()
        return await self.require_actor(actor, tx)


def create_session_auth(pool: ConnectionPool) -> SessionAuth:
    return SessionAuth(pool)
