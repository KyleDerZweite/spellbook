"""Standalone ValueHistory scheduling. HTTP never owns this runner."""

import asyncio
import logging

from spellbook_core.db import ConnectionPool
from spellbook_core.inventory_value import InventoryValues
from spellbook_core.value_history import (
    CAPTURE_INTERVAL_SECONDS,
    CaptureResult,
    capture_value_history,
)

_LOG = logging.getLogger(__name__)


class ValueHistoryRunner:
    def __init__(self, pool: ConnectionPool, values: InventoryValues):
        self.pool, self.values = pool, values
        self._timer: asyncio.Task[None] | None = None
        self._running: asyncio.Task[CaptureResult] | None = None
        self._closed = False

    async def run_once(self) -> CaptureResult:
        if self._closed:
            raise RuntimeError("Value history runner closed")
        if self._running is None or self._running.done():
            self._running = asyncio.create_task(capture_value_history(self.pool, self.values))
        return await asyncio.shield(self._running)

    def start(self) -> None:
        if self._closed or self._timer is not None:
            return

        async def schedule() -> None:
            loop = asyncio.get_running_loop()
            while True:
                started = loop.time()
                try:
                    await self.run_once()
                except Exception:
                    _LOG.warning("Inventory value runner unavailable.")
                # Keep the ten-second cadence for ordinary work without overlapping captures.
                elapsed = loop.time() - started
                await asyncio.sleep(max(0, CAPTURE_INTERVAL_SECONDS - elapsed))

        self._timer = asyncio.create_task(schedule(), name="value-history-scheduler")

    async def close(self) -> None:
        self._closed = True
        tasks = [t for t in (self._timer, self._running) if t is not None]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._timer = self._running = None


def create_value_history_runner(
    pool: ConnectionPool, values: InventoryValues
) -> ValueHistoryRunner:
    return ValueHistoryRunner(pool, values)
