"""Request admission, byte limits and response policy around native routing."""

import asyncio

from fastapi import Depends, FastAPI, Request
from spellbook_core.auth import SessionAuth
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.auth import require_form_origin, stale_session_cookie
from spellbook_api.http.errors import HttpError, error_response, install_error_handlers
from spellbook_api.http.parsing import header

HOST_BODY_BYTES = 12 * 1024 * 1024


def cache_policy(path: str) -> str | None:
    if path in {
        "/api/v1/mtg/inventory/value",
        "/api/v1/mtg/inventory/value-history",
    }:
        return "private, no-store"
    if path in {"/api/v1/web", "/api/v1/mtg/dashboard", "/api/v1/mtg/commands"} or path.startswith(
        (
            "/api/v1/auth/",
            "/api/v1/account/",
            "/api/v1/web/",
            "/api/v1/mtg/catalog/printings/",
        )
    ):
        return "no-store"
    return None


def response_policy(path: str, response: Response) -> None:
    if policy := cache_policy(path):
        response.headers["Cache-Control"] = policy
    if path.startswith("/api/"):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"


def configure_http(
    http: FastAPI,
    origin: str,
    auth: SessionAuth | None = None,
    admission: RequestAdmission | None = None,
) -> None:
    http.router.redirect_slashes = False
    install_error_handlers(http)
    http.add_middleware(RequestPolicy, admission=admission or RequestAdmission())

    async def authority(request: Request) -> None:
        for name in ("authorization", "origin", "content-type"):
            header(request, name)
        route = request.scope.get("route")
        require_form_origin(request, origin, getattr(route, "path", ""))
        if auth is not None:
            request.state.cleanup_cookie = await stale_session_cookie(request, auth, origin)

    http.router.dependencies.append(Depends(authority))


class RequestPolicy:
    def __init__(self, app: ASGIApp, admission: RequestAdmission) -> None:
        self.app = app
        self.admission = admission

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        size = 0
        body_done = asyncio.Event()
        if scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            body_done.set()

        async def bounded_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > HOST_BODY_BYTES:
                    raise HttpError(413, "Request body exceeds the size limit")
                if not message.get("more_body", False):
                    body_done.set()
            return message

        async def policy_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                response = Response()
                response.raw_headers = list(message["headers"])
                response_policy(scope["path"], response)
                cleanup = scope.get("state", {}).get("cleanup_cookie")
                if cleanup:
                    response.raw_headers.insert(0, (b"set-cookie", cleanup.encode("latin-1")))
                message = {**message, "headers": response.raw_headers}
            await send(message)

        # The SSE response alone observes its receive channel, including setup.
        if scope["path"] == "/api/v1/account/events" and scope["method"] == "GET":
            await self.app(scope, bounded_receive, policy_send)
            return

        async def respond() -> None:
            try:
                async with self.admission.request():
                    await self.app(scope, bounded_receive, policy_send)
            except HttpError as cause:
                await error_response(cause)(scope, bounded_receive, policy_send)

        async def disconnected() -> None:
            await body_done.wait()
            while (await receive())["type"] != "http.disconnect":
                pass

        handler = asyncio.create_task(respond(), name="http-request")
        watcher = asyncio.create_task(disconnected(), name="http-disconnect")
        try:
            done, _ = await asyncio.wait({handler, watcher}, return_when=asyncio.FIRST_COMPLETED)
            if handler in done:
                await handler
        finally:
            for task in (handler, watcher):
                if not task.done():
                    task.cancel()
            await asyncio.gather(handler, watcher, return_exceptions=True)
