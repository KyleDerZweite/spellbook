"""Host ownership of real native futures and private opt-in instrumentation."""

import asyncio
import os
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import pytest
from spellbook_core import passwords as password_module
from spellbook_core.errors import AuthError

from spellbook_api.application import ApplicationResources, create_application
from spellbook_api.http.types import Configuration
from spellbook_api.verification import VerificationPlan, VerificationReport

ORIGIN = "http://127.0.0.1:5173"
DSN = "postgresql://localhost/unused-fixture"
GOLDEN = (
    "scrypt$0123456789abcdef0123456789abcdef$"
    "815f0e9978809b56ee3dc01448c0fc369bed6caa319a62aee3f98c6794493b3dec76ff0"
    "40562378f160e683d9d181b36bfebc22d97031d754bffd9d8de1825db"
)


def test_private_plan_has_no_environment_or_public_route_switch() -> None:
    config = Configuration.from_environment({"APP_ORIGIN": ORIGIN, "VERIFICATION_PLAN": "true"})
    assert config.database_url is None
    with pytest.raises(ValueError, match="both plan and sink"):
        create_application(config, verification_plan=VerificationPlan())
    with pytest.raises(ValueError, match="actual database-backed host"):
        create_application(
            config, verification_plan=VerificationPlan(), verification_sink=lambda r: None
        )
    assert DSN not in repr(Configuration(ORIGIN, database_url=DSN))


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
        resources = ApplicationResources(Configuration(ORIGIN, database_url=DSN), None, None)
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


def test_private_hook_runs_in_host_process_and_stops_before_native_pool_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        reports: list[VerificationReport] = []
        lifetime = create_application(
            Configuration(ORIGIN, database_url=DSN),
            verification_plan=VerificationPlan(concurrent_scrypt=True),
            verification_sink=reports.append,
        )
        resources = cast(ApplicationResources, lifetime.http.state.resources)

        async def pool_open(wait: bool = False, timeout: float = 30.0) -> None:
            pass

        @asynccontextmanager
        async def connection(timeout: float | None = None) -> AsyncIterator[None]:
            yield None

        monkeypatch.setattr(resources.pool, "open", pool_open)
        monkeypatch.setattr(resources.pool, "connection", connection)
        async with lifetime.http.router.lifespan_context(lifetime.http):
            async with asyncio.timeout(2):
                while resources.passwords.diagnostics().active != 4:
                    await asyncio.sleep(0.005)
            await asyncio.sleep(0.03)
            await lifetime.close_streams()
        assert len(reports) == 1 and reports[0].interrupted
        assert reports[0].pid == os.getpid() and reports[0].active_max == 4
        assert reports[0].lag_observations > 0
        assert resources.passwords.diagnostics().active == 0
        assert all(t.name.startswith("spellbook-scrypt") is False for t in threading.enumerate())

    asyncio.run(exercise())


def test_closed_resources_cannot_advertise_a_new_ready_host() -> None:
    async def exercise() -> None:
        resources = ApplicationResources(Configuration(ORIGIN, database_url=DSN), None, None)
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
