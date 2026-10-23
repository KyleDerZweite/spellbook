"""Scheduling coalesces work and awaits transaction cleanup during shutdown."""

import asyncio
from typing import cast
from unittest.mock import patch

import pytest
from spellbook_core.db import ConnectionPool
from spellbook_core.inventory_value import InventoryValues
from spellbook_core.value_history import CaptureResult

from spellbook_state.value_history import ValueHistoryRunner


def test_run_once_coalesces_concurrent_callers() -> None:
    async def scenario() -> None:
        entered, release = asyncio.Event(), asyncio.Event()
        calls = 0

        async def capture(pool: ConnectionPool, values: InventoryValues) -> CaptureResult:
            nonlocal calls
            calls += 1
            entered.set()
            await release.wait()
            return CaptureResult(captured_accounts=2)

        runner = ValueHistoryRunner(cast(ConnectionPool, None), cast(InventoryValues, None))
        with patch("spellbook_state.value_history.capture_value_history", capture):
            one = asyncio.create_task(runner.run_once())
            await entered.wait()
            two = asyncio.create_task(runner.run_once())
            release.set()
            results = await asyncio.gather(one, two)
            assert calls == 1 and [r.captured_accounts for r in results] == [2, 2]
            await runner.close()
            with pytest.raises(RuntimeError, match="closed"):
                await runner.run_once()

    asyncio.run(scenario())


def test_close_awaits_capture_finally_and_is_repeatable() -> None:
    async def scenario() -> None:
        entered, settled = asyncio.Event(), asyncio.Event()

        async def capture(pool: ConnectionPool, values: InventoryValues) -> CaptureResult:
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                await asyncio.sleep(0)
                settled.set()
            return CaptureResult()

        runner = ValueHistoryRunner(cast(ConnectionPool, None), cast(InventoryValues, None))
        with patch("spellbook_state.value_history.capture_value_history", capture):
            runner.start()
            runner.start()
            await entered.wait()
            await runner.close()
            assert settled.is_set()
            await runner.close()

    asyncio.run(scenario())


def test_scheduler_retries_after_a_failed_cycle() -> None:
    async def scenario() -> None:
        recovered = asyncio.Event()
        calls = 0

        async def capture(pool: ConnectionPool, values: InventoryValues) -> CaptureResult:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("recoverable capture failure")
            recovered.set()
            return CaptureResult()

        runner = ValueHistoryRunner(cast(ConnectionPool, None), cast(InventoryValues, None))
        with (
            patch("spellbook_state.value_history.capture_value_history", capture),
            patch(
                "spellbook_state.value_history.CAPTURE_INTERVAL_SECONDS",
                0,
            ),
        ):
            runner.start()
            await asyncio.wait_for(recovered.wait(), timeout=1)
            await runner.close()
        assert calls >= 2

    asyncio.run(scenario())
