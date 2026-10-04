import pytest
from fastapi.testclient import TestClient

from scan_worker.main import app


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def scan_request() -> dict[str, str]:
    return {
        "sessionId": "session-1",
        "artifactId": "artifact-1",
        "originalObjectKey": "scan-sessions/session-1/artifact-1.jpg",
        "contentType": "image/jpeg",
        "fileName": "artifact-1.jpg",
    }


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("content_type", ["image/jpeg", "image/png", "image/webp"])
def test_scaffold_reuses_original_artifact(
    client: TestClient, scan_request: dict[str, str], content_type: str
) -> None:
    scan_request["contentType"] = content_type

    response = client.post("/v1/scan/process", json=scan_request)

    assert response.status_code == 200
    assert response.json() == {
        "status": "no_match",
        "normalizedObjectKey": scan_request["originalObjectKey"],
        "qualityScore": 0,
        "embeddingModelVersion": "stub-v1",
        "ocrModelVersion": "stub-v1",
        "ocrTokens": {},
        "candidates": [],
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("sessionId", ""),
        ("sessionId", "../session-1"),
        ("sessionId", "s" * 129),
        ("artifactId", ""),
        ("artifactId", "artifact/1"),
        ("originalObjectKey", " "),
        ("originalObjectKey", "k" * 1025),
        ("contentType", "application/octet-stream"),
        ("contentType", "image/svg+xml"),
        ("fileName", ""),
        ("fileName", "n" * 256),
    ],
)
def test_invalid_scan_metadata_returns_validation_error(
    client: TestClient, scan_request: dict[str, str], field: str, value: str
) -> None:
    scan_request[field] = value

    response = client.post("/v1/scan/process", json=scan_request)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]


def test_missing_artifact_key_returns_validation_error(
    client: TestClient, scan_request: dict[str, str]
) -> None:
    del scan_request["originalObjectKey"]

    response = client.post("/v1/scan/process", json=scan_request)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "originalObjectKey"]
