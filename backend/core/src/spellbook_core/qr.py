"""Five-minute one-use QR authorization with live approver-session fencing."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from psycopg.rows import class_row

from .auth import LocalAuth, TokenSession, _now, hash_session_token, valid_session_token
from .auth_attempts import AttemptLimiter
from .db import ConnectionPool, Transaction, iso_timestamp, transaction
from .errors import AuthError
from .models import Actor
from .validation import MISSING, Missing


class QrAuthError(Exception):
    def __init__(
        self,
        kind: Literal[
            "ValidationFailed", "NotFound", "Conflict", "Unauthenticated", "RateLimited"
        ],
        message: str,
    ):
        self.kind = kind
        super().__init__(message)


@dataclass(frozen=True)
class Requester:
    requester_secret: str | Missing = MISSING
    browser_secret: str | None = None
    browser_authenticated: bool = False


@dataclass(frozen=True)
class Redemption:
    kind: str
    status: str
    session: TokenSession | None = None


@dataclass(frozen=True)
class _Challenge:
    code_hash: str
    secret_hash: str
    kind: str
    status: str
    approver_account_id: str | None
    approver_session_hash: str | None
    expires_at: datetime


def _code_hash(code: str) -> str:
    if not valid_session_token(code):
        raise QrAuthError("ValidationFailed", "Invalid QR code")
    return hash_session_token(code)


def _info(code: str, row: _Challenge) -> dict[str, object]:
    return {
        "code": code,
        "kind": row.kind,
        "status": _status(row),
        "expiresAt": iso_timestamp(row.expires_at),
    }


def _status(row: _Challenge) -> str:
    if row.status in {"consumed", "denied"}:
        return row.status
    return "expired" if row.expires_at <= _now() else row.status


def _verify_requester(row: _Challenge, requester: Requester) -> None:
    if row.kind == "browser" and requester.requester_secret is not MISSING:
        raise QrAuthError("ValidationFailed", "Browser credentials must use the requester cookie")
    secret = requester.browser_secret if row.kind == "browser" else requester.requester_secret
    if (
        not isinstance(secret, str)
        or not valid_session_token(secret)
        or hash_session_token(secret) != row.secret_hash
    ):
        raise QrAuthError("Unauthenticated", "Invalid requester credentials")
    if row.kind == "browser" and requester.browser_authenticated:
        raise QrAuthError("Conflict", "This browser is already signed in.")


class QrAuth:
    def __init__(self, pool: ConnectionPool, auth: LocalAuth):
        self._pool = pool
        self._auth = auth
        self._creation = AttemptLimiter(20)
        self._decision = AttemptLimiter(60)
        self._poll = AttemptLimiter(600)

    @staticmethod
    def _attempt(limiter: AttemptLimiter, address: str) -> None:
        try:
            limiter.take(address)
        except AuthError:
            raise QrAuthError("RateLimited", "Too many QR requests. Try again later.") from None

    async def _read(self, code: str, tx: Transaction, *, lock: bool = False) -> _Challenge:
        async with tx.cursor(row_factory=class_row(_Challenge)) as cursor:
            await cursor.execute(
                "SELECT code_hash,secret_hash,kind,status,approver_account_id,"
                "approver_session_hash,expires_at "
                "FROM qr_authorizations WHERE code_hash=%s" + (" FOR UPDATE" if lock else ""),
                (_code_hash(code),),
            )
            row = await cursor.fetchone()
        if row is None:
            raise QrAuthError("NotFound", "QR request not found. Start a new request.")
        return row

    async def _lock_profile(self, tx: Transaction, account_id: str) -> None:
        cursor = await tx.execute(
            "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (account_id,)
        )
        if not await cursor.fetchone():
            raise QrAuthError("Unauthenticated", "Authentication required")

    async def _live_session(self, tx: Transaction, digest: str, account_id: str) -> bool:
        cursor = await tx.execute(
            "SELECT account_id,expires_at FROM auth_sessions WHERE token_hash=%s FOR SHARE",
            (digest,),
        )
        row = await cursor.fetchone()
        return bool(
            row and row[0] == account_id and isinstance(row[1], datetime) and row[1] > _now()
        )

    async def create(self, kind: str, address: str) -> dict[str, object]:
        self._attempt(self._creation, address)
        if kind not in {"browser", "device"}:
            raise QrAuthError("ValidationFailed", "Invalid QR request kind")
        code, secret = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        expires = _now() + timedelta(minutes=5)
        async with transaction(self._pool) as tx:
            await tx.execute(
                "DELETE FROM qr_authorizations WHERE code_hash IN ("
                "SELECT code_hash FROM qr_authorizations "
                "WHERE expires_at < now() - interval '1 day' "
                "ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)"
            )
            await tx.execute(
                "INSERT INTO qr_authorizations(code_hash,secret_hash,kind,expires_at) "
                "VALUES (%s,%s,%s,%s)",
                (hash_session_token(code), hash_session_token(secret), kind, expires),
            )
        return {
            "code": code,
            "kind": kind,
            "requesterSecret": secret,
            "expiresAt": iso_timestamp(expires),
            "interval": 3,
        }

    async def inspect(self, actor: Actor, code: str, address: str) -> dict[str, object]:
        self._attempt(self._poll, address)
        await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True) as tx:
            return _info(code, await self._read(code, tx))

    async def decide(
        self, actor: Actor, code: str, decision: str, address: str
    ) -> dict[str, object]:
        self._attempt(self._decision, address)
        if decision not in {"approve", "deny"}:
            raise QrAuthError("ValidationFailed", "Invalid QR decision")
        user = await self._auth.require_actor(actor)
        digest = self._auth._digest(actor)
        async with transaction(self._pool) as tx:
            await self._lock_profile(tx, user.account_id)
            row = await self._read(code, tx, lock=True)
            if not await self._live_session(tx, digest, user.account_id):
                raise QrAuthError("Unauthenticated", "Authentication required")
            status = "approved" if decision == "approve" else "denied"
            if row.status != "pending":
                if (
                    (
                        row.status != status
                        and not (row.status == "consumed" and status == "approved")
                    )
                    or row.approver_session_hash != digest
                    or row.approver_account_id != user.account_id
                ):
                    raise QrAuthError("Conflict", "This QR request already has a decision.")
                return _info(code, row)
            if row.expires_at <= _now():
                return _info(code, row)
            await tx.execute(
                "UPDATE qr_authorizations SET status=%s,approver_account_id=%s,"
                "approver_session_hash=%s WHERE code_hash=%s",
                (status, user.account_id, digest, row.code_hash),
            )
            return _info(code, await self._read(code, tx))

    async def redeem(self, code: str, requester: Requester, address: str) -> Redemption:
        self._attempt(self._poll, address)
        async with transaction(self._pool, read_only=True) as tx:
            initial = await self._read(code, tx)
        _verify_requester(initial, requester)
        status = _status(initial)
        if status != "approved":
            return Redemption(initial.kind, status)
        assert initial.approver_account_id is not None
        async with transaction(self._pool) as tx:
            await self._lock_profile(tx, initial.approver_account_id)
            row = await self._read(code, tx, lock=True)
            _verify_requester(row, requester)
            current = _status(row)
            if current != "approved":
                return Redemption(row.kind, current)
            assert row.approver_account_id is not None and row.approver_session_hash is not None
            live = await self._live_session(tx, row.approver_session_hash, row.approver_account_id)
            if not live or row.expires_at <= _now():
                await tx.execute(
                    "UPDATE qr_authorizations SET expires_at=%s WHERE code_hash=%s",
                    (_now(), row.code_hash),
                )
                return Redemption(row.kind, "expired")
            cursor = await tx.execute(
                "SELECT password_hash FROM local_credentials WHERE account_id=%s",
                (row.approver_account_id,),
            )
            credential = await cursor.fetchone()
            if not credential:
                raise QrAuthError("Unauthenticated", "Authentication required")
            session = await self._auth.create_session(
                row.approver_account_id, str(credential[0]), tx
            )
            if session is None:
                raise QrAuthError("Unauthenticated", "Authentication required")
            await tx.execute(
                "UPDATE qr_authorizations SET status='consumed' WHERE code_hash=%s",
                (row.code_hash,),
            )
            return Redemption(row.kind, "authenticated", session)
