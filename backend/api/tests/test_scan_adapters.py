"""Actual transient worker HTTP calls against a task-owned fixture."""

import asyncio
import base64
import contextlib
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest
from spellbook_core.mtg.scan.types import WorkerInput

from spellbook_api.scan_worker import HttpScanWorker

SESSION = "11111111-1111-4111-8111-111111111111"
ARTIFACT = "22222222-2222-4222-8222-222222222222"
PNG = b"\x89PNG\r\n\x1a\nfixture"
INPUT: WorkerInput = {
    "sessionId": SESSION,
    "artifactId": ARTIFACT,
    "imageSha256": sha256(PNG).hexdigest(),
    "contentType": "image/png",
    "fileName": "card.png",
}
RAW = {
    "status": "no_match",
    "imageSha256": INPUT["imageSha256"],
    "qualityScore": 0,
    "embeddingModelVersion": "stub-v1",
    "ocrModelVersion": "stub-v1",
    "ocrTokens": {},
    "candidates": [],
}


@dataclass
class Endpoint:
    url: str = ""
    response: bytes = json.dumps(RAW).encode()
    status: int = 200
    requests: list[tuple[str, str, bytes, dict[str, str]]] = field(default_factory=list)
    stall: bool = False
    release: threading.Event = field(default_factory=threading.Event)


@pytest.fixture
def endpoint() -> Iterator[Endpoint]:
    state = Endpoint()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: object) -> None:
            pass

        def _read(self) -> bytes:
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            state.requests.append((self.command, self.path, body, dict(self.headers)))
            return body

        def _reply(self, status: int, body: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                self.wfile.write(body)

        def do_POST(self) -> None:
            self._read()
            if state.stall:
                state.release.wait(timeout=40)
            self._reply(state.status, state.response)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    state.url = f"http://127.0.0.1:{server.server_port}"
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.05))
    thread.start()
    try:
        yield state
    finally:
        state.release.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()


def test_worker_real_http_request_and_scaffold_json(endpoint: Endpoint) -> None:
    async def scenario() -> None:
        worker = HttpScanWorker(endpoint.url + "/")
        try:
            assert await worker.process(INPUT, PNG) == RAW
            method, path, body, headers = endpoint.requests[0]
            assert (method, path) == ("POST", "/v1/scan/process")
            payload = json.loads(body)
            assert payload.pop("imageBase64") == base64.b64encode(PNG).decode()
            assert payload == INPUT and headers["Content-Type"] == "application/json"
        finally:
            await worker.close()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "body,status",
    [
        (b"x" * (1024 * 1024 + 1), 200),
        (b"not JSON", 200),
        (b"\xff", 200),
        (b"NaN", 200),
        (b"{}", 503),
    ],
)
def test_worker_rejects_actual_http_failure_and_oversize(
    endpoint: Endpoint, body: bytes, status: int
) -> None:
    endpoint.response, endpoint.status = body, status

    async def scenario() -> None:
        worker = HttpScanWorker(endpoint.url)
        try:
            with pytest.raises((RuntimeError, ValueError)):
                await worker.process(INPUT, PNG)
        finally:
            await worker.close()

    asyncio.run(scenario())


def test_worker_production_deadline_aborts_stalled_http(endpoint: Endpoint) -> None:
    endpoint.stall = True

    async def scenario() -> None:
        worker = HttpScanWorker(endpoint.url)
        started = time.monotonic()
        try:
            with pytest.raises(TimeoutError):
                await worker.process(INPUT, PNG)
            assert 29 <= time.monotonic() - started < 35
        finally:
            endpoint.release.set()
            await worker.close()

    asyncio.run(scenario())


def test_adapter_against_actual_scaffold_source_over_tcp(tmp_path: Path) -> None:
    # Task-owned fixture child only, without provider configuration. This exercises
    # actual worker source using the API test environment, not its production lock.
    root = Path(__file__).resolve().parents[3]
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    with (tmp_path / "scan-worker.log").open("w+") as log:
        child = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "scan_worker.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=tmp_path,
            env={
                "PATH": os.environ.get("PATH", ""),
                "PYTHONPATH": str(root / "backend/workers/scan/src"),
            },
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            url = f"http://127.0.0.1:{port}"
            for _ in range(100):
                assert child.poll() is None, "Owned worker exited before readiness"
                try:
                    with urlopen(url + "/health", timeout=1) as response:
                        assert json.load(response) == {"status": "ok"}
                    break
                except URLError:
                    time.sleep(0.05)
            else:
                pytest.fail("Owned worker did not become ready")

            async def scenario() -> None:
                worker = HttpScanWorker(url)
                try:
                    assert await worker.process(INPUT, PNG) == RAW
                finally:
                    await worker.close()

            asyncio.run(scenario())
        finally:
            if child.poll() is None:
                child.terminate()
            child.wait(timeout=15)
        log.seek(0)
        output = log.read()
        assert child.returncode in (0, -signal.SIGTERM)
        assert "Application shutdown complete" in output
        assert "Finished server process" in output
