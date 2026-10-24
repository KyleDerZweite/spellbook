import asyncio
import hashlib
import hmac
import json
import secrets
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from threading import Event
from typing import Any, ParamSpec, TypeVar

import pytest

from spellbook_core import passwords
from spellbook_core.errors import AuthError
from spellbook_core.passwords import create_password_verifier, valid_password

_P = ParamSpec("_P")
_T = TypeVar("_T")
_GOLDEN = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/wire.json").read_text()
)


class RecordingExecutor(ThreadPoolExecutor):
    def __init__(self) -> None:
        super().__init__(max_workers=4)
        self.submitted: list[Future[Any]] = []

    def submit(self, fn: Callable[_P, _T], /, *args: _P.args, **kwargs: _P.kwargs) -> Future[_T]:
        future = super().submit(fn, *args, **kwargs)
        self.submitted.append(future)
        return future


@pytest.mark.parametrize("vector", _GOLDEN["credentials"], ids=lambda v: v["id"])
def test_native_golden_and_wrong_password(vector: dict[str, str]) -> None:
    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        assert await verifier.verify(vector["password"], vector["hash"])
        assert not await verifier.verify(vector["password"] + "wrong", vector["hash"])
        assert not await verifier.verify(vector["password"], None)
        verifier.close_admission()
        await verifier.settle()
        assert verifier.diagnostics().completed == 3
        assert verifier.diagnostics().failed == 0
        assert len(executor.submitted) == 3

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


@pytest.mark.parametrize("vector", _GOLDEN["text"], ids=lambda v: v["id"])
def test_golden_utf16_bounds(vector: dict[str, object]) -> None:
    assert valid_password(vector["value"]) is vector["valid"]


@pytest.mark.parametrize("value", [None, 12, [], "", "a" * 129, "🔮" * 65])
def test_password_bounds_reject_non_strings_and_out_of_range(value: object) -> None:
    assert not valid_password(value)


def test_exact_native_arguments_dummy_comparison_and_surrogate_replacement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[bytes, dict[str, object]]] = []
    comparisons: list[tuple[bytes, bytes]] = []

    def derive(password: bytes, **kwargs: object) -> bytes:
        calls.append((password, kwargs))
        return bytes(64)

    def compare(actual: bytes, expected: bytes) -> bool:
        comparisons.append((actual, expected))
        return True

    monkeypatch.setattr(hashlib, "scrypt", derive)
    monkeypatch.setattr(hmac, "compare_digest", compare)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        # verify itself accepts short/empty inputs; caller validation is separate.
        assert not await verifier.verify("", None)
        assert await verifier.verify(
            "\ud800x\udc00\ud83d\udd2e", _GOLDEN["credentials"][0]["hash"]
        )
        assert calls == [
            (
                b"",
                dict(salt=b"0" * 32, n=32768, r=8, p=3, dklen=64, maxmem=64 * 1024 * 1024),
            ),
            (
                "�x�🔮".encode(),
                dict(
                    salt=b"0123456789abcdef0123456789abcdef",
                    n=32768,
                    r=8,
                    p=3,
                    dklen=64,
                    maxmem=64 * 1024 * 1024,
                ),
            ),
        ]
        assert comparisons[0] == (bytes(64), bytes(64))
        assert comparisons[1][1] == bytes.fromhex(_GOLDEN["credentials"][0]["hash"].split("$")[2])

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


@pytest.mark.parametrize(
    "encoded",
    [
        "",
        "scrypt",
        "SCRYPT$" + "0" * 32 + "$" + "0" * 128,
        "scrypt$" + "A" * 32 + "$" + "0" * 128,
        "scrypt$" + "0" * 31 + "$" + "0" * 128,
        "scrypt$" + "0" * 32 + "$" + "0" * 127,
        *(
            _GOLDEN["credentials"][0]["hash"] + suffix
            for suffix in ("\n", "\r", "\r\n", "\u2028", "\u2029", "x")
        ),
    ],
)
def test_malformed_hash_never_submits(encoded: str) -> None:
    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        assert not await verifier.verify("anything", encoded)
        assert executor.submitted == []
        assert verifier.diagnostics().malformed == 1

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_native_futures_keep_all_four_slots_after_cancellation_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = Event()
    original = passwords._derive

    def native(password: str, salt: str, expected: str, dummy: bool) -> bool:
        # Run the real scrypt and keep its actual concurrent future running until released.
        result = original(password, salt, expected, dummy)
        if not release.wait(10):
            raise TimeoutError("test native gate was not released")
        return result

    monkeypatch.setattr(passwords, "_derive", native)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        tasks = [asyncio.create_task(verifier.verify("test", None)) for _ in range(4)]
        try:
            await asyncio.sleep(0)
            assert len(executor.submitted) == 4
            assert all(f.running() and not f.done() for f in executor.submitted)
            fifth = verifier.verify("test", None)
            # Advancing the coroutine raises before its first await, with no queued work.
            with pytest.raises(AuthError):
                fifth.send(None)
            assert len(executor.submitted) == 4
            tasks[0].cancel()
            with pytest.raises(asyncio.CancelledError):
                await tasks[0]
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(tasks[1], timeout=0.001)
            for _ in range(2):
                with pytest.raises(
                    AuthError, match=r"^Authentication is busy\. Try again shortly\.$"
                ) as error:
                    await verifier.verify("test", None)
                assert error.value.kind == "RateLimited"
            assert len(executor.submitted) == 4
            assert verifier.diagnostics().active == 4
            assert all(not f.cancelled() and not f.done() for f in executor.submitted)
            settling = asyncio.create_task(verifier.settle())
            await asyncio.sleep(0)
            assert not settling.done()
            settling.cancel()
            with pytest.raises(asyncio.CancelledError):
                await settling
            assert all(not f.cancelled() for f in executor.submitted)
            release.set()
            await asyncio.gather(*tasks, return_exceptions=True)
            await verifier.settle()
            assert all(f.done() and not f.cancelled() for f in executor.submitted)
            assert verifier.diagnostics().active == 0
            assert verifier.diagnostics().completed == 4
            assert not await verifier.verify("test", None)
            assert len(executor.submitted) == 5
            verifier.close_admission()
            verifier.close_admission()
            with pytest.raises(AuthError):
                await verifier.verify("test", None)
            await verifier.settle()
            assert len(executor.submitted) == 5
            assert verifier.diagnostics().active_max == 4
        finally:
            release.set()
            await asyncio.gather(*tasks, return_exceptions=True)
            await verifier.settle()

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_derivation_and_submission_failures_release_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*args: object) -> bool:
        raise ValueError("test native failure")

    monkeypatch.setattr(passwords, "_derive", fail)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        for _ in range(5):
            with pytest.raises(ValueError, match="test native failure"):
                await verifier.verify("test", None)
        await verifier.settle()
        assert verifier.diagnostics().active == 0
        assert verifier.diagnostics().failed == 5
        executor.shutdown(wait=True)
        with pytest.raises(RuntimeError, match="shutdown"):
            await verifier.verify("test", None)
        assert verifier.diagnostics().active == 0
        assert verifier.diagnostics().failed == 6

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_construction_has_no_native_work_and_lifetime_owns_executor() -> None:
    with RecordingExecutor() as executor:
        verifier = create_password_verifier(executor)
        assert executor.submitted == []
        assert verifier.diagnostics().active == 0
        verifier.close_admission()
        asyncio.run(verifier.settle())
        # Closing the verifier does not shut down the lifetime's executor.
        assert executor.submit(lambda: 42).result() == 42


def test_cancelled_caller_observes_late_native_failure_and_releases_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = Event()

    def fail(*args: object) -> bool:
        if not release.wait(10):
            raise TimeoutError("test failure gate was not released")
        raise ValueError("test failure after cancellation")

    monkeypatch.setattr(passwords, "_derive", fail)

    async def exercise(executor: RecordingExecutor) -> None:
        errors: list[dict[str, Any]] = []
        loop = asyncio.get_running_loop()
        loop.set_exception_handler(lambda loop, context: errors.append(context))
        verifier = create_password_verifier(executor)
        caller = asyncio.create_task(verifier.verify("test", None))
        try:
            await asyncio.sleep(0)
            caller.cancel()
            with pytest.raises(asyncio.CancelledError):
                await caller
            assert verifier.diagnostics().active == 1
        finally:
            release.set()
            await verifier.settle()
        await asyncio.sleep(0)
        assert errors == []
        assert verifier.diagnostics().active == 0
        assert verifier.diagnostics().failed == 1
        assert executor.submitted[0].done()
        assert not executor.submitted[0].cancelled()

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_hash_creation_uses_existing_salt_encoding_and_roundtrips(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(secrets, "token_hex", lambda count: "0123456789abcdef" * 2)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        vector = _GOLDEN["credentials"][0]
        encoded = await verifier.hash(vector["password"])
        assert encoded == vector["hash"]
        assert await verifier.verify(vector["password"], encoded)
        assert not await verifier.verify("wrong password", encoded)
        verifier.close_admission()
        with pytest.raises(AuthError):
            await verifier.hash("another password")
        await verifier.settle()
        assert verifier.diagnostics().active == 0

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))


def test_hashes_share_verification_capacity_and_survive_caller_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = Event()

    def hash_password(password: str) -> str:
        if not release.wait(10):
            raise TimeoutError("test hash gate was not released")
        return str(_GOLDEN["credentials"][0]["hash"])

    monkeypatch.setattr(passwords, "hash_password", hash_password)

    async def exercise(executor: RecordingExecutor) -> None:
        verifier = create_password_verifier(executor)
        callers = [asyncio.create_task(verifier.hash("test password")) for _ in range(4)]
        try:
            await asyncio.sleep(0)
            assert verifier.diagnostics().active == 4
            callers[0].cancel()
            await asyncio.gather(callers[0], return_exceptions=True)
            with pytest.raises(AuthError):
                await verifier.verify("test password", None)
            with pytest.raises(AuthError):
                await verifier.hash("test password")
            verifier.close_admission()
        finally:
            release.set()
            await asyncio.gather(*callers, return_exceptions=True)
            await verifier.settle()
        assert verifier.diagnostics().active == 0
        assert len(executor.submitted) == 4
        assert all(not future.cancelled() for future in executor.submitted)

    with RecordingExecutor() as executor:
        asyncio.run(exercise(executor))
