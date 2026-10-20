"""SavedState handler and pre-drain stream ownership. No route registration."""

import asyncio

from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ActorError
from spellbook_core.saved_state import SavedState
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError
from spellbook_api.http.parsing import header
from spellbook_api.http.sse import SavedStateResponse


class SavedStateRoutes:
    def __init__(self, auth: SessionAuth, saved_state: SavedState, public_origin: str) -> None:
        self._auth = auth
        self._saved_state = saved_state
        self._public_origin = public_origin
        self._streams: set[SavedStateResponse] = set()
        self._closed = False

    async def handle(self, request: Request) -> Response:
        origin = header(request, "origin")
        if origin is not None and origin != self._public_origin:
            raise HttpError(403, "Same-origin connection required")
        if request.query_params:
            raise HttpError(400, "Stream query parameters are not supported")
        actor = await require_mobile_auth(request, self._auth, self._public_origin)
        if self._closed:
            raise HttpError(503, "Saved state temporarily unavailable")
        response = SavedStateResponse(request, lambda: self._streams.discard(response))
        self._streams.add(response)
        try:
            await response.open(self._saved_state, actor)
            if self._closed:
                raise HttpError(503, "Saved state temporarily unavailable")
            return response
        except BaseException as cause:
            await response.close()
            if isinstance(cause, asyncio.CancelledError):
                current = asyncio.current_task()
                if current is not None and current.cancelling():
                    raise
            elif isinstance(cause, ActorError):
                raise HttpError(401, "Authentication required") from None
            elif not isinstance(cause, Exception):
                raise
            raise HttpError(503, "Saved state temporarily unavailable") from None

    async def close_streams(self) -> None:
        self._closed = True
        self._saved_state.close_admission()
        if self._streams:
            await asyncio.gather(*(stream.close() for stream in tuple(self._streams)))


def create_saved_state_routes(
    auth: SessionAuth, saved_state: SavedState, public_origin: str
) -> SavedStateRoutes:
    return SavedStateRoutes(auth, saved_state, public_origin)
