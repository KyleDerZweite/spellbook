"""The actual shared registry, including ordering before domain adapters."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor, SessionInfo
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.saved_state import create_saved_state
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message, Scope

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.application import create_http_application
from spellbook_api.http.errors import json_response
from spellbook_api.http.router import HttpRoute, RouteRegistry
from spellbook_api.http.routes_saved_state import SavedStateRoutes, create_saved_state_routes
from spellbook_api.http.types import Configuration

ORIGIN = "https://candidate.example"
ACTOR = Actor("fixture-account", "fixture", "", "grove", "grove")
TOKEN = "a" * 43
PRINTING = "11111111-1111-4111-8111-111111111111"


class Dependencies:
    def __init__(self) -> None:
        self.auth = cast(SessionAuth, create_autospec(SessionAuth, instance=True))
        self.catalog = cast(Catalog, create_autospec(Catalog, instance=True))
        self.inventory = cast(Inventory, create_autospec(Inventory, instance=True))
        self.saved = cast(SavedStateRoutes, create_autospec(SavedStateRoutes, instance=True))
        cast(AsyncMock, self.auth.validate_session).return_value = None
        cast(AsyncMock, self.auth.require_actor).return_value = ACTOR
        cast(AsyncMock, self.auth.inspect_session).return_value = SessionInfo(
            ACTOR, "2099-01-01T00:00:00.000Z"
        )
        cast(AsyncMock, self.catalog.get_catalog_printing).return_value = {"id": PRINTING}
        cast(AsyncMock, self.inventory.get_entry).return_value = {"entryId": PRINTING}
        cast(AsyncMock, self.inventory.add_items).return_value = {"revision": "1"}
        cast(AsyncMock, self.saved.handle).return_value = Response("stub-stream")

    def application(self) -> FastAPI:
        return create_http_application(
            Configuration(ORIGIN),
            auth=self.auth,
            catalog=self.catalog,
            inventory=self.inventory,
            saved_routes=self.saved,
        )


@pytest.mark.parametrize("method", ["GET", "HEAD", "POST", "OPTIONS"])
@pytest.mark.parametrize("segment", ["%", "%GG", "%C3%28", "%ED%A0%80"])
def test_bad_named_encoding_precedes_cookie_sql_but_not_method_selection(
    method: str,
    segment: str,
) -> None:
    d = Dependencies()
    with TestClient(d.application()) as client:
        response = client.request(
            method,
            f"/api/catalog/printings/{segment}",
            headers={"Cookie": "spellbook_session=" + TOKEN},
        )
    if method in {"GET", "HEAD"}:
        assert response.status_code == 400
        if method == "GET":
            assert response.json() == {"message": "Invalid path encoding", "status": 400}
    elif method == "OPTIONS":
        assert response.status_code == 204
    else:
        assert response.status_code == 405
        assert response.json() == {"message": "Method Not Allowed"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    cast(AsyncMock, d.auth.validate_session).assert_not_awaited()
    cast(AsyncMock, d.catalog.get_catalog_printing).assert_not_awaited()


@pytest.mark.parametrize("segment", ["%2520", "%2F", "%252F"])
def test_named_segments_reach_adapters_as_original_raw_values(segment: str) -> None:
    d = Dependencies()
    with TestClient(d.application()) as client:
        response = client.get(f"/api/catalog/printings/{segment}")
    assert response.status_code == 400
    assert response.json()["message"] == "printingId must be a UUID"

    # A double-decoded space would have been trimmed by require_uuid; prove the RAW port directly.
    async def exercise() -> None:
        observed: list[str] = []

        async def handler(request: Request, params: dict[str, str]) -> Response:
            observed.append(params["id"])
            return json_response({})

        registry = RouteRegistry(
            [HttpRoute("GET", "/raw/:id", handler)], ORIGIN, None, RequestAdmission()
        )
        request = Request(
            {"type": "http", "method": "GET", "path": "/raw/" + segment, "headers": []}
        )
        assert (await registry._handle(request)).status_code == 200
        assert observed == [segment]

    asyncio.run(exercise())


@pytest.mark.parametrize("prefix", ["/%61pi", "/api%2Fcatalog", "/api/catalog%2Fprintings"])
def test_encoded_literals_never_alias_registered_routes(prefix: str) -> None:
    with TestClient(Dependencies().application()) as client:
        assert client.get(prefix + "/" + PRINTING).status_code == 404


def test_form_origin_precedes_cookie_and_cookie_cleanup_precedes_handler_cookie() -> None:
    d = Dependencies()
    with TestClient(d.application()) as client:
        response = client.post(
            "/api/mobile/v1/mtg/inventory",
            content="bad form",
            headers={"content-type": "text/plain", "cookie": "spellbook_session=" + TOKEN},
        )
    assert response.status_code == 403
    cast(AsyncMock, d.auth.validate_session).assert_not_awaited()
    assert "cache-control" not in response.headers

    async def exercise() -> None:
        async def replace(request: Request, params: dict[str, str]) -> Response:
            response = json_response({})
            response.raw_headers.extend(
                [(b"set-cookie", b"spellbook_session=replacement"), (b"set-cookie", b"qr=cleanup")]
            )
            return response

        registry = RouteRegistry(
            [HttpRoute("GET", "/api/auth/session", replace)], ORIGIN, d.auth, RequestAdmission()
        )
        response = await registry._handle(
            Request(
                {
                    "type": "http",
                    "method": "GET",
                    "path": "/api/auth/session",
                    "headers": [
                        (b"cookie", ("spellbook_session=" + TOKEN).encode()),
                        (b"authorization", b"Bearer invalid"),
                    ],
                }
            )
        )
        assert response.headers.getlist("set-cookie") == [
            "spellbook_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
            "spellbook_session=replacement",
            "qr=cleanup",
        ]

    asyncio.run(exercise())


@pytest.mark.parametrize(
    "path,allow",
    [
        ("/api/auth/session", "GET, HEAD, OPTIONS"),
        ("/api/catalog/printings/" + PRINTING, "GET, HEAD, OPTIONS"),
        ("/api/mobile/v1/mtg/inventory", "GET, HEAD, POST, OPTIONS"),
        ("/api/mobile/v1/mtg/inventory/" + PRINTING, "GET, HEAD, PATCH, DELETE, OPTIONS"),
        ("/api/account/events", "GET, HEAD, OPTIONS"),
    ],
)
def test_trailing_slash_options_and_special_405_do_no_cookie_or_auth_work(
    path: str, allow: str
) -> None:
    d = Dependencies()
    with TestClient(d.application()) as client:
        for suffix in ["", "/"]:
            response = client.options(
                path + suffix, headers={"cookie": "spellbook_session=" + TOKEN}
            )
            assert response.status_code == 204 and response.headers["allow"] == allow
            response = client.request(
                "TRACE", path + suffix, headers={"cookie": "spellbook_session=" + TOKEN}
            )
            assert response.status_code == 405 and response.headers["allow"] == allow
            assert response.json() == {"message": "Method Not Allowed"}
            assert response.headers["x-robots-tag"] == "noindex, nofollow"
    cast(AsyncMock, d.auth.validate_session).assert_not_awaited()


def test_duplicate_authorization_suppresses_cookie_and_failure_privacy_is_endpoint_specific() -> (
    None
):
    d = Dependencies()
    with TestClient(d.application()) as client:
        for path in ["/api/auth/session", "/api/mobile/v1/mtg/inventory/" + PRINTING]:
            response = client.get(
                path,
                headers=[
                    ("Authorization", "Bearer " + TOKEN),
                    ("Authorization", "Bearer " + TOKEN),
                    ("Cookie", "spellbook_session=" + TOKEN),
                ],
            )
            assert response.status_code == 401
            assert response.json()["message"] == "Invalid bearer token"
            assert ("cache-control" in response.headers) is path.startswith("/api/auth/")
            assert response.headers.get_list("set-cookie")[0].startswith("spellbook_session=;")


def test_body_framing_media_utf8_json_and_inner_limit_use_the_shared_host() -> None:
    d = Dependencies()
    cast(AsyncMock, d.auth.validate_session).return_value = ACTOR
    cases = [
        (b"", "application/json", 400, "A request body is required"),
        (b"{}", "text/plain", 415, "Use application/json"),
        (b"\xff", "application/json", 400, "Invalid JSON body"),
        (b"[1]", "application/json", 400, "A JSON object is required"),
        (
            b"{" + b" " * (1024 * 1024),
            "application/json",
            413,
            "Request body exceeds the size limit",
        ),
    ]
    with TestClient(d.application()) as client:
        for body, media, status, message in cases:
            response = client.post(
                "/api/mobile/v1/mtg/inventory",
                content=body,
                headers={
                    "Authorization": "Bearer " + TOKEN,
                    "Origin": ORIGIN,
                    "Content-Type": media,
                },
            )
            assert response.status_code == status
            assert response.json()["message"] == message
            assert "cache-control" not in response.headers
    cast(AsyncMock, d.inventory.add_items).assert_not_awaited()


@pytest.mark.parametrize("path", ["/api/account/events", "/api/v1/account/events"])
def test_sse_head_closes_real_subscription_and_has_only_one_receive_consumer(path: str) -> None:
    async def exercise() -> None:
        d = Dependencies()
        cast(AsyncMock, d.auth.validate_session).return_value = ACTOR
        cast(AsyncMock, d.auth.actor_session).return_value = SessionInfo(
            ACTOR, (datetime.now(UTC) + timedelta(hours=1)).isoformat()
        )
        barriers: list[asyncio.Task[bool]] = []

        def ensure() -> None:
            if saved.listener_starting(1):
                barriers.append(asyncio.create_task(saved.listener_ready(1)))

        saved = create_saved_state(
            d.auth, ensure_listener=ensure, request_listener_recovery=lambda g, r: None
        )
        saved.start()
        routes = create_saved_state_routes(d.auth, saved, ORIGIN)
        app = create_http_application(
            Configuration(ORIGIN),
            auth=d.auth,
            catalog=d.catalog,
            inventory=d.inventory,
            saved_routes=routes,
        )
        reading = 0

        async def receive() -> Message:
            nonlocal reading
            reading += 1
            assert reading == 1
            try:
                await asyncio.Future[None]()
                return {"type": "http.disconnect"}
            finally:
                reading -= 1

        messages: list[Message] = []

        async def send(message: Message) -> None:
            messages.append(message)

        scope: Scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "HEAD",
            "scheme": "https",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [(b"authorization", ("Bearer " + TOKEN).encode())],
            "server": ("candidate.example", 443),
            "client": ("127.0.0.1", 1234),
        }
        try:
            await app(scope, receive, send)
            assert messages[0]["status"] == 200
            assert messages[-1].get("body") == b""
            assert saved.diagnostics()["subscribers"] == 0
            assert saved.diagnostics()["heldSubscriptions"] == 0
            assert reading == 0
        finally:
            await routes.close_streams()
            await asyncio.gather(*barriers)
            await saved.close()

    asyncio.run(exercise())


def test_declared_literal_routes_do_not_fall_through_to_an_entry_parameter() -> None:
    d = Dependencies()
    with TestClient(d.application()) as client:
        response = client.get(
            "/api/mobile/v1/mtg/inventory/groups", headers={"Cookie": "spellbook_session=" + TOKEN}
        )
        assert response.status_code == 401
        response = client.get(
            "/api/mobile/v1/mtg/inventory/value", headers={"Cookie": "spellbook_session=" + TOKEN}
        )
        assert response.status_code == 404
        assert response.json()["message"] == "Not Found"
    cast(AsyncMock, d.inventory.get_entry).assert_not_awaited()


def test_actual_host_fetch_method_rejection_is_separate_from_router_405() -> None:
    from spellbook_api.main import HostRequestPolicy

    app = create_http_application(Configuration(ORIGIN))
    with TestClient(HostRequestPolicy(app)) as client:
        for method in ["TRACE"]:
            response = client.request(method, "/openapi.json")
            assert response.status_code == 500
            assert response.json() == {"status": 500, "message": "Internal Server Error"}
            assert "allow" not in response.headers and "x-robots-tag" not in response.headers
        for method in ["TRACK", "UNKNOWN"]:
            rejected = client.request(method, "/openapi.json")
            assert rejected.status_code == 400 and rejected.content == b""
        response = client.request("PUT", "/openapi.json")
        assert response.status_code == 405
        assert response.json() == {"message": "Method Not Allowed"}


def test_outer_host_cap_is_distinct_from_the_inner_json_decoder() -> None:
    from starlette.routing import Route

    from spellbook_api.http.router import HOST_BODY_BYTES

    async def consume(request: Request, params: dict[str, str]) -> Response:
        await request.body()
        return json_response({})

    registry = RouteRegistry(
        [HttpRoute("POST", "/api/body", consume)], ORIGIN, None, RequestAdmission()
    )
    app = FastAPI()
    app.router.routes.append(Route("/{path:path}", registry))
    with TestClient(app) as client:
        response = client.post(
            "/api/body", content=b"x" * (HOST_BODY_BYTES + 1), headers={"Origin": ORIGIN}
        )
        assert response.status_code == 413
        assert response.json() == {"message": "Request body exceeds the size limit", "status": 413}
