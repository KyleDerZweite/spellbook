import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

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
    ],
)
def test_invalid_origin_is_rejected_before_start(origin: str) -> None:
    with pytest.raises(ValueError):
        Configuration(origin)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.1", "example.com"])
def test_candidate_cannot_bind_outside_loopback(host: str) -> None:
    with pytest.raises(ValueError):
        Configuration("http://localhost:5173", host=host)


@pytest.mark.parametrize("port", ["", "0", "65536", "1.5", "-1", "٣٠٠٢"])
def test_invalid_port_is_rejected_before_start(port: str) -> None:
    with pytest.raises(ValueError):
        Configuration.from_environment({"APP_ORIGIN": "http://localhost:5173", "API_PORT": port})


def test_dormant_default_uses_a_separate_loopback_port() -> None:
    configuration = Configuration.from_environment({"APP_ORIGIN": "http://localhost:5173"})
    assert configuration.host == "127.0.0.1"
    assert configuration.port == 3002


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
