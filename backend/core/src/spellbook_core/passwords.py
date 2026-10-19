"""Node-compatible password verification using a lifetime-owned dedicated executor."""

import asyncio
import hashlib
import hmac
import re
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from threading import Lock

from .errors import AuthError

_HASH = re.compile(r"scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}")
_DUMMY_HASH = f"scrypt${'0' * 32}${'0' * 128}"
_BUSY = "Authentication is busy. Try again shortly."


def valid_password(value: object) -> bool:
    """Keep eventual caller validation separate from verifyPassword semantics."""
    return (
        isinstance(value, str)
        and 12 <= len(value.encode("utf-16-le", "surrogatepass")) // 2 <= 128
    )


def _derive(password: str, salt: str, expected: str, dummy: bool) -> bool:
    # JS combines valid surrogate pairs and replaces each unpaired surrogate with U+FFFD.
    encoded = password.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")
    actual = hashlib.scrypt(
        encoded.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=32768,
        r=8,
        p=3,
        dklen=64,
        maxmem=64 * 1024 * 1024,
    )
    return hmac.compare_digest(actual, bytes.fromhex(expected)) and not dummy


@dataclass(frozen=True)
class PasswordDiagnostics:
    offered: int
    completed: int
    busy: int
    failed: int
    active: int
    active_max: int
    malformed: int
    accepting: bool


class PasswordVerifier:
    """The injected four-thread executor must accept no unrelated submissions.

    Only the lifetime shuts down the executor, after close_admission and settle.
    Native completion releases reservations, independently of asyncio cancellation.
    """

    def __init__(self, executor: ThreadPoolExecutor) -> None:
        self._executor = executor
        self._lock = Lock()
        self._pending: set[Future[bool]] = set()
        self._accepting = True
        self._offered = self._completed = self._busy = self._failed = 0
        self._active_max = self._malformed = 0

    async def verify(self, password: str, encoded_hash: str | None) -> bool:
        encoded = _DUMMY_HASH if encoded_hash is None else encoded_hash
        with self._lock:
            if not self._accepting:
                self._busy += 1
                raise AuthError(_BUSY)
            if not _HASH.fullmatch(encoded):
                self._malformed += 1
                return False
            self._offered += 1
            if len(self._pending) >= 4:
                self._busy += 1
                raise AuthError(_BUSY)
            _, salt, expected = encoded.split("$")
            try:
                future = self._executor.submit(
                    _derive, password, salt, expected, encoded_hash is None
                )
            except BaseException:
                self._failed += 1
                raise
            self._pending.add(future)
            self._active_max = max(self._active_max, len(self._pending))
        # Register outside the lock because an already completed future calls back inline.
        future.add_done_callback(self._completed_native)
        return await _native_waiter(future)

    def _completed_native(self, future: Future[bool]) -> None:
        with self._lock:
            self._pending.remove(future)
            self._completed += 1
            if future.cancelled() or future.exception() is not None:
                self._failed += 1

    def close_admission(self) -> None:
        with self._lock:
            self._accepting = False

    async def settle(self) -> None:
        """Await native work without transferring cancellation to its futures."""
        with self._lock:
            pending = tuple(self._pending)
        if pending:
            await asyncio.gather(*(_native_waiter(f) for f in pending), return_exceptions=True)

    def diagnostics(self) -> PasswordDiagnostics:
        with self._lock:
            return PasswordDiagnostics(
                self._offered,
                self._completed,
                self._busy,
                self._failed,
                len(self._pending),
                self._active_max,
                self._malformed,
                self._accepting,
            )


def _native_waiter(native: Future[bool]) -> asyncio.Future[bool]:
    # This future has no cancellation link back to the executor. Shield in Python
    # 3.14 reports a late native exception to the loop after caller cancellation.
    loop = asyncio.get_running_loop()
    waiter: asyncio.Future[bool] = loop.create_future()
    waiter.add_done_callback(_observe)

    def deliver() -> None:
        if waiter.done():
            return
        if native.cancelled():
            waiter.cancel()
        elif (error := native.exception()) is not None:
            waiter.set_exception(error)
        else:
            waiter.set_result(native.result())

    def completed(future: Future[bool]) -> None:
        try:
            loop.call_soon_threadsafe(deliver)
        except RuntimeError:
            # The native completion callback still releases the reservation if a
            # caller has already closed its event loop. Lifetime must settle first.
            if not loop.is_closed():
                raise

    native.add_done_callback(completed)
    return waiter


def _observe(future: asyncio.Future[bool]) -> None:
    if not future.cancelled():
        future.exception()


def create_password_verifier(executor: ThreadPoolExecutor) -> PasswordVerifier:
    return PasswordVerifier(executor)
