"""Compatibility behavior for the routes implemented by this dormant slice."""

from fastapi import FastAPI, Request
from pydantic import AnyHttpUrl
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

DISCOVERY_PATHS = {"/openapi.json", "/openapi.json/"}


class RawPathRouting:
    """Match literal URI segments before adapters decode named parameters.

    Uvicorn supplies raw_path without a query string. Its decoded path would
    otherwise admit encoded aliases or change named-segment boundaries.
    This ASGI wrapper forwards streams directly, without tasks or prefetch.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            raw_path: bytes | None = scope.get("raw_path")
            if raw_path is not None:
                if not raw_path.startswith(b"/") or raw_path.startswith(b"//"):
                    response = JSONResponse(
                        {"message": "Invalid request target", "status": 400}, status_code=400
                    )
                    await response(scope, receive, send)
                    return
                # Node normalizes dot segments through URL before matching, but
                # keeps percent escapes in literal segments until after matching.
                target = AnyHttpUrl("http://candidate.invalid" + raw_path.decode("latin-1"))
                scope = {**scope, "path": target.path or "/"}
        await self.app(scope, receive, send)


def install_error_handlers(http: FastAPI) -> None:
    async def http_error(request: Request, cause: Exception) -> Response:
        if not isinstance(cause, HTTPException):
            raise cause
        if cause.status_code == 405:
            headers = (
                {"Allow": "GET, HEAD, OPTIONS"} if request.url.path in DISCOVERY_PATHS else {}
            )
            return JSONResponse(
                {"message": "Method Not Allowed"}, status_code=405, headers=headers
            )
        return JSONResponse(
            {"status": cause.status_code, "message": cause.detail}, status_code=cause.status_code
        )

    http.add_exception_handler(HTTPException, http_error)
