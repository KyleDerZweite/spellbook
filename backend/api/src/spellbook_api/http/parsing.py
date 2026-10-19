"""Explicit Node-compatible request parsing, without framework coercion."""

import json
import math
import re
from typing import cast
from urllib.parse import unquote

from spellbook_core.validation import MISSING, js_trim
from starlette.requests import ClientDisconnect, Request

from spellbook_api.http.errors import HttpError

_UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.IGNORECASE | re.ASCII)


def trim(value: str) -> str:
    return js_trim(value)


def decode_parameter(value: str) -> str:
    """Decode only a named segment already selected by raw route matching."""
    if re.search(r"%(?![0-9a-fA-F]{2})", value):
        raise HttpError(400, "Invalid path encoding")
    try:
        return unquote(value, encoding="utf-8", errors="strict")
    except UnicodeError:
        raise HttpError(400, "Invalid path encoding") from None


def require_uuid(value: object, name: str = "id") -> str:
    if not isinstance(value, str) or not _UUID.fullmatch(trim(value)):
        raise HttpError(400, f"{name} must be a UUID")
    return trim(value)


def read_string(value: object, name: str, fallback: str = "") -> str:
    if value is MISSING:
        return fallback
    if not isinstance(value, str):
        raise HttpError(400, f"{name} must be a string")
    return value


def read_number(value: object, name: str, fallback: int | float = 0) -> int | float:
    if value is MISSING:
        return fallback
    try:
        finite = isinstance(value, int | float) and math.isfinite(value)
    except OverflowError:
        finite = False
    if isinstance(value, bool) or not isinstance(value, int | float) or not finite:
        raise HttpError(400, f"{name} must be a finite number")
    return value


def read_query_integer(
    value: str | None,
    name: str,
    fallback: int,
    maximum: int = 9007199254740991,
    minimum: int = 0,
) -> int:
    if value is None:
        return fallback
    if not re.fullmatch(r"[0-9]+", value):
        raise HttpError(400, f"{name} must be an integer between {minimum} and {maximum}")
    # Avoid Python's decimal digit limit while rejecting arbitrarily large input.
    significant = value.lstrip("0") or "0"
    if len(significant) > 16:
        raise HttpError(400, f"{name} must be an integer between {minimum} and {maximum}")
    number = int(significant)
    if not minimum <= number <= min(maximum, 9007199254740991):
        raise HttpError(400, f"{name} must be an integer between {minimum} and {maximum}")
    return number


def truthy(value: object) -> bool:
    """JS truthiness for parsed JSON, where empty arrays and objects are true."""
    if value is MISSING or value is None or value is False:
        return False
    if isinstance(value, str):
        return bool(value)
    if isinstance(value, int | float):
        return value != 0 and not (isinstance(value, float) and math.isnan(value))
    return True


async def read_request_bytes(request: Request, max_bytes: int) -> bytes:
    # The Node bridge exposes no body for unframed or bodyless requests.
    length = request.headers.get("content-length", "0")
    if request.method in {"GET", "HEAD"} or (
        "transfer-encoding" not in request.headers
        and (not length.isascii() or not length.isdigit() or not length.lstrip("0"))
    ):
        raise HttpError(400, "A request body is required")
    chunks: list[bytes] = []
    size = 0
    try:
        async for chunk in request.stream():
            size += len(chunk)
            if size > max_bytes:
                raise HttpError(413, "Request body exceeds the size limit")
            chunks.append(chunk)
    except HttpError:
        raise
    except ClientDisconnect, OSError, RuntimeError:
        raise HttpError(400, "Unable to read request body") from None
    return b"".join(chunks)


def _invalid_constant(value: str) -> object:
    raise ValueError("Invalid JSON constant")


async def read_json_object(request: Request, max_bytes: int = 1024 * 1024) -> dict[str, object]:
    media = trim(request.headers.get("content-type", "").split(";")[0]).lower()
    if media != "application/json":
        raise HttpError(415, "Use application/json")
    raw = await read_request_bytes(request, max_bytes)
    try:
        # TextDecoder strips one leading BOM, and JSON.parse uses binary64 for every number.
        body: object = json.loads(
            raw.decode("utf-8-sig"),
            parse_int=float,
            parse_float=float,
            parse_constant=_invalid_constant,
        )
    except UnicodeError, ValueError, RecursionError:
        raise HttpError(400, "Invalid JSON body") from None
    if not isinstance(body, dict):
        raise HttpError(400, "A JSON object is required")
    return cast(dict[str, object], body)
