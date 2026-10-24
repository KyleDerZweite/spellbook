"""Python adapter component evidence. These tests do not assemble the shared host."""

import asyncio
import json
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import RequestConflictError
from spellbook_core.mtg.errors import (
    DescriptionConflictError,
    InventoryQuantityChangedError,
    NotesConflictError,
)
from spellbook_core.validation import MISSING
from starlette.requests import Request
from starlette.types import Message

from spellbook_api.http.auth import (
    require_form_origin,
    require_mobile_auth,
    selected_token,
    stale_session_cookie,
)
from spellbook_api.http.errors import HttpError, error_response
from spellbook_api.http.parsing import (
    read_json_object,
    read_number,
    read_string,
)

GOLDEN: dict[str, Any] = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/wire.json").read_text()
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


@pytest.mark.parametrize("vector", GOLDEN["headers"], ids=lambda v: v["id"])
def test_header_golden(vector: dict[str, Any]) -> None:
    assert selected_token(request(headers=vector["headers"])) == vector["selected"]


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


def test_empty_json_body_is_a_safe_validation_failure() -> None:
    async def scenario() -> None:
        for headers in [
            {"content-type": "application/json"},
            {
                "content-type": "application/json",
                "content-length": "0",
            },
        ]:
            with pytest.raises(HttpError, match="Invalid JSON body"):
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
