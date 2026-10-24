"""Real native routes hand off receive ownership after guarded body consumption."""

import asyncio
import json
import socket
from unittest.mock import AsyncMock, create_autospec
from urllib.parse import urlsplit

import pytest
import uvicorn
from fastapi import FastAPI
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.mtg.scan import Scan
from starlette.types import Message, Scope
from test_auth_account import ACTOR, ORIGIN, TOKEN, Dependencies

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.mtg.routes_commands import create_command_routes
from spellbook_api.http.mtg.routes_decks import create_deck_routes
from spellbook_api.http.mtg.routes_scan import create_scan_routes
from spellbook_api.http.policy import configure_http
from spellbook_api.http.routes_auth import create_auth_routes

ENTRY = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def target() -> tuple[FastAPI, dict[str, AsyncMock], RequestAdmission]:
    d = Dependencies()
    scan = create_autospec(Scan, instance=True)
    decks = create_autospec(Decks, instance=True)
    inventory = create_autospec(Inventory, instance=True)
    admission = RequestAdmission()
    http = FastAPI(openapi_url=None)
    configure_http(http, ORIGIN, d.auth, admission)
    for router in (
        create_scan_routes(d.auth, scan, ORIGIN),
        create_deck_routes(d.auth, decks, ORIGIN),
        create_auth_routes(d.auth, ORIGIN),
        create_command_routes(d.auth, inventory, decks, ORIGIN),
    ):
        http.include_router(router)
    operations = {
        "scan-create": scan.create_session,
        "scan-list": scan.list_sessions,
        "deck-delete": decks.delete_deck,
        "card-delete": decks.remove_deck_card,
        "logout": d.auth.revoke_session,
        "inventory-patch": inventory.patch_entry,
    }
    return http, operations, admission


def scope(method: str, path: str, headers: list[tuple[bytes, bytes]]) -> Scope:
    url = urlsplit(path)
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": url.path,
        "raw_path": url.path.encode(),
        "query_string": url.query.encode(),
        "headers": headers,
        "server": ("candidate.example", 443),
        "client": ("127.0.0.1", 1234),
    }


@pytest.mark.parametrize(
    "method,path,operation",
    [
        ("POST", "/api/v1/mtg/scan/sessions", "scan-create"),
        ("DELETE", "/api/v1/mtg/decks/" + ENTRY, "deck-delete"),
        ("DELETE", "/api/v1/mtg/deck-cards/" + ENTRY + "?requestId=original", "card-delete"),
        ("POST", "/api/v1/auth/logout", "logout"),
        ("GET", "/api/v1/mtg/scan/sessions", "scan-list"),
    ],
)
def test_disconnect_settles_bodyless_use_case_without_competing_readers(
    target: tuple[FastAPI, dict[str, AsyncMock], RequestAdmission],
    method: str,
    path: str,
    operation: str,
) -> None:
    async def scenario() -> None:
        app, operations, admission = target
        entered, settled, release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        incoming: asyncio.Queue[Message] = asyncio.Queue()
        await incoming.put({"type": "http.request", "body": b"", "more_body": False})
        readers = 0

        async def work(*args: object, **kwargs: object) -> object:
            entered.set()
            try:
                await release.wait()
                return {}
            finally:
                settled.set()

        operations[operation].side_effect = work

        async def receive() -> Message:
            nonlocal readers
            readers += 1
            assert readers == 1
            try:
                return await incoming.get()
            finally:
                readers -= 1

        async def send(message: Message) -> None:
            pass

        headers = [(b"authorization", ("Bearer " + TOKEN).encode()), (b"content-length", b"0")]
        pending = asyncio.create_task(app(scope(method, path, headers), receive, send))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            await incoming.put({"type": "http.disconnect"})
            await asyncio.wait_for(settled.wait(), 1)
            await asyncio.wait_for(pending, 1)
            assert readers == 0 and admission.active == 0
            assert not [
                task
                for task in asyncio.all_tasks()
                if task.get_name() in {"http-request", "http-disconnect"}
            ]
        finally:
            release.set()
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

    asyncio.run(scenario())


@pytest.mark.parametrize("authorized", [False, True])
@pytest.mark.parametrize("chunked", [False, True])
def test_bodyful_command_auth_precedes_reads_and_retains_every_body_chunk(
    target: tuple[FastAPI, dict[str, AsyncMock], RequestAdmission],
    authorized: bool,
    chunked: bool,
) -> None:
    async def scenario() -> None:
        app, operations, admission = target
        value = {
            "requestId": "original",
            "entryId": ENTRY,
            "quantity": 3,
            "notes": "draft",
            "notesRevision": "7",
        }
        body = json.dumps({"operation": "inventory.patchEntry", "input": value}).encode()
        operations["inventory-patch"].return_value = {"requestId": "original"}
        incoming: asyncio.Queue[Message] = asyncio.Queue()
        for part, more in ((body[:19], True), (body[19:], False)):
            await incoming.put({"type": "http.request", "body": part, "more_body": more})
        received: list[Message] = []
        sent: list[Message] = []
        readers = 0

        async def receive() -> Message:
            nonlocal readers
            readers += 1
            assert readers == 1
            try:
                message = await incoming.get()
                received.append(message)
                return message
            finally:
                readers -= 1

        async def send(message: Message) -> None:
            sent.append(message)

        headers = [
            (b"authorization", ("Bearer " + (TOKEN if authorized else "invalid")).encode()),
            (b"content-type", b"application/json"),
        ]
        headers.append(
            (b"transfer-encoding", b"chunked")
            if chunked
            else (b"content-length", str(len(body)).encode())
        )
        await app(scope("POST", "/api/v1/mtg/commands", headers), receive, send)
        assert sent[0]["status"] == (200 if authorized else 401)
        assert readers == 0 and admission.active == 0
        if authorized:
            assert b"".join(message.get("body", b"") for message in received) == body
            operations["inventory-patch"].assert_awaited_once_with(
                ACTOR, {**value, "source": "web"}
            )
        else:
            assert not received
            operations["inventory-patch"].assert_not_awaited()

    asyncio.run(scenario())


def test_native_tcp_bodyless_disconnect_cancels_the_running_use_case(
    target: tuple[FastAPI, dict[str, AsyncMock], RequestAdmission],
) -> None:
    async def scenario() -> None:
        app, operations, admission = target
        entered, settled, release = asyncio.Event(), asyncio.Event(), asyncio.Event()

        async def work(*args: object, **kwargs: object) -> object:
            entered.set()
            try:
                await release.wait()
                return {}
            finally:
                settled.set()

        operations["scan-create"].side_effect = work
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            server = uvicorn.Server(uvicorn.Config(app, lifespan="off", log_level="critical"))
            pending = asyncio.create_task(server.serve(sockets=[listener]))
            writer: asyncio.StreamWriter | None = None
            try:
                async with asyncio.timeout(3):
                    while not server.started:
                        await asyncio.sleep(0.005)
                    _, writer = await asyncio.open_connection("127.0.0.1", port)
                    writer.write(
                        (
                            "POST /api/v1/mtg/scan/sessions HTTP/1.1\r\n"
                            "Host: localhost\r\nContent-Length: 0\r\n"
                            "Authorization: Bearer " + TOKEN + "\r\n\r\n"
                        ).encode()
                    )
                    await writer.drain()
                    await entered.wait()
                    writer.close()
                    await writer.wait_closed()
                    await asyncio.wait_for(settled.wait(), 1)
                    assert admission.active == 0
            finally:
                release.set()
                if writer is not None:
                    writer.close()
                    await writer.wait_closed()
                server.should_exit = True
                await asyncio.wait_for(pending, 5)

    asyncio.run(scenario())
