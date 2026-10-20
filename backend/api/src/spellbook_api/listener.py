"""One physical LISTEN generation, with supervisor-owned recovery settlement."""

import asyncio
import os
from contextlib import suppress

from psycopg import AsyncConnection
from spellbook_core.saved_state import SAVED_STATE_CHANNEL, ListenerFailure, SavedState

LISTENER_RETRY_SECONDS = 0.5


class SavedStateListener:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._saved_state: SavedState | None = None
        self._generation = 0
        self._wanted = asyncio.Event()
        self._recovery = asyncio.Event()
        self._stopped = asyncio.Event()
        self._supervisor: asyncio.Task[None] | None = None
        self._connection: AsyncConnection[tuple[object, ...]] | None = None
        self._consumer: asyncio.Task[None] | None = None
        self._barrier: asyncio.Task[bool] | None = None
        self._closing = False
        self._blocked = False

    @property
    def generation(self) -> int:
        return self._generation

    @property
    def blocked(self) -> bool:
        return self._blocked

    def start(self, saved_state: SavedState) -> None:
        if self._closing or self._supervisor is not None:
            return
        self._saved_state = saved_state
        self._supervisor = asyncio.create_task(self._run(), name="saved-state-listener")

    def ensure_listener(self) -> None:
        if not self._closing:
            self._wanted.set()

    def request_recovery(self, generation: int, reason: ListenerFailure) -> None:
        if not self._closing and generation == self._generation:
            self._recovery.set()

    async def _connect(self) -> AsyncConnection[tuple[object, ...]]:
        return await AsyncConnection.connect(
            self._database_url,
            autocommit=True,
            connect_timeout=5,
            application_name=f"spellbook-python-listener:{os.getpid()}",
        )

    async def _consume(self, generation: int) -> None:
        assert self._connection is not None and self._saved_state is not None
        async for notification in self._connection.notifies():
            self._saved_state.receive_notification(generation, notification.payload)
        raise RuntimeError("Saved state notification consumer ended")

    async def _settle_generation(self) -> None:
        for task in (self._barrier, self._consumer):
            if task is not None and not task.done():
                task.cancel()
        tasks = [task for task in (self._barrier, self._consumer) if task is not None]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._barrier = self._consumer = None
        if self._connection is not None:
            # No replacement is allowed unless this await proves physical closure.
            await self._connection.close()
            if not self._connection.closed:
                raise RuntimeError("Listener closure could not be established")
            self._connection = None

    async def _attempt(self) -> None:
        assert self._saved_state is not None
        saved = self._saved_state
        self._generation += 1
        generation = self._generation
        self._recovery.clear()
        if not saved.listener_starting(generation):
            return
        reason: ListenerFailure = "connect"
        recovery = asyncio.create_task(self._recovery.wait(), name="listener-recovery-signal")
        stopping = asyncio.create_task(self._stopped.wait(), name="listener-stop-signal")
        try:
            async with asyncio.timeout(5):
                self._connection = await self._connect()
                await self._connection.execute(f"LISTEN {SAVED_STATE_CHANNEL}")
            self._consumer = asyncio.create_task(
                self._consume(generation), name="listener-consumer"
            )
            self._barrier = asyncio.create_task(
                saved.listener_ready(generation), name="listener-barrier"
            )
            reason = "barrier"
            done, _ = await asyncio.wait(
                {self._consumer, self._barrier, recovery, stopping},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if self._barrier in done and self._barrier.result():
                reason = "consumer"
                await asyncio.wait(
                    {self._consumer, recovery, stopping}, return_when=asyncio.FIRST_COMPLETED
                )
        except asyncio.CancelledError:
            reason = "shutdown" if self._closing else reason
            raise
        except Exception:
            # No connection string, SQL text or driver exception enters a public diagnostic.
            pass
        finally:
            saved.listener_lost(generation, "shutdown" if self._closing else reason)
            for task in (recovery, stopping):
                task.cancel()
            await asyncio.gather(recovery, stopping, return_exceptions=True)
            await self._settle_generation()

    async def _run(self) -> None:
        await self._wanted.wait()
        while not self._closing:
            try:
                await self._attempt()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Keep the possibly live connection owned. Retry only during explicit close.
                self._blocked = True
                await self._stopped.wait()
                return
            if not self._closing:
                # Only shutdown, never ensure/recovery, can bypass the retry interval.
                with suppress(TimeoutError):
                    await asyncio.wait_for(self._stopped.wait(), LISTENER_RETRY_SECONDS)

    async def close(self) -> None:
        self._closing = True
        self._wanted.set()
        self._stopped.set()
        if self._supervisor is not None:
            await asyncio.gather(self._supervisor, return_exceptions=True)
        await self._settle_generation()
