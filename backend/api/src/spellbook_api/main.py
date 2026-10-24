"""Explicit candidate entrypoint with pre-drain stream shutdown."""

import asyncio
import os
import socket

import uvicorn

from spellbook_api.application import create_application
from spellbook_api.http.types import ApplicationLifetime, Configuration


class CandidateServer(uvicorn.Server):
    def __init__(self, lifetime: ApplicationLifetime, configuration: Configuration) -> None:
        self.lifetime = lifetime
        self.shutdown_started = False
        super().__init__(
            uvicorn.Config(
                lifetime.http,
                host=configuration.host,
                port=configuration.port,
                workers=1,
                http="h11",
                proxy_headers=False,
                server_header=False,
                timeout_graceful_shutdown=15,
            )
        )

    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        self.shutdown_started = True
        # Lifespan teardown happens after Uvicorn's drain and cannot close SSE first.
        async with asyncio.timeout(15):
            try:
                await self.lifetime.close_streams()
            finally:
                try:
                    await super().shutdown(sockets)
                finally:
                    await self.lifetime.close()


async def serve(configuration: Configuration) -> None:
    lifetime = create_application(configuration)
    server: CandidateServer | None = None
    try:
        server = CandidateServer(lifetime, configuration)
        await server.serve()
        if not server.started:
            raise RuntimeError("API startup failed before listening")
    finally:
        # Also release resources when startup fails before Uvicorn calls shutdown.
        if server is None or not server.shutdown_started:
            async with asyncio.timeout(15):
                await lifetime.close()


def main() -> None:
    configuration = Configuration.from_environment(os.environ)
    if configuration.database_url is None and os.environ.get("API_DISCOVERY_ONLY") != "true":
        raise ValueError(
            "DATABASE_URL is required; API_DISCOVERY_ONLY=true enables schema-only mode"
        )
    asyncio.run(serve(configuration))


if __name__ == "__main__":
    main()
