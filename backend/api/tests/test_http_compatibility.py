"""Python adapter component evidence. These tests do not assemble the shared host."""

import asyncio
import json
import math
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import (
    ActorError,
    DescriptionConflictError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.validation import MISSING
from starlette.requests import Request
from starlette.types import Message

from spellbook_api.http.auth import (
    read_cookie,
    require_form_origin,
    require_mobile_auth,
    selected_token,
    stale_session_cookie,
)
from spellbook_api.http.errors import HttpError, error_response, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    header,
    read_json_object,
    read_number,
    read_query_integer,
    read_string,
    require_uuid,
    truthy,
)

GOLDEN: dict[str, Any] = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/compatibility/golden.json").read_text()
)


def request(
    body: bytes = b"",
    headers: dict[str, str] | None = None,
    method: str = "POST",
    *,
    chunks: list[bytes] | None = None,
) -> Request:
    remaining = list(chunks if chunks is not None else [body])
    headers = dict(headers or {})
    if chunks is not None:
        headers.setdefault("transfer-encoding", "chunked")
    elif body:
        headers.setdefault("content-length", str(len(body)))

    async def receive() -> Message:
        if remaining:
            return {"type": "http.request", "body": remaining.pop(0), "more_body": bool(remaining)}
        return {"type": "http.disconnect"}

    return Request(
        {
            "type": "http",
            "method": method,
            "scheme": "https",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "server": ("spellbook.test", 443),
            "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
        },
        receive,
    )


@pytest.mark.parametrize("vector", GOLDEN["jsonBodies"], ids=lambda v: v["id"])
def test_json_golden(vector: dict[str, Any]) -> None:
    raw = bytes.fromhex(vector["hex"]) if "hex" in vector else vector["body"].encode()
    operation = read_json_object(request(raw, {"content-type": vector["contentType"]}))
    if "status" in vector:
        with pytest.raises(HttpError) as failure:
            asyncio.run(operation)
        assert failure.value.status == vector["status"]
        assert str(failure.value) == vector["message"]
    else:
        result = asyncio.run(operation)
        if vector.get("nonfinite"):
            quantity = result["quantity"]
            assert isinstance(quantity, float) and math.isinf(quantity)
        else:
            assert result == vector["expected"]
        if vector.get("negativeZero"):
            quantity = result["quantity"]
            assert isinstance(quantity, float) and math.copysign(1, quantity) == -1


@pytest.mark.parametrize("vector", GOLDEN["headers"], ids=lambda v: v["id"])
def test_header_golden(vector: dict[str, Any]) -> None:
    assert selected_token(request(headers=vector["headers"])) == vector["selected"]


@pytest.mark.parametrize("vector", GOLDEN["queries"], ids=lambda v: v["id"])
def test_query_golden(vector: dict[str, Any]) -> None:
    if "status" in vector:
        with pytest.raises(HttpError) as failure:
            read_query_integer(vector["value"], "limit", 20)
        assert failure.value.status == vector["status"]
    else:
        assert read_query_integer(vector["value"], "limit", 20) == vector["expected"]


@pytest.mark.parametrize("raw", ["%", "%ZZ", "%ff", "%C0%AF", "%ED%A0%80", "%E2%82"])
def test_named_parameters_reject_invalid_percent_and_utf8(raw: str) -> None:
    with pytest.raises(HttpError, match="Invalid path encoding"):
        decode_parameter(raw)


def test_named_parameter_decoding_occurs_once_after_matching() -> None:
    assert decode_parameter("a%2Fb") == "a/b"
    assert decode_parameter("%252f") == "%2f"
    assert decode_parameter("a+b") == "a+b"
    assert require_uuid(" 11111111-1111-4111-8111-111111111111 ") == (
        "11111111-1111-4111-8111-111111111111"
    )
    with pytest.raises(HttpError):
        require_uuid("\x8511111111-1111-4111-8111-111111111111")
    assert read_cookie(request(headers={"cookie": "spellbook_session=a+b"})) == "a+b"


def test_json_binary64_bom_chunk_limit_and_non_json_constants() -> None:
    async def scenario() -> None:
        result = await read_json_object(
            request(
                b'\xef\xbb\xbf{"value":9007199254740993}', {"content-type": "application/json"}
            )
        )
        assert result["value"] == 9007199254740992
        for raw in [b'{"value":NaN}', b'{"value":Infinity}', b"\xff"]:
            with pytest.raises(HttpError, match="Invalid JSON body"):
                await read_json_object(request(raw, {"content-type": "application/json"}))
        with pytest.raises(HttpError) as failure:
            await read_json_object(
                request(
                    headers={"content-type": "application/json"}, chunks=[b'{"a":', b'"12345"}']
                ),
                max_bytes=10,
            )
        assert failure.value.status == 413

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "raw",
    [
        b'{"a":1,}',
        b'{"a":[1,]}',
        b'{"a":01}',
        b'{"a":+1}',
        b'{"a":.1}',
        b'{"a":1e}',
        b'{"a":true false}',
        b'{"a" 1}',
        b'{"a":[] ]}',
        b"{}{}",
    ],
)
def test_json_rejects_invalid_container_and_scalar_grammar(raw: bytes) -> None:
    with pytest.raises(HttpError, match="Invalid JSON body"):
        asyncio.run(read_json_object(request(raw, {"content-type": "application/json"})))


def test_json_nesting_is_bounded_by_bytes_without_a_python_recursion_limit() -> None:
    async def scenario() -> None:
        raw = b'{"ignored":' + b"[" * 2000 + b"0" + b"]" * 2000 + b"}"
        body = await read_json_object(request(raw, {"content-type": "application/json"}))
        current = body["ignored"]
        for _ in range(2000):
            assert isinstance(current, list) and len(current) == 1
            current = current[0]
        assert current == 0
        for malformed in [raw[:-2], raw[:-2] + b",]}"]:
            with pytest.raises(HttpError, match="Invalid JSON body"):
                await read_json_object(request(malformed, {"content-type": "application/json"}))

    asyncio.run(scenario())


def test_json_media_presence_and_strict_scalar_types() -> None:
    assert read_string(MISSING, "field", "fallback") == "fallback"
    assert read_number(MISSING, "field", 1) == 1
    invalid_numbers: list[object] = [None, True, "1", [], {}]
    for value in invalid_numbers:
        with pytest.raises(HttpError):
            read_number(value, "quantity")
    for value in [None, 1, False]:
        with pytest.raises(HttpError):
            read_string(value, "notes")
    assert truthy([]) and truthy({})
    assert not truthy(0) and not truthy(None) and not truthy("")
    assert truthy(" ")


def test_body_presence_is_distinct_from_invalid_json() -> None:
    async def scenario() -> None:
        for headers in [
            {"content-type": "application/json"},
            {
                "content-type": "application/json",
                "content-length": "0",
            },
        ]:
            with pytest.raises(HttpError, match="A request body is required"):
                await read_json_object(request(headers=headers))
        with pytest.raises(HttpError, match="Invalid JSON body"):
            await read_json_object(
                request(
                    headers={"content-type": "application/json"},
                    chunks=[b""],
                )
            )

    asyncio.run(scenario())


def test_mobile_selection_and_cookie_cleanup_with_mocked_session_provider() -> None:
    async def scenario() -> None:
        provider = create_autospec(SessionAuth, instance=True)
        provider.validate_session = AsyncMock(return_value=None)
        auth = cast(SessionAuth, provider)
        for authorization in ["", "Basic invalid", "Bearer " + "b" * 43]:
            incoming = request(
                headers={
                    "authorization": authorization,
                    "cookie": "spellbook_session=" + "a" * 43,
                }
            )
            with pytest.raises(HttpError, match="Invalid bearer token"):
                await require_mobile_auth(incoming, auth, "https://spellbook.test")
            expected = "b" * 43 if authorization.startswith("Bearer ") else None
            provider.validate_session.assert_awaited_with(expected)
            assert await stale_session_cookie(incoming, auth, "https://spellbook.test") == (
                "spellbook_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"
            )
        with pytest.raises(HttpError, match="Authentication required"):
            await require_mobile_auth(request(), auth, "https://spellbook.test")

    asyncio.run(scenario())


def test_repeated_headers_match_node_fetch_append_semantics() -> None:
    incoming = request(
        headers={
            "authorization": "Bearer " + "a" * 43,
            "cookie": "other=first",
            "origin": "https://spellbook.test",
        }
    )
    incoming.scope["headers"].extend(
        [
            (b"authorization", b"Basic invalid"),
            (b"cookie", b"spellbook_session=" + b"b" * 43),
            (b"origin", b"https://foreign.test"),
        ]
    )
    assert header(incoming, "authorization") == "Bearer " + "a" * 43 + ", Basic invalid"
    assert selected_token(incoming) is None
    assert read_cookie(incoming) == "b" * 43
    with pytest.raises(HttpError, match="Cross-site POST"):
        require_form_origin(incoming, "https://spellbook.test")

    async def repeated_media() -> None:
        incoming = request(b"{}", {"content-type": "application/json"})
        incoming.scope["headers"].append((b"content-type", b"application/json"))
        with pytest.raises(HttpError) as failure:
            await read_json_object(incoming)
        assert failure.value.status == 415

    asyncio.run(repeated_media())


@pytest.mark.parametrize("media", [None, "text/plain", "application/x-www-form-urlencoded"])
def test_form_origin_guard_precedes_body_parsing(media: str | None) -> None:
    headers = {"authorization": "Bearer " + "a" * 43}
    if media is not None:
        headers["content-type"] = media
    with pytest.raises(HttpError, match="Cross-site POST form submissions are forbidden"):
        require_form_origin(request(headers=headers), "https://spellbook.test")
    require_form_origin(
        request(headers={**headers, "origin": "https://spellbook.test"}), "https://spellbook.test"
    )
    require_form_origin(
        request(headers={**headers, "content-type": "application/json"}), "https://spellbook.test"
    )


@pytest.mark.parametrize(
    "case",
    [
        "conflict-notes",
        "conflict-description",
        "conflict-quantity-absent",
        "conflict-quantity-present",
        "conflict-request",
        "error-private",
    ],
)
def test_representative_domain_error_vectors(case: str) -> None:
    vector = next(v for v in GOLDEN["conflicts"] if v["id"] == case)
    causes: dict[str, Exception] = {
        "conflict-notes": NotesConflictError(
            {
                "entryId": "11111111-1111-4111-8111-111111111111",
                "notes": "é 🔮",
                "notesRevision": "9007199254740993",
            }
        ),
        "conflict-description": DescriptionConflictError(
            {
                "description": "saved",
                "descriptionRevision": "8",
            }
        ),
        "conflict-quantity-absent": InventoryQuantityChangedError(None),
        "conflict-quantity-present": InventoryQuantityChangedError(3),
        "conflict-request": RequestConflictError(),
        "error-private": RuntimeError("private SQL and credential information"),
    }
    response = error_response(causes[case])
    assert response.status_code == vector["status"]
    assert json.loads(bytes(response.body)) == vector["body"]
    assert response.headers["content-type"] == "application/json"


def test_known_errors_and_json_surrogate_encoding() -> None:
    for cause, status in [
        (ActorError(), 401),
        (ValidationError("bad"), 400),
        (InventoryNotFoundError("Inventory entry not found"), 404),
    ]:
        assert error_response(cause).status_code == status
    assert json_response({"text": "é\ud800"}).body == b'{"text":"\xc3\xa9\\ud800"}'
