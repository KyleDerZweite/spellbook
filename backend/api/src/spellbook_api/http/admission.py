"""Finite host admission, independently of request-pool acquisition."""

import asyncio
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from spellbook_api.http.errors import HttpError

REQUEST_ACTIVE = 32
REQUEST_WAITING = 32
REQUEST_WAIT_SECONDS = 2.0


class RequestAdmission:
    def __init__(self) -> None:
        self.active = 0
        self._waiting: deque[asyncio.Future[None]] = deque()
        self._closed = False
        self._tasks: set[asyncio.Task[object]] = set()

    @property
    def waiting(self) -> int:
        return len(self._waiting)

    def close_admission(self) -> None:
        self._closed = True
        while self._waiting:
            waiter = self._waiting.popleft()
            if not waiter.done():
                waiter.set_exception(HttpError(503, "Service Unavailable"))

    async def _acquire(self) -> None:
        if self._closed:
            raise HttpError(503, "Service Unavailable")
        if self.active < REQUEST_ACTIVE:
            self.active += 1
            return
        if len(self._waiting) >= REQUEST_WAITING:
            raise HttpError(503, "Service Unavailable")
        waiter: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        self._waiting.append(waiter)
        try:
            async with asyncio.timeout(REQUEST_WAIT_SECONDS):
                await asyncio.shield(waiter)
        except BaseException as cause:
            if waiter.done() and not waiter.cancelled() and waiter.exception() is None:
                # A slot was handed over in the same turn as timeout/cancellation.
                self._release()
            else:
                if waiter in self._waiting:
                    self._waiting.remove(waiter)
                waiter.cancel()
            if isinstance(cause, TimeoutError):
                raise HttpError(503, "Service Unavailable") from None
            raise

    def _release(self) -> None:
        while self._waiting:
            waiter = self._waiting.popleft()
            if not waiter.done():
                waiter.set_result(None)
                return
        self.active -= 1

    async def settle(self) -> None:
        """After host drain, retain ownership through request cancellation/rollback."""
        tasks = tuple(self._tasks)
        for task in tasks:
            if not task.done() and not task.cancelling():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    @asynccontextmanager
    async def request(self) -> AsyncIterator[None]:
        await self._acquire()
        task = asyncio.current_task()
        assert task is not None
        self._tasks.add(task)
        try:
            yield
        finally:
            self._tasks.discard(task)
            self._release()
