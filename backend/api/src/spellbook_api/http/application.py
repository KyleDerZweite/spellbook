"""Discovery is the only registered route. Business adapters remain unimplemented."""

import json
from importlib.resources import files
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse, Response

from spellbook_api.http.router import DISCOVERY_PATHS, RawPathRouting, install_error_handlers
from spellbook_api.http.types import Configuration


def create_http_application(configuration: Configuration) -> FastAPI:
    resource = files("spellbook_api").joinpath("openapi.json")
    # Editable installs read the same owner directly; distributions bundle it at build time.
    schema_text = (
        resource.read_text(encoding="utf-8")
        if resource.is_file()
        else (Path(__file__).resolve().parents[5] / "contracts/openapi.json").read_text(
            encoding="utf-8"
        )
    )
    schema = json.loads(schema_text)
    schema["servers"] = [{"url": configuration.public_origin}]
    http = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, redirect_slashes=False)
    http.add_middleware(RawPathRouting)
    install_error_handlers(http)

    async def discovery(request: Request) -> Response:
        if request.method == "OPTIONS":
            return Response(status_code=204, headers={"Allow": "GET, HEAD, OPTIONS"})
        response = JSONResponse(schema, headers={"Cache-Control": "public, max-age=3600"})
        if request.method == "HEAD":
            response.body = b""
        return response

    for path in sorted(DISCOVERY_PATHS):
        http.add_api_route(
            path, discovery, methods=["GET", "HEAD", "OPTIONS"], include_in_schema=False
        )
    return http
