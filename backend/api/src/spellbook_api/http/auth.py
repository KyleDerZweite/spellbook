"""Session selection and request authority at the HTTP boundary."""

import ipaddress
import re

from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.errors import HttpError
from spellbook_api.http.parsing import decode_parameter, header, trim

SESSION_COOKIE = "spellbook_session"


def get_bearer_token(request: Request) -> str | None:
    match = re.fullmatch(
        r"Bearer ([A-Za-z0-9_-]{43})",
        header(request, "authorization") or "",
        flags=re.IGNORECASE | re.ASCII,
    )
    return match[1] if match else None


def read_cookie(request: Request, name: str = SESSION_COOKIE) -> str | None:
    for item in (header(request, "cookie") or "").split(";"):
        key, separator, value = item.partition("=")
        if not separator or trim(key) != name:
            continue
        try:
            return decode_parameter(trim(value))
        except HttpError:
            return None
    return None


def selected_token(request: Request) -> str | None:
    if "authorization" in request.headers:
        return get_bearer_token(request)
    return read_cookie(request)


def require_same_origin(request: Request, public_origin: str, allow_missing: bool = False) -> None:
    origin = header(request, "origin")
    if origin != public_origin and not (allow_missing and origin is None):
        raise HttpError(403, "Invalid request origin")


def require_form_origin(request: Request, public_origin: str, route_path: str = "") -> None:
    """Guard browser form mutations, with the existing narrow native bearer exceptions."""
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    media = trim((header(request, "content-type") or "").split(";")[0]).lower()
    if media and media not in {
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "text/plain",
        "application/x-sveltekit-formdata",
    }:
        return
    origin = header(request, "origin")
    if origin == public_origin:
        return
    if origin is None and get_bearer_token(request):
        if (
            request.method == "POST"
            and media == "multipart/form-data"
            and route_path == "/api/v1/mtg/scan/sessions/{sessionId}/frames"
        ):
            return
        bodyless = {
            "DELETE /api/v1/mtg/decks/{deckId}",
            "DELETE /api/v1/mtg/deck-cards/{entryId}",
            "DELETE /api/v1/mtg/inventory/{entryId}",
            "POST /api/v1/mtg/scan/sessions",
            "POST /api/v1/auth/logout",
        }
        length = header(request, "content-length") or "0"
        has_body = "transfer-encoding" in request.headers or (
            length.isascii() and length.isdigit() and bool(length.lstrip("0"))
        )
        if not media and not has_body and f"{request.method} {route_path}" in bodyless:
            return
    raise HttpError(403, f"Cross-site {request.method} form submissions are forbidden")


async def require_mobile_auth(request: Request, auth: SessionAuth, public_origin: str) -> Actor:
    actor = await auth.validate_session(selected_token(request))
    if "authorization" in request.headers:
        if actor is None:
            raise HttpError(401, "Invalid bearer token")
        return actor
    if actor is None:
        raise HttpError(401, "Authentication required")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_same_origin(request, public_origin)
    return actor


async def stale_session_cookie(
    request: Request,
    auth: SessionAuth,
    public_origin: str,
) -> str | None:
    """Request policy prepends cleanup before any replacement cookie."""
    cookie = read_cookie(request)
    if not cookie or await auth.validate_session(cookie) is not None:
        return None
    secure = "; Secure" if public_origin.startswith("https:") else ""
    return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}"


def client_address(request: Request, trusted_proxy_addresses: tuple[str, ...] = ()) -> str:
    peer = normalize_address(request.client.host if request.client else "unknown")
    forwarded = header(request, "x-spellbook-client-address")
    if peer in trusted_proxy_addresses and forwarded:
        try:
            ipaddress.ip_address(forwarded)
        except ValueError:
            pass
        else:
            return normalize_address(forwarded)
    return peer


def normalize_address(address: str) -> str:
    if address.startswith("::ffff:"):
        try:
            return str(ipaddress.IPv4Address(address[7:]))
        except ValueError:
            pass
    return address


def write_session_cookie(response: Response, token: str, public_origin: str) -> None:
    append_cookie(response, SESSION_COOKIE, token, "/", 2592000, public_origin)


def append_cookie(
    response: Response, name: str, value: str, path: str, max_age: int, public_origin: str
) -> None:
    secure = "; Secure" if public_origin.startswith("https:") else ""
    response.raw_headers.append(
        (
            b"set-cookie",
            (
                f"{name}={value}; Path={path}; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"
            ).encode("ascii"),
        )
    )
