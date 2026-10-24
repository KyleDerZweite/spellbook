"""Runner sequencing and graceful rollback join through fake Core job seams."""

import asyncio
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest
from spellbook_core.db import ConnectionPool
from spellbook_core.mtg.categories.jobs import WholeDeckJobClaim

from spellbook_state.categories import WholeDeckCategoryRunner, run_once

CLAIM = WholeDeckJobClaim("deck", "account", "1", "2", "3", "lease", 1)


def test_runner_retries_after_failed_processing_and_does_not_retry_cancellation() -> None:
    async def scenario() -> None:
        pool = cast(ConnectionPool, object())
        calls: list[str] = []

        async def process(*args: object) -> None:
            calls.append("rolled back")
            raise RuntimeError("infrastructure failure")

        async def backoff(*args: object) -> None:
            calls.append("backoff committed")

        with (
            patch(
                "spellbook_state.categories.claim_whole_deck_job", AsyncMock(return_value=CLAIM)
            ),
            patch("spellbook_state.categories.process_whole_deck_job", process),
            patch("spellbook_state.categories.backoff_whole_deck_job", backoff),
            pytest.raises(RuntimeError),
        ):
            await run_once(pool)
        assert calls == ["rolled back", "backoff committed"]
        backoff_mock = AsyncMock()
        with (
            patch(
                "spellbook_state.categories.claim_whole_deck_job", AsyncMock(return_value=CLAIM)
            ),
            patch(
                "spellbook_state.categories.process_whole_deck_job",
                AsyncMock(side_effect=asyncio.CancelledError),
            ),
            patch("spellbook_state.categories.backoff_whole_deck_job", backoff_mock),
            pytest.raises(asyncio.CancelledError),
        ):
            await run_once(pool)
        backoff_mock.assert_not_awaited()

    asyncio.run(scenario())


def test_close_joins_current_processing_once_and_start_is_idempotent() -> None:
    async def scenario() -> None:
        entered, rolled_back = asyncio.Event(), asyncio.Event()

        async def process(*args: object) -> None:
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                rolled_back.set()

        claim = AsyncMock(return_value=CLAIM)
        with (
            patch("spellbook_state.categories.claim_whole_deck_job", claim),
            patch("spellbook_state.categories.process_whole_deck_job", process),
        ):
            runner = WholeDeckCategoryRunner(cast(ConnectionPool, object()))
            runner.start()
            runner.start()
            await asyncio.wait_for(entered.wait(), 1)
            await runner.close()
            assert rolled_back.is_set()
            await runner.close()
            runner.start()
            claim.assert_awaited_once()

    asyncio.run(scenario())
