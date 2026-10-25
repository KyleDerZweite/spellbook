"""Published schema and ordinary FastAPI discovery behavior."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from spellbook_api.application import create_application
from spellbook_api.http.types import Configuration


def test_discovery_uses_neutral_schema_and_only_replaces_origin() -> None:
    canonical = Path(__file__).resolve().parents[3] / "contracts/openapi.json"
    expected = json.loads(canonical.read_text())
    expected["servers"] = [{"url": "https://candidate.example"}]
    with TestClient(create_application(Configuration("https://candidate.example")).http) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200 and response.json() == expected
        assert response.headers["cache-control"] == "public, max-age=3600"
        for path in ("/openapi.json/", "/docs", "/redoc", "/api/v1/auth/session"):
            response = client.get(path, follow_redirects=False)
            assert response.status_code == 404 and "location" not in response.headers
        for method in ("HEAD", "OPTIONS", "POST", "UNKNOWN"):
            response = client.request(method, "/openapi.json")
            assert response.status_code == 405 and response.headers["allow"] == "GET"
