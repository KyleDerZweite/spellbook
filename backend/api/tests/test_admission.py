import asyncio

import pytest

from spellbook_api.http import admission as module
from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.errors import HttpError


def test_active_waiting_and_excess_rejection_do_not_start_work() -> None:
    async def exercise() -> None:
        gate = RequestAdmission()
        release = asyncio.Event()
        started = 0

        async def work() -> None:
            nonlocal started
            async with gate.request():
                started += 1
                await release.wait()

        jobs = [asyncio.create_task(work()) for _ in range(64)]
        await asyncio.sleep(0.01)
        assert (gate.active, gate.waiting, started) == (32, 32, 32)
        with pytest.raises(HttpError) as failed:
            await work()
        assert failed.value.status == 503
        assert started == 32
        release.set()
        await asyncio.gather(*jobs)
        assert (gate.active, gate.waiting, started) == (0, 0, 64)

    asyncio.run(exercise())


def test_cancelled_and_timed_out_waiters_cannot_retain_a_handed_over_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(module, "REQUEST_ACTIVE", 1)
    monkeypatch.setattr(module, "REQUEST_WAIT_SECONDS", 0.02)

    async def exercise() -> None:
        gate = RequestAdmission()
        owner = gate.request()
        await owner.__aenter__()
        waiter = asyncio.create_task(gate._acquire())
        await asyncio.sleep(0)
        with pytest.raises(HttpError):
            await waiter
        assert (gate.active, gate.waiting) == (1, 0)
        cancelled = asyncio.create_task(gate._acquire())
        await asyncio.sleep(0)
        # Handoff and cancellation happen before the acquiring task resumes.
        await owner.__aexit__(None, None, None)
        cancelled.cancel()
        with pytest.raises(asyncio.CancelledError):
            await cancelled
        assert (gate.active, gate.waiting) == (0, 0)
        async with gate.request():
            assert gate.active == 1
        gate.close_admission()
        with pytest.raises(HttpError):
            await gate._acquire()

    asyncio.run(exercise())


def test_shutdown_rejects_queued_admission_without_cancelling_active_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(module, "REQUEST_ACTIVE", 1)

    async def exercise() -> None:
        gate = RequestAdmission()
        async with gate.request():
            waiter = asyncio.create_task(gate._acquire())
            await asyncio.sleep(0)
            gate.close_admission()
            with pytest.raises(HttpError):
                await waiter
            assert (gate.active, gate.waiting) == (1, 0)
        assert gate.active == 0

    asyncio.run(exercise())


def test_post_drain_settlement_awaits_actual_request_rollback() -> None:
    async def exercise() -> None:
        gate = RequestAdmission()
        entered, rollback_started, rollback_done = (
            asyncio.Event(),
            asyncio.Event(),
            asyncio.Event(),
        )

        async def request() -> None:
            async with gate.request():
                entered.set()
                try:
                    await asyncio.Future[None]()
                finally:
                    rollback_started.set()
                    await rollback_done.wait()

        work = asyncio.create_task(request())
        await entered.wait()
        gate.close_admission()
        settlement = asyncio.create_task(gate.settle())
        await rollback_started.wait()
        assert gate.active == 1 and not settlement.done()
        rollback_done.set()
        await settlement
        assert work.cancelled() and gate.active == gate.waiting == 0

    asyncio.run(exercise())
