from scan_worker.main import ScanProcessRequest, health, process_scan


def test_health_returns_ok() -> None:
    assert health() == {"status": "ok"}


def test_process_scan_normalizes_session_object_key() -> None:
    request = ScanProcessRequest(
        sessionId="session-1",
        artifactId="artifact-1",
        originalObjectKey="uploads/scan-sessions/session-1/artifact-1.jpg",
        contentType="image/jpeg",
        fileName="artifact-1.jpg",
    )

    response = process_scan(request)

    assert response.status == "no_match"
    assert response.normalizedObjectKey == "uploads/scan-normalized/session-1/artifact-1.jpg"
    assert response.candidates == []


def test_process_scan_falls_back_when_key_is_not_session_scoped() -> None:
    request = ScanProcessRequest(
        sessionId="session-1",
        artifactId="artifact-1",
        originalObjectKey="uploads/artifact-1.jpg",
        contentType="image/jpeg",
        fileName="artifact-1.jpg",
    )

    response = process_scan(request)

    assert response.normalizedObjectKey == "scan-normalized/session-1/artifact-1.jpg"
