"""Actual Scan HTTP parsing and registry behavior, independent of SQL integration."""

import json
from collections.abc import Iterator
from contextlib import ExitStack
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import Any
from unittest.mock import create_autospec, patch

import pytest
from fastapi.testclient import TestClient
from http_helpers import application, operations
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.scan import Scan, ScanError, ScanImage

from spellbook_api.http.mtg.routes_scan import create_scan_routes

BASE = "/api/v1/mtg/scan"
ORIGIN = "https://spellbook.test"
SESSION = "11111111-1111-4111-8111-111111111111"
ARTIFACT = "22222222-2222-4222-8222-222222222222"
TOKEN = "a" * 43
ACTOR = Actor("scan-route", "unit", "", "", "")
PNG = b"\x89PNG\r\n\x1a\nfixture"


def multipart(
    payload: bytes = PNG,
    *,
    filename: str = '"photo.png"',
    encoding: str | None = None,
    ending: bytes = b"\r\n--scan--\r\n",
) -> bytes:
    headers = (
        '--scan\r\nContent-Disposition: form-data; name="file"; filename='
        + filename
        + "\r\nContent-Type: image/png\r\n"
        + (f"Content-Transfer-Encoding: {encoding}\r\n" if encoding is not None else "")
        + "\r\n"
    )
    return headers.encode() + payload + ending


MULTIPART_CASES: list[tuple[str, bytes, bytes | None, str]] = [
    ("complete", multipart(), PNG, "photo.png"),
    ("complete-no-final-crlf", multipart(ending=b"\r\n--scan--"), PNG, "photo.png"),
    (
        "complete-binary",
        multipart(PNG + b"\x00\xff\xfe\r\n"),
        PNG + b"\x00\xff\xfe\r\n",
        "photo.png",
    ),
    ("unfinished-boundary", multipart(ending=b"\r\n--scan\r\n"), None, ""),
    ("missing-close", multipart(ending=b"\r\n--scan"), None, ""),
    (
        "unfinished-next-part",
        multipart(ending=b'\r\n--scan\r\nContent-Disposition: form-data; name="other"\r\n\r\nx'),
        None,
        "",
    ),
]


@pytest.mark.parametrize(
    "name,body,payload,filename", MULTIPART_CASES, ids=[c[0] for c in MULTIPART_CASES]
)
def test_standard_multipart_completeness_and_binary_file_values(
    routes: tuple[Any, ...], name: str, body: bytes, payload: bytes | None, filename: str
) -> None:
    _auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        content=body,
        headers={"Content-Type": "multipart/form-data; boundary=scan"},
    )
    if payload is None:
        assert response.status_code == 400
        assert response.json()["message"] == "Malformed multipart upload"
        scan.upload_frame.assert_not_awaited()
    else:
        assert response.status_code == 200
        assert scan.upload_frame.await_args.kwargs["body"] == payload
        assert scan.upload_frame.await_args.kwargs["file_name"] == filename


@pytest.mark.parametrize(
    "ending",
    [
        b"",
        b'\r\n--scan\r\nContent-Disposition: form-data; name="other"; '
        b'filename="unfinished.png"\r\n\r\nunfinished',
    ],
    ids=["unfinished-first-file", "completed-file-and-rejected-second-file"],
)
def test_incomplete_multipart_closes_all_opened_files(
    routes: tuple[Any, ...],
    ending: bytes,
) -> None:
    _auth, scan, client = routes
    opened: list[Any] = []
    body = multipart(ending=ending)
    with ExitStack() as cleanup:

        def spool(*args: Any, **kwargs: Any) -> Any:
            file = cleanup.enter_context(SpooledTemporaryFile(*args, **kwargs))
            opened.append(file)
            return file

        with patch("starlette.formparsers.SpooledTemporaryFile", spool):
            response = client.post(
                BASE + f"/sessions/{SESSION}/frames",
                content=body,
                headers={"Content-Type": "multipart/form-data; boundary=scan"},
            )
        assert response.status_code == 400
        scan.upload_frame.assert_not_awaited()
        assert len(opened) == 1 and all(file.closed for file in opened)


@pytest.fixture
def routes() -> Iterator[tuple[Any, Any, TestClient]]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.side_effect = lambda token: ACTOR if token == TOKEN else None
    scan = create_autospec(Scan, instance=True)
    scan.list_sessions.return_value = []
    scan.create_session.return_value = {"id": SESSION, "status": "open"}
    scan.upload_frame.return_value = {
        "artifact": {"id": ARTIFACT},
        "result": {"status": "no_match"},
    }
    scan.read_image.return_value = ScanImage(PNG, "image/png")
    scan.read_session.return_value = {"artifacts": [], "reviewItems": [], "lastResult": None}
    scan.submit_result.return_value = {
        "artifact": {"id": ARTIFACT},
        "result": {"status": "matched"},
    }
    scan.commit_review.return_value = {
        "kind": "Committed",
        "sessionId": SESSION,
        "acknowledgement": {"revision": "0"},
    }
    http = application(create_scan_routes(auth, scan, ORIGIN), ORIGIN, auth)
    with TestClient(http, headers={"Authorization": "Bearer " + TOKEN}) as client:
        yield auth, scan, client


def test_scan_factory_matches_openapi_operations() -> None:
    auth = create_autospec(SessionAuth, instance=True)
    scan = create_autospec(Scan, instance=True)
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/openapi.json").read_text()
    )
    actual = operations(create_scan_routes(auth, scan, ORIGIN))
    expected = {
        (method.upper(), path)
        for path, item in schema["paths"].items()
        if path.startswith(BASE)
        for method in item
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert actual == expected


def test_session_routes_and_method_headers(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    response = client.post(BASE + "/sessions")
    assert response.status_code == 200
    assert response.json() == {"session": {"id": SESSION, "status": "open"}}
    assert response.headers["cache-control"] == "no-store"
    assert client.get(BASE + "/sessions").json() == {"sessions": []}
    head = client.head(BASE + "/sessions")
    assert head.status_code == 405 and head.content == b""
    assert client.options(BASE + "/sessions").headers["allow"] == "POST"
    assert client.delete(BASE + "/sessions").status_code == 405
    scan.create_session.assert_awaited_once_with(ACTOR)


@pytest.mark.parametrize("supplied", ["https://foreign.test", "null"])
def test_form_foreign_origin_rejected_even_with_bearer(
    routes: tuple[Any, ...], supplied: str
) -> None:
    auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        files={"file": ("photo.png", PNG, "image/png")},
        headers={"Origin": supplied},
    )
    assert response.status_code == 403
    scan.upload_frame.assert_not_awaited()
    auth.validate_session.assert_not_awaited()


def test_cookie_origin_and_invalid_bearer_precedence(routes: tuple[Any, ...]) -> None:
    _auth, _scan, client = routes
    client.headers.pop("authorization")
    client.cookies.set("spellbook_session", TOKEN)
    assert client.get(BASE + "/sessions").status_code == 200
    assert client.post(BASE + "/sessions").status_code == 403
    assert client.post(BASE + "/sessions", headers={"Origin": ORIGIN}).status_code == 200
    response = client.get(BASE + "/sessions", headers={"Authorization": "malformed"})
    assert response.status_code == 401 and response.json()["message"] == "Invalid bearer token"


def test_native_single_file_upload_and_multipart_contract(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        files=[
            ("file", ("photo.png", PNG, "image/png")),
        ],
    )
    assert response.status_code == 200
    scan.upload_frame.assert_awaited_once_with(
        ACTOR, session_id=SESSION, body=PNG, content_type="image/png", file_name="photo.png"
    )
    assert response.headers["cache-control"] == "no-store"
    assert client.post(
        BASE + f"/sessions/{SESSION}/frames",
        content=b"x",
        headers={"Content-Type": "multipart/form-data"},
    ).json() == {"status": 400, "message": "Malformed multipart upload"}
    assert (
        client.post(
            BASE + f"/sessions/{SESSION}/frames", files={"other": ("photo.png", PNG, "image/png")}
        ).json()["message"]
        == 'multipart file field "file" is required'
    )
    assert client.post(BASE + f"/sessions/{SESSION}/frames", json={}).status_code == 415
    oversized = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        content=b"x" * (12 * 1024 * 1024 + 1),
        headers={"Content-Type": "multipart/form-data; boundary=x"},
    )
    assert oversized.status_code == 413


def test_multipart_file_type_is_normalized(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        files={"file": ("photo.png", PNG, "IMAGE/PNG ")},
    )
    assert response.status_code == 200
    assert scan.upload_frame.await_args.kwargs["content_type"] == "image/png"


def test_read_query_last_values_and_absence(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    path = BASE + f"/sessions/{SESSION}/result"
    assert client.get(path).json()["lastResult"] is None
    scan.read_session.assert_awaited_with(ACTOR, {"sessionId": SESSION})
    response = client.get(
        path + f"?limit=002&limit=0&artifactCursor={ARTIFACT}&reviewCursor={ARTIFACT}"
    )
    assert response.status_code == 200
    scan.read_session.assert_awaited_with(
        ACTOR,
        {"sessionId": SESSION, "limit": 0, "artifactCursor": ARTIFACT, "reviewCursor": ARTIFACT},
    )
    assert client.get(path + "?limit=1.5").json()["message"] == "Invalid Scan page limit"
    assert client.get(path.replace(SESSION, "%GG")).status_code == 400


def test_result_and_commit_json_use_path_authority_and_no_framework_422(
    routes: tuple[Any, ...],
) -> None:
    _auth, scan, client = routes
    path = BASE + f"/sessions/{SESSION}/artifacts/{ARTIFACT}/result"
    response = client.post(
        path,
        json={
            "sessionId": "foreign",
            "artifactId": "foreign",
            "status": "matched",
            "modelVersion": "native",
            "candidates": [],
        },
    )
    assert response.status_code == 200
    body = scan.submit_result.await_args.args[1]
    assert body["sessionId"] == SESSION and body["artifactId"] == ARTIFACT
    assert (
        client.post(path, content=b"[]", headers={"Content-Type": "application/json"}).status_code
        == 400
    )
    assert (
        client.post(
            path, content=b"\xff", headers={"Content-Type": "application/json"}
        ).status_code
        == 400
    )
    assert (
        client.post(BASE + "/review/commit", json={"requestId": "r"}).json()["kind"] == "Committed"
    )
    scan.commit_review.assert_awaited_once_with(ACTOR, {"requestId": "r"})
    response = client.post(
        path, content=b"x" * (1024 * 1024 + 1), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413


def test_image_headers_and_scan_error_mapping(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    path = BASE + f"/artifacts/{ARTIFACT}/image"
    response = client.get(path)
    assert response.content == PNG
    assert response.headers["content-length"] == str(len(PNG))
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    scan.read_image.side_effect = ScanError("ScanNotFound", "Scan artifact not found", 404)
    response = client.get(path)
    assert response.json() == {
        "status": 404,
        "kind": "ScanNotFound",
        "message": "Scan artifact not found",
    }
