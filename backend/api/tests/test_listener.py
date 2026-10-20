import asyncio
from collections.abc import AsyncIterator, Callable
from typing import cast

import pytest
from psycopg import AsyncConnection, Notify
from spellbook_core.auth import create_session_auth
from spellbook_core.db import ConnectionPool
from spellbook_core.saved_state import create_saved_state

from spellbook_api.listener import LISTENER_RETRY_SECONDS, SavedStateListener


class Connection:
    def __init__(self) -> None:
        self.closed = False
        self.notifications: asyncio.Queue[Notify | Exception] = asyncio.Queue()
        self.close_started = asyncio.Event()
        self.close_allowed = asyncio.Event()
        self.close_allowed.set()
        self.fail_close = False

    async def execute(self, command: str) -> None:
        assert command == "LISTEN spellbook_saved_state"

    async def close(self) -> None:
        self.close_started.set()
        await self.close_allowed.wait()
        if self.fail_close:
            raise OSError("simulated physical close failure")
        self.closed = True

    async def notifies(self) -> AsyncIterator[Notify]:
        while True:
            message = await self.notifications.get()
            if isinstance(message, Exception):
                raise message
            yield message


async def until(check: Callable[[], bool]) -> None:
    async with asyncio.timeout(3):
        while not check():
            await asyncio.sleep(0.005)


def test_listener_generation_retry_and_physical_connection_settlement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert LISTENER_RETRY_SECONDS == 0.5

    async def exercise() -> None:
        listener = SavedStateListener("unused-private-dsn")
        saved = create_saved_state(
            create_session_auth(cast(ConnectionPool, None)),
            ensure_listener=listener.ensure_listener,
            request_listener_recovery=listener.request_recovery,
        )
        connections: list[Connection] = []
        opened: list[float] = []

        async def connect() -> AsyncConnection[tuple[object, ...]]:
            assert all(previous.closed for previous in connections)
            connection = Connection()
            connections.append(connection)
            opened.append(asyncio.get_running_loop().time())
            return cast(AsyncConnection[tuple[object, ...]], connection)

        monkeypatch.setattr(listener, "_connect", connect)
        saved.start()
        listener.start(saved)
        try:
            await asyncio.sleep(0)
            assert connections == []
            for _ in range(100):
                listener.ensure_listener()
            await until(lambda: saved.diagnostics()["ready"])
            first = listener.generation
            connections[0].close_allowed.clear()
            connections[0].notifications.put_nowait(OSError("consumer failure"))
            await connections[0].close_started.wait()
            assert not saved.diagnostics()["ready"]
            for _ in range(10):
                listener.ensure_listener()
                listener.request_recovery(first, "auth_check")
            await asyncio.sleep(0.03)
            assert len(connections) == 1
            settled = asyncio.get_running_loop().time()
            connections[0].close_allowed.set()
            await until(lambda: len(connections) == 2 and saved.diagnostics()["ready"])
            assert opened[1] - settled >= 0.49
            assert listener.generation > first
            listener.request_recovery(first, "consumer")
            assert saved.listener_ready is not None
            await asyncio.sleep(0.03)
            assert len(connections) == 2
            assert not saved.listener_lost(first, "consumer")
            assert not await saved.listener_ready(first)
        finally:
            await listener.close()
            await saved.close()
        assert all(connection.closed for connection in connections)
        assert saved.diagnostics()["backgroundTasks"] == 0
        assert saved.diagnostics()["authorityTasks"] == 0

    asyncio.run(exercise())


def test_close_failure_blocks_replacement_until_explicit_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        listener = SavedStateListener("unused-private-dsn")
        saved = create_saved_state(
            create_session_auth(cast(ConnectionPool, None)),
            ensure_listener=listener.ensure_listener,
            request_listener_recovery=listener.request_recovery,
        )
        connection = Connection()
        attempts = 0

        async def connect() -> AsyncConnection[tuple[object, ...]]:
            nonlocal attempts
            attempts += 1
            return cast(AsyncConnection[tuple[object, ...]], connection)

        monkeypatch.setattr(listener, "_connect", connect)
        saved.start()
        listener.start(saved)
        listener.ensure_listener()
        try:
            await until(lambda: saved.diagnostics()["ready"])
            connection.fail_close = True
            listener.request_recovery(listener.generation, "auth_check")
            await until(lambda: listener.blocked)
            listener.ensure_listener()
            await asyncio.sleep(0.55)
            assert attempts == 1 and not connection.closed
            assert not saved.diagnostics()["ready"]
        finally:
            connection.fail_close = False
            await listener.close()
            await saved.close()
        assert connection.closed

    asyncio.run(exercise())


def test_recovery_settles_externally_owned_barrier_before_closing_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        listener = SavedStateListener("unused-private-dsn")
        saved = create_saved_state(
            create_session_auth(cast(ConnectionPool, None)),
            ensure_listener=listener.ensure_listener,
            request_listener_recovery=listener.request_recovery,
        )
        connection = Connection()
        barrier_started, barrier_cancelled, physical_done = (
            asyncio.Event(),
            asyncio.Event(),
            asyncio.Event(),
        )

        async def connect() -> AsyncConnection[tuple[object, ...]]:
            return cast(AsyncConnection[tuple[object, ...]], connection)

        async def barrier(generation: int) -> bool:
            barrier_started.set()
            try:
                await asyncio.Future[None]()
            finally:
                barrier_cancelled.set()
                await physical_done.wait()
            return False

        monkeypatch.setattr(listener, "_connect", connect)
        monkeypatch.setattr(saved, "listener_ready", barrier)
        listener.start(saved)
        listener.ensure_listener()
        await barrier_started.wait()
        listener.request_recovery(listener.generation, "auth_check")
        await barrier_cancelled.wait()
        close = asyncio.create_task(listener.close())
        await asyncio.sleep(0.02)
        assert not close.done() and not connection.close_started.is_set()
        physical_done.set()
        await close
        await saved.close()
        assert connection.closed

    asyncio.run(exercise())


def test_connect_failure_keeps_500ms_delay_even_with_repeated_ensure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        listener = SavedStateListener("unused-private-dsn")
        saved = create_saved_state(
            create_session_auth(cast(ConnectionPool, None)),
            ensure_listener=listener.ensure_listener,
            request_listener_recovery=listener.request_recovery,
        )
        attempts: list[float] = []

        async def connect() -> AsyncConnection[tuple[object, ...]]:
            attempts.append(asyncio.get_running_loop().time())
            raise OSError("connect failure")

        monkeypatch.setattr(listener, "_connect", connect)
        listener.start(saved)
        listener.ensure_listener()
        try:
            await until(lambda: len(attempts) == 1)
            for _ in range(100):
                listener.ensure_listener()
                listener.request_recovery(listener.generation, "connect")
            await until(lambda: len(attempts) == 2)
            assert attempts[1] - attempts[0] >= 0.49
        finally:
            await listener.close()
            await saved.close()

    asyncio.run(exercise())
