"""Opt-in real Auth/Profile/QR transactions on the existing guarded disposable pool."""

import asyncio
import json
import os
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import NamedTuple
from uuid import uuid4

import pytest
from psycopg import AsyncConnection
from test_postgres import native_pool

from spellbook_core.auth import (
    Authenticated,
    LocalAuth,
    TokenSession,
    create_local_auth,
    hash_session_token,
)
from spellbook_core.db import ConnectionPool, Transaction, iso_timestamp, transaction
from spellbook_core.devices import DeviceSessionError
from spellbook_core.errors import ActorError, ProfileError
from spellbook_core.models import Actor
from spellbook_core.passwords import create_password_verifier
from spellbook_core.profile import create_profile
from spellbook_core.qr import QrAuthError, Redemption, Requester

pytestmark = pytest.mark.skipif(
    not os.environ.get("P02B_CORE_NATIVE_DATABASE"), reason="Requires exclusive native PG lease"
)
PASSWORD = "functional-original-password"


class Fixture(NamedTuple):
    pool: ConnectionPool
    auth: LocalAuth
    first: Authenticated
    second: Authenticated
    codes: list[str]


@asynccontextmanager
async def fixture() -> AsyncIterator[Fixture]:
    async with native_pool() as pool:
        with ThreadPoolExecutor(max_workers=4) as executor:
            verifier = create_password_verifier(executor)
            auth = create_local_auth(pool, verifier)
            accounts: list[str] = []
            codes: list[str] = []
            try:
                first = await auth.authenticate("register", "one_" + uuid4().hex[:16], PASSWORD)
                assert first
                accounts.append(first.user.account_id)
                second = await auth.authenticate("register", "two_" + uuid4().hex[:16], PASSWORD)
                assert second
                accounts.append(second.user.account_id)
                yield Fixture(pool, auth, first, second, codes)
            finally:
                verifier.close_admission()
                await verifier.settle()
                async with transaction(pool) as tx:
                    await tx.execute(
                        "DELETE FROM qr_authorizations WHERE code_hash=ANY(%s::text[])",
                        ([hash_session_token(code) for code in codes],),
                    )
                    await tx.execute(
                        "DELETE FROM user_profiles WHERE account_id=ANY(%s::text[])", (accounts,)
                    )


def test_registration_login_password_rotation_and_foreign_actors() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            auth, registered = f.auth, f.first
            name = registered.user.username
            assert await auth.authenticate("register", name.upper(), PASSWORD) is None
            assert await auth.authenticate("login", name, "incorrect password") is None
            login = await auth.authenticate("login", " " + name.upper() + " ", PASSWORD)
            assert login and login.user.account_id == registered.user.account_id
            assert await auth.create_session(registered.user.account_id, "stale hash") is None
            assert await auth.change_password(login.user, "wrong", "new-valid-password") is None
            assert await auth.validate_session(login.session.token)
            results = await asyncio.gather(
                auth.change_password(login.user, PASSWORD, "new-valid-password-one"),
                auth.change_password(registered.user, PASSWORD, "new-valid-password-two"),
                return_exceptions=True,
            )
            winners = [
                value
                for value in results
                if value is not None and not isinstance(value, BaseException)
            ]
            assert len(winners) == 1
            assert await auth.validate_session(login.session.token) is None
            assert await auth.validate_session(registered.session.token) is None
            assert await auth.validate_session(f.second.session.token)
            with pytest.raises(ActorError):
                await auth.require_actor(login.user)
            forged = Actor(f.second.user.account_id, name, "", "wizard", "grove")
            with pytest.raises(ActorError):
                await auth.require_actor(forged)

    asyncio.run(scenario())


def test_profile_disjoint_merges_atomic_invalid_card_and_account_isolation() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            profile = create_profile(f.pool, f.auth)
            await asyncio.gather(
                profile.patch(f.first.user, {"email": "owner@example.test"}),
                profile.patch(f.first.user, {"profileCard": {"name": "Owner"}}),
                profile.patch(f.first.user, {"profileCard": {"rulesText": "{total_decks}"}}),
            )
            result = await profile.get(f.first.user)
            assert result["user"]["email"] == "owner@example.test"
            assert result["card"]["name"] == "Owner"
            assert result["card"]["rulesText"] == "{total_decks}"
            assert result["totals"] == {
                "total": 0,
                "names": 0,
                "printings": 0,
                "sets": 0,
                "foils": 0,
                "decks": 0,
            }
            with pytest.raises(ProfileError):
                await profile.patch(
                    f.first.user, {"artworkId": "tide", "profileCard": {"power": "1"}}
                )
            assert await profile.get(f.first.user) == result
            untouched = await profile.get(f.second.user)
            assert untouched["user"] == f.second.user.to_dto()
            assert untouched["card"]["name"] == f.second.user.username
            assert await profile.patch(f.first.user, {}) == result
            with pytest.raises(ProfileError):
                await profile.patch(f.first.user, {"accountId": f.second.user.account_id})

    asyncio.run(scenario())


async def challenge(f: Fixture, kind: str = "device") -> tuple[str, str]:
    result = await f.auth.qr.create(kind, "fixture")
    code, secret = str(result["code"]), str(result["requesterSecret"])
    f.codes.append(code)
    return code, secret


def test_qr_one_use_replay_decision_conflict_and_approver_revocation() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            qr = f.auth.qr
            code, secret = await challenge(f)
            requester = Requester(requester_secret=secret)
            assert (await qr.redeem(code, requester, "fixture")).status == "pending"
            await qr.decide(f.first.user, code, "approve", "fixture")
            with pytest.raises(QrAuthError, match="already has a decision"):
                await qr.decide(f.second.user, code, "approve", "fixture")
            results = await asyncio.gather(
                qr.redeem(code, requester, "fixture"), qr.redeem(code, requester, "fixture")
            )
            assert sorted(r.status for r in results) == ["authenticated", "consumed"]
            granted = next(r.session for r in results if r.session)
            assert granted
            user = await f.auth.validate_session(granted.token)
            assert user and user.account_id == f.first.user.account_id
            assert (await qr.decide(f.first.user, code, "approve", "fixture"))[
                "status"
            ] == "consumed"
            second_code, second_secret = await challenge(f)
            await qr.decide(f.first.user, second_code, "approve", "fixture")
            await f.auth.revoke_session(f.first.session.token)
            assert (
                await qr.redeem(second_code, Requester(requester_secret=second_secret), "fixture")
            ).status == "expired"

    asyncio.run(scenario())


def test_qr_browser_binding_expiry_and_terminal_denial() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            qr = f.auth.qr
            code, secret = await challenge(f, "browser")
            for requester in (
                Requester(requester_secret=secret),
                Requester(browser_secret="x" * 43),
                Requester(browser_secret=secret, requester_secret=secret),
            ):
                with pytest.raises(QrAuthError):
                    await qr.redeem(code, requester, "fixture")
            with pytest.raises(QrAuthError, match="already signed in"):
                await qr.redeem(
                    code, Requester(browser_secret=secret, browser_authenticated=True), "fixture"
                )
            await qr.decide(f.first.user, code, "deny", "fixture")
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE qr_authorizations SET expires_at=now()-interval '1 second' "
                    "WHERE code_hash=%s",
                    (hash_session_token(code),),
                )
            assert (
                await qr.redeem(code, Requester(browser_secret=secret), "fixture")
            ).status == "denied"
            expired, expired_secret = await challenge(f)
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE qr_authorizations SET expires_at=now()-interval '1 second' "
                    "WHERE code_hash=%s",
                    (hash_session_token(expired),),
                )
            assert (await qr.decide(f.first.user, expired, "approve", "fixture"))[
                "status"
            ] == "expired"
            assert (
                await qr.redeem(expired, Requester(requester_secret=expired_secret), "fixture")
            ).status == "expired"

    asyncio.run(scenario())


def test_registration_rolls_back_profile_and_credentials_when_session_insert_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        async with fixture() as f:
            username = "rollback_" + uuid4().hex[:12]
            original = f.auth._issue

            async def fail_session(
                account: str, expected: str, tx: Transaction
            ) -> TokenSession | None:
                result = await original(account, expected, tx)
                assert result
                raise RuntimeError("fixture failure after session insertion")

            monkeypatch.setattr(f.auth, "_issue", fail_session)
            with pytest.raises(RuntimeError, match="after session insertion"):
                await f.auth.authenticate("register", username, PASSWORD)
            async with transaction(f.pool, read_only=True) as tx:
                for table in ("user_profiles", "local_credentials"):
                    from psycopg import sql

                    row = await (
                        await tx.execute(
                            sql.SQL("SELECT 1 FROM {} WHERE username=%s").format(
                                sql.Identifier(table)
                            ),
                            (username,),
                        )
                    ).fetchone()
                    assert row is None

    asyncio.run(scenario())


def test_qr_redemption_rechecks_approver_expiry_after_session_lock_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        async with fixture() as f:
            code, secret = await challenge(f)
            await f.auth.qr.decide(f.first.user, code, "approve", "fixture")
            reached_session = asyncio.Event()
            original = f.auth.qr._live_session

            async def live(tx: Transaction, digest: str, account: str) -> bool:
                reached_session.set()
                return await original(tx, digest, account)

            monkeypatch.setattr(f.auth.qr, "_live_session", live)
            redeem: asyncio.Task[Redemption] | None = None
            try:
                async with transaction(f.pool) as tx:
                    await tx.execute(
                        "SELECT token_hash FROM auth_sessions WHERE token_hash=%s FOR UPDATE",
                        (hash_session_token(f.first.session.token),),
                    )
                    redeem = asyncio.create_task(
                        f.auth.qr.redeem(code, Requester(requester_secret=secret), "fixture")
                    )
                    await asyncio.wait_for(reached_session.wait(), 1)
                    await tx.execute(
                        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' "
                        "WHERE token_hash=%s",
                        (hash_session_token(f.first.session.token),),
                    )
                assert (await redeem).status == "expired"
            finally:
                if redeem:
                    await asyncio.gather(redeem, return_exceptions=True)

    asyncio.run(scenario())


def test_demo_fences_existing_sessions_and_qr_issuance() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            demo = create_local_auth(f.pool, f.auth.passwords, demo_mode=True)
            assert await f.auth.validate_session(f.first.session.token)
            assert await demo.validate_session(f.first.session.token) is None
            assert await demo.authenticate("register", "new_owner", PASSWORD) is None
            assert await demo.authenticate("login", f.first.user.username, PASSWORD) is None
            async with transaction(f.pool) as tx:
                row = await (
                    await tx.execute(
                        "SELECT password_hash FROM local_credentials WHERE account_id=%s",
                        (f.first.user.account_id,),
                    )
                ).fetchone()
                assert row
                assert await demo.create_session(f.first.user.account_id, str(row[0]), tx) is None
            assert await f.auth.authenticate("login", f.first.user.username, PASSWORD)
            code, secret = await challenge(f)
            await f.auth.qr.decide(f.first.user, code, "approve", "fixture")
            with pytest.raises(QrAuthError):
                await demo.qr.redeem(code, Requester(requester_secret=secret), "fixture")
            from spellbook_core.passwords import hash_password

            async with transaction(f.pool) as tx:
                await tx.execute(
                    "UPDATE user_profiles SET username='demo' WHERE account_id=%s",
                    (f.second.user.account_id,),
                )
                await tx.execute(
                    "UPDATE local_credentials SET username='demo',password_hash=%s "
                    "WHERE account_id=%s",
                    (hash_password("demo"), f.second.user.account_id),
                )
            logged = await demo.authenticate("login", "demo", "demo")
            assert logged and await demo.validate_session(logged.session.token)
            assert await demo.authenticate("login", "demo", PASSWORD) is None
            assert await demo.change_password(logged.user, "demo", PASSWORD) is None

    asyncio.run(scenario())


class Clock:
    def __init__(self, now: datetime):
        self.value = now

    def __call__(self) -> datetime:
        return self.value


async def device_token(f: Fixture) -> str:
    result = await f.auth.qr.create("device", "fixture", " Desk robot ", "cardstation")
    code, secret = str(result["code"]), str(result["requesterSecret"])
    f.codes.append(code)
    inspected = await f.auth.qr.inspect(f.first.user, code, "fixture")
    assert (inspected["deviceName"], inspected["deviceType"]) == ("Desk robot", "cardstation")
    await f.auth.qr.decide(f.first.user, code, "approve", "fixture")
    redeemed = await f.auth.qr.redeem(code, Requester(requester_secret=secret), "fixture")
    assert redeemed.session is not None
    return redeemed.session.token


async def session_row(pool: ConnectionPool, token: str) -> tuple[object, ...] | None:
    async with transaction(pool, read_only=True) as tx:
        cursor = await tx.execute(
            "SELECT device_id,device_name,device_type,created_at,last_seen_at,expires_at "
            "FROM auth_sessions WHERE token_hash=%s",
            (hash_session_token(token),),
        )
        return await cursor.fetchone()


def test_device_redemption_sliding_renewal_and_absolute_cap() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            browser = await session_row(f.pool, f.first.session.token)
            assert browser and browser[0] is None and browser[4] is None
            assert isinstance(browser[3], datetime) and isinstance(browser[5], datetime)
            assert browser[5] - browser[3] >= timedelta(days=29, hours=23)
            token = await device_token(f)
            row = await session_row(f.pool, token)
            assert row and row[0] is not None and row[1:3] == ("Desk robot", "cardstation")
            created = row[3]
            assert isinstance(created, datetime) and row[4] == created
            assert row[5] == created + timedelta(days=90)
            clock = Clock(created + timedelta(hours=23))
            auth = LocalAuth(f.pool, f.auth.passwords, clock=clock)
            info = await auth.inspect_session(token)
            assert info and info.device and info.device.name == "Desk robot"
            assert info.device.id == str(row[0]) and info.device.type == "cardstation"
            assert (await session_row(f.pool, token)) == row  # throttled: no write
            for days in (80, 160, 240, 320):
                clock.value = created + timedelta(days=days)
                info = await auth.inspect_session(token)
                assert info and info.expires_at == iso_timestamp(
                    min(clock.value + timedelta(days=90), created + timedelta(days=365))
                )
                renewed = await session_row(f.pool, token)
                assert renewed and renewed[4] == clock.value
                clock.value += timedelta(hours=12)
                await auth.inspect_session(token)
                assert (await session_row(f.pool, token)) == renewed
            clock.value = created + timedelta(days=364)
            info = await auth.inspect_session(token)
            assert info and info.expires_at == iso_timestamp(created + timedelta(days=365))
            clock.value = created + timedelta(days=365, seconds=1)
            assert await auth.inspect_session(token) is None

    asyncio.run(scenario())


def test_renewal_and_rename_do_not_notify_but_revocation_does() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            token = await device_token(f)
            row = await session_row(f.pool, token)
            assert row and isinstance(row[3], datetime)
            account = f.first.user.account_id
            listener = await AsyncConnection.connect(
                os.environ["TEST_DATABASE_URL"], autocommit=True
            )
            try:
                await listener.execute("LISTEN spellbook_saved_state")

                async def drained() -> list[str]:
                    notes = [
                        note.payload
                        async for note in listener.notifies(timeout=0.5)
                        if account in note.payload
                    ]
                    return notes

                assert await drained() == []
                auth = LocalAuth(f.pool, f.auth.passwords, clock=Clock(row[3] + timedelta(days=2)))
                await auth.inspect_session(token)
                renewed = await session_row(f.pool, token)
                assert renewed and renewed[5] != row[5]
                await f.auth.devices.rename(f.first.user, str(row[0]), "Renamed")
                assert await drained() == []
                await f.auth.devices.revoke(f.first.user, str(row[0]))
                assert [json.loads(note)["topic"] for note in await drained()] == ["auth"]
            finally:
                await listener.close()

    asyncio.run(scenario())


def test_linked_device_list_rename_revoke_and_account_isolation() -> None:
    async def scenario() -> None:
        async with fixture() as f:
            devices = f.auth.devices
            first_token, second_token = await device_token(f), await device_token(f)
            listed = (await devices.list(f.first.user))["devices"]
            assert isinstance(listed, list) and len(listed) == 2
            newest, oldest = listed
            assert newest["createdAt"] >= oldest["createdAt"]
            assert set(newest) == {"id", "name", "type", "createdAt", "lastSeenAt", "expiresAt"}
            assert (await devices.list(f.second.user)) == {"devices": []}
            target = str(oldest["id"])
            for call in (
                devices.rename(f.second.user, target, "Mine"),
                devices.revoke(f.second.user, target),
                devices.rename(f.first.user, str(uuid4()), "Unknown"),
                devices.revoke(f.first.user, "not-a-uuid"),
            ):
                with pytest.raises(DeviceSessionError) as error:
                    await call
                assert error.value.kind == "NotFound"
            with pytest.raises(DeviceSessionError) as invalid:
                await devices.rename(f.first.user, target, "bad\nname")
            assert invalid.value.kind == "ValidationFailed"
            renamed = await devices.rename(f.first.user, target, "  Sorter  ")
            assert renamed["name"] == "Sorter" and renamed["id"] == target
            await devices.revoke(f.first.user, target)
            remaining = (await devices.list(f.first.user))["devices"]
            assert isinstance(remaining, list) and [d["id"] for d in remaining] == [newest["id"]]
            tokens = {first_token, second_token}
            alive = [t for t in tokens if await f.auth.validate_session(t)]
            assert len(alive) == 1
            # Password rotation revokes device sessions with every other session.
            await f.auth.change_password(f.first.user, PASSWORD, "rotated-password-value")
            assert await f.auth.validate_session(alive[0]) is None

    asyncio.run(scenario())
