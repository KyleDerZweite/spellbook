"""Bounded native body reading and transport validation."""

import math
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import cast
from urllib.parse import unquote

from pydantic import ConfigDict, JsonValue, RootModel
from pydantic import ValidationError as PydanticValidationError
from spellbook_core.validation import MISSING, js_trim
from starlette.datastructures import UploadFile
from starlette.formparsers import FormParser, MultiPartException
from starlette.requests import ClientDisconnect, Request

from spellbook_api.http.errors import HttpError

_UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.IGNORECASE | re.ASCII)


def trim(value: str) -> str:
    return js_trim(value)


def header(request: Request, name: str) -> str | None:
    values = request.headers.getlist(name)
    if len(values) > 1 and name.lower() in {"authorization", "origin", "content-type"}:
        raise HttpError(400, "Repeated authority or content headers are not supported")
    return request.headers.get(name)


def decode_parameter(value: str) -> str:
    """Decode percent-escaped cookie values; route parameters are already decoded."""
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


async def read_request_bytes(request: Request, max_bytes: int) -> bytes:
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


class JsonObject(RootModel[dict[str, JsonValue]]):
    model_config = ConfigDict(strict=True, allow_inf_nan=False)


async def read_json_object(request: Request, max_bytes: int = 1024 * 1024) -> dict[str, object]:
    media = (header(request, "content-type") or "").split(";", 1)[0].strip().lower()
    if media != "application/json" and not (
        media.startswith("application/") and media.endswith("+json")
    ):
        raise HttpError(415, "Use application/json")
    raw = await read_request_bytes(request, max_bytes)
    try:
        return cast(dict[str, object], JsonObject.model_validate_json(raw).root)
    except PydanticValidationError:
        raise HttpError(400, "Invalid JSON body") from None


@dataclass(frozen=True)
class FormFile:
    """File entries remain non-string credential inputs, without coercing credentials."""

    filename: str
    content: bytes


async def read_form_data(
    request: Request, max_bytes: int = 12 * 1024 * 1024
) -> dict[str, str | FormFile]:
    content_type = header(request, "content-type") or ""
    media = trim(content_type.split(";")[0]).lower()
    if media not in {"application/x-www-form-urlencoded", "multipart/form-data"}:
        raise HttpError(415, "Use application/x-www-form-urlencoded or multipart/form-data")
    raw = await read_request_bytes(request, max_bytes)

    async def stream() -> AsyncGenerator[bytes]:
        yield raw
        yield b""

    from spellbook_api.http.multipart import CompleteMultipartParser

    parser = (
        FormParser(request.headers, stream(), max_fields=32, max_part_size=max_bytes)
        if media == "application/x-www-form-urlencoded"
        else CompleteMultipartParser(
            request.headers, stream(), max_files=4, max_fields=32, max_part_size=max_bytes
        )
    )
    try:
        form = await parser.parse()
    except MultiPartException:
        raise HttpError(400, "Invalid form body") from None
    try:
        return {
            key: FormFile(value.filename or "", await value.read())
            if isinstance(value, UploadFile)
            else value
            for key, value in form.multi_items()
        }
    finally:
        await form.close()
