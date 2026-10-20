"""Explicit candidate entrypoint with pre-drain stream shutdown."""

import asyncio
import os
import socket
from collections.abc import Callable

import uvicorn
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send
from uvicorn.protocols.http.h11_impl import H11Protocol

from spellbook_api.application import create_application
from spellbook_api.http.errors import HttpError, error_response
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.verification import VerificationPlan, VerificationReport

# Frozen from the retained Node 26.10.0 HTTP parser. Router support is separate.
NODE_HTTP_METHODS = frozenset(
    [
        "ACL",
        "BIND",
        "CHECKOUT",
        "CONNECT",
        "COPY",
        "DELETE",
        "GET",
        "HEAD",
        "LINK",
        "LOCK",
        "M-SEARCH",
        "MERGE",
        "MKACTIVITY",
        "MKCALENDAR",
        "MKCOL",
        "MOVE",
        "NOTIFY",
        "OPTIONS",
        "PATCH",
        "POST",
        "PROPFIND",
        "PROPPATCH",
        "PURGE",
        "PUT",
        "QUERY",
        "REBIND",
        "REPORT",
        "SEARCH",
        "SOURCE",
        "SUBSCRIBE",
        "TRACE",
        "UNBIND",
        "UNLINK",
        "UNLOCK",
        "UNSUBSCRIBE",
    ]
)


class HostRequestPolicy:
    """Retain failures in Node's HTTP-to-Fetch bridge before router dispatch."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in NODE_HTTP_METHODS:
            await Response(status_code=400, headers={"Connection": "close"})(scope, receive, send)
            return
        if scope["type"] == "http" and scope["method"] == "TRACE":
            target = scope.get("raw_path", scope["path"].encode())
            cause = (
                HttpError(400, "Invalid request target")
                if not target.startswith(b"/") or target.startswith(b"//")
                else HttpError(500, "Internal Server Error")
            )
            await error_response(cause)(scope, receive, send)
            return
        await self.app(scope, receive, send)


class NodeHTTPProtocol(H11Protocol):
    """Close unsupported tunnels before ASGI, as Node without a connect listener does."""

    def _should_upgrade(self) -> bool:
        # Uvicorn 0.54.0 calls this after parsing each request, before creating
        # its response cycle. CONNECT must produce no response, including on
        # fragmented and keep-alive requests. ASGI cannot express that close.
        if self.scope["method"] == "CONNECT":
            self.transport.close()
            return True
        return super()._should_upgrade()


class CandidateServer(uvicorn.Server):
    def __init__(self, lifetime: ApplicationLifetime, configuration: Configuration) -> None:
        self.lifetime = lifetime
        self.shutdown_started = False
        super().__init__(
            uvicorn.Config(
                HostRequestPolicy(lifetime.http),
                host=configuration.host,
                port=configuration.port,
                workers=1,
                http=NodeHTTPProtocol,
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


async def serve(
    configuration: Configuration,
    *,
    verification_plan: VerificationPlan | None = None,
    verification_sink: Callable[[VerificationReport], None] | None = None,
) -> None:
    lifetime = (
        create_application(configuration)
        if verification_plan is None and verification_sink is None
        else create_application(
            configuration, verification_plan=verification_plan, verification_sink=verification_sink
        )
    )
    server: CandidateServer | None = None
    try:
        server = CandidateServer(lifetime, configuration)
        await server.serve()
    finally:
        # Also release resources when startup fails before Uvicorn calls shutdown.
        if server is None or not server.shutdown_started:
            async with asyncio.timeout(15):
                await lifetime.close()


def main() -> None:
    asyncio.run(serve(Configuration.from_environment(os.environ)))


if __name__ == "__main__":
    main()
