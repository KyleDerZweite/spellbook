"""Actual local IO, worker HTTP and Boto3 wire requests to a task-owned fixture.

The S3 endpoint below is a protocol fixture, not provider acceptance evidence.
"""

import asyncio
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.error import URLError
from urllib.request import urlopen

import pytest
from spellbook_core.mtg.scan import ScanError
from spellbook_core.mtg.scan.types import WorkerInput

from spellbook_api.scan_storage import ScanObjectStorage, ScanStorageConfiguration
from spellbook_api.scan_worker import HttpScanWorker

SESSION = "11111111-1111-4111-8111-111111111111"
ARTIFACT = "22222222-2222-4222-8222-222222222222"
KEY = f"scan-sessions/{SESSION}/{ARTIFACT}.png"
PNG = b"\x89PNG\r\n\x1a\nfixture"
INPUT: WorkerInput = {
    "sessionId": SESSION,
    "artifactId": ARTIFACT,
    "originalObjectKey": KEY,
    "contentType": "image/png",
    "fileName": "card.png",
}
RAW = {
    "status": "no_match",
    "normalizedObjectKey": KEY,
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
    objects: dict[str, bytes] = field(default_factory=dict)
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

        def do_PUT(self) -> None:
            state.objects[self.path] = self._read()
            self._reply(200, b"")

        def do_GET(self) -> None:
            self._read()
            body = state.objects.get(self.path)
            self._reply(
                200 if body is not None else 404,
                body
                if body is not None
                else b"<Error><Code>NoSuchKey</Code><Message>Missing</Message></Error>",
            )

        def do_DELETE(self) -> None:
            self._read()
            state.objects.pop(self.path, None)
            self._reply(204, b"")

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


def test_local_storage_roundtrip_limits_paths_and_exclusive_write(tmp_path: Path) -> None:
    async def scenario() -> None:
        storage = ScanObjectStorage(ScanStorageConfiguration(local_storage_dir=str(tmp_path)))
        await storage.write(KEY, PNG, "image/png")
        with pytest.raises(FileExistsError):
            await storage.write(KEY, b"overwrite", "image/png")
        assert (await storage.read(KEY)).bytes == PNG
        for key in ("../escape", KEY.upper(), KEY + "/../x", KEY.replace(".png", ".exe")):
            with pytest.raises(ScanError):
                await storage.read(key)
        (tmp_path / KEY).write_bytes(PNG + b"x" * (10 * 1024 * 1024))
        with pytest.raises(ScanError) as error:
            await storage.read(KEY)
        assert error.value.status == 413
        await storage.delete(KEY)
        await storage.delete(KEY)
        with pytest.raises(ScanError) as missing:
            await storage.read(KEY)
        assert missing.value.status == 404
        await storage.close()

    asyncio.run(scenario())


def test_local_symlink_escape_is_rejected(tmp_path: Path) -> None:
    async def scenario() -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "scan-sessions").symlink_to(tmp_path)
        storage = ScanObjectStorage(ScanStorageConfiguration(local_storage_dir=str(root)))
        with pytest.raises(ScanError):
            await storage.write(KEY, PNG, "image/png")
        await storage.close()

    asyncio.run(scenario())


def test_actual_s3_sdk_writes_reads_deletes_and_maps_missing(endpoint: Endpoint) -> None:
    pytest.importorskip("boto3")

    async def scenario() -> None:
        # Synthetic fixture credentials only. No provider or credential chain access.
        storage = ScanObjectStorage(
            ScanStorageConfiguration(
                storage_driver="s3",
                s3_endpoint=endpoint.url,
                s3_bucket="scan-fixture",
                s3_access_key_id="fixture-access",
                s3_secret_access_key="fixture-secret",
            )
        )
        try:
            await storage.write(KEY, PNG, "image/png")
            assert (await storage.read(KEY)).bytes == PNG
            assert endpoint.requests[0][:3] == ("PUT", "/scan-fixture/" + KEY, PNG)
            headers = endpoint.requests[0][3]
            assert headers["Content-Type"] == "image/png"
            assert headers["Authorization"].startswith("AWS4-HMAC-SHA256 ")
            await storage.delete(KEY)
            with pytest.raises(ScanError) as error:
                await storage.read(KEY)
            assert error.value.kind == "ScanNotFound" and error.value.status == 404
        finally:
            await storage.close()

    asyncio.run(scenario())


def test_storage_cancellation_waits_for_late_write_before_cleanup(tmp_path: Path) -> None:
    async def scenario() -> None:
        storage = ScanObjectStorage(ScanStorageConfiguration(local_storage_dir=str(tmp_path)))
        started, finish = threading.Event(), threading.Event()
        original = Path.open

        def delayed(path: Path, *args: Any, **kwargs: Any) -> Any:
            started.set()
            assert finish.wait(timeout=5)
            return original(path, *args, **kwargs)

        with patch.object(Path, "open", delayed):
            task = asyncio.create_task(storage.write(KEY, PNG, "image/png"))
            await asyncio.to_thread(started.wait, 5)
            task.cancel()
            await asyncio.sleep(0)
            assert not task.done()
            finish.set()
            with pytest.raises(asyncio.CancelledError):
                await task
        await storage.delete(KEY)
        assert not (tmp_path / KEY).exists()
        await storage.close()

    asyncio.run(scenario())


def test_worker_real_http_request_and_scaffold_json(endpoint: Endpoint) -> None:
    async def scenario() -> None:
        worker = HttpScanWorker(endpoint.url + "/")
        try:
            assert await worker.process(INPUT) == RAW
            method, path, body, headers = endpoint.requests[0]
            assert (method, path) == ("POST", "/v1/scan/process")
            assert json.loads(body) == INPUT and headers["Content-Type"] == "application/json"
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
                await worker.process(INPUT)
        finally:
            await worker.close()

    asyncio.run(scenario())


def test_existing_storage_environment_names_and_safe_configuration_repr() -> None:
    config = ScanStorageConfiguration.from_environment(
        {
            "SCAN_STORAGE_DRIVER": "s3",
            "SCAN_LOCAL_STORAGE_DIR": "/retained/scans",
            "S3_ENDPOINT": "https://objects.test",
            "S3_REGION": "eu-central-1",
            "S3_BUCKET": "existing",
            "S3_ACCESS_KEY_ID": "private-access",
            "S3_SECRET_ACCESS_KEY": "private-secret",
            "S3_FORCE_PATH_STYLE": "false",
        }
    )
    assert config.s3_force_path_style == "false" and config.s3_bucket == "existing"
    assert config.local_storage_dir == "/retained/scans"
    assert "private-access" not in repr(config) and "private-secret" not in repr(config)


def test_worker_production_deadline_aborts_stalled_http(endpoint: Endpoint) -> None:
    endpoint.stall = True

    async def scenario() -> None:
        worker = HttpScanWorker(endpoint.url)
        started = time.monotonic()
        try:
            with pytest.raises(TimeoutError):
                await worker.process(INPUT)
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
                    assert await worker.process(INPUT) == RAW
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
