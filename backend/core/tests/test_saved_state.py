"""Component authority/lifetime tests, plus opt-in leased PostgreSQL callbacks."""

import asyncio
import json
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import uuid4

import pytest
from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict

from spellbook_core import saved_state as module
from spellbook_core.auth import SessionAuth, create_session_auth, hash_session_token
from spellbook_core.db import ConnectionPool, Transaction
from spellbook_core.errors import ActorError
from spellbook_core.models import Actor, SessionInfo
from spellbook_core.saved_state import (
    Cancellation,
    ListenerFailure,
    SavedState,
    SavedStateEvent,
    SavedStateUnavailable,
    Subscription,
    create_saved_state,
)


class Authority(SessionAuth):
    """A controlled substitute. These tests do not establish native SessionAuth."""

    def __init__(self) -> None:
        self.calls = 0
        self.revoked: set[str] = set()
        self.failure = False
        self.hook: Callable[[Actor], Awaitable[None]] | None = None
        self.expires = datetime.now(UTC) + timedelta(hours=1)

    async def actor_session(self, actor: Actor) -> SessionInfo:
        self.calls += 1
        if self.hook:
            await self.hook(actor)
        if actor.account_id in self.revoked:
            raise ActorError()
        if self.failure:
            raise OSError("private database failure")
        return SessionInfo(actor, self.expires.isoformat())


def actor(account: str = "one") -> Actor:
    return Actor(account, account, "", "", "")


async def until(predicate: Callable[[], bool]) -> None:
    async with asyncio.timeout(1):
        while not predicate():
            await asyncio.sleep(0)


@asynccontextmanager
async def runtime(
    *, ready: bool = True
) -> AsyncIterator[tuple[SavedState, Authority, list[tuple[int, ListenerFailure]]]]:
    auth = Authority()
    recoveries: list[tuple[int, ListenerFailure]] = []
    sync = create_saved_state(
        auth,
        ensure_listener=lambda: None,
        request_listener_recovery=lambda g, reason: recoveries.append((g, reason)),
    )
    sync.start()
    assert sync.listener_starting(1)
    if ready:
        assert await sync.listener_ready(1)
    try:
        yield sync, auth, recoveries
    finally:
        await sync.close()
        assert sync.diagnostics()["authorityTasks"] == 0
        assert sync.diagnostics()["backgroundTasks"] == 0
        assert sync.diagnostics()["heldSubscriptions"] == 0


async def frame(sub: Subscription) -> dict[str, object] | None:
    event = await sub.next()
    delivered = await sub.deliver(event) if event else None
    return delivered.to_dto() if delivered else None


def notify(sync: SavedState, account: str, topic: str, generation: int = 1) -> None:
    sync.receive_notification(generation, json.dumps({"accountId": account, "topic": topic}))


def test_construction_is_inert() -> None:
    sync = create_saved_state(
        Authority(), ensure_listener=lambda: None, request_listener_recovery=lambda *_: None
    )
    assert sync.diagnostics()["backgroundTasks"] == 0
    assert not sync.diagnostics()["ready"]


def test_notifications_are_coalesced_private_and_public_values_are_strict() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, _, _):
            one, two = await sync.subscribe(actor()), await sync.subscribe(actor("two"))
            assert await frame(one) == {"event": "reset", "data": {}}
            await frame(two)
            for _ in range(100):
                for topic in ("profile", "inventory", "decks", "scan"):
                    notify(sync, "one", topic)
            await until(lambda: sync.diagnostics()["queuedEvents"] == 1)
            assert await frame(one) == {
                "event": "invalidate",
                "data": {"topics": ["profile", "inventory", "decks", "scan"]},
            }
            for payload in (
                "[]",
                "null",
                "{",
                '{"public":true,"topic":"profile"}',
                '{"public":true,"topic":"values","extra":1}',
                '{"public":1,"topic":"values"}',
                '{"accountId":"one","public":null,"topic":"profile"}',
                '{"accountId":"one","topic":[]}',
            ):
                sync.receive_notification(1, payload)
            await asyncio.sleep(0)
            assert sync.diagnostics()["queuedEvents"] == 0
            sync.receive_notification(1, '{"public":true,"topic":"values"}')
            await until(lambda: sync.diagnostics()["queuedEvents"] == 2)
            assert await frame(one) == {"event": "invalidate", "data": {"topics": ["values"]}}
            assert await frame(two) == {"event": "invalidate", "data": {"topics": ["values"]}}

    asyncio.run(scenario())


def test_auth_control_and_final_revocation_only_expire_affected_subscription() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, recovery):
            one, two = await sync.subscribe(actor()), await sync.subscribe(actor("two"))
            event = await one.next()
            assert event
            auth.revoked.add("one")
            delivery = await one.deliver(event)
            assert delivery and delivery.event == "auth-expired"
            assert await one.next() is None
            assert not recovery
            assert sync.diagnostics()["ready"]
            assert (await frame(two)) == {"event": "reset", "data": {}}
            notify(sync, "two", "auth")
            await asyncio.sleep(0.01)
            assert sync.diagnostics()["queuedEvents"] == 0
            auth.revoked.add("two")
            notify(sync, "two", "auth")
            await until(lambda: sync.diagnostics()["subscribers"] == 0)
            assert await frame(two) == {"event": "auth-expired", "data": {}}

    asyncio.run(scenario())


def test_reservations_reject_forgery_reuse_and_other_subscriptions() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            one, two = await sync.subscribe(actor()), await sync.subscribe(actor())
            event = await one.next()
            assert event
            calls = auth.calls
            assert await two.deliver(event) is None
            assert await one.deliver(SavedStateEvent("reset")) is None
            assert await one.deliver(SavedStateEvent("auth-expired")) is None
            assert auth.calls == calls
            assert await one.deliver(event) is event
            assert auth.calls == calls + 1
            assert await one.deliver(event) is None

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "operation", ["immediate", "periodic", "fanout", "reservation", "delivery"]
)
def test_infrastructure_failure_fences_before_recovery(
    operation: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, recovery):
            fenced: list[bool] = []
            original = sync._request_recovery

            def signal(generation: int, reason: ListenerFailure) -> None:
                fenced.append(not sync.diagnostics()["ready"])
                assert not sync.listener_lost(generation, reason)
                original(generation, reason)

            sync._request_recovery = signal
            if operation == "periodic":
                monkeypatch.setattr(module, "SAVED_STATE_REVALIDATE_SECONDS", 0.01)
            sub = await sync.subscribe(actor())
            reserved = await sub.next()
            assert reserved
            if operation != "delivery":
                await sub.deliver(reserved)
            if operation == "reservation":
                notify(sync, "one", "inventory")
                await until(lambda: sync.diagnostics()["queuedEvents"] == 1)
            auth.failure = True
            if operation == "immediate":
                with pytest.raises(SavedStateUnavailable):
                    await sync.subscribe(actor("new"))
            elif operation == "periodic":
                await until(lambda: bool(recovery))
            elif operation == "fanout":
                notify(sync, "one", "inventory")
                await until(lambda: bool(recovery))
            elif operation == "reservation":
                event = await sub.next()
                assert event and event.event == "recovering"
            else:
                event = await sub.deliver(reserved)
                assert event and event.event == "recovering"
            assert fenced == [True]
            assert recovery == [(1, "auth_check")]
            assert not await sync.listener_ready(1)
            notify(sync, "one", "profile")
            assert not sync.diagnostics()["ready"]

    asyncio.run(scenario())


def test_barrier_includes_attachment_during_wait_and_rejects_lost_generation() -> None:
    async def scenario() -> None:
        async with runtime(ready=False) as (sync, auth, _):
            first = asyncio.create_task(sync.subscribe(actor()))
            await until(lambda: sync.diagnostics()["subscribers"] == 1)
            gate, entered = asyncio.Event(), asyncio.Event()

            async def hold(who: Actor) -> None:
                if who.account_id == "one":
                    entered.set()
                    await gate.wait()

            auth.hook = hold
            barrier = asyncio.create_task(sync.listener_ready(1))
            await entered.wait()
            second = asyncio.create_task(sync.subscribe(actor("two")))
            await until(lambda: sync.diagnostics()["subscribers"] == 2)
            notify(sync, "two", "inventory")
            auth.revoked.add("two")
            gate.set()
            assert await barrier
            one = await first
            with pytest.raises(ActorError):
                await second
            assert await frame(one) == {"event": "reset", "data": {}}
            assert sync.listener_lost(1, "consumer")
            assert not sync.listener_starting(1)
            assert not await sync.listener_ready(1)
            assert sync.listener_starting(2)
            assert await sync.listener_ready(2)
            assert not sync.listener_lost(1, "consumer")
            notify(sync, "one", "profile", 1)
            assert await frame(one) == {"event": "reset", "data": {}}

    asyncio.run(scenario())


def test_loss_during_final_authority_and_barrier_never_authorizes_stale_completion() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            sub = await sync.subscribe(actor())
            event = await sub.next()
            assert event
            gate, entered = asyncio.Event(), asyncio.Event()

            async def hold(_: Actor) -> None:
                entered.set()
                await gate.wait()

            auth.hook = hold
            delivery = asyncio.create_task(sub.deliver(event))
            await entered.wait()
            assert sync.listener_lost(1, "consumer")
            assert sync.listener_starting(2)
            gate.set()
            delivered = await delivery
            assert delivered and delivered.event == "recovering"
            gate.clear()
            entered.clear()
            barrier = asyncio.create_task(sync.listener_ready(2))
            await entered.wait()
            assert sync.listener_lost(2, "consumer")
            gate.set()
            assert not await barrier
            assert not sync.diagnostics()["ready"]

    asyncio.run(scenario())


def test_cancel_before_and_after_ready_and_no_late_attachment() -> None:
    async def scenario() -> None:
        async with runtime(ready=False) as (sync, _, _):
            cancellation = Cancellation()
            setup = asyncio.create_task(sync.subscribe(actor(), cancellation))
            await until(lambda: sync.diagnostics()["subscribers"] == 1)
            cancellation.abort()
            with pytest.raises(SavedStateUnavailable):
                await setup
            assert await sync.listener_ready(1)
            with pytest.raises(SavedStateUnavailable):
                await sync.subscribe(actor(), cancellation)
            live = Cancellation()
            sub = await sync.subscribe(actor(), live)
            live.abort()
            assert await sub.next() is None
            assert sync.diagnostics()["subscribers"] == 0

    asyncio.run(scenario())


def test_cancelled_query_holds_admission_until_actual_settlement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(module, "SAVED_STATE_MAX_SUBSCRIBERS", 1)

    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            entered, release = asyncio.Event(), asyncio.Event()

            async def resistant(_: Actor) -> None:
                entered.set()
                while not release.is_set():
                    with suppress(asyncio.CancelledError):
                        await release.wait()

            auth.hook = resistant
            setup = asyncio.create_task(sync.subscribe(actor()))
            await entered.wait()
            setup.cancel()
            with pytest.raises(asyncio.CancelledError):
                await setup
            assert sync.diagnostics()["authorityTasks"] == 1
            assert sync.diagnostics()["heldSubscriptions"] == 1
            with pytest.raises(SavedStateUnavailable):
                await sync.subscribe(actor("two"))
            closing = asyncio.create_task(sync.close())
            await asyncio.sleep(0)
            assert not closing.done()
            release.set()
            await closing

    asyncio.run(scenario())


def test_timed_out_coalesced_query_is_not_replaced_and_barrier_awaits_settlement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            sub = await sync.subscribe(actor())
            await frame(sub)
            sync.listener_lost(1, "consumer")
            sync.listener_starting(2)
            entered, release = asyncio.Event(), asyncio.Event()

            async def resistant(_: Actor) -> None:
                entered.set()
                while not release.is_set():
                    with suppress(asyncio.CancelledError):
                        await release.wait()

            auth.hook = resistant
            monkeypatch.setattr(module, "SAVED_STATE_SETUP_SECONDS", 0.02)
            barrier = asyncio.create_task(sync.listener_ready(2))
            await entered.wait()
            await asyncio.sleep(0.04)
            assert not sync.diagnostics()["ready"]
            assert not barrier.done()
            calls = auth.calls
            assert sync.listener_starting(3)
            # The underlying reservation remains the same across logical timeouts.
            validation = asyncio.create_task(sync._validate(sub))
            await asyncio.sleep(0.04)
            assert auth.calls == calls
            assert not await validation
            release.set()
            assert not await barrier

    asyncio.run(scenario())


def test_expiry_slow_queue_and_subscriber_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            subscribers = [await sync.subscribe(actor(str(i))) for i in range(32)]
            with pytest.raises(SavedStateUnavailable):
                await sync.subscribe(actor("extra"))
            for sub in subscribers:
                sub.close()
            await until(lambda: sync.diagnostics()["heldSubscriptions"] == 0)
            monkeypatch.setattr(module, "SAVED_STATE_SLOW_SECONDS", 0.02)
            slow = await sync.subscribe(actor())
            await until(lambda: sync.diagnostics()["subscribers"] == 0)
            assert await slow.next() is None
            auth.expires = datetime.now(UTC) + timedelta(seconds=0.02)
            expiring = await sync.subscribe(actor())
            await frame(expiring)
            await until(lambda: sync.diagnostics()["subscribers"] == 0)
            assert await frame(expiring) == {"event": "auth-expired", "data": {}}

    asyncio.run(scenario())


class NativePool(ConnectionPool, Protocol):
    async def open(self) -> None: ...
    async def close(self) -> None: ...


@asynccontextmanager
async def native() -> AsyncIterator[tuple[SavedState, NativePool, Transaction, Actor, str]]:
    """Test-only listener/consumer. This is not production lifetime evidence."""
    target = os.environ["P02B_SAVED_STATE_NATIVE_DATABASE"]
    assert target == "sb_py_0e56d611_api_python"
    dsn = os.environ["TEST_DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target
    pool_factory = cast(
        Callable[..., NativePool], pytest.importorskip("psycopg_pool").AsyncConnectionPool
    )
    pool = pool_factory(
        dsn,
        open=False,
        min_size=0,
        max_size=4,
        timeout=2,
        max_waiting=32,
        kwargs={"application_name": "p02b_saved_state_authority"},
    )
    await pool.open()
    account, token = f"p02b_saved_{uuid4().hex}", uuid4().hex + uuid4().hex[:11]
    fixture = await AsyncConnection[tuple[object, ...]].connect(dsn, autocommit=True)
    listener = await AsyncConnection[tuple[object, ...]].connect(dsn, autocommit=True)
    auth = create_session_auth(pool)
    sync = create_saved_state(
        auth, ensure_listener=lambda: None, request_listener_recovery=lambda *_: None
    )
    sync.start()
    consumer: asyncio.Task[None] | None = None
    try:
        await fixture.execute(
            "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)", (account, account)
        )
        await fixture.execute(
            "INSERT INTO auth_sessions(token_hash,account_id,expires_at) "
            "VALUES(%s,%s,now()+interval '1 hour')",
            (hash_session_token(token), account),
        )
        identity = await auth.validate_session(token)
        assert identity
        await listener.execute("LISTEN spellbook_saved_state")
        assert sync.listener_starting(1)

        async def consume() -> None:
            async for message in listener.notifies():
                sync.receive_notification(1, message.payload)

        consumer = asyncio.create_task(consume())
        assert await sync.listener_ready(1)
        yield sync, pool, fixture, identity, token
    finally:
        if consumer:
            consumer.cancel()
            await asyncio.gather(consumer, return_exceptions=True)
        await sync.close()
        await listener.close()
        await fixture.execute("ROLLBACK")
        await fixture.execute("DELETE FROM user_profiles WHERE account_id=%s", (account,))
        await fixture.close()
        await pool.close()


@pytest.mark.skipif(
    not os.environ.get("P02B_SAVED_STATE_NATIVE_DATABASE"),
    reason="Requires root-allocated serial api_python lease",
)
def test_native_commit_rollback_triggers_and_final_revocation() -> None:
    async def scenario() -> None:
        async with native() as (sync, _, fixture, identity, token):
            sub = await sync.subscribe(identity)
            assert await frame(sub) == {"event": "reset", "data": {}}
            await fixture.execute("BEGIN")
            await fixture.execute(
                "UPDATE user_profiles SET email='rollback@example.test' WHERE account_id=%s",
                (identity.account_id,),
            )
            await fixture.execute("ROLLBACK")
            await asyncio.sleep(0.05)
            assert sync.diagnostics()["queuedEvents"] == 0
            await fixture.execute(
                "UPDATE user_profiles SET email='commit@example.test' WHERE account_id=%s",
                (identity.account_id,),
            )
            await until(lambda: sync.diagnostics()["queuedEvents"] == 1)
            reserved = await sub.next()
            assert reserved and reserved.event == "invalidate"
            await fixture.execute(
                "DELETE FROM auth_sessions WHERE token_hash=%s", (hash_session_token(token),)
            )
            delivery = await sub.deliver(reserved)
            assert delivery and delivery.event == "auth-expired"
            assert await sub.next() is None

    asyncio.run(scenario())


def test_replacement_reset_is_freshly_authorized_after_a_reserved_old_generation() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            sub = await sync.subscribe(actor())
            old = await sub.next()
            assert old
            sync.listener_lost(1, "consumer")
            sync.listener_starting(2)
            assert await sync.listener_ready(2)
            calls = auth.calls
            delivery = await sub.deliver(old)
            assert delivery and delivery.event == "reset" and delivery is not old
            assert auth.calls >= calls + 2
            assert await sub.deliver(old) is None

    asyncio.run(scenario())


def test_barrier_cancellation_waits_for_its_cancelled_authority_child() -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            sub = await sync.subscribe(actor())
            await frame(sub)
            sync.listener_lost(1, "consumer")
            sync.listener_starting(2)
            entered, release = asyncio.Event(), asyncio.Event()

            async def resistant(_: Actor) -> None:
                entered.set()
                while not release.is_set():
                    with suppress(asyncio.CancelledError):
                        await release.wait()

            auth.hook = resistant
            barrier = asyncio.create_task(sync.listener_ready(2))
            await entered.wait()
            barrier.cancel()
            await asyncio.sleep(0)
            assert not barrier.done()
            assert sync.diagnostics()["authorityTasks"] == 1
            assert not sync.diagnostics()["ready"]
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await barrier
            assert sync.diagnostics()["authorityTasks"] == 0

    asyncio.run(scenario())


async def native_blocked(fixture: Transaction) -> None:
    async with asyncio.timeout(2):
        while True:
            row = await (
                await fixture.execute(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE application_name='p02b_saved_state_authority' "
                    "AND wait_event_type='Lock'"
                )
            ).fetchone()
            if row and row[0] == 1:
                return
            await asyncio.sleep(0.01)


@pytest.mark.skipif(
    not os.environ.get("P02B_SAVED_STATE_NATIVE_DATABASE"),
    reason="Requires root-allocated serial api_python lease",
)
def test_native_barrier_loss_stale_generation_and_cancellation_settlement() -> None:
    async def scenario() -> None:
        async with native() as (sync, _, fixture, identity, _):
            sub = await sync.subscribe(identity)
            await frame(sub)
            assert sync.listener_lost(1, "consumer")
            assert await frame(sub) == {"event": "recovering", "data": {}}
            assert sync.listener_starting(2)
            cancellation = Cancellation()
            setup = asyncio.create_task(sync.subscribe(identity, cancellation))
            await until(lambda: sync.diagnostics()["subscribers"] == 2)
            cancellation.abort()
            with pytest.raises(SavedStateUnavailable):
                await setup
            await fixture.execute("BEGIN")
            await fixture.execute("LOCK TABLE auth_sessions IN ACCESS EXCLUSIVE MODE")
            barrier = asyncio.create_task(sync.listener_ready(2))
            try:
                await native_blocked(fixture)
                assert sync.listener_lost(2, "consumer")
            finally:
                await fixture.execute("ROLLBACK")
            assert not await barrier
            assert sync.diagnostics()["authorityTasks"] == 0
            assert sync.listener_starting(3)
            assert await sync.listener_ready(3)
            assert not await sync.listener_ready(2)
            notify(sync, identity.account_id, "profile", generation=2)
            assert await frame(sub) == {"event": "reset", "data": {}}
            cancellation = Cancellation()
            second = await sync.subscribe(identity, cancellation)
            cancellation.abort()
            assert await second.next() is None
            notify(sync, identity.account_id, "profile", generation=3)
            await until(lambda: sync.diagnostics()["queuedEvents"] == 1)
            reserved = await sub.next()
            assert reserved
            await fixture.execute("BEGIN")
            await fixture.execute("LOCK TABLE auth_sessions IN ACCESS EXCLUSIVE MODE")
            delivery = asyncio.create_task(sub.deliver(reserved))
            try:
                await native_blocked(fixture)
                reads = tuple(sync._queries)
                assert len(reads) == 1
                delivery.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await delivery
                await asyncio.gather(*reads, return_exceptions=True)
                assert all(task.done() for task in reads)
                assert sync.diagnostics()["authorityTasks"] == 0
            finally:
                await fixture.execute("ROLLBACK")
            await sync.close()
            assert sync.diagnostics()["backgroundTasks"] == 0
            assert sync.diagnostics()["authorityTasks"] == 0

    asyncio.run(scenario())


@pytest.mark.skipif(
    not os.environ.get("P02B_SAVED_STATE_NATIVE_DATABASE"),
    reason="Requires root-allocated serial api_python lease",
)
def test_native_closed_pool_authority_failure_fences_before_recovery_signal() -> None:
    async def scenario() -> None:
        async with native() as (sync, pool, _, identity, _):
            sub = await sync.subscribe(identity)
            reserved = await sub.next()
            assert reserved
            signalled: list[tuple[int, ListenerFailure]] = []

            def recovery(generation: int, reason: ListenerFailure) -> None:
                assert not sync.diagnostics()["ready"]
                assert not sync.listener_lost(generation, reason)
                signalled.append((generation, reason))

            sync._request_recovery = recovery
            await pool.close()
            delivered = await sub.deliver(reserved)
            assert delivered and delivered.event == "recovering"
            assert signalled == [(1, "auth_check")]
            assert not await sync.listener_ready(1)

    asyncio.run(scenario())


def test_new_generation_waits_for_old_snapshot_then_reads_fresh_authority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        async with runtime() as (sync, auth, _):
            sub = await sync.subscribe(actor())
            await frame(sub)
            captured, release = asyncio.Event(), asyncio.Event()
            original = auth.actor_session

            async def old_snapshot(identity: Actor) -> SessionInfo:
                session = await original(identity)
                captured.set()
                await release.wait()
                return session

            monkeypatch.setattr(auth, "actor_session", old_snapshot)
            notify(sync, "one", "inventory")
            await captured.wait()
            assert sync.diagnostics()["authorityTasks"] == 1
            assert sync.listener_lost(1, "consumer")
            auth.revoked.add("one")
            assert sync.listener_starting(2)
            barrier = asyncio.create_task(sync.listener_ready(2))
            calls = auth.calls
            for _ in range(5):
                await asyncio.sleep(0)
            assert not sync.diagnostics()["ready"]
            assert not barrier.done()
            assert auth.calls == calls
            release.set()
            assert await barrier
            assert auth.calls == calls + 1
            assert sync.diagnostics()["subscribers"] == 0
            assert await frame(sub) == {"event": "auth-expired", "data": {}}
            assert sync.diagnostics()["queuedEvents"] == 0

    asyncio.run(scenario())
