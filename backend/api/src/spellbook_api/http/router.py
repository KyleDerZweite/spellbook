"""Compatibility behavior for the routes implemented by this dormant slice."""

from fastapi import FastAPI, Request
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response

DISCOVERY_PATHS = {"/openapi.json", "/openapi.json/"}


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
