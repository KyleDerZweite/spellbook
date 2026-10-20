"""Manual assembled-host acceptance. Not selected by ordinary pytest discovery.

Requires the exclusive sse lease, two 10+1 API budgets and fixture pool2 <=24/32.
Installed Python and built Node artifacts are explicit inputs, never substituted.
"""

import asyncio
import json
import os
import signal
import socket
import subprocess
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx2
import pytest
from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import AsyncConnectionPool
from spellbook_core.db import Transaction
from test_cross_runtime import _core_native_helpers

from spellbook_api.application import ApplicationResources, create_application
from spellbook_api.http.types import Configuration
from spellbook_api.main import NODE_HTTP_METHODS, CandidateServer

ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.skipif(
    not os.environ.get("P02B_SHARED_NATIVE_DATABASE"), reason="Manual exclusive sse lease required"
)
ORIGIN = os.environ.get("P02B_PUBLIC_ORIGIN", "http://127.0.0.1:5191")
OUT = ROOT / ".local/p02b-shared-integration"


def port() -> int:
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return int(reservation.getsockname()[1])


async def until(predicate: Callable[[], Awaitable[bool]], seconds: float = 5) -> None:
    async with asyncio.timeout(seconds):
        while not await predicate():
            await asyncio.sleep(0.01)


@dataclass(frozen=True)
class World:
    pool: AsyncConnectionPool[Transaction]
    account_id: str
    token: str
    printing: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": "Bearer " + self.token}


@asynccontextmanager
async def world() -> AsyncIterator[World]:
    target = os.environ["P02B_SHARED_NATIVE_DATABASE"]
    assert target == "sb_py_0e56d611_sse"
    dsn = os.environ["TEST_DATABASE_URL"]
    assert dsn == os.environ["DATABASE_URL"]
    assert conninfo_to_dict(dsn).get("dbname") == target
    helpers = _core_native_helpers()
    pool: AsyncConnectionPool[Transaction] = AsyncConnectionPool(
        dsn,
        open=False,
        min_size=0,
        max_size=2,
        timeout=2,
        max_waiting=32,
        kwargs={"application_name": "p02b-host-fixture"},
    )
    await pool.open()
    try:
        async with helpers.native_catalog(pool), helpers.native_account(pool) as (account, token):
            yield World(pool, account, token, str(helpers.CARD["id"]))
    finally:
        await pool.close()


@dataclass(frozen=True)
class ProcessHost:
    url: str
    child: subprocess.Popen[bytes]


@asynccontextmanager
async def process_host(kind: str, *, api_url: str | None = None) -> AsyncIterator[ProcessHost]:
    selected = int(ORIGIN.rsplit(":", 1)[1]) if kind == "web" else port()
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("PG") and k not in {"PYTHONPATH", "PYTHONHOME"}
    }
    env.update(
        APP_ORIGIN=ORIGIN,
        API_HOST="127.0.0.1",
        API_PORT=str(selected),
        VALUE_HISTORY_ENABLED="false",
    )
    if kind == "python":
        interpreter = Path(os.environ["P02B_INSTALLED_PYTHON"]).absolute()
        assert ROOT not in interpreter.parents
        command = [str(interpreter), "-m", "spellbook_api.main"]
    else:
        node = os.environ["P02B_NODE_EXECUTABLE"]
        assert subprocess.check_output([node, "--version"], text=True).strip() == "v26.10.0"
        assert (
            set(
                json.loads(
                    subprocess.check_output(
                        [node, "-p", "JSON.stringify(require('node:http').METHODS)"], text=True
                    )
                )
            )
            == NODE_HTTP_METHODS
        )
        command = [
            node,
            str(ROOT / ("backend/dist/main.js" if kind == "node" else "frontend/build/index.js")),
        ]
    if kind == "web":
        env = {
            k: v
            for k, v in env.items()
            if k in {"PATH", "HOME", "TMPDIR", "LANG", "TZ", "APP_ORIGIN"}
        }
        env.update(
            HOST="127.0.0.1",
            PORT=str(selected),
            API_INTERNAL_URL=api_url or "",
            SHUTDOWN_TIMEOUT="1",
            BODY_SIZE_LIMIT="12M",
        )
    work = OUT / ("process-cwd-" + uuid4().hex)
    work.mkdir()
    log_path = OUT / f"{kind}-{uuid4().hex}.log"
    with log_path.open("wb") as log:
        child = subprocess.Popen(command, cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            async with httpx2.AsyncClient(timeout=1) as client:

                async def healthy() -> bool:
                    assert child.poll() is None, (
                        f"Owned {kind} host exited before readiness; see {log_path.name}"
                    )
                    try:
                        return (
                            await client.get(f"http://127.0.0.1:{selected}/openapi.json")
                        ).status_code == 200
                    except httpx2.HTTPError:
                        return False

                await until(healthy, 10)
            yield ProcessHost(f"http://127.0.0.1:{selected}", child)
        finally:
            if child.poll() is None:
                child.send_signal(signal.SIGTERM)
            result = await asyncio.to_thread(child.wait, timeout=15)
            assert result in {0, -signal.SIGTERM}, (kind, result, log_path.name)


@asynccontextmanager
async def source_host(
    *, small_socket: bool = False
) -> AsyncIterator[tuple[str, ApplicationResources, CandidateServer]]:
    selected = port()
    configuration = Configuration(
        ORIGIN, port=selected, database_url=os.environ["TEST_DATABASE_URL"]
    )
    lifetime = create_application(configuration)
    resources = cast(ApplicationResources, lifetime.http.state.resources)
    server = CandidateServer(lifetime, configuration)
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if small_socket:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024)
    listener.bind(("127.0.0.1", selected))
    listener.listen(128)
    listener.setblocking(False)
    task = asyncio.create_task(server.serve(sockets=[listener]), name="owned-native-host")

    async def healthy() -> bool:
        if task.done():
            await task
            raise AssertionError("Owned host exited before readiness")
        return server.started

    try:
        await until(healthy)
        yield f"http://127.0.0.1:{selected}", resources, server
    finally:
        server.should_exit = True
        async with asyncio.timeout(15):
            await task
            await lifetime.close()
        listener.close()


@asynccontextmanager
async def events(
    client: httpx2.AsyncClient, url: str, headers: dict[str, str]
) -> AsyncIterator[Callable[[], Awaitable[str]]]:
    async with client.stream(
        "GET", url + "/api/account/events", headers=headers, timeout=None
    ) as response:
        assert response.status_code == 200
        lines = response.aiter_lines()

        async def next_event() -> str:
            async with asyncio.timeout(6):
                async for line in lines:
                    if line.startswith("event: "):
                        name = line[7:]
                        async for tail in lines:
                            if tail == "":
                                return name
            raise AssertionError("SSE ended before an event")

        yield next_event


def payload(w: World, request_id: str, quantity: int) -> dict[str, object]:
    return {
        "requestId": request_id,
        "items": [{"catalogCardId": w.printing, "quantity": quantity}],
    }


async def add(
    client: httpx2.AsyncClient, url: str, w: World, body: dict[str, object]
) -> dict[str, Any]:
    response = await client.post(
        url + "/api/mobile/v1/mtg/inventory", json=body, headers=w.headers
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


async def parity_failures(
    client: httpx2.AsyncClient, url: str, w: World
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for method, path, headers, body in [
        ("GET", "/api/auth/session", w.headers, None),
        (
            "GET",
            "/api/auth/session",
            {"Authorization": "", "Cookie": "spellbook_session=" + w.token},
            None,
        ),
        ("GET", "/api/catalog/printings/%C3%28", {"Cookie": "spellbook_session=" + w.token}, None),
        ("GET", "/api/catalog/printings/%2520", w.headers, None),
        (
            "POST",
            "/api/mobile/v1/mtg/inventory",
            {**w.headers, "Content-Type": "text/plain", "Origin": ORIGIN},
            b"{}",
        ),
        (
            "POST",
            "/api/mobile/v1/mtg/inventory",
            {**w.headers, "Content-Type": "application/json"},
            b"\xff",
        ),
        ("OPTIONS", "/api/mobile/v1/mtg/inventory/", {}, None),
        ("TRACE", "/api/mobile/v1/mtg/inventory/" + str(uuid4()), {}, None),
        ("TRACK", "/api/mobile/v1/mtg/inventory/" + str(uuid4()), {}, None),
    ]:
        response = await client.request(method, url + path, headers=headers, content=body)
        result.append(
            {
                "status": response.status_code,
                "body": response.json() if response.content else None,
                "cache": response.headers.get("cache-control"),
                "robots": response.headers.get("x-robots-tag"),
                "allow": response.headers.get("allow"),
                "cookies": response.headers.get_list("set-cookie"),
            }
        )
    return result


async def assert_connect_closes_without_response(url: str) -> None:
    from urllib.parse import urlsplit

    parsed = urlsplit(url)
    assert parsed.hostname is not None and parsed.port is not None
    for target, keep_alive in [("/openapi.json", False), ("example.com:443", True)]:
        reader, writer = await asyncio.open_connection(parsed.hostname, parsed.port)
        try:
            if keep_alive:
                writer.write(b"GET /openapi.json HTTP/1.1\r\nHost: localhost\r\n\r\n")
                await writer.drain()
                headers = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 2)
                assert headers.startswith(b"HTTP/1.1 200")
                length = next(
                    int(line.split(b":", 1)[1])
                    for line in headers.split(b"\r\n")
                    if line.lower().startswith(b"content-length:")
                )
                await asyncio.wait_for(reader.readexactly(length), 2)
            # Split the method across TCP writes so rejection depends on the
            # parsed request rather than the layout of received packets.
            writer.write(b"CON")
            await writer.drain()
            await asyncio.sleep(0.01)
            writer.write(("NECT " + target + " HTTP/1.1\r\nHost: localhost\r\n\r\n").encode())
            await writer.drain()
            assert await asyncio.wait_for(reader.read(), 2) == b""
        finally:
            writer.close()
            await writer.wait_closed()


def test_built_node_and_installed_python_replay_original_receipts_and_wire_failures() -> None:
    async def exercise() -> None:
        async with world() as w, httpx2.AsyncClient(timeout=5) as client:
            first, second = str(uuid4()), str(uuid4())
            first_body, second_body = payload(w, first, 2), payload(w, second, 3)
            async with process_host("node") as node:
                await assert_connect_closes_without_response(node.url)
                node_wire = await parity_failures(client, node.url, w)
                original = await add(client, node.url, w, first_body)
            async with process_host("python") as candidate:
                await assert_connect_closes_without_response(candidate.url)
                assert await parity_failures(client, candidate.url, w) == node_wire
                assert await add(client, candidate.url, w, first_body) == original
                python_ack = await lost_reply_add(candidate.url, w, second_body)
                assert python_ack["changes"][0]["quantity"] == 5
                altered = await client.post(
                    candidate.url + "/api/mobile/v1/mtg/inventory",
                    headers=w.headers,
                    json=payload(w, first, 4),
                )
                assert altered.status_code == 409 and altered.json()["kind"] == "RequestConflict"
                async with w.pool.connection() as tx:
                    receipts = await (
                        await tx.execute(
                            (
                                "SELECT request_id,request_hash,acknowledgement "
                                "FROM inventory_mutation_requests "
                                "WHERE account_id=%s ORDER BY request_id"
                            ),
                            (w.account_id,),
                        )
                    ).fetchall()
                    assert len(receipts) == 2 and all(row[1] and row[2] for row in receipts)
                    await tx.execute(
                        "DELETE FROM inventory_cards WHERE account_id=%s", (w.account_id,)
                    )
            async with process_host("node") as node:
                assert await add(client, node.url, w, second_body) == python_ack
                replacement = await add(client, node.url, w, payload(w, str(uuid4()), 7))
                assert replacement["changes"][0]["quantity"] == 7
                assert await add(client, node.url, w, first_body) == original
            async with process_host("python") as candidate:
                assert await add(client, candidate.url, w, second_body) == python_ack
                detail = await client.get(
                    candidate.url
                    + "/api/mobile/v1/mtg/inventory/"
                    + replacement["changes"][0]["entryId"],
                    headers=w.headers,
                )
                assert detail.status_code == 200 and detail.json()["entry"]["quantity"] == 7
                async with w.pool.connection() as tx:
                    after = await (
                        await tx.execute(
                            (
                                "SELECT request_id,request_hash,acknowledgement "
                                "FROM inventory_mutation_requests "
                                "WHERE account_id=%s AND request_id=ANY(%s) ORDER BY request_id"
                            ),
                            (w.account_id, [first, second]),
                        )
                    ).fetchall()
                    assert receipts == after

    asyncio.run(exercise())


def test_installed_replicas_proxy_revocation_and_physical_listener_reconnect() -> None:
    async def exercise() -> None:
        async with (
            world() as w,
            httpx2.AsyncClient(timeout=5) as client,
            process_host("python") as primary,
            process_host("python") as replica,
            events(client, primary.url, w.headers) as one,
            events(client, replica.url, w.headers) as two,
        ):
            assert await one() == "reset" and await two() == "reset"
            async with w.pool.connection() as tx:
                listeners = await (
                    await tx.execute(
                        "SELECT pid,application_name FROM pg_stat_activity "
                        "WHERE datname=current_database() "
                        "AND application_name LIKE 'spellbook-python-listener:%' ORDER BY pid"
                    )
                ).fetchall()
            assert len(listeners) == 2
            assert {int(str(row[1]).split(":")[-1]) for row in listeners} == {
                primary.child.pid,
                replica.child.pid,
            }
            await add(client, primary.url, w, payload(w, str(uuid4()), 1))
            assert await one() == "invalidate" and await two() == "invalidate"
            async with process_host("web", api_url=primary.url) as proxy:
                direct = await client.get(primary.url + "/api/auth/session", headers=w.headers)
                via = await client.get(proxy.url + "/api/auth/session", headers=w.headers)
                assert direct.status_code == via.status_code == 200 and direct.json() == via.json()
                async with events(client, proxy.url, w.headers) as proxied:
                    assert await proxied() == "reset"
            async with w.pool.connection() as tx:
                target = next(
                    row for row in listeners if str(row[1]).endswith(":" + str(primary.child.pid))
                )
                await tx.execute("SELECT pg_terminate_backend(%s)", (target[0],))
            assert await one() == "recovering"
            assert await one() == "reset"
            async with w.pool.connection() as tx:
                current = await (
                    await tx.execute(
                        (
                            "SELECT pid FROM pg_stat_activity "
                            "WHERE datname=current_database() AND application_name=%s"
                        ),
                        ("spellbook-python-listener:" + str(primary.child.pid),),
                    )
                ).fetchall()
                assert len(current) == 1 and current[0][0] != target[0]
                await tx.execute("DELETE FROM auth_sessions WHERE account_id=%s", (w.account_id,))
                await tx.execute(
                    "SELECT pg_notify('spellbook_saved_state',%s)",
                    (json.dumps({"accountId": w.account_id, "topic": "auth"}),),
                )
            assert await one() == "auth-expired" and await two() == "auth-expired"

    asyncio.run(exercise())


def test_native_close_failure_blocks_replacement_and_shutdown_is_pool_last(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        async with (
            world() as w,
            source_host() as (url, resources, _server),
            httpx2.AsyncClient(timeout=5) as client,
        ):
            async with events(client, url, w.headers) as stream:
                assert await stream() == "reset"
                connection = resources.listener._connection
                assert connection is not None
                original = AsyncConnection.close

                async def failed(self: AsyncConnection[tuple[object, ...]]) -> None:
                    if self is connection:
                        raise OSError("injected before actual physical close")
                    await original(self)

                monkeypatch.setattr(AsyncConnection, "close", failed)
                try:
                    resources.listener.request_recovery(
                        resources.listener.generation, "auth_check"
                    )
                    assert await stream() == "recovering"

                    async def blocked() -> bool:
                        return resources.listener.blocked

                    await until(blocked)
                    await asyncio.sleep(0.55)
                    async with w.pool.connection() as tx:
                        pids = await (
                            await tx.execute(
                                (
                                    "SELECT pid FROM pg_stat_activity "
                                    "WHERE datname=current_database() AND application_name=%s"
                                ),
                                ("spellbook-python-listener:" + str(os.getpid()),),
                            )
                        ).fetchall()
                    assert len(pids) == 1 and pids[0][0] == connection.info.backend_pid
                finally:
                    monkeypatch.setattr(AsyncConnection, "close", original)
            begin = time.monotonic()
            await resources.close_streams()
            await resources.close()
            assert time.monotonic() - begin < 15
            assert resources.pool.closed and connection.closed
            assert resources.saved_state.diagnostics()["authorityTasks"] == 0

    asyncio.run(exercise())


def test_actual_sse_head_admission_and_shutdown_with_32_live_streams(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def exercise() -> None:
        async with (
            world() as w,
            source_host() as (url, resources, server),
            httpx2.AsyncClient(timeout=5) as client,
            AsyncExitStack() as streams,
        ):
            head = await client.head(url + "/api/account/events", headers=w.headers)
            assert head.status_code == 200 and head.content == b""
            assert resources.saved_state.diagnostics()["heldSubscriptions"] == 0
            for _ in range(32):
                stream = await streams.enter_async_context(events(client, url, w.headers))
                assert await stream() == "reset"
            assert resources.saved_state.diagnostics()["subscribers"] == 32
            rejected = await client.get(url + "/api/account/events", headers=w.headers)
            assert rejected.status_code == 503
            assert resources.saved_state.diagnostics()["subscribers"] == 32
            started = time.monotonic()
            server.should_exit = True

            async def closed() -> bool:
                return resources.pool.closed

            await until(closed, 15)
            assert time.monotonic() - started < 15
            diagnostic = resources.saved_state.diagnostics()
            assert diagnostic["subscribers"] == diagnostic["authorityTasks"] == 0
            assert diagnostic["backgroundTasks"] == diagnostic["heldSubscriptions"] == 0

    asyncio.run(exercise())
    assert "ASGI callable returned without completing response" not in capsys.readouterr().err


def test_actual_tcp_backpressure_disposes_slow_reader_within_30_second_bound() -> None:
    async def exercise() -> None:
        async with world() as w, source_host(small_socket=True) as (url, resources, server):
            loop = asyncio.get_running_loop()
            client = socket.socket()
            client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
            client.setblocking(False)
            try:
                await loop.sock_connect(client, ("127.0.0.1", int(url.rsplit(":", 1)[1])))
                request = (
                    "GET /api/account/events HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                    + "Authorization: Bearer "
                    + w.token
                    + "\r\n\r\n"
                ).encode()
                await loop.sock_sendall(client, request)
                headers = b""
                async with asyncio.timeout(5):
                    while b"\r\n\r\n" not in headers:
                        headers += await loop.sock_recv(client, 4096)
                assert headers.startswith(b"HTTP/1.1 200")
                high_water = 0
                async with w.pool.connection() as tx, asyncio.timeout(20):
                    while high_water < 65536:
                        await tx.execute(
                            "SELECT pg_notify('spellbook_saved_state',%s)",
                            (json.dumps({"accountId": w.account_id, "topic": "inventory"}),),
                        )
                        await tx.commit()
                        await asyncio.sleep(0.002)
                        high_water = max(
                            (
                                cast(Any, protocol).transport.get_write_buffer_size()
                                for protocol in server.server_state.connections
                            ),
                            default=0,
                        )
                observed = time.monotonic()

                async def disposed() -> bool:
                    return resources.saved_state.diagnostics()["heldSubscriptions"] == 0

                await until(disposed, 31)
                elapsed = time.monotonic() - observed
                assert elapsed <= 31
                (OUT / "slow-reader.json").write_text(
                    json.dumps(
                        {
                            "tcp": True,
                            "socketBufferBytes": 1024,
                            "writeBufferObservedBytes": high_water,
                            "secondsAfterObservedBackpressure": elapsed,
                            "limitSeconds": 30,
                            "timerToleranceSeconds": 1,
                            "resourceGateClaim": False,
                        },
                        indent=2,
                    )
                    + "\n"
                )
            finally:
                client.close()

    asyncio.run(exercise())


def test_installed_private_hook_owns_same_process_native_lanes_and_shutdown() -> None:
    async def exercise() -> None:
        async with world() as w, httpx2.AsyncClient(timeout=5) as client:
            interpreter = Path(os.environ["P02B_INSTALLED_PYTHON"]).absolute()
            assert ROOT not in interpreter.parents
            selected = port()
            identifier = uuid4().hex
            wrapper = OUT / ("private-host-" + identifier + ".py")
            report_file = OUT / ("private-report-" + identifier + ".json")
            provenance_file = OUT / ("private-provenance-" + identifier + ".json")
            wrapper.write_text(
                "import asyncio,json,os,sys\n"
                "from dataclasses import asdict\n"
                "from importlib.resources import files\n"
                "from pathlib import Path\n"
                "import spellbook_api,spellbook_core\n"
                "from spellbook_api.main import serve\n"
                "from spellbook_api.http.types import Configuration\n"
                "from spellbook_api.verification import VerificationPlan\n"
                "Path(sys.argv[2]).write_text(json.dumps({'pid':os.getpid(),"
                "'api':spellbook_api.__file__,'core':spellbook_core.__file__,"
                "'schemaBytes':len(files('spellbook_api').joinpath('openapi.json').read_bytes())}))\n"
                "def sink(report):\n"
                " Path(sys.argv[1]).write_text(json.dumps(asdict(report)))\n"
                "asyncio.run(serve(Configuration.from_environment(os.environ),"
                "verification_plan=VerificationPlan(concurrent_scrypt=True),verification_sink=sink))\n"
            )
            env = {
                k: v
                for k, v in os.environ.items()
                if not k.startswith("PG") and k not in {"PYTHONHOME", "PYTHONPATH"}
            }
            env.update(APP_ORIGIN=ORIGIN, API_HOST="127.0.0.1", API_PORT=str(selected))
            with (OUT / ("private-host-" + identifier + ".log")).open("wb") as log:
                child = subprocess.Popen(
                    [str(interpreter), str(wrapper), str(report_file), str(provenance_file)],
                    cwd=OUT,
                    env=env,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
                try:

                    async def healthy() -> bool:
                        assert child.poll() is None
                        try:
                            return (
                                await client.get(f"http://127.0.0.1:{selected}/openapi.json")
                            ).status_code == 200
                        except httpx2.HTTPError:
                            return False

                    await until(healthy, 10)
                    response = await client.get(
                        f"http://127.0.0.1:{selected}/api/auth/session", headers=w.headers
                    )
                    assert response.status_code == 200
                    await asyncio.sleep(0.05)
                finally:
                    if child.poll() is None:
                        child.send_signal(signal.SIGTERM)
                    assert await asyncio.to_thread(child.wait, timeout=15) in {0, -signal.SIGTERM}
            report = json.loads(report_file.read_text())
            provenance = json.loads(provenance_file.read_text())
            assert report["pid"] == provenance["pid"] == child.pid
            assert report["phase"] == "warmup" and report["interrupted"]
            assert report["active_max"] == 4 and report["lag_observations"] > 0
            assert report["instrumentation"] == "spellbook-p01-monotonic-10ms-now-plus-interval-v1"
            assert sum(case["completed"] + case["drained"] for case in report["cases"]) >= 4
            assert all(case["failed"] == case["drain_failed"] == 0 for case in report["cases"])
            assert all("/site-packages/" in provenance[key] for key in ["api", "core"])

    asyncio.run(exercise())


async def lost_reply_add(url: str, w: World, body: dict[str, object]) -> dict[str, Any]:
    wire = json.dumps(body).encode()
    connection = socket.socket()
    connection.setblocking(False)
    loop = asyncio.get_running_loop()
    try:
        await loop.sock_connect(connection, ("127.0.0.1", int(url.rsplit(":", 1)[1])))
        await loop.sock_sendall(
            connection,
            (
                "POST /api/mobile/v1/mtg/inventory HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                + "Authorization: Bearer "
                + w.token
                + "\r\nContent-Type: application/json\r\n"
                + "Content-Length: "
                + str(len(wire))
                + "\r\n\r\n"
            ).encode()
            + wire,
        )
        async with asyncio.timeout(5):
            while True:
                async with w.pool.connection() as tx:
                    row = await (
                        await tx.execute(
                            "SELECT acknowledgement FROM inventory_mutation_requests "
                            "WHERE account_id=%s AND request_id=%s",
                            (w.account_id, body["requestId"]),
                        )
                    ).fetchone()
                if row:
                    # The client consumes zero response bytes; the database is the test oracle.
                    return cast(dict[str, Any], row[0])
                await asyncio.sleep(0.005)
    finally:
        connection.close()


def test_native_disconnect_before_profile_lock_settles_rollback_and_admission() -> None:
    async def exercise() -> None:
        async with world() as w, source_host() as (url, resources, _server):
            request_id = str(uuid4())
            wire = json.dumps(payload(w, request_id, 1)).encode()
            connection = socket.socket()
            connection.setblocking(False)
            loop = asyncio.get_running_loop()
            try:
                async with w.pool.connection() as blocker:
                    await blocker.execute("BEGIN")
                    await blocker.execute(
                        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                        (w.account_id,),
                    )
                    await loop.sock_connect(connection, ("127.0.0.1", int(url.rsplit(":", 1)[1])))
                    await loop.sock_sendall(
                        connection,
                        (
                            "POST /api/mobile/v1/mtg/inventory HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                            + "Authorization: Bearer "
                            + w.token
                            + "\r\nContent-Type: application/json\r\n"
                            + "Content-Length: "
                            + str(len(wire))
                            + "\r\n\r\n"
                        ).encode()
                        + wire,
                    )

                    async def blocked() -> bool:
                        async with w.pool.connection() as tx:
                            row = await (
                                await tx.execute(
                                    "SELECT count(*) FROM pg_stat_activity "
                                    "WHERE datname=current_database() AND application_name=%s "
                                    "AND wait_event_type='Lock'",
                                    ("spellbook-python-api:" + str(os.getpid()),),
                                )
                            ).fetchone()
                        return bool(row and row[0])

                    await until(blocked)
                    connection.close()

                    async def settled() -> bool:
                        return resources.admission.active == 0

                    await until(settled)
                    assert resources.pool.get_stats().get("requests_waiting", 0) == 0
                    await blocker.execute("ROLLBACK")
                async with w.pool.connection() as tx:
                    row = await (
                        await tx.execute(
                            "SELECT count(*) FROM inventory_mutation_requests "
                            "WHERE account_id=%s AND request_id=%s",
                            (w.account_id, request_id),
                        )
                    ).fetchone()
                    assert row and row[0] == 0
            finally:
                connection.close()

    asyncio.run(exercise())


def test_native_authority_failure_signals_recovery_after_local_fence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from spellbook_core.models import Actor, SessionInfo
    from spellbook_core.saved_state import ListenerFailure

    async def exercise() -> None:
        async with (
            world() as w,
            source_host() as (url, resources, _server),
            httpx2.AsyncClient(timeout=5) as client,
            events(client, url, w.headers) as stream,
        ):
            assert await stream() == "reset"
            previous = resources.listener.generation
            connection = resources.listener._connection
            assert connection is not None
            original = resources.auth.actor_session
            original_recovery = resources.saved_state._request_recovery
            signals: list[tuple[int, str]] = []
            failed = False

            async def authority(actor: Actor) -> SessionInfo:
                nonlocal failed
                if not failed:
                    failed = True
                    raise OSError("injected authority infrastructure failure")
                return await original(actor)

            def recover(generation: int, reason: ListenerFailure) -> None:
                assert not resources.saved_state.diagnostics()["ready"]
                signals.append((generation, reason))
                original_recovery(generation, reason)

            monkeypatch.setattr(resources.auth, "actor_session", authority)
            monkeypatch.setattr(resources.saved_state, "_request_recovery", recover)
            async with w.pool.connection() as tx:
                await tx.execute(
                    "SELECT pg_notify('spellbook_saved_state',%s)",
                    (json.dumps({"accountId": w.account_id, "topic": "inventory"}),),
                )
            assert await stream() == "recovering"
            assert await stream() == "reset"
            assert signals == [(previous, "auth_check")]
            assert resources.listener.generation > previous and connection.closed
            assert resources.saved_state.diagnostics()["ready"]
            async with w.pool.connection() as tx:
                row = await (
                    await tx.execute(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE datname=current_database() AND application_name=%s",
                        ("spellbook-python-listener:" + str(os.getpid()),),
                    )
                ).fetchone()
                assert row and row[0] == 1

    asyncio.run(exercise())
