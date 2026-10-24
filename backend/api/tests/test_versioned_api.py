"""Current API contracts at the production HTTP registry boundary.

Application doubles verify adapter policy, not PostgreSQL or client integration.
"""

import asyncio
import json
import re
from pathlib import Path
from typing import cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from fastapi.testclient import TestClient
from spellbook_core.auth import TokenSession
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.qr import Redemption
from starlette.routing import Route
from test_auth_account import ACTOR, CODE, EXPIRES, ORIGIN, SECRET, TOKEN, Dependencies

from spellbook_api.application import create_application
from spellbook_api.http.application import create_http_application
from spellbook_api.http.router import HttpRoute, RouteRegistry
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import Configuration

PRINTING = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize("method", ["GET", "POST", "OPTIONS"])
@pytest.mark.parametrize(
    "path",
    [
        "/api/auth/session",
        "/api/auth/login",
        "/api/auth/qr/requests",
        "/api/auth/qr/token",
        "/api/account/profile",
        "/api/account/dashboard",
        "/api/account/events",
        "/api/catalog/search",
        "/api/catalog/printings/" + PRINTING,
        "/api/mobile/v1/mtg/search",
        "/api/mobile/v1/mtg/cards/" + PRINTING + "/printings",
        "/api/mobile/v1/mtg/inventory",
        "/api/mobile/v1/mtg/inventory/value",
        "/api/mobile/v1/mtg/decks",
        "/api/mobile/v1/mtg/scan/sessions",
        "/api/web/v1/commands",
        "/api/web/v1/auth/login",
        "/api/web/v1/auth/register",
        "/api/web/v1/password",
    ],
)
def test_removed_paths_return_404_without_dispatch_or_effects(
    method: str, path: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    lifetime = create_application(
        Configuration(ORIGIN, database_url="postgresql://localhost/unused")
    )
    registry = cast(RouteRegistry, cast(Route, lifetime.http.router.routes[-1]).app)
    handlers = [AsyncMock(wraps=route.handle) for route in registry._routes]
    registry._routes = [
        HttpRoute(route.method, route.path, handler)
        for route, handler in zip(registry._routes, handlers, strict=True)
    ]
    auth = AsyncMock(return_value=ACTOR)
    monkeypatch.setattr(lifetime.http.state.resources.auth, "validate_session", auth)
    client = TestClient(lifetime.http)
    try:
        for suffix in ["", "/"]:
            response = client.request(
                method,
                path + suffix + "?limit=bad",
                content="invalid form",
                headers={
                    "Authorization": "Bearer " + TOKEN,
                    "Cookie": "spellbook_session=stale",
                    "Origin": "https://foreign.example",
                    "Content-Type": "text/plain",
                },
                follow_redirects=False,
            )
            assert response.status_code == 404
            assert response.json() == {"message": "Not Found", "status": 404}
            assert not {"location", "allow", "set-cookie"} & response.headers.keys()
        auth.assert_not_awaited()
        for handler in handlers:
            handler.assert_not_awaited()
    finally:
        client.close()
        asyncio.run(lifetime.close())


def test_browser_qr_cookie_jar_completes_flow_and_clears_requester_cookie() -> None:
    prefix = "/api/v1/auth"
    d = Dependencies()
    # A real cookie jar exercises Path matching rather than injecting the requester header.
    with (
        TestClient(d.app, base_url=ORIGIN) as requester,
        TestClient(d.app, base_url=ORIGIN) as approver,
    ):
        created = requester.post(
            prefix + "/qr/requests", json={"kind": "browser"}, headers={"Origin": ORIGIN}
        )
        assert created.status_code == 201 and SECRET not in created.text
        assert created.json()["verificationUri"] == ORIGIN + "/auth/approve?code=" + CODE
        cookie = next(iter(requester.cookies.jar))
        assert cookie.path == prefix + "/qr" and cookie.secure
        pending = requester.post(
            prefix + "/qr/token", json={"code": CODE}, headers={"Origin": ORIGIN}
        )
        assert pending.json() == {"status": "pending"}
        assert d.auth.qr.redeem.call_args.args[1].browser_secret == SECRET
        headers = {"Authorization": "Bearer " + TOKEN}
        assert approver.get(prefix + "/qr/requests/" + CODE, headers=headers).status_code == 200
        approved = approver.post(
            prefix + "/qr/requests/" + CODE + "/decision",
            json={"decision": "approve"},
            headers=headers,
        )
        assert approved.status_code == 200
        d.auth.qr.decide.assert_awaited_once_with(ACTOR, CODE, "approve", "testclient")
        d.auth.qr.redeem.return_value = Redemption(
            "browser", "authenticated", TokenSession(TOKEN, EXPIRES)
        )
        redeemed = requester.post(
            prefix + "/qr/token", json={"code": CODE}, headers={"Origin": ORIGIN}
        )
        assert redeemed.json() == {"status": "authenticated", "expiresAt": EXPIRES}
        cookies = redeemed.headers.get_list("set-cookie")
        assert len(cookies) == 2 and cookies[0].startswith("spellbook_session=" + TOKEN)
        assert cookies[1] == (
            f"spellbook_qr_requester=; Path={prefix}/qr; Max-Age=0; HttpOnly; SameSite=Lax; Secure"
        )
        assert {cookie.name: cookie.path for cookie in requester.cookies.jar} == {
            "spellbook_session": "/"
        }
        assert requester.get(prefix + "/session").status_code == 200
        assert redeemed.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("terminal", ["denied", "expired"])
def test_terminal_qr_result_cleans_requester_cookie(terminal: str) -> None:
    prefix = "/api/v1/auth"
    d = Dependencies()
    with TestClient(d.app, base_url=ORIGIN) as client:
        client.post(prefix + "/qr/requests", json={"kind": "browser"}, headers={"Origin": ORIGIN})
        d.auth.qr.redeem.return_value = Redemption("browser", terminal)
        response = client.post(
            prefix + "/qr/token", json={"code": CODE}, headers={"Origin": ORIGIN}
        )
        assert response.json() == {"status": terminal}
        assert f"Path={prefix}/qr; Max-Age=0;" in response.headers["set-cookie"]
        assert not list(client.cookies.jar)


def test_device_qr_and_bearer_selection_keep_credentials_private() -> None:
    prefix = "/api/v1/auth"
    d = Dependencies()
    with TestClient(d.app, base_url=ORIGIN) as client:
        created = client.post(prefix + "/qr/requests", json={"kind": "device"})
        assert created.status_code == 201 and created.json()["requesterSecret"] == SECRET
        assert "set-cookie" not in created.headers
        d.auth.qr.redeem.return_value = Redemption(
            "device", "authenticated", TokenSession(TOKEN, EXPIRES)
        )
        redeemed = client.post(
            prefix + "/qr/token", json={"code": CODE, "requesterSecret": SECRET}
        )
        assert redeemed.json() == {"status": "authenticated", "token": TOKEN, "expiresAt": EXPIRES}
        assert "set-cookie" not in redeemed.headers
        failed = client.get(
            prefix + "/session",
            headers={"Authorization": "invalid", "Cookie": "spellbook_session=" + TOKEN},
        )
        assert failed.status_code == 401 and failed.json()["message"] == "Invalid bearer token"
        d.auth.validate_session.assert_awaited_with(None)


def test_raw_forms_keep_predecode_limits_and_password_cookie_rotation() -> None:
    prefix = "/api/v1/web"
    d = Dependencies()
    with TestClient(d.app, base_url=ORIGIN) as client:
        malformed = client.post(
            prefix + "/auth/login",
            content=b"x" * (12 * 1024 * 1024 + 1),
            headers={"Origin": ORIGIN, "Content-Type": "application/x-www-form-urlencoded"},
        )
        assert malformed.status_code == 413
        d.auth.take_auth_attempt.assert_called_once_with("testclient")
        d.auth.authenticate.assert_not_awaited()
        denied = client.post(prefix + "/auth/login", data={})
        assert denied.status_code == 403
        d.auth.take_auth_attempt.assert_called_once()
        login = client.post(
            prefix + "/auth/login",
            content="username=first&username=second&password=valid-password",
            headers={"Origin": ORIGIN, "Content-Type": "application/x-www-form-urlencoded"},
        )
        assert login.status_code == 200
        d.auth.authenticate.assert_awaited_once_with("login", "first", "valid-password", {})
        changed = client.post(
            prefix + "/password",
            content="currentPassword=old&newPassword=valid-password&confirmPassword=valid-password",
            headers={
                "Origin": ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": "spellbook_session=" + TOKEN,
            },
        )
        assert changed.status_code == 200 and changed.json()["success"] is True
        assert changed.headers["set-cookie"].startswith("spellbook_session=" + TOKEN)
        assert changed.headers["cache-control"] == "no-store"


def test_public_catalog_parses_first_query_values_without_authentication() -> None:
    d = Dependencies()
    catalog = create_autospec(Catalog, instance=True)
    catalog.search_catalog_request.return_value = {"hits": []}
    app = create_http_application(
        Configuration(ORIGIN),
        auth=d.auth,
        catalog=catalog,
        inventory=create_autospec(Inventory, instance=True),
        saved_routes=create_autospec(SavedStateRoutes, instance=True),
    )
    with TestClient(app) as client:
        path = "/api/v1/mtg/catalog/search"
        assert client.get(path + "?limit=bad").status_code == 400
        valid = client.get(path + "?q=first&q=second&limit=3&limit=bad")
        assert valid.status_code == 200
        catalog.search_catalog_request.assert_awaited_once_with(
            {"query": "first", "limit": 3, "offset": 0}
        )
        posted = client.post(path, json={"query": "JSON", "limit": 4})
        assert posted.status_code == 200
        catalog.search_catalog_request.assert_awaited_with({"query": "JSON", "limit": 4})
        assert posted.headers["cache-control"] == "no-store"
        assert posted.headers["x-robots-tag"] == "noindex, nofollow"
        d.auth.validate_session.assert_not_awaited()


def test_complete_registry_allow_options_and_405_match_openapi_without_auth() -> None:
    root = Path(__file__).resolve().parents[3]
    schema = json.loads((root / "contracts/openapi.json").read_text())
    expected: dict[str, list[str]] = {}
    for path, item in schema["paths"].items():
        if path.startswith("/api/"):
            expected[path] = [
                method.upper()
                for method in item
                if method in {"get", "post", "patch", "put", "delete"}
            ]
    lifetime = create_application(
        Configuration(ORIGIN, database_url="postgresql://localhost/unused")
    )
    registry = cast(RouteRegistry, cast(Route, lifetime.http.router.routes[-1]).app)
    try:
        client = TestClient(lifetime.http)
        for path, methods in expected.items():
            target = re.sub(r"\{[^}]+\}", PRINTING, path)
            wanted = ", ".join(
                [
                    part
                    for method in methods
                    for part in (["GET", "HEAD"] if method == "GET" else [method])
                ]
                + ["OPTIONS"]
            )
            for suffix in ["", "/"]:
                options = client.options(target + suffix)
                assert options.status_code == 204, target
                assert options.headers["allow"] == wanted, target
                rejected = client.request("TRACE", target + suffix)
                assert rejected.status_code == 405, target
                assert rejected.json() == {"message": "Method Not Allowed"}
                assert rejected.headers["allow"] == options.headers["allow"]
        assert len(registry._routes) == len(
            {(route.method, route.path) for route in registry._routes}
        )
    finally:
        asyncio.run(lifetime.close())


@pytest.mark.parametrize(
    "path,policy",
    [
        ("/api/v1/auth/session", "no-store"),
        ("/api/v1/account/profile", "no-store"),
        ("/api/v1/mtg/dashboard", "no-store"),
        ("/api/v1/mtg/inventory/value", "private, no-store"),
        ("/api/v1/mtg/inventory/value-history", "private, no-store"),
    ],
)
def test_private_policy_is_preserved_on_failures_and_head(
    path: str, policy: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    lifetime = create_application(
        Configuration(ORIGIN, database_url="postgresql://localhost/unused")
    )
    resources = lifetime.http.state.resources
    # No lifespan entry or database work: reject at the actual authentication boundary.
    monkeypatch.setattr(resources.auth, "validate_session", AsyncMock(return_value=None))
    try:
        client = TestClient(lifetime.http)
        for method in ["GET", "HEAD"]:
            response = client.request(method, path)
            assert response.status_code == 401
            assert response.headers["cache-control"] == policy
            assert response.headers["x-robots-tag"] == "noindex, nofollow"
            if method == "HEAD":
                assert response.content == b""
    finally:
        asyncio.run(lifetime.close())


def test_bodyless_origin_exception_and_command_retry_inputs_are_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prefix = "/api/v1/mtg"
    lifetime = create_application(
        Configuration(ORIGIN, database_url="postgresql://localhost/unused")
    )
    resources = lifetime.http.state.resources
    monkeypatch.setattr(
        resources.auth,
        "validate_session",
        AsyncMock(side_effect=lambda token: ACTOR if token == TOKEN else None),
    )
    removed = AsyncMock(return_value={"requestId": "original", "revision": "9"})
    command = AsyncMock(return_value={"requestId": "original", "revision": "9"})
    monkeypatch.setattr(resources.inventory, "remove", removed)
    monkeypatch.setattr(resources.inventory, "add", command)
    try:
        client = TestClient(lifetime.http)
        headers = {"Authorization": "Bearer " + TOKEN}
        bodyless = client.delete(prefix + "/inventory/" + PRINTING, headers=headers)
        assert bodyless.status_code == 415
        removed.assert_not_awaited()
        forbidden = client.request(
            "DELETE", prefix + "/inventory/" + PRINTING, content="x", headers=headers
        )
        assert forbidden.status_code == 403
        removed.assert_not_awaited()
        commands = "/api/v1/mtg/commands"
        value = {
            "requestId": "original",
            "catalogCardId": PRINTING,
            "quantity": 1,
            "finish": "foil",
            "condition": "NM",
        }
        response = client.post(
            commands, json={"operation": "inventory.add", "input": value}, headers=headers
        )
        assert response.status_code == 200 and response.json()["requestId"] == "original"
        command.assert_awaited_once_with(ACTOR, {**value, "source": "web"})
        assert "notes" not in command.call_args.args[1]
        assert response.headers["cache-control"] == "no-store"
    finally:
        asyncio.run(lifetime.close())


def test_registry_sse_retains_receive_ownership_through_recovery_and_predrain() -> None:
    path = "/api/v1/account/events"
    from starlette.types import Message, Scope
    from test_saved_state_http import ORIGIN as STREAM_ORIGIN
    from test_saved_state_http import TOKEN as STREAM_TOKEN
    from test_saved_state_http import harness

    async def exercise() -> None:
        async with harness() as (routes, saved, auth):
            app = create_http_application(
                Configuration(STREAM_ORIGIN),
                auth=auth,
                catalog=create_autospec(Catalog, instance=True),
                inventory=create_autospec(Inventory, instance=True),
                saved_routes=routes,
            )
            incoming: asyncio.Queue[Message] = asyncio.Queue()
            readers = 0
            first, recovering, replacement = asyncio.Event(), asyncio.Event(), asyncio.Event()
            messages: list[Message] = []
            resets = 0

            async def receive() -> Message:
                nonlocal readers
                readers += 1
                assert readers == 1
                try:
                    return await incoming.get()
                finally:
                    readers -= 1

            async def send(message: Message) -> None:
                nonlocal resets
                messages.append(message)
                content = message.get("body", b"")
                if content.startswith(b"event: reset"):
                    resets += 1
                    (first if resets == 1 else replacement).set()
                if content.startswith(b"event: recovering"):
                    recovering.set()

            scope: Scope = {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "https",
                "path": path,
                "raw_path": path.encode(),
                "query_string": b"",
                "headers": [(b"authorization", ("Bearer " + STREAM_TOKEN).encode())],
                "server": ("spellbook.example.test", 443),
                "client": ("127.0.0.1", 1234),
            }
            stream = asyncio.create_task(app(scope, receive, send))
            try:
                async with asyncio.timeout(3):
                    await first.wait()
                    assert saved.listener_lost(1, "consumer")
                    await recovering.wait()
                    assert not stream.done()
                    assert saved.listener_starting(2)
                    assert await saved.listener_ready(2)
                    await replacement.wait()
                    await routes.close_streams()
                    await stream
                headers = dict(messages[0]["headers"])
                assert headers[b"cache-control"] == b"no-store"
                assert headers[b"x-accel-buffering"] == b"no"
                assert headers[b"x-robots-tag"] == b"noindex, nofollow"
                assert messages[-1] == {
                    "type": "http.response.body",
                    "body": b"",
                    "more_body": False,
                }
                assert readers == 0 and saved.diagnostics()["subscribers"] == 0
            finally:
                await routes.close_streams()
                if not stream.done():
                    stream.cancel()
                await asyncio.gather(stream, return_exceptions=True)

    asyncio.run(exercise())
