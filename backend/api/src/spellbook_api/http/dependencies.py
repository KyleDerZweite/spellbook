"""Native dependencies defer decoding until request authority has been checked."""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from pydantic import StringConstraints
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.parsing import read_json_object


def actor_dependency(auth: SessionAuth, origin: str) -> Callable[[Request], Awaitable[Actor]]:
    async def authenticated(request: Request) -> Actor:
        return await require_mobile_auth(request, auth, origin)

    return authenticated


def body_dependency(
    guard: Callable[[Request], Awaitable[Actor]] | None = None,
    max_bytes: int = 1024 * 1024,
) -> Callable[..., Awaitable[dict[str, object]]]:
    if guard is None:

        async def public_body(request: Request) -> dict[str, object]:
            return await read_json_object(request, max_bytes)

        return public_body

    async def private_body(
        request: Request, actor: Annotated[Actor, Depends(guard)]
    ) -> dict[str, object]:
        return await read_json_object(request, max_bytes)

    return private_body


UUIDPath = Annotated[
    str, StringConstraints(pattern=r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
]
