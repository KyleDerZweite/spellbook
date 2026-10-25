import asyncio
import socket

import pytest
import uvicorn
from fastapi import FastAPI

from spellbook_api import main
from spellbook_api.application import create_application
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.main import CandidateServer


@pytest.mark.parametrize("fail", [False, True])
def test_streams_close_before_uvicorn_drain_and_resources_afterward(
    monkeypatch: pytest.MonkeyPatch, fail: bool
) -> None:
    observed: list[str] = []

    async def close_streams() -> None:
        observed.append("streams")

    async def close() -> None:
        observed.append("resources")

    async def drain(self: uvicorn.Server, sockets: list[socket.socket] | None = None) -> None:
        observed.append("drain")
        if fail:
            raise RuntimeError("test drain failure")

    monkeypatch.setattr(uvicorn.Server, "shutdown", drain)
    server = CandidateServer(
        ApplicationLifetime(FastAPI(), close_streams, close),
        Configuration("http://localhost:5173"),
    )
    if fail:
        with pytest.raises(RuntimeError, match="test drain failure"):
            asyncio.run(server.shutdown())
    else:
        asyncio.run(server.shutdown())
    assert observed == ["streams", "drain", "resources"]
    assert server.config.workers == 1
    assert server.config.proxy_headers is False


def test_discovery_lifetime_is_safe_to_close_repeatedly_before_start() -> None:
    async def exercise() -> None:
        lifetime = create_application(Configuration("http://localhost:5173"))
        await lifetime.close_streams()
        await lifetime.close()
        await lifetime.close()

    asyncio.run(exercise())


def test_startup_failure_closes_owned_resources(monkeypatch: pytest.MonkeyPatch) -> None:
    observed: list[str] = []

    async def close_streams() -> None:
        observed.append("streams")

    async def close() -> None:
        observed.append("resources")

    async def fail_start(self: uvicorn.Server, sockets: list[socket.socket] | None = None) -> None:
        raise RuntimeError("test startup failure")

    lifetime = ApplicationLifetime(FastAPI(), close_streams, close)
    monkeypatch.setattr(main, "create_application", lambda configuration: lifetime)
    monkeypatch.setattr(uvicorn.Server, "serve", fail_start)
    with pytest.raises(RuntimeError, match="test startup failure"):
        asyncio.run(main.serve(Configuration("http://localhost:5173")))
    assert observed == ["resources"]


def test_default_entrypoint_rejects_missing_database_before_resource_construction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ORIGIN", "http://localhost:5173")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("API_DISCOVERY_ONLY", raising=False)
    with pytest.raises(ValueError, match="DATABASE_URL is required"):
        main.main()


def test_uvicorn_lifespan_failure_is_a_failed_entrypoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: list[str] = []

    async def close() -> None:
        observed.append("closed")

    async def startup_refused(self: uvicorn.Server) -> None:
        # Uvicorn reports a failed lifespan by returning without setting started.
        assert not self.started

    monkeypatch.setattr(
        main,
        "create_application",
        lambda configuration: ApplicationLifetime(FastAPI(), close, close),
    )
    monkeypatch.setattr(uvicorn.Server, "serve", startup_refused)
    with pytest.raises(RuntimeError, match="startup failed before listening"):
        asyncio.run(main.serve(Configuration("http://localhost:5173")))
    assert observed == ["closed"]
