"""Owned ASGI component harness. Production registry/lifetime/TCP remain separate."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from spellbook_core import saved_state as core_module
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ActorError
from spellbook_core.models import Actor, SessionInfo
from spellbook_core.saved_state import SavedState, create_saved_state
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message

from spellbook_api.http import sse
from spellbook_api.http.errors import HttpError, error_response
from spellbook_api.http.routes_saved_state import SavedStateRoutes, create_saved_state_routes
from spellbook_api.http.sse import SavedStateResponse

ORIGIN = "https://spellbook.example.test"
TOKEN = "A" * 43


class Authority(SessionAuth):
    def __init__(self) -> None:
        self.actor = Actor("one", "one", "", "", "")
        self.revoked = False
        self.failure = False
        self.calls = 0
        self.selected: list[str | None] = []
        self.hook: Callable[[], Awaitable[None]] | None = None

    async def validate_session(self, token: str | None) -> Actor | None:
        self.selected.append(token)
        return self.actor if token == TOKEN else None

    async def actor_session(self, actor: Actor) -> SessionInfo:
        self.calls += 1
        if self.hook:
            await self.hook()
        if self.revoked:
            raise ActorError()
        if self.failure:
            raise OSError("private database error")
        return SessionInfo(actor, (datetime.now(UTC) + timedelta(hours=1)).isoformat())


async def until(predicate: Callable[[], bool]) -> None:
    async with asyncio.timeout(1):
        while not predicate():
            await asyncio.sleep(0)


@asynccontextmanager
async def harness(
    *, ready: bool = True
) -> AsyncIterator[tuple[SavedStateRoutes, SavedState, Authority]]:
    auth = Authority()
    sync = create_saved_state(
        auth, ensure_listener=lambda: None, request_listener_recovery=lambda *_: None
    )
    routes = create_saved_state_routes(auth, sync, ORIGIN)
    sync.start()
    sync.listener_starting(1)
    if ready:
        assert await sync.listener_ready(1)
    try:
        yield routes, sync, auth
    finally:
        await routes.close_streams()
        await sync.close()
        assert not sync.diagnostics()["subscribers"]
        assert not sync.diagnostics()["authorityTasks"]
        assert not sync.diagnostics()["backgroundTasks"]
        assert not [
            task for task in asyncio.all_tasks() if task.get_name().startswith("saved-state-")
        ]


def request(
    headers: list[tuple[bytes, bytes]] | None = None, query: bytes = b""
) -> tuple[Request, asyncio.Queue[Message]]:
    incoming: asyncio.Queue[Message] = asyncio.Queue()
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/account/events",
        "raw_path": b"/api/v1/account/events",
        "query_string": query,
        "headers": headers
        if headers is not None
        else [(b"authorization", f"Bearer {TOKEN}".encode())],
        "server": ("spellbook.example.test", 443),
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope, receive=incoming.get), incoming


async def invoke(routes: SavedStateRoutes, req: Request) -> Response:
    try:
        return await routes.handle(req)
    except HttpError as cause:
        return error_response(cause)


@pytest.mark.parametrize(
    ("headers", "query", "status", "message", "selected"),
    [
        (
            [(b"origin", b"https://foreign.test")],
            b"x=1",
            403,
            "Same-origin connection required",
            [],
        ),
        ([(b"origin", b"null")], b"", 403, "Same-origin connection required", []),
        (
            [(b"origin", ORIGIN.encode()), (b"origin", ORIGIN.encode())],
            b"",
            400,
            "Repeated authority or content headers are not supported",
            [],
        ),
        ([], b"token=secret", 400, "Stream query parameters are not supported", []),
        ([], b"=", 400, "Stream query parameters are not supported", []),
        ([], b"", 401, "Authentication required", [None]),
        (
            [(b"authorization", b""), (b"cookie", f"spellbook_session={TOKEN}".encode())],
            b"",
            401,
            "Invalid bearer token",
            [None],
        ),
        (
            [
                (b"authorization", f"Bearer {TOKEN}".encode()),
                (b"authorization", f"Bearer {TOKEN}".encode()),
            ],
            b"",
            400,
            "Repeated authority or content headers are not supported",
            [],
        ),
    ],
)
def test_origin_query_auth_order(
    headers: list[tuple[bytes, bytes]],
    query: bytes,
    status: int,
    message: str,
    selected: list[str | None],
) -> None:
    async def scenario() -> None:
        async with harness() as (routes, _, auth):
            req, _ = request(headers, query)
            response = await invoke(routes, req)
            assert response.status_code == status
            assert response.body == f'{{"message":"{message}","status":{status}}}'.encode()
            assert auth.selected == selected

    asyncio.run(scenario())


@pytest.mark.parametrize("cookie", [False, True])
def test_cookie_or_bearer_setup_headers_and_explicit_close(cookie: bool) -> None:
    async def scenario() -> None:
        async with harness() as (routes, sync, auth):
            headers = [(b"origin", ORIGIN.encode())]
            headers += (
                [(b"cookie", f"spellbook_session={TOKEN}".encode())]
                if cookie
                else [(b"authorization", f"Bearer {TOKEN}".encode())]
            )
            req, _ = request(headers, b"&&")
            response = await routes.handle(req)
            assert isinstance(response, SavedStateResponse)
            assert response.status_code == 200
            assert dict(response.headers) == {
                "content-type": "text/event-stream",
                "cache-control": "no-store",
                "x-accel-buffering": "no",
                "connection": "keep-alive",
            }
            assert auth.selected == [TOKEN]
            assert sync.diagnostics()["subscribers"] == 1
            await response.close()
            assert not sync.diagnostics()["subscribers"]

    asyncio.run(scenario())


@pytest.mark.parametrize("revoked", [False, True])
def test_setup_failure_is_status_before_headers(revoked: bool) -> None:
    async def scenario() -> None:
        async with harness() as (routes, sync, auth):
            auth.revoked, auth.failure = revoked, not revoked
            response = await invoke(routes, request()[0])
            assert response.status_code == (401 if revoked else 503)
            assert b"private" not in response.body
            assert not sync.diagnostics()["subscribers"]

    asyncio.run(scenario())


def test_setup_timeout_disconnect_and_shutdown_leave_no_late_stream(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(core_module, "SAVED_STATE_SETUP_SECONDS", 0.02)

    async def scenario() -> None:
        async with harness(ready=False) as (routes, sync, _):
            response = await invoke(routes, request()[0])
            assert response.status_code == 503
            assert not sync.diagnostics()["subscribers"]
            req, incoming = request()
            pending = asyncio.create_task(invoke(routes, req))
            await until(lambda: bool(sync.diagnostics()["subscribers"]))
            incoming.put_nowait({"type": "http.disconnect"})
            assert (await pending).status_code == 503
            assert not sync.diagnostics()["subscribers"]
            pending = asyncio.create_task(invoke(routes, request()[0]))
            await until(lambda: bool(sync.diagnostics()["subscribers"]))
            await routes.close_streams()
            assert (await pending).status_code == 503
            assert (await invoke(routes, request()[0])).status_code == 503

    asyncio.run(scenario())


def test_heartbeat_retains_one_pull_and_delivery_revocation_blocks_protected_frame(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sse, "SAVED_STATE_HEARTBEAT_SECONDS", 0.01)

    async def scenario() -> None:
        async with harness() as (routes, sync, auth):
            req, _ = request()
            response = await routes.handle(req)
            sent: list[Message] = []
            heartbeat, release = asyncio.Event(), asyncio.Event()

            async def send(message: Message) -> None:
                sent.append(message)
                if message.get("body") == b": heartbeat\n\n":
                    heartbeat.set()
                    await release.wait()

            body = asyncio.create_task(response(req.scope, req.receive, send))
            await heartbeat.wait()
            pulls = [task for task in asyncio.all_tasks() if task.get_name() == "saved-state-pull"]
            assert len(pulls) == 1
            sync.receive_notification(1, '{"accountId":"one","topic":"inventory"}')
            await until(lambda: sync.diagnostics()["reservedEvents"] == 1)
            assert pulls[0].done()
            auth.revoked = True
            release.set()
            await body
            content = b"".join(message.get("body", b"") for message in sent)
            assert b"event: reset\ndata: {}\n\n" in content
            assert b": heartbeat\n\n" in content
            assert b"event: auth-expired\ndata: {}\n\n" in content
            assert b"event: invalidate" not in content

    asyncio.run(scenario())


def test_send_is_awaited_without_prefetch_and_slow_send_is_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sse, "SAVED_STATE_SEND_SECONDS", 0.02)

    async def scenario() -> None:
        async with harness() as (routes, _, auth):
            req, _ = request()
            response = await routes.handle(req)
            blocked = asyncio.Event()

            async def send(message: Message) -> None:
                if message.get("body", b"").startswith(b"event: reset"):
                    blocked.set()
                    await asyncio.Event().wait()

            body = asyncio.create_task(response(req.scope, req.receive, send))
            await blocked.wait()
            calls = auth.calls
            assert not [
                task for task in asyncio.all_tasks() if task.get_name() == "saved-state-pull"
            ]
            await asyncio.sleep(0)
            assert auth.calls == calls
            with pytest.raises(TimeoutError):
                await body

    asyncio.run(scenario())


@pytest.mark.parametrize("mode", ["disconnect", "shutdown", "body_cancel"])
def test_close_settles_inflight_pull_and_send(mode: str) -> None:
    async def scenario() -> None:
        async with harness() as (routes, sync, _):
            req, incoming = request()
            response = await routes.handle(req)
            blocked, settled = asyncio.Event(), asyncio.Event()

            async def send(message: Message) -> None:
                if message.get("body", b"").startswith(b"event: reset"):
                    blocked.set()
                    try:
                        await asyncio.Event().wait()
                    finally:
                        settled.set()

            body = asyncio.create_task(response(req.scope, req.receive, send))
            await blocked.wait()
            if mode == "disconnect":
                incoming.put_nowait({"type": "http.disconnect"})
                await body
            elif mode == "shutdown":
                await routes.close_streams()
                await body
            else:
                body.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await body
            assert settled.is_set()
            assert not sync.diagnostics()["subscribers"]

    asyncio.run(scenario())


def test_recovering_then_new_reset_keep_the_stream_open() -> None:
    async def scenario() -> None:
        async with harness() as (routes, sync, _):
            req, _ = request()
            response = await routes.handle(req)
            first, recovering, replacement = asyncio.Event(), asyncio.Event(), asyncio.Event()
            resets = 0

            async def send(message: Message) -> None:
                nonlocal resets
                content = message.get("body", b"")
                if content.startswith(b"event: reset"):
                    resets += 1
                    (first if resets == 1 else replacement).set()
                if content.startswith(b"event: recovering"):
                    recovering.set()

            body = asyncio.create_task(response(req.scope, req.receive, send))
            await first.wait()
            assert sync.listener_lost(1, "consumer")
            await recovering.wait()
            assert not body.done()
            assert sync.listener_starting(2)
            assert await sync.listener_ready(2)
            await replacement.wait()
            assert sync.diagnostics()["subscribers"] == 1
            await routes.close_streams()
            await body

    asyncio.run(scenario())
