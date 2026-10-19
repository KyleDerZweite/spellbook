"""Private opt-in P01 instrumentation. The host/lifetime owns startup and cleanup.

No credentials are accepted through a plan or emitted to a sink. The embedded
public subset is checked against contracts/compatibility/golden.json by tests.
"""

import asyncio
import math
import os
import resource
import sys
from collections import deque
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from spellbook_core.errors import AuthError
from spellbook_core.passwords import PasswordVerifier

_INSTRUMENTATION = "spellbook-p01-monotonic-10ms-now-plus-interval-v1"
_LAG_CAPACITY = 24_000
_RESOURCE_CAPACITY = 242


@dataclass(frozen=True)
class _Case:
    name: str
    password: str = field(repr=False)
    encoded_hash: str | None = field(repr=False)
    expected: bool


# Fixed before a run, in the same order for all four completion-driven lanes.
_ASCII = _Case(
    "credential-ascii",
    "baseline password 123",
    "scrypt$0123456789abcdef0123456789abcdef$"
    "815f0e9978809b56ee3dc01448c0fc369bed6caa319a62aee3f98c6794493b3dec76ff0"
    "40562378f160e683d9d181b36bfebc22d97031d754bffd9d8de1825db",
    True,
)
_UNICODE = _Case(
    "credential-unicode",
    "six🔮astral🔮symbols🔮",
    "scrypt$0123456789abcdef0123456789abcdef$"
    "ab6d7ba3e62d19af2b8d6cf6ac6cd3e05b0b582a2af720576ef594dfcfc52eb96bf"
    "7dc53743a5b751fbb2a04f4a7b61dd5bc0fca8670c36001d02ae2f385f964",
    True,
)
_CASES = (
    _ASCII,
    _UNICODE,
    _Case("wrong-password", _UNICODE.password, _ASCII.encoded_hash, False),
    _Case("null-dummy", _ASCII.password, None, False),
)


@dataclass(frozen=True)
class VerificationPlan:
    warmup_seconds: float = 60.0
    sample_seconds: float = 180.0
    concurrent_scrypt: bool = False

    def __post_init__(self) -> None:
        if self.warmup_seconds != 60 or self.sample_seconds != 180:
            raise ValueError("P01 requires 60 seconds warmup and 180 seconds sampling")
        if type(self.concurrent_scrypt) is not bool:
            raise ValueError("concurrent_scrypt must be an explicit boolean")


@dataclass(frozen=True)
class ProcessSample:
    monotonic_seconds: float
    pid: int
    cpu_seconds: float
    rss_bytes: int | None
    peak_rss_bytes: int


@dataclass(frozen=True)
class CaseOutcomes:
    case: str
    offered: int
    completed: int
    busy: int
    failed: int
    matched: int
    drained: int
    drain_failed: int


@dataclass(frozen=True)
class VerificationReport:
    instrumentation: str
    pid: int
    phase: Literal["warmup", "sample"]
    concurrent_scrypt: bool
    planned_seconds: float
    observed_seconds: float
    interrupted: bool
    lag_seconds: tuple[float, ...]
    lag_observations: int
    resources: tuple[ProcessSample, ...]
    cases: tuple[CaseOutcomes, ...]
    active_max: int
    started_monotonic_seconds: float

    def lag_percentile(self, percentile: float) -> float | None:
        """Nearest-rank distribution over the retained raw samples."""
        if not 0 < percentile <= 100:
            raise ValueError("percentile must be in (0, 100]")
        if not self.lag_seconds:
            return None
        ordered = sorted(self.lag_seconds)
        return ordered[math.ceil(percentile * len(ordered) / 100) - 1]


@dataclass
class _Counts:
    offered: int = 0
    completed: int = 0
    busy: int = 0
    failed: int = 0
    matched: int = 0
    drained: int = 0
    drain_failed: int = 0


class _Phase:
    def __init__(self, name: Literal["warmup", "sample"], duration: float, now: float) -> None:
        self.name = name
        self.duration = duration
        self.started = now
        self.ended = now
        self.interrupted = False
        self.lag: deque[float] = deque(maxlen=_LAG_CAPACITY)
        self.lag_observations = 0
        self.resources: deque[ProcessSample] = deque(maxlen=_RESOURCE_CAPACITY)
        self.counts = {case.name: _Counts() for case in _CASES}
        self.active_max = 0


def _process_sample(now: float) -> ProcessSample:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    try:
        rss = int(Path("/proc/self/statm").read_text().split()[1]) * os.sysconf("SC_PAGE_SIZE")
    except OSError, ValueError, IndexError:
        rss = None
    peak = int(usage.ru_maxrss) * (1 if sys.platform == "darwin" else 1024)
    return ProcessSample(now, os.getpid(), usage.ru_utime + usage.ru_stime, rss, peak)


class VerificationRun:
    """Owns all lane tasks and timer handles, never the injected executor."""

    def __init__(
        self,
        passwords: PasswordVerifier,
        plan: VerificationPlan,
        sink: Callable[[VerificationReport], None],
    ) -> None:
        self._passwords = passwords
        self._plan = plan
        self._sink = sink
        self._stopped = asyncio.Event()
        self._accepting = True
        self._phase: _Phase | None = None
        self._lag_handle: asyncio.TimerHandle | None = None
        self._resource_handle: asyncio.TimerHandle | None = None
        self._task: asyncio.Task[None] | None = None
        self._lanes: list[asyncio.Task[None]] = []
        self._active = 0

    def _start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="password-verification")
        self._task.add_done_callback(_observe_task)

    def stop_admission(self) -> None:
        self._accepting = False
        self._stopped.set()
        if self._lag_handle is not None:
            self._lag_handle.cancel()
        if self._resource_handle is not None:
            self._resource_handle.cancel()

    async def settle(self) -> None:
        if self._task is not None:
            # Cancelling this waiter cannot cancel the run or log its later failure
            # through Python 3.14 shield's exception handler.
            waiter: asyncio.Future[None] = asyncio.get_running_loop().create_future()

            def completed(task: asyncio.Task[None]) -> None:
                if not waiter.done():
                    waiter.set_result(None)

            self._task.add_done_callback(completed)
            await waiter
            self._task.result()

    def _schedule_lag(self, due: float) -> None:
        self._lag_handle = asyncio.get_running_loop().call_at(due, self._probe, due)

    def _probe(self, due: float) -> None:
        if not self._accepting:
            return
        now = asyncio.get_running_loop().time()
        if self._phase is not None:
            self._phase.lag.append(max(0.0, now - due))
            self._phase.lag_observations += 1
        self._schedule_lag(now + 0.010)

    def _sample_resources(self) -> None:
        if not self._accepting:
            return
        loop = asyncio.get_running_loop()
        if self._phase is not None:
            self._phase.resources.append(_process_sample(loop.time()))
        self._resource_handle = loop.call_at(loop.time() + 1.0, self._sample_resources)

    async def _lane(self) -> None:
        index = 0
        while self._accepting:
            phase = self._phase
            if phase is None:
                return
            case = _CASES[index % len(_CASES)]
            counts = phase.counts[case.name]
            counts.offered += 1
            self._active += 1
            phase.active_max = max(phase.active_max, self._active)
            try:
                result = await self._passwords.verify(case.password, case.encoded_hash)
            except AuthError:
                counts.busy += 1
                return
            except Exception:
                current = self._phase if self._accepting else None
                if current is None:
                    counts.drained += 1
                    counts.drain_failed += 1
                else:
                    current.counts[case.name].failed += 1
                return
            else:
                # Attribute completions to their observed window, including carry-in
                # from warmup. Settlement after admission stops is reported separately.
                current = self._phase if self._accepting else None
                if current is None:
                    counts.drained += 1
                    counts.drain_failed += int(result is not case.expected)
                else:
                    completed = current.counts[case.name]
                    completed.completed += 1
                    if result is case.expected:
                        completed.matched += 1
                    else:
                        completed.failed += 1
                if result is not case.expected:
                    return
            finally:
                self._active -= 1
            index += 1

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        phases: list[_Phase] = []
        try:
            windows: tuple[tuple[Literal["warmup", "sample"], float], ...] = (
                ("warmup", self._plan.warmup_seconds),
                ("sample", self._plan.sample_seconds),
            )
            for name, duration in windows:
                if not self._accepting:
                    break
                phase = _Phase(name, duration, loop.time())
                phases.append(phase)
                self._phase = phase
                phase.resources.append(_process_sample(loop.time()))
                if name == "warmup":
                    self._schedule_lag(loop.time() + 0.010)
                    self._sample_resources()
                    if self._plan.concurrent_scrypt:
                        self._lanes = [
                            asyncio.create_task(self._lane(), name=f"password-lane-{i}")
                            for i in range(4)
                        ]
                with suppress(TimeoutError):
                    await asyncio.wait_for(self._stopped.wait(), timeout=duration)
                phase.ended = loop.time()
                phase.interrupted = self._stopped.is_set()
                phase.resources.append(_process_sample(phase.ended))
        finally:
            self.stop_admission()
            # Do not cancel lanes: their current await owns a real native reservation.
            await asyncio.gather(*self._lanes)
            await self._passwords.settle()
            if phases:
                phases[-1].resources.append(_process_sample(loop.time()))
            self._phase = None
        for phase in phases:
            self._sink(
                VerificationReport(
                    _INSTRUMENTATION,
                    os.getpid(),
                    phase.name,
                    self._plan.concurrent_scrypt,
                    phase.duration,
                    phase.ended - phase.started,
                    phase.interrupted,
                    tuple(phase.lag),
                    phase.lag_observations,
                    tuple(phase.resources),
                    tuple(
                        CaseOutcomes(name, **vars(counts)) for name, counts in phase.counts.items()
                    ),
                    phase.active_max,
                    phase.started,
                )
            )


def _observe_task(task: asyncio.Task[None]) -> None:
    if not task.cancelled():
        task.exception()


def start_verification(
    passwords: PasswordVerifier,
    plan: VerificationPlan,
    sink: Callable[[VerificationReport], None],
) -> VerificationRun:
    run = VerificationRun(passwords, plan, sink)
    run._start()
    return run
