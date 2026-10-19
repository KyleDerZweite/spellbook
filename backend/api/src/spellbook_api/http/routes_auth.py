"""The representative session read. Login and QR remain with P03."""

from spellbook_core.auth import SessionAuth
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth, selected_token
from spellbook_api.http.errors import HttpError, json_response


async def get_session(request: Request, auth: SessionAuth, public_origin: str) -> Response:
    actor = await require_mobile_auth(request, auth, public_origin)
    current = await auth.require_actor(actor)
    session = await auth.inspect_session(selected_token(request))
    if session is None:
        raise HttpError(401, "Authentication required")
    return json_response(
        {"user": current.to_dto(), "expiresAt": session.expires_at},
        headers={"Cache-Control": "no-store"},
    )
