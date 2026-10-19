import json
from pathlib import Path

from fastapi.testclient import TestClient

from spellbook_api.application import create_application
from spellbook_api.http.types import Configuration


def test_discovery_uses_neutral_schema_and_only_replaces_origin() -> None:
    canonical_path = Path(__file__).resolve().parents[3] / "contracts/openapi.json"
    canonical_bytes = canonical_path.read_bytes()
    expected = json.loads(canonical_bytes)
    expected["servers"] = [{"url": "https://candidate.example"}]
    with TestClient(create_application(Configuration("https://candidate.example")).http) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert response.json() == expected
        assert response.headers["cache-control"] == "public, max-age=3600"
        for path in ("/openapi.json", "/openapi.json/"):
            assert client.get(path).json() == expected
            head = client.head(path)
            assert head.status_code == 200
            assert head.content == b""
            options = client.options(path)
            assert options.status_code == 204
            assert options.headers["allow"] == "GET, HEAD, OPTIONS"
            for method in ("POST", "PATCH", "DELETE", "TRACE", "UNKNOWN"):
                rejected = client.request(method, path)
                assert rejected.status_code == 405
                assert rejected.json() == {"message": "Method Not Allowed"}
                assert rejected.headers["allow"] == "GET, HEAD, OPTIONS"
    assert canonical_path.read_bytes() == canonical_bytes


def test_no_business_routes_or_generated_documentation_are_exposed() -> None:
    with TestClient(create_application(Configuration("http://localhost:5173")).http) as client:
        for path in (
            "/docs",
            "/redoc",
            "/docs/oauth2-redirect",
            "/api/auth/session",
            "/api/account/events",
        ):
            response = client.get(path)
            assert response.status_code == 404
            assert response.json() == {"status": 404, "message": "Not Found"}
        assert client.get("/openapi.json//").status_code == 404
