import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest

from spellbook_api.http.types import Configuration


@pytest.mark.parametrize(
    "origin",
    [
        "",
        "/",
        "https://example.com/",
        "https://u:p@example.com",
        "https://example.com?x=1",
        "ftp://example.com",
        "http://example.com:99999",
        "https://EXAMPLE.com",
        "https://example.com:443",
        "http://bad host",
        "http://bad|host",
        "http://bad<host",
        "http://bad>host",
        "http://bad^host",
        "http://bad\\host",
        "http://999.999.999.999",
        "http://127.1",
        "http://0x7f000001",
        "http://0177.0.0.1",
        "http://example.123",
        "http://127.0.0.1.",
        "http://xn--a",
        "http://xn--",
    ],
)
def test_invalid_origin_is_rejected_before_start(origin: str) -> None:
    with pytest.raises(ValueError):
        Configuration(origin)


@pytest.mark.parametrize(
    "origin",
    [
        "http://127.0.0.1:5173",
        "http://[::1]:5173",
        "https://example.com",
        "http://localhost:5173",
        "https://xn--bcher-kva.example",
    ],
)
def test_canonical_origins_remain_accepted(origin: str) -> None:
    assert Configuration(origin).public_origin == origin


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.1", "127.0.0.1"])
def test_configurable_ip_bind(host: str) -> None:
    assert Configuration("http://localhost:5173", host=host).host == host


def test_invalid_bind_is_rejected() -> None:
    with pytest.raises(ValueError, match="API_HOST"):
        Configuration("http://localhost:5173", host="example.com")


@pytest.mark.parametrize("port", ["", "0", "65536", "1.5", "-1", "٣٠٠٢"])
def test_invalid_port_is_rejected_before_start(port: str) -> None:
    with pytest.raises(ValueError):
        Configuration.from_environment({"APP_ORIGIN": "http://localhost:5173", "API_PORT": port})


def test_default_uses_normal_api_port() -> None:
    configuration = Configuration.from_environment({"APP_ORIGIN": "http://localhost:5173"})
    assert configuration.host == "127.0.0.1"
    assert configuration.port == 3001


def test_actual_host_loads_schema_and_exits_gracefully(tmp_path: Path) -> None:
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    with (tmp_path / "candidate.log").open("w+") as log:
        child = subprocess.Popen(
            [sys.executable, "-m", "spellbook_api.main"],
            cwd=tmp_path,
            env={
                "PATH": os.environ.get("PATH", ""),
                "APP_ORIGIN": "http://localhost:5173",
                "API_DISCOVERY_ONLY": "true",
                "API_HOST": "127.0.0.1",
                "API_PORT": str(port),
            },
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            for _ in range(100):
                assert child.poll() is None, "owned candidate exited before readiness"
                try:
                    with urlopen(f"http://127.0.0.1:{port}/openapi.json", timeout=1) as response:
                        assert response.status == 200
                        assert b'"openapi":"3.1.0"' in response.read()
                    break
                except URLError:
                    time.sleep(0.05)
            else:
                pytest.fail("owned candidate did not become ready")
            for path in ("/openapi.json%2F", "/%6fpenapi.json", "/openapi%2ejson"):
                for method in ("GET", "OPTIONS", "POST"):
                    with pytest.raises(HTTPError) as failure:
                        urlopen(
                            Request(f"http://127.0.0.1:{port}{path}", method=method), timeout=1
                        )
                    assert failure.value.code == 404
                    assert "Allow" not in failure.value.headers
            for path in ("/other/../openapi.json", "/other/%2e%2e/openapi.json"):
                with urlopen(f"http://127.0.0.1:{port}{path}", timeout=1) as response:
                    assert response.status == 200
        finally:
            if child.poll() is None:
                child.terminate()
            # Never force termination. A timeout fails and leaves the owned child for inspection.
            result = child.wait(timeout=15)
        log.seek(0)
        output = log.read()
    assert result in (0, -signal.SIGTERM)
    assert "Application shutdown complete" in output
    assert "Finished server process" in output
