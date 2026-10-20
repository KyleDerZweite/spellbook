"""Session selection and request authority at the HTTP boundary."""

import re

from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from starlette.requests import Request

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


def require_same_origin(request: Request, public_origin: str) -> None:
    if header(request, "origin") != public_origin:
        raise HttpError(403, "Invalid request origin")


def require_form_origin(request: Request, public_origin: str) -> None:
    """Pre-handler guard for the representative items-add route."""
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
    if header(request, "origin") != public_origin:
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
    """The shared registry prepends this cleanup even with explicit bearer auth."""
    cookie = read_cookie(request)
    if not cookie or await auth.validate_session(cookie) is not None:
        return None
    secure = "; Secure" if public_origin.startswith("https:") else ""
    return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}"
