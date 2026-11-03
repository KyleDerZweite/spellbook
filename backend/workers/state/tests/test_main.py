"""State process composition and cancellation without database or service access."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock

import pytest

from spellbook_state import main as module
from spellbook_state.main import Configuration, StateResources

DSN = "postgresql://fixture/unused"


@pytest.mark.parametrize("key", ["VALUE_HISTORY_ENABLED", "DEMO_MODE"])
def test_switches_reject_invalid_values(key: str) -> None:
    with pytest.raises(ValueError, match=key):
        Configuration.from_environment({"DATABASE_URL": DSN, key: "yes"})


def test_configuration_keeps_calendar_flags_and_secrets_private() -> None:
    config = Configuration.from_environment(
        {
            "DATABASE_URL": DSN,
            "VALUE_HISTORY_ENABLED": "false",
            "VALUE_HISTORY_TIMEZONE": " UTC ",
        }
    )
    assert not config.value_history_enabled
    assert config.value_history_timezone == "UTC" and DSN not in repr(config)
    with pytest.raises(ValueError, match="IANA"):
        Configuration(DSN, value_history_timezone="invalid-zone")
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Configuration("invalid password=synthetic-secret")


@pytest.mark.parametrize("enabled", [True, False])
def test_start_owns_history_scheduler_and_close_joins_it_before_pool(
    monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    async def scenario() -> None:
        resources = StateResources(Configuration(DSN, enabled, "UTC"))
        assert resources.values.timezone == "UTC"
        assert resources.values.valuation is resources.valuation
        observed: list[str] = []
        history_start = Mock()
        monkeypatch.setattr(resources.history, "start", history_start)
        monkeypatch.setattr(resources.pool, "open", AsyncMock())

        @asynccontextmanager
        async def connection(timeout: float | None = None) -> AsyncIterator[None]:
            yield None

        monkeypatch.setattr(resources.pool, "connection", connection)
        await resources.start()
        await resources.start()
        assert history_start.call_count == int(enabled)
        entered, release = asyncio.Event(), asyncio.Event()

        async def history_close() -> None:
            entered.set()
            await release.wait()
            observed.append("history")
            raise RuntimeError("history cleanup failure")

        actual_pool_close = resources.pool.close

        async def pool_close(timeout: float = 5.0) -> None:
            assert observed == ["history"]
            observed.append("pool")
            await actual_pool_close(timeout)

        monkeypatch.setattr(resources.history, "close", history_close)
        monkeypatch.setattr(resources.pool, "close", pool_close)
        close = asyncio.create_task(resources.close())
        await asyncio.wait_for(entered.wait(), 1)
        close.cancel()
        with pytest.raises(asyncio.CancelledError):
            await close
        assert "pool" not in observed
        release.set()
        with pytest.raises(RuntimeError, match="history cleanup failure"):
            await resources.close()
        assert observed[-1] == "pool" and resources.pool.closed
        with pytest.raises(RuntimeError, match="closed"):
            await resources.start()

    asyncio.run(scenario())


def test_startup_failure_still_closes_runner_and_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    async def scenario() -> None:
        resources = StateResources(Configuration(DSN))
        monkeypatch.setattr(module, "StateResources", lambda config: resources)
        monkeypatch.setattr(resources.pool, "open", AsyncMock(side_effect=OSError("unavailable")))
        with pytest.raises(OSError):
            await module.serve(Configuration(DSN), asyncio.Event())
        assert resources.pool.closed
        assert resources.history._closed

    asyncio.run(scenario())


def test_runtime_driver_errors_never_print_secrets(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("DATABASE_URL", DSN)
    monkeypatch.setattr(module, "_run", AsyncMock(side_effect=ValueError("synthetic-secret")))
    assert module.main([]) == 1
    output = capsys.readouterr()
    assert "synthetic-secret" not in output.out + output.err + caplog.text


def test_demo_configuration_reaches_the_same_valuation_provider() -> None:
    config = Configuration.from_environment({"DATABASE_URL": DSN, "DEMO_MODE": "true"})
    assert StateResources(config).valuation.demo_mode
    assert not StateResources(Configuration(DSN)).valuation.demo_mode
