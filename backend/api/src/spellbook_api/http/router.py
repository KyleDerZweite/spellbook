"""Raw-path dispatch and Node-compatible method, authority and response policy."""

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass

from fastapi import FastAPI, Request
from pydantic import AnyHttpUrl, ValidationError
from spellbook_core.auth import SessionAuth
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.auth import require_form_origin, stale_session_cookie
from spellbook_api.http.errors import HttpError, error_response, json_response
from spellbook_api.http.parsing import decode_parameter
from spellbook_api.http.paths import canonical_path
from spellbook_api.http.sse import SavedStateResponse

DISCOVERY_PATHS = {"/openapi.json", "/openapi.json/"}
HOST_BODY_BYTES = 12 * 1024 * 1024

type Handler = Callable[[Request, dict[str, str]], Awaitable[Response]]


@dataclass(frozen=True)
class HttpRoute:
    method: str
    path: str
    handle: Handler


class RawPathRouting:
    """Normalize URL dots, retaining escapes until after literal route matching."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            raw_path: bytes | None = scope.get("raw_path")
            if raw_path is not None:
                try:
                    if not raw_path.startswith(b"/") or raw_path.startswith(b"//"):
                        raise ValueError("Invalid request target")
                    target = AnyHttpUrl("http://candidate.invalid" + raw_path.decode("latin-1"))
                except ValueError, ValidationError:
                    response = error_response(HttpError(400, "Invalid request target"))
                    await response(scope, receive, send)
                    return
                scope = {**scope, "path": target.path or "/"}
        await self.app(scope, receive, send)


def cache_policy(path: str) -> str | None:
    path = canonical_path(path)
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


class RouteRegistry:
    def __init__(
        self,
        routes: list[HttpRoute],
        public_origin: str,
        auth: SessionAuth | None,
        admission: RequestAdmission,
        declared_methods: Mapping[str, tuple[str, ...]] | None = None,
    ) -> None:
        self._routes = sorted(
            routes,
            key=lambda route: (
                tuple(segment.startswith(":") for segment in route.path.split("/")),
                -len(route.path.split("/")),
            ),
        )
        keys = {(route.method, route.path) for route in routes}
        if len(keys) != len(routes):
            raise ValueError("Duplicate HTTP route")
        self._declared = declared_methods or {}
        self._patterns = sorted(
            dict.fromkeys([*self._declared, *(route.path for route in routes)]),
            key=lambda path: (
                tuple(segment.startswith(":") for segment in path.split("/")),
                -len(path.split("/")),
            ),
        )
        self._origin = public_origin
        self._auth = auth
        self._admission = admission

    async def _handle(self, request: Request) -> Response:
        original_path = request.scope["path"]
        path = original_path.removesuffix("/") or "/"
        segments = path.split("/")
        cleanup: str | None = None
        try:
            candidates = [
                pattern
                for pattern in self._patterns
                if len(pattern.split("/")) == len(segments)
                and all(
                    expected.startswith(":") or expected == actual
                    for expected, actual in zip(pattern.split("/"), segments, strict=True)
                )
            ]
            if not candidates:
                raise HttpError(404, "Not Found")
            matches = [route for route in self._routes if route.path == candidates[0]]
            if not matches:
                raise HttpError(404, "Not Found")
            allowed: list[str] = []
            methods = self._declared.get(matches[0].path, tuple(route.method for route in matches))
            for declared in methods:
                allowed.extend(["GET", "HEAD"] if declared == "GET" else [declared])
            allow = ", ".join(dict.fromkeys([*allowed, "OPTIONS"]))
            method = "GET" if request.method == "HEAD" else request.method
            match = next((route for route in matches if route.method == method), None)
            if request.method == "OPTIONS":
                response = Response(status_code=204, headers={"Allow": allow})
            elif match is None and method in methods:
                # An advertised later-slice method has no fabricated business handler.
                raise HttpError(404, "Not Found")
            elif match is None:
                response = json_response(
                    {"message": "Method Not Allowed"}, status=405, headers={"Allow": allow}
                )
            else:
                params: dict[str, str] = {}
                for expected, raw in zip(match.path.split("/"), segments, strict=True):
                    if expected.startswith(":"):
                        decode_parameter(
                            raw
                        )  # Validate early; the handler receives unchanged RAW.
                        params[expected[1:]] = raw
                require_form_origin(request, self._origin, match.path)
                if self._auth is not None:
                    cleanup = await stale_session_cookie(request, self._auth, self._origin)
                response = await match.handle(request, params)
        except Exception as cause:
            response = error_response(cause)
        policy = cache_policy(path)
        if policy:
            response.headers["Cache-Control"] = policy
        if original_path.startswith("/api/"):
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
        if cleanup is not None:
            response.raw_headers.insert(0, (b"set-cookie", cleanup.encode("latin-1")))
        if request.method == "HEAD":
            if isinstance(response, SavedStateResponse):
                await response.close()
            head = Response(status_code=response.status_code)
            head.raw_headers = list(response.raw_headers)
            return head
        return response

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        size = 0
        body_done = asyncio.Event()
        if scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            body_done.set()

        async def bounded_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                # Node's bridge exposes no body for GET/HEAD, including SSE.
                if scope["method"] not in {"GET", "HEAD"}:
                    size += len(message.get("body", b""))
                    if size > HOST_BODY_BYTES:
                        raise HttpError(413, "Request body exceeds the size limit")
                if not message.get("more_body", False):
                    body_done.set()
            return message

        request = Request(scope, bounded_receive)
        # The SSE adapter owns its sole receive consumer, including setup and HEAD close.
        stream = canonical_path(
            scope["path"].removesuffix("/")
        ) == "/api/v1/account/events" and request.method in {
            "GET",
            "HEAD",
        }
        if stream:
            response = await self._handle(request)
            started = complete = False

            async def stream_send(message: Message) -> None:
                nonlocal started, complete
                await send(message)
                if message["type"] == "http.response.start":
                    started = True
                elif message["type"] == "http.response.body" and not message.get(
                    "more_body", False
                ):
                    complete = True

            await response(scope, bounded_receive, stream_send)
            # Pre-drain closure cancels the adapter body task. Finish ASGI framing
            # after its awaited settlement, without another receive consumer.
            if started and not complete:
                await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        async def disconnected() -> None:
            # Body consumption and disconnect observation never read ASGI concurrently.
            await body_done.wait()
            while (await receive())["type"] != "http.disconnect":
                pass

        async def respond() -> None:
            try:
                async with self._admission.request():
                    response = await self._handle(request)
                    await response(scope, bounded_receive, send)
            except HttpError as cause:
                response = error_response(cause)
                policy = cache_policy(scope["path"].removesuffix("/"))
                if policy:
                    response.headers["Cache-Control"] = policy
                if scope["path"].startswith("/api/"):
                    response.headers["X-Robots-Tag"] = "noindex, nofollow"
                if request.method == "HEAD":
                    response.body = b""
                await response(scope, bounded_receive, send)

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


def install_error_handlers(http: FastAPI) -> None:
    async def http_error(request: Request, cause: Exception) -> Response:
        if isinstance(cause, HTTPException):
            return error_response(HttpError(cause.status_code, cause.detail))
        return error_response(cause)

    http.add_exception_handler(HTTPException, http_error)
