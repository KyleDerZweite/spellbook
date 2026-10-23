"""Host ownership of real native futures."""

import asyncio
import threading
from typing import cast

import pytest
from spellbook_core import passwords as password_module
from spellbook_core.errors import AuthError

from spellbook_api.application import ApplicationResources, create_application
from spellbook_api.http.types import Configuration

ORIGIN = "http://127.0.0.1:5173"
DSN = "postgresql://localhost/unused-fixture"
GOLDEN = (
    "scrypt$0123456789abcdef0123456789abcdef$"
    "815f0e9978809b56ee3dc01448c0fc369bed6caa319a62aee3f98c6794493b3dec76ff0"
    "40562378f160e683d9d181b36bfebc22d97031d754bffd9d8de1825db"
)


def test_native_futures_and_executor_settle_before_the_request_pool_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = threading.Event()
    real_derive = password_module._derive
    started = 0
    lock = threading.Lock()
    observed: list[str] = []

    def derive(password: str, salt: str, expected: str, dummy: bool) -> bool:
        nonlocal started
        with lock:
            started += 1
        assert release.wait(timeout=5)
        return real_derive(password, salt, expected, dummy)

    monkeypatch.setattr(password_module, "_derive", derive)

    async def exercise() -> None:
        resources = ApplicationResources(Configuration(ORIGIN, database_url=DSN))
        native_shutdown = resources.executor.shutdown

        def shutdown(wait: bool = True, *, cancel_futures: bool = False) -> None:
            assert resources.passwords.diagnostics().active == 0
            observed.append("executor")
            native_shutdown(wait=wait, cancel_futures=cancel_futures)

        async def pool_close(timeout: float = 5.0) -> None:
            observed.append("pool")

        monkeypatch.setattr(resources.executor, "shutdown", shutdown)
        monkeypatch.setattr(resources.pool, "close", pool_close)
        attempts = [
            asyncio.create_task(resources.passwords.verify("baseline password 123", GOLDEN))
            for _ in range(4)
        ]
        async with asyncio.timeout(2):
            while started != 4:
                await asyncio.sleep(0.005)
        with pytest.raises(AuthError):
            await resources.passwords.verify("baseline password 123", GOLDEN)
        attempts[0].cancel()
        await asyncio.gather(attempts[0], return_exceptions=True)
        assert resources.passwords.diagnostics().active == 4
        await resources.close_streams()
        close = asyncio.create_task(resources.close())
        await asyncio.sleep(0.02)
        assert not close.done() and observed == []
        close.cancel()
        with pytest.raises(asyncio.CancelledError):
            await close
        assert resources.passwords.diagnostics().active == 4 and observed == []
        replacement_waiter = asyncio.create_task(resources.close())
        release.set()
        await asyncio.gather(*attempts, return_exceptions=True)
        await replacement_waiter
        await resources.close()
        assert observed == ["executor", "pool"]

    try:
        asyncio.run(exercise())
    finally:
        release.set()


def test_partial_startup_and_cancelled_close_keep_resource_settlement_owned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        lifetime = create_application(Configuration(ORIGIN, database_url=DSN))
        resources = cast(ApplicationResources, lifetime.http.state.resources)
        pool_closed = False

        async def fail_open(wait: bool = False, timeout: float = 30.0) -> None:
            raise OSError("startup failure")

        actual_close = resources.pool.close

        async def close_pool(timeout: float = 5.0) -> None:
            nonlocal pool_closed
            pool_closed = True
            await actual_close(timeout)

        monkeypatch.setattr(resources.pool, "open", fail_open)
        monkeypatch.setattr(resources.pool, "close", close_pool)
        with pytest.raises(OSError, match="startup failure"):
            async with lifetime.http.router.lifespan_context(lifetime.http):
                pytest.fail("A failed pool startup must not yield an application")
        assert pool_closed
        assert resources.saved_state.diagnostics()["backgroundTasks"] == 0
        with pytest.raises(AuthError):
            await resources.passwords.verify("public-fixture", GOLDEN)

    asyncio.run(exercise())


def test_closed_resources_cannot_advertise_a_new_ready_host() -> None:
    async def exercise() -> None:
        resources = ApplicationResources(Configuration(ORIGIN, database_url=DSN))
        await resources.close()
        with pytest.raises(RuntimeError, match="resources are closed"):
            await resources.start()
        assert resources.pool.closed

    asyncio.run(exercise())


@pytest.mark.parametrize("dsn", [" ", "invalid-connection password=private-fixture"])
def test_invalid_database_configuration_never_exposes_supplied_values(dsn: str) -> None:
    with pytest.raises(ValueError) as failed:
        Configuration(ORIGIN, database_url=dsn)
    assert str(failed.value) == "DATABASE_URL must be a valid PostgreSQL connection string"


def test_configuration_repr_redacts_database_url() -> None:
    assert DSN not in repr(Configuration(ORIGIN, database_url=DSN))


@pytest.mark.parametrize("failure", [None, "worker", "storage"])
def test_scan_adapters_close_after_request_cleanup_and_before_pool_even_on_failure(
    monkeypatch: pytest.MonkeyPatch, failure: str | None
) -> None:
    async def scenario() -> None:
        resources = ApplicationResources(Configuration(ORIGIN, database_url=DSN))
        started, cleaning, release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        observed: list[str] = []
        actual_worker_close, actual_storage_close = (
            resources.scan_worker.close,
            resources.scan_storage.close,
        )
        actual_pool_close = resources.pool.close

        async def request() -> None:
            async with resources.admission.request():
                started.set()
                try:
                    await asyncio.Future[None]()
                finally:
                    cleaning.set()
                    await release.wait()
                    observed.append("request")

        async def worker_close() -> None:
            assert resources.admission.active == 0
            await actual_worker_close()
            observed.append("worker")
            if failure == "worker":
                raise RuntimeError("worker close failure")

        async def storage_close() -> None:
            assert resources.admission.active == 0
            await actual_storage_close()
            observed.append("storage")
            if failure == "storage":
                raise RuntimeError("storage close failure")

        async def pool_close(timeout: float = 5.0) -> None:
            observed.append("pool")
            await actual_pool_close(timeout)

        monkeypatch.setattr(resources.scan_worker, "close", worker_close)
        monkeypatch.setattr(resources.scan_storage, "close", storage_close)
        monkeypatch.setattr(resources.pool, "close", pool_close)
        pending = asyncio.create_task(request())
        await asyncio.wait_for(started.wait(), 2)
        close = asyncio.create_task(resources.close())
        try:
            await asyncio.wait_for(cleaning.wait(), 2)
            assert observed == [] and not close.done()
        finally:
            release.set()
        if failure:
            with pytest.raises(RuntimeError, match=f"{failure} close failure"):
                await close
        else:
            await close
            await resources.close()
        await asyncio.gather(pending, return_exceptions=True)
        assert observed == ["request", "worker", "storage", "pool"]
        assert resources.pool.closed and resources.scan_worker._client.is_closed
        assert resources.scan_storage._closed

    asyncio.run(scenario())
