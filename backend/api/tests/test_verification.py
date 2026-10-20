import asyncio
import json
import os
import time
from collections.abc import Callable, Coroutine
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import FrozenInstanceError, fields
from pathlib import Path
from threading import Event, get_ident
from typing import Any, ParamSpec, TypeVar

import pytest
from spellbook_core import passwords
from spellbook_core.passwords import create_password_verifier

from spellbook_api import verification
from spellbook_api.application import create_application
from spellbook_api.http.types import Configuration
from spellbook_api.verification import (
    VerificationPlan,
    VerificationReport,
    VerificationRun,
    start_verification,
)

_P = ParamSpec("_P")
_T = TypeVar("_T")


class RecordingExecutor(ThreadPoolExecutor):
    def __init__(self) -> None:
        super().__init__(max_workers=4)
        self.futures: list[Future[Any]] = []

    def submit(self, fn: Callable[_P, _T], /, *args: _P.args, **kwargs: _P.kwargs) -> Future[_T]:
        future = super().submit(fn, *args, **kwargs)
        self.futures.append(future)
        return future


async def _wait_until(predicate: Callable[[], bool]) -> None:
    async with asyncio.timeout(10):
        while not predicate():
            await asyncio.sleep(0.005)


def test_plan_is_immutable_p01_only_and_accepts_no_credentials() -> None:
    plan = VerificationPlan(concurrent_scrypt=True)
    assert {f.name for f in fields(plan)} == {
        "warmup_seconds",
        "sample_seconds",
        "concurrent_scrypt",
    }
    with pytest.raises(FrozenInstanceError):
        setattr(plan, fields(plan)[1].name, 1)
    for warmup, sample in ((0, 180), (60, 1), (float("nan"), 180), (60, float("inf"))):
        with pytest.raises(ValueError, match="P01"):
            VerificationPlan(warmup, sample)


def test_embedded_public_subset_matches_checked_golden_exactly() -> None:
    golden = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/compatibility/golden.json").read_text()
    )
    for case, expected in zip(verification._CASES[:2], golden["credentials"], strict=True):
        assert (case.name, case.password, case.encoded_hash, case.expected) == (
            expected["id"],
            expected["password"],
            expected["hash"],
            True,
        )
    assert verification._CASES[2].encoded_hash == golden["credentials"][0]["hash"]
    assert verification._CASES[2].password != golden["credentials"][0]["password"]
    assert verification._CASES[2].expected is False
    assert verification._CASES[3].encoded_hash is None
    assert verification._CASES[3].expected is False


def test_construction_and_ordinary_application_start_no_hook_work() -> None:
    with RecordingExecutor() as executor:
        verifier = create_password_verifier(executor)
        run = VerificationRun(verifier, VerificationPlan(), lambda report: None)
        assert run._task is None
        assert run._lanes == []
        assert run._lag_handle is None
        assert executor.futures == []
        lifetime = create_application(Configuration("http://localhost:5173"))
        assert not any(
            "verification" in getattr(route, "path", "") for route in lifetime.http.routes
        )
        asyncio.run(lifetime.close())


def test_probe_is_monotonic_clamped_and_reschedules_from_now(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Clock:
        now = 0.0

        def time(self) -> float:
            return self.now

    clock = Clock()
    scheduled: list[float] = []
    monkeypatch.setattr(asyncio, "get_running_loop", lambda: clock)
    monkeypatch.setattr(verification, "_LAG_CAPACITY", 3)
    with RecordingExecutor() as executor:
        run = VerificationRun(
            create_password_verifier(executor), VerificationPlan(), lambda r: None
        )
        phase = verification._Phase("sample", 180, 0)
        run._phase = phase
        monkeypatch.setattr(run, "_schedule_lag", scheduled.append)
        for now, due in ((1.0, 1.01), (2.0, 2.0), (3.1, 3.0), (4.5, 4.0)):
            clock.now = now
            run._probe(due)
        assert list(phase.lag) == pytest.approx([0, 0.1, 0.5])
        assert phase.lag_observations == 4
        assert scheduled == pytest.approx([1.01, 2.01, 3.11, 4.51])
        run.stop_admission()
        run._probe(5)
        assert phase.lag_observations == 4
        assert len(scheduled) == 4


def test_ordinary_cohort_probes_actual_process_without_derivations() -> None:
    async def exercise(executor: RecordingExecutor) -> None:
        reports: list[VerificationReport] = []
        verifier = create_password_verifier(executor)
        run = start_verification(verifier, VerificationPlan(), reports.append)
        await asyncio.sleep(0.045)
        run.stop_admission()
        await run.settle()
        assert executor.futures == []
        assert len(reports) == 1
        report = reports[0]
        assert report.pid == os.getpid()
        assert report.phase == "warmup"
        assert report.planned_seconds == 60
        assert report.interrupted
        assert report.concurrent_scrypt is False
        assert report.lag_observations >= 1
        assert report.lag_percentile(95) is not None
        assert report.instrumentation == "spellbook-p01-monotonic-10ms-now-plus-interval-v1"
        assert all(sample.pid == os.getpid() for sample in report.resources)
        assert all(
            sample.cpu_seconds >= 0 and sample.peak_rss_bytes > 0 for sample in report.resources
        )
        assert all(
            sample.rss_bytes is not None and sample.rss_bytes > 0 for sample in report.resources
        )
        assert all(case.offered == 0 for case in report.cases)
        assert "baseline password" not in repr(report)
        assert run._task is not None and run._task.done()
        assert run._lag_handle is not None and run._lag_handle.cancelled()
        assert run._resource_handle is not None and run._resource_handle.cancelled()
        await run.settle()

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_four_native_lanes_cycle_golden_wrong_and_dummy_without_backlog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    native_workers: set[tuple[int, int]] = set()
    original = passwords._derive

    def native(password: str, salt: str, expected: str, dummy: bool) -> bool:
        native_workers.add((os.getpid(), get_ident()))
        return original(password, salt, expected, dummy)

    monkeypatch.setattr(passwords, "_derive", native)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        reports: list[VerificationReport] = []
        run = start_verification(
            verifier, VerificationPlan(concurrent_scrypt=True), reports.append
        )
        try:
            await _wait_until(lambda: verifier.diagnostics().completed >= 20)
        finally:
            run.stop_admission()
            verifier.close_admission()
            await run.settle()
        diagnostics = verifier.diagnostics()
        assert diagnostics.active == 0
        assert diagnostics.active_max == 4
        assert diagnostics.busy == diagnostics.failed == 0
        assert all(f.done() and not f.cancelled() for f in executor.futures)
        assert all(lane.done() and not lane.cancelled() for lane in run._lanes)
        assert reports[0].active_max == 4
        assert reports[0].lag_observations > 0
        for case in reports[0].cases:
            assert case.offered == case.completed + case.drained
            assert case.completed == case.matched
            assert case.completed + case.drained >= 4
            assert case.busy == case.failed == case.drain_failed == 0
        assert native_workers
        assert all(pid == os.getpid() and thread != get_ident() for pid, thread in native_workers)

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_stop_inflight_and_cancelled_settle_keep_actual_futures_owned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = Event()
    original = passwords._derive

    def native(password: str, salt: str, expected: str, dummy: bool) -> bool:
        if not release.wait(10):
            raise TimeoutError("test gate was not released")
        return original(password, salt, expected, dummy)

    monkeypatch.setattr(passwords, "_derive", native)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        reports: list[VerificationReport] = []
        run = start_verification(
            verifier, VerificationPlan(concurrent_scrypt=True), reports.append
        )
        try:
            await _wait_until(lambda: len(executor.futures) == 4)
            run.stop_admission()
            verifier.close_admission()
            settling = asyncio.create_task(run.settle())
            await asyncio.sleep(0.025)
            assert not settling.done()
            assert all(f.running() and not f.done() for f in executor.futures)
            settling.cancel()
            with pytest.raises(asyncio.CancelledError):
                await settling
            assert len(executor.futures) == 4
            assert verifier.diagnostics().active == 4
            assert reports == []
        finally:
            release.set()
            await run.settle()
        assert len(executor.futures) == 4
        assert all(f.done() and not f.cancelled() for f in executor.futures)
        assert verifier.diagnostics().active == 0
        assert reports[0].interrupted
        assert sum(c.drained for c in reports[0].cases) == 4
        assert sum(c.completed for c in reports[0].cases) == 0
        assert all(lane.done() for lane in run._lanes)

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_warmup_and_sample_windows_use_declared_durations_and_same_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    durations: list[float] = []

    async def elapsed(waiter: Coroutine[Any, Any, bool], *, timeout: float) -> bool:
        waiter.close()
        durations.append(timeout)
        await asyncio.sleep(0.025)
        raise TimeoutError

    monkeypatch.setattr(asyncio, "wait_for", elapsed)

    async def exercise(executor: RecordingExecutor) -> None:
        reports: list[VerificationReport] = []
        run = start_verification(
            create_password_verifier(executor), VerificationPlan(), reports.append
        )
        await run.settle()
        assert durations == [60, 180]
        assert [r.phase for r in reports] == ["warmup", "sample"]
        assert all(r.lag_observations >= 1 and not r.interrupted for r in reports)
        assert reports[0].instrumentation == reports[1].instrumentation

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_process_sample_covers_cpu_and_nearest_rank_lag_distribution() -> None:
    before = verification._process_sample(time.monotonic())
    # A real CPU operation gives the instrumentation something to observe in this PID.
    sum(i * i for i in range(100_000))
    after = verification._process_sample(time.monotonic())
    assert before.pid == after.pid == os.getpid()
    assert after.cpu_seconds >= before.cpu_seconds
    assert after.monotonic_seconds >= before.monotonic_seconds
    report = VerificationReport(
        "test",
        os.getpid(),
        "sample",
        False,
        180,
        1,
        True,
        (0.03, 0.01, 0.02),
        3,
        (before, after),
        (),
        0,
        before.monotonic_seconds,
    )
    assert report.lag_percentile(50) == 0.02
    assert report.lag_percentile(99) == 0.03
    with pytest.raises(ValueError):
        report.lag_percentile(0)


def test_sink_failure_occurs_after_owned_tasks_settle() -> None:
    def fail(report: VerificationReport) -> None:
        raise ValueError("test sink failure")

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        run = start_verification(verifier, VerificationPlan(), fail)
        await asyncio.sleep(0)
        run.stop_admission()
        with pytest.raises(ValueError, match="test sink failure"):
            await run.settle()
        assert verifier.diagnostics().active == 0
        assert run._task is not None and run._task.done()
        assert run._lag_handle is not None and run._lag_handle.cancelled()
        assert run._resource_handle is not None and run._resource_handle.cancelled()

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


@pytest.mark.parametrize("failure", ["busy", "native-error", "mismatch"])
def test_lane_failures_are_counted_without_retry_backlog(
    monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    def derive(*args: object) -> bool:
        if failure == "native-error":
            raise ValueError("private test failure must not reach report")
        return False

    monkeypatch.setattr(passwords, "_derive", derive)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        if failure == "busy":
            verifier.close_admission()
        reports: list[VerificationReport] = []
        run = start_verification(
            verifier, VerificationPlan(concurrent_scrypt=True), reports.append
        )
        try:
            await _wait_until(lambda: len(run._lanes) == 4 and all(t.done() for t in run._lanes))
        finally:
            run.stop_admission()
            await run.settle()
        cases = reports[0].cases
        assert sum(c.offered for c in cases) == 4
        assert sum(c.busy for c in cases) == (4 if failure == "busy" else 0)
        assert sum(c.failed for c in cases) == (0 if failure == "busy" else 4)
        assert len(executor.futures) == (0 if failure == "busy" else 4)
        assert verifier.diagnostics().active == 0
        assert "private test failure" not in repr(reports)

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))
