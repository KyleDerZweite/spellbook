"""Actual Scan HTTP parsing and registry behavior, independent of SQL integration."""

import base64
import json
import os
import re
import subprocess
from collections.abc import Iterator
from contextlib import ExitStack
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import Any
from unittest.mock import create_autospec, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.scan import Scan, ScanError, ScanImage
from spellbook_core.mtg.scan.validation import check_image

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.mtg.routes_scan import create_scan_routes
from spellbook_api.http.router import RawPathRouting, RouteRegistry

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
    ("base64", multipart(base64.b64encode(PNG), encoding="base64"), PNG, "photo.png"),
    (
        "base64-unpadded",
        multipart(base64.b64encode(PNG + b"x").rstrip(b"="), encoding="base64"),
        PNG + b"x",
        "photo.png",
    ),
    (
        "base64-ignored-bytes",
        multipart(b"!" + base64.b64encode(PNG) + b"=trailing", encoding="base64"),
        PNG,
        "photo.png",
    ),
    (
        "base64-uppercase",
        multipart(base64.b64encode(PNG), encoding="BASE64"),
        base64.b64encode(PNG),
        "photo.png",
    ),
    (
        "base64-quoted",
        multipart(base64.b64encode(PNG), encoding='"base64"'),
        base64.b64encode(PNG),
        "photo.png",
    ),
    (
        "quoted-printable",
        multipart(b"=89PNG", encoding="quoted-printable"),
        b"=89PNG",
        "photo.png",
    ),
    ("binary-transfer", multipart(PNG, encoding="binary"), PNG, "photo.png"),
    (
        "base64-url-safe",
        multipart(base64.b64encode(PNG + b"\xfb\xff", altchars=b"-_"), encoding="base64"),
        PNG + b"\xfb\xff",
        "photo.png",
    ),
    ("base64-single-sextet", multipart(b"A", encoding="base64"), b"", "photo.png"),
    (
        "base64-trailing-sextet",
        multipart(b"AAAAA", encoding="base64"),
        b"\x00\x00\x00",
        "photo.png",
    ),
    (
        "base64-utf16-low-bytes",
        multipart("\uff41AAA".encode(), encoding="base64"),
        b"\x00\x00\x00",
        "photo.png",
    ),
    (
        "base64-value-whitespace",
        multipart(base64.b64encode(PNG), encoding=" \tbase64\t "),
        PNG,
        "photo.png",
    ),
    (
        "quote-at-filename-limit",
        multipart(filename='"' + "x" * 250 + '%22.png"'),
        PNG,
        "x" * 250 + '".png',
    ),
    (
        "quoted-escapes-only",
        multipart(filename='"%0a%0D%22%2F%25%2522.png"'),
        PNG,
        '\n\r"%2F%25%2522.png',
    ),
    ("unquoted-percent-literal", multipart(filename="%22%2F.png"), PNG, "%22%2F.png"),
]


@pytest.mark.parametrize(
    "name,body,payload,filename", MULTIPART_CASES, ids=[c[0] for c in MULTIPART_CASES]
)
def test_raw_multipart_completeness_and_fetch_file_values(
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


@pytest.mark.skipif(
    not os.environ.get("TEST_SCAN_NODE_BINARY"), reason="Requires pinned Node 26.10.0"
)
def test_raw_multipart_values_against_actual_node_26_fetch() -> None:
    driver = r"""
const input = JSON.parse(await new Response(process.stdin).text());
if (process.version !== 'v26.10.0') throw new Error('Wrong Node runtime');
const results = [];
for (const item of input) {
  try {
    const form = await new Request('http://fixture', {method:'POST',
      headers:{'content-type':'multipart/form-data; boundary=scan'},
      body:Buffer.from(item.body, 'base64')}).formData();
    const file = form.get('file');
    results.push({name:item.name, filename:file.name,
      payload:Buffer.from(await file.arrayBuffer()).toString('base64')});
  } catch {
    results.push({name:item.name, malformed:true});
  }
}
process.stdout.write(JSON.stringify(results));
"""
    result = subprocess.run(
        [os.environ["TEST_SCAN_NODE_BINARY"], "--input-type=module", "-e", driver],
        input=json.dumps(
            [
                {"name": name, "body": base64.b64encode(body).decode()}
                for name, body, _, _ in MULTIPART_CASES
            ]
        ),
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    expected = [
        {"name": name, "malformed": True}
        if payload is None
        else {"name": name, "filename": filename, "payload": base64.b64encode(payload).decode()}
        for name, _body, payload, filename in MULTIPART_CASES
    ]
    assert json.loads(result.stdout) == expected


@pytest.mark.skipif(
    not os.environ.get("TEST_SCAN_NODE_BINARY"), reason="Requires pinned Node 26.10.0"
)
def test_actual_node_formdata_quote_filename_at_image_validation_limit(
    routes: tuple[Any, ...],
) -> None:
    _auth, scan, client = routes
    filename = "x" * 250 + '".png'
    driver = r"""
if (process.version !== 'v26.10.0') throw new Error('Wrong Node runtime');
const input = JSON.parse(await new Response(process.stdin).text());
const form = new FormData();
form.append('file', new File([Buffer.from(input.png, 'base64')], input.filename,
  {type:'image/png'}));
const request = new Request('http://fixture', {method:'POST', body:form});
const body = Buffer.from(await request.arrayBuffer());
const contentType = request.headers.get('content-type');
const parsed = await new Request('http://fixture', {method:'POST',
  headers:{'content-type':contentType}, body}).formData();
process.stdout.write(JSON.stringify({body:body.toString('base64'), contentType,
  filename:parsed.get('file').name}));
"""
    result = subprocess.run(
        [os.environ["TEST_SCAN_NODE_BINARY"], "--input-type=module", "-e", driver],
        input=json.dumps({"png": base64.b64encode(PNG).decode(), "filename": filename}),
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    actual = json.loads(result.stdout)
    raw = base64.b64decode(actual["body"])
    assert b"%22" in raw and actual["filename"] == filename
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        content=raw,
        headers={"Content-Type": actual["contentType"]},
    )
    assert response.status_code == 200
    forwarded = scan.upload_frame.await_args.kwargs
    assert forwarded["file_name"] == filename and len(filename) == 255
    assert (
        check_image(forwarded["body"], forwarded["content_type"], forwarded["file_name"])
        == "image/png"
    )


def test_incomplete_multipart_closes_completed_and_unfinished_files(
    routes: tuple[Any, ...],
) -> None:
    _auth, scan, client = routes
    opened: list[Any] = []
    body = multipart(
        ending=b'\r\n--scan\r\nContent-Disposition: form-data; name="other"; '
        b'filename="unfinished.png"\r\n\r\nunfinished'
    )
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
        assert len(opened) == 2 and all(file.closed for file in opened)


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
        "kind": "LegacyNoRepeat",
        "requestId": "r",
        "binding": "UnverifiedLegacyHash",
        "acknowledgement": {"revision": "0"},
    }
    registry = RouteRegistry(
        create_scan_routes(auth, scan, ORIGIN), ORIGIN, auth, RequestAdmission()
    )
    http = FastAPI(openapi_url=None)
    http.mount("/", registry)
    http.add_middleware(RawPathRouting)
    with TestClient(http, headers={"Authorization": "Bearer " + TOKEN}) as client:
        yield auth, scan, client


def test_scan_factory_matches_openapi_operations() -> None:
    auth = create_autospec(SessionAuth, instance=True)
    scan = create_autospec(Scan, instance=True)
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/openapi.json").read_text()
    )
    actual = {(route.method, route.path) for route in create_scan_routes(auth, scan, ORIGIN)}
    expected = {
        (method.upper(), re.sub(r"\{(\w+)\}", r":\1", path))
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
    assert head.status_code == 200 and head.content == b""
    assert client.options(BASE + "/sessions").headers["allow"] == "POST, GET, HEAD, OPTIONS"
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


def test_native_upload_first_file_and_multipart_contract(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        files=[
            ("file", ("photo.png", PNG, "image/png")),
            ("file", ("other.jpg", b"other", "image/jpeg")),
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


def test_multipart_file_type_uses_fetch_lowercase_normalization(routes: tuple[Any, ...]) -> None:
    _auth, scan, client = routes
    response = client.post(
        BASE + f"/sessions/{SESSION}/frames",
        files={"file": ("photo.png", PNG, "IMAGE/PNG ")},
    )
    assert response.status_code == 200
    assert scan.upload_frame.await_args.kwargs["content_type"] == "image/png"


def test_read_query_first_values_and_absence(routes: tuple[Any, ...]) -> None:
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
        {"sessionId": SESSION, "limit": 2, "artifactCursor": ARTIFACT, "reviewCursor": ARTIFACT},
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
        client.post(BASE + "/review/commit", json={"requestId": "r"}).json()["kind"]
        == "LegacyNoRepeat"
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
