"""HTTP-only proxy fixture using the installed Python host, parser and registry.

The fixture has no domain or database behavior. Browser/API application acceptance
remains in the guarded HTTP suites.
"""

import asyncio
import os
from collections.abc import AsyncIterator

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

from spellbook_api.http.auth import client_address
from spellbook_api.http.errors import json_response
from spellbook_api.http.parsing import read_json_object
from spellbook_api.http.policy import configure_http
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.main import CandidateServer


async def main() -> None:
    stop = asyncio.Event()

    async def headers(request: Request) -> Response:
        response = json_response(
            {
                "headers": dict(request.headers),
                "clientAddress": client_address(request, ("127.0.0.1",)),
            },
            status=201,
            headers={"cache-control": "no-store"},
        )
        response.raw_headers.extend(
            [
                (b"set-cookie", b"one=test; Path=/; HttpOnly"),
                (
                    b"set-cookie",
                    b"two=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/api; HttpOnly",
                ),
            ]
        )
        return response

    async def events(request: Request) -> StreamingResponse:
        async def stream() -> AsyncIterator[bytes]:
            try:
                yield b"event: reset\ndata: {}\n\n"
                await stop.wait()
            finally:
                print("stream-cancelled", flush=True)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "cache-control": "no-store",
                "x-accel-buffering": "no",
            },
        )

    async def upload(request: Request) -> Response:
        aborted = request.url.path.endswith("upload-abort")
        if aborted:
            print("upload-started", flush=True)
        try:
            await read_json_object(request)
            return json_response({"ok": True})
        finally:
            if aborted:
                print("upload-aborted", flush=True)

    app = FastAPI()
    configure_http(app, "http://localhost:5173")
    app.add_api_route("/api/proxy-test/headers", headers, methods=["GET"])
    app.add_api_route("/api/proxy-test/events", events, methods=["GET"])
    app.add_api_route("/api/proxy-test/upload-abort", upload, methods=["POST"])
    app.add_api_route("/api/v1/mtg/commands", upload, methods=["POST"])

    async def close() -> None:
        stop.set()

    server = CandidateServer(
        ApplicationLifetime(app, close, close),
        Configuration("http://localhost:5173", port=int(os.environ["API_PORT"])),
    )
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
