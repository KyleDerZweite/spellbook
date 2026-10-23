"""Opt-in real Auth/Profile/QR transactions on the existing guarded disposable pool."""

import asyncio
import os
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import NamedTuple
from uuid import uuid4

import pytest
from test_postgres import native_pool

from spellbook_core.auth import (
    Authenticated,
    LocalAuth,
    TokenSession,
    create_local_auth,
    hash_session_token,
)
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.errors import ActorError
from spellbook_core.models import Actor
from spellbook_core.passwords import create_password_verifier
from spellbook_core.profile import ProfileError, create_profile
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
