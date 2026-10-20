"""Direct Inventory adapter components, plus opt-in TCP with real PostgreSQL.

The small ASGI component below exercises actual handlers. It is deliberately not
ApplicationLifetime, the production registry, admission, SSE or a performance proof.
"""

import asyncio
import json
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, create_autospec, patch
from uuid import uuid4

import httpx2
import pytest
import uvicorn
from spellbook_core.auth import SessionAuth
from spellbook_core.db import transaction
from spellbook_core.errors import NotesConflictError, RequestConflictError
from spellbook_core.inventory import Inventory
from spellbook_core.models import Actor
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from test_cross_runtime import NATIVE, NativeInventory, native_fixture

from spellbook_api.http.auth import require_form_origin, stale_session_cookie
from spellbook_api.http.errors import HttpError, error_response
from spellbook_api.http.routes_inventory import add_items, get_entry

ORIGIN = "https://spellbook.test"
ACTOR = Actor("component-account", "component", "", "", "")
PRINTING = "11111111-1111-4111-8111-111111111111"


def request(
    body: object, *, headers: dict[str, str] | None = None, method: str = "POST"
) -> Request:
    raw = json.dumps(body).encode()
    selected = {
        "content-type": "application/json",
        "authorization": "Bearer " + "a" * 43,
        "content-length": str(len(raw)),
        **(headers or {}),
    }

    async def receive() -> Message:
        return {"type": "http.request", "body": raw, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [(k.encode(), v.encode()) for k, v in selected.items()],
        },
        receive,
    )


async def invoke(req: Request, auth: SessionAuth, inventory: Inventory) -> Response:
    try:
        return await add_items(req, auth, inventory, ORIGIN)
    except Exception as cause:
        return error_response(cause)


def dependencies() -> tuple[Any, Any]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.return_value = ACTOR
    inventory = create_autospec(Inventory, instance=True)
    inventory.add_items.return_value = {"requestId": "r", "changes": []}
    return auth, inventory


def test_http_items_defaults_absence_unknown_keys_and_validation_order() -> None:
    async def scenario() -> None:
        auth, inventory = dependencies()
        response = await invoke(
            request(
                {
                    "requestId": " r ",
                    "unknown": "ignored",
                    "game": "not-mtg",
                    "items": [
                        {"catalogCardId": PRINTING, "notesRevision": None, "accountId": "forged"}
                    ],
                }
            ),
            auth,
            inventory,
        )
        assert response.status_code == 200
        assert "cache-control" not in response.headers
        inventory.add_items.assert_awaited_once_with(
            ACTOR,
            request_id=" r ",
            source="mobile",
            operations=[
                {
                    "op": "add",
                    "catalogCardId": PRINTING,
                    "finish": "nonfoil",
                    "condition": "NM",
                    "quantity": 1,
                }
            ],
        )
        auth.validate_session.return_value = None
        response = await invoke(
            request(None, headers={"content-type": "text/plain"}), auth, inventory
        )
        assert (
            response.status_code == 401
            and json.loads(bytes(response.body))["message"] == "Invalid bearer token"
        )

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({}, "requestId and items are required"),
        ({"requestId": 0, "items": []}, "requestId and items are required"),
        ({"requestId": "r", "items": None}, "requestId and items are required"),
        ({"requestId": 1, "items": [None]}, "Each inventory item must be an object"),
        ({"requestId": 1, "items": []}, "requestId must be a string"),
        ({"requestId": "r", "items": [{"catalogCardId": None}]}, "catalogCardId must be a string"),
        ({"requestId": "r", "items": [{"finish": None}]}, "finish must be a string"),
        ({"requestId": "r", "items": [{"quantity": True}]}, "quantity must be a finite number"),
        ({"requestId": "r", "items": [{"quantity": "1"}]}, "quantity must be a finite number"),
        ({"requestId": "r", "items": [{"notes": None}]}, "notes must be a string"),
        (
            {"requestId": "r", "items": [{"notes": "", "notesRevision": None}]},
            "notesRevision must be a string",
        ),
        ({"requestId": "r", "items": [], "source": None}, "source must be a string"),
    ],
)
def test_http_item_input_errors(body: object, message: str) -> None:
    auth, inventory = dependencies()
    response = asyncio.run(invoke(request(body), auth, inventory))
    assert response.status_code == 400
    assert json.loads(bytes(response.body)) == {"message": message, "status": 400}
    inventory.add_items.assert_not_awaited()


def test_http_decode_exactly_once_before_auth_and_trim_only_at_http_boundary() -> None:
    async def scenario() -> None:
        auth, inventory = dependencies()
        inventory.get_entry.return_value = {"entry": {}, "memberships": [], "revision": "0"}
        response = await get_entry(
            request({}, method="GET"), "%20" + PRINTING.upper() + "%20", auth, inventory, ORIGIN
        )
        assert response.status_code == 200
        inventory.get_entry.assert_awaited_once_with(ACTOR, PRINTING.upper())
        for raw, message in [
            ("%ZZ", "Invalid path encoding"),
            ("%FF", "Invalid path encoding"),
            ("%2520" + PRINTING, "entryId must be a UUID"),
        ]:
            with pytest.raises(HttpError, match=message):
                await get_entry(request({}, method="GET"), raw, auth, inventory, ORIGIN)
        inventory.get_entry.return_value = None
        with pytest.raises(HttpError, match="Inventory entry not found") as failure:
            await get_entry(request({}, method="GET"), PRINTING, auth, inventory, ORIGIN)
        assert failure.value.status == 404
        auth.reset_mock()
        with pytest.raises(HttpError):
            await get_entry(request({}, method="GET"), "%FF", auth, inventory, ORIGIN)
        auth.validate_session.assert_not_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "cause",
    [
        RequestConflictError(),
        NotesConflictError(
            {"entryId": PRINTING, "notes": "saved", "notesRevision": "9007199254740993"}
        ),
        RuntimeError("private infrastructure"),
    ],
)
def test_http_domain_failures_use_shared_error_mapping(cause: Exception) -> None:
    auth, inventory = dependencies()
    inventory.add_items.side_effect = cause
    response = asyncio.run(invoke(request({"requestId": "r", "items": []}), auth, inventory))
    expected = error_response(cause)
    assert response.status_code == expected.status_code
    assert bytes(response.body) == bytes(expected.body)
    assert b"private infrastructure" not in bytes(response.body)


def component(fixture: NativeInventory) -> ASGIApp:
    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        req = Request(scope, receive)
        cleanup = None
        try:
            raw = scope["raw_path"].decode("ascii")
            require_form_origin(req, ORIGIN)
            cleanup = await stale_session_cookie(req, fixture.auth, ORIGIN)
            if raw == "/api/mobile/v1/mtg/inventory" and req.method == "POST":
                response = await add_items(req, fixture.auth, fixture.inventory, ORIGIN)
            elif raw.startswith("/api/mobile/v1/mtg/inventory/") and req.method == "GET":
                response = await get_entry(
                    req, raw.rsplit("/", 1)[1], fixture.auth, fixture.inventory, ORIGIN
                )
            else:
                raise HttpError(404, "Not Found")
        except Exception as cause:
            response = error_response(cause)
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        if cleanup:
            response.headers.append("Set-Cookie", cleanup)
        await response(scope, receive, send)

    return app


@asynccontextmanager
async def tcp_component(fixture: NativeInventory) -> AsyncIterator[str]:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        server = uvicorn.Server(
            uvicorn.Config(component(fixture), lifespan="off", log_level="critical")
        )
        pending = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            async with asyncio.timeout(5):
                while not server.started:
                    if pending.done():
                        await pending
                        raise AssertionError("Component server did not start")
                    await asyncio.sleep(0.01)
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            await asyncio.wait_for(pending, 5)


@NATIVE
def test_native_tcp_python_component_add_readback_replay_auth_caps_and_failures() -> None:
    async def scenario() -> None:
        async with (
            native_fixture() as fixture,
            tcp_component(fixture) as url,
            httpx2.AsyncClient(base_url=url) as client,
        ):
            path = "/api/mobile/v1/mtg/inventory"
            bearer = {"authorization": "Bearer " + fixture.token}
            payload = {
                "requestId": str(uuid4()),
                "items": [{"catalogCardId": fixture.card["id"], "notes": "Original"}],
            }
            original = await client.post(path, json=payload, headers=bearer)
            assert original.status_code == 200
            receipt = original.json()
            entry_id = receipt["changes"][0]["entryId"]
            detail = await client.get(path + "/" + entry_id, headers=bearer)
            assert detail.status_code == 200
            assert detail.json()["entry"]["quantity"] == 1
            assert detail.json()["entry"]["canonicalCardId"] == fixture.card["oracle_id"]
            assert detail.headers["x-robots-tag"] == "noindex, nofollow"
            assert "cache-control" not in detail.headers
            with patch.object(
                fixture.inventory._catalog,
                "get_catalog_printing",
                AsyncMock(side_effect=AssertionError("Catalog accessed")),
            ):
                assert (await client.post(path, json=payload, headers=bearer)).json() == receipt
                changed = await client.post(
                    path,
                    json={
                        **payload,
                        "items": [{"catalogCardId": fixture.card["id"], "quantity": 2}],
                    },
                    headers=bearer,
                )
                assert changed.status_code == 409 and changed.json()["kind"] == "RequestConflict"
            stale = await client.post(
                path,
                json={
                    "requestId": str(uuid4()),
                    "items": [
                        {
                            "catalogCardId": fixture.card["id"],
                            "notes": "stale",
                            "notesRevision": "9",
                        }
                    ],
                },
                headers=bearer,
            )
            assert stale.status_code == 409 and stale.json()["notesRevision"] == "0"
            cookies = {"cookie": "spellbook_session=" + fixture.token}
            assert (await client.post(path, json=payload, headers=cookies)).status_code == 403
            assert (
                await client.post(path, json=payload, headers={**cookies, "origin": ORIGIN})
            ).json() == receipt
            assert (
                await client.post(
                    path,
                    json=payload,
                    headers={**cookies, "authorization": "Basic bad", "origin": ORIGIN},
                )
            ).status_code == 401
            assert (await client.get(path + "/%FF", headers=bearer)).status_code == 400
            assert (await client.get(path + "/" + str(uuid4()), headers=bearer)).status_code == 404
            assert (
                await client.post(path + "/bulk", json=payload, headers=bearer)
            ).status_code == 404
            base = json.dumps(
                {
                    "requestId": str(uuid4()),
                    "items": [{"catalogCardId": fixture.card["id"]}],
                    "padding": "",
                }
            ).encode()
            exact = base[:-2] + b"x" * (1024 * 1024 - len(base)) + base[-2:]
            response = await client.post(
                path, content=exact, headers={**bearer, "content-type": "application/json"}
            )
            assert response.status_code == 200
            response = await client.post(
                path, content=exact + b" ", headers={**bearer, "content-type": "application/json"}
            )
            assert response.status_code == 413
            async with transaction(fixture.pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT count(*),sum(quantity) FROM inventory_cards WHERE account_id=%s",
                        (fixture.account_id,),
                    )
                ).fetchone() == (1, 2)

    asyncio.run(scenario())


@NATIVE
def test_native_tcp_disconnect_after_commit_replays_original_receipt() -> None:
    async def scenario() -> None:
        async with native_fixture() as fixture, tcp_component(fixture) as url:
            committed, finish = asyncio.Event(), asyncio.Event()
            original_add = fixture.inventory.add_items
            recorded: list[object] = []

            async def delayed_reply(actor: Actor, **kwargs: object) -> Any:
                result = await original_add(actor, **kwargs)
                recorded.append(result)
                committed.set()
                await finish.wait()
                return result

            payload = {"requestId": str(uuid4()), "items": [{"catalogCardId": fixture.card["id"]}]}
            raw = json.dumps(payload).encode()
            port = int(url.rsplit(":", 1)[1])
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            with patch.object(fixture.inventory, "add_items", delayed_reply):
                try:
                    writer.write(
                        (
                            "POST /api/mobile/v1/mtg/inventory HTTP/1.1\r\n"
                            "Host: 127.0.0.1\r\nContent-Type: application/json\r\n"
                            f"Authorization: Bearer {fixture.token}\r\n"
                            f"Content-Length: {len(raw)}\r\n\r\n"
                        ).encode()
                        + raw
                    )
                    await writer.drain()
                    await asyncio.wait_for(committed.wait(), 3)
                    # The transaction and receipt are committed before the socket goes away.
                    assert not reader.at_eof()
                    writer.close()
                    await writer.wait_closed()
                finally:
                    finish.set()
                    writer.close()
                    await writer.wait_closed()
            async with httpx2.AsyncClient(base_url=url) as client:
                replay = await client.post(
                    "/api/mobile/v1/mtg/inventory",
                    json=payload,
                    headers={"authorization": "Bearer " + fixture.token},
                )
                assert replay.status_code == 200 and replay.json() == recorded[0]
            async with transaction(fixture.pool, read_only=True) as tx:
                row = await (
                    await tx.execute(
                        "SELECT count(*),sum(quantity) FROM inventory_cards WHERE account_id=%s",
                        (fixture.account_id,),
                    )
                ).fetchone()
                assert row == (1, 1)

    asyncio.run(scenario())
