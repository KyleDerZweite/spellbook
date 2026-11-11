import base64
from hashlib import sha256

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
        "imageSha256": sha256(b"\xff\xd8\xffimage").hexdigest(),
        "imageBase64": base64.b64encode(b"\xff\xd8\xffimage").decode(),
        "contentType": "image/jpeg",
        "fileName": "artifact-1.jpg",
    }


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("content_type", ["image/jpeg", "image/png", "image/webp"])
def test_scaffold_processes_transient_image(
    client: TestClient, scan_request: dict[str, str], content_type: str
) -> None:
    scan_request["contentType"] = content_type

    response = client.post("/v1/scan/process", json=scan_request)

    assert response.status_code == 200
    assert response.json() == {
        "status": "no_match",
        "imageSha256": scan_request["imageSha256"],
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
        ("imageSha256", "not-a-digest"),
        ("imageBase64", "#"),
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


def test_missing_image_returns_validation_error(
    client: TestClient, scan_request: dict[str, str]
) -> None:
    del scan_request["imageBase64"]

    response = client.post("/v1/scan/process", json=scan_request)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "imageBase64"]


def test_worker_rejects_corrupted_image_and_digest(
    client: TestClient, scan_request: dict[str, str]
) -> None:
    scan_request["imageSha256"] = "0" * 64
    assert client.post("/v1/scan/process", json=scan_request).status_code == 422
    scan_request["imageBase64"] = base64.b64encode(b"x" * (10 * 1024 * 1024 + 1)).decode()
    assert client.post("/v1/scan/process", json=scan_request).status_code == 413
