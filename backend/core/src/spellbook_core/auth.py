"""Session-bound actors issued only after a fresh PostgreSQL session/profile read."""

import hashlib
import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4
from weakref import WeakKeyDictionary

from psycopg.errors import UniqueViolation
from psycopg.rows import class_row

from .auth_attempts import AttemptLimiter
from .db import ConnectionPool, Transaction, iso_timestamp, transaction
from .errors import ActorError
from .models import Actor, SessionInfo
from .passwords import PasswordVerifier
from .validation import js_trim, js_utf8, utf16_length, valid_password

ARTWORK_IDS = ("grove", "tide", "ember", "astral")


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


SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30


@dataclass(frozen=True, slots=True)
class TokenSession:
    token: str
    expires_at: str

    def to_dto(self) -> dict[str, str]:
        return {"token": self.token, "expiresAt": self.expires_at}


@dataclass(frozen=True, slots=True)
class Authenticated:
    user: Actor
    session: TokenSession

    def to_dto(self) -> dict[str, object]:
        return {"user": self.user.to_dto(), **self.session.to_dto()}


class LocalAuth(SessionAuth):
    def __init__(self, pool: ConnectionPool, passwords: PasswordVerifier, demo_mode: bool = False):
        from .qr import QrAuth

        super().__init__(pool)
        self.passwords = passwords
        self.demo_mode = demo_mode
        self._attempts = AttemptLimiter(20)
        self.qr = QrAuth(pool, self)

    def take_auth_attempt(self, address: str) -> None:
        self._attempts.take(address)

    async def _issue(
        self, account_id: str, expected_hash: str, tx: Transaction
    ) -> TokenSession | None:
        profile = await tx.execute(
            "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (account_id,)
        )
        if not await profile.fetchone():
            return None
        current = await tx.execute(
            "SELECT password_hash FROM local_credentials WHERE account_id=%s", (account_id,)
        )
        credential = await current.fetchone()
        if not credential or credential[0] != expected_hash:
            return None
        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(seconds=SESSION_LIFETIME_SECONDS)
        await tx.execute(
            "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES (%s,%s,%s)",
            (hash_session_token(token), account_id, expires),
        )
        return TokenSession(token, iso_timestamp(expires))

    async def create_session(
        self, account_id: str, expected_password_hash: str, tx: Transaction | None = None
    ) -> TokenSession | None:
        if tx is not None:
            return await self._issue(account_id, expected_password_hash, tx)
        async with transaction(self._pool) as connection:
            return await self._issue(account_id, expected_password_hash, connection)

    async def revoke_session(self, token: str | None) -> None:
        if token:
            async with transaction(self._pool) as tx:
                await tx.execute(
                    "DELETE FROM auth_sessions WHERE token_hash=%s", (hash_session_token(token),)
                )

    async def authenticate(
        self,
        mode: Literal["login", "register"],
        username_input: object,
        password: object,
        preferences: Mapping[str, object] | None = None,
    ) -> Authenticated | None:
        artwork = (preferences or {}).get("artworkId", "grove")
        if mode == "register" and artwork not in ARTWORK_IDS:
            return None
        username = normalize_username(username_input)
        if self.demo_mode and (mode != "login" or username != "demo"):
            return None
        if (
            not username
            or not isinstance(password, str)
            or (
                not valid_password(password)
                and not (
                    self.demo_mode
                    and mode == "login"
                    and username == "demo"
                    and password == "demo"
                )
            )
        ):
            return None
        encoded: str | None
        if mode == "register":
            encoded = await self.passwords.hash(password)
            account_id = str(uuid4())
            try:
                async with transaction(self._pool) as tx:
                    await tx.execute(
                        "INSERT INTO user_profiles(account_id,username,artwork_id) "
                        "VALUES (%s,%s,%s)",
                        (account_id, username, artwork),
                    )
                    await tx.execute(
                        "INSERT INTO local_credentials(account_id,username,password_hash) "
                        "VALUES (%s,%s,%s)",
                        (account_id, username, encoded),
                    )
                    session = await self._issue(account_id, encoded, tx)
                    assert session is not None
                    info = await self._read(hash_session_token(session.token), tx)
                    assert info is not None
                    return Authenticated(info.user, session)
            except UniqueViolation:
                return None
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                "SELECT account_id,password_hash FROM local_credentials WHERE username=%s LIMIT 1",
                (username,),
            )
            credential = await cursor.fetchone()
        encoded = str(credential[1]) if credential else None
        if not await self.passwords.verify(password, encoded) or not credential or encoded is None:
            return None
        async with transaction(self._pool) as tx:
            session = await self._issue(str(credential[0]), encoded, tx)
            if session is None:
                return None
            info = await self._read(hash_session_token(session.token), tx)
            return Authenticated(info.user, session) if info else None

    async def change_password(
        self, actor: Actor, current_password: str, new_password: str
    ) -> TokenSession | None:
        user = await self.require_actor(actor)
        if (
            self.demo_mode
            or not current_password
            or utf16_length(current_password) > 128
            or not valid_password(new_password)
        ):
            return None
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                "SELECT password_hash FROM local_credentials WHERE account_id=%s",
                (user.account_id,),
            )
            row = await cursor.fetchone()
        encoded = str(row[0]) if row else None
        if not await self.passwords.verify(current_password, encoded) or encoded is None:
            return None
        replacement = await self.passwords.hash(new_password)
        async with transaction(self._pool) as tx:
            profile = await tx.execute(
                "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                (user.account_id,),
            )
            if not await profile.fetchone():
                return None
            await self.require_actor(actor, tx)
            current = await tx.execute(
                "SELECT password_hash FROM local_credentials WHERE account_id=%s",
                (user.account_id,),
            )
            credential = await current.fetchone()
            if not credential or credential[0] != encoded:
                return None
            await tx.execute(
                "UPDATE local_credentials SET password_hash=%s,updated_at=%s WHERE account_id=%s",
                (replacement, _now(), user.account_id),
            )
            await tx.execute("DELETE FROM auth_sessions WHERE account_id=%s", (user.account_id,))
            session = await self._issue(user.account_id, replacement, tx)
            if session is None:
                raise RuntimeError("Unable to issue the replacement session")
            return session


def normalize_username(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    username = js_trim(value).lower()
    return username if re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,31}", username) else None


def create_local_auth(
    pool: ConnectionPool, passwords: PasswordVerifier, demo_mode: bool = False
) -> LocalAuth:
    return LocalAuth(pool, passwords, demo_mode)
