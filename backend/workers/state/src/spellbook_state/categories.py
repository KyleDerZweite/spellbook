"""Separate WholeDeckCategory runner; the state host owns pool and process lifetime."""

import asyncio
import logging

from spellbook_core.categories.jobs import (
    POLL_SECONDS,
    backoff_whole_deck_job,
    claim_whole_deck_job,
    process_whole_deck_job,
)
from spellbook_core.db import ConnectionPool

log = logging.getLogger(__name__)


async def run_once(pool: ConnectionPool) -> bool:
    claim = await claim_whole_deck_job(pool)
    if claim is None:
        return False
    try:
        await process_whole_deck_job(pool, claim)
    except Exception:
        # The evaluation transaction has settled rollback before a retry is recorded.
        await backoff_whole_deck_job(pool, claim)
        raise
    return True


class WholeDeckCategoryRunner:
    def __init__(self, pool: ConnectionPool, *, poll_seconds: float = POLL_SECONDS):
        self.pool = pool
        self.poll_seconds = poll_seconds
        self._task: asyncio.Task[None] | None = None
        self._closed = False

    def start(self) -> None:
        if self._task is None and not self._closed:
            self._task = asyncio.create_task(self._run(), name="whole-deck-categories")

    async def _run(self) -> None:
        while True:
            try:
                await run_once(self.pool)
            except Exception:
                # Do not log SQL, connection strings or account data.
                log.warning("Whole-deck Category evaluation temporarily unavailable")
            await asyncio.sleep(self.poll_seconds)

    async def close(self) -> None:
        self._closed = True
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
