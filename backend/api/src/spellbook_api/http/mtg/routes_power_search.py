"""Optional-session global search. Explicit invalid bearer credentials fail closed."""

from fastapi import APIRouter, Request
from spellbook_core.auth import SessionAuth
from spellbook_core.mtg.power_search import PowerSearch
from starlette.responses import Response

from spellbook_api.http.auth import selected_token
from spellbook_api.http.errors import HttpError, json_response


def create_power_search_routes(auth: SessionAuth, search: PowerSearch) -> APIRouter:
    router = APIRouter()

    async def get(request: Request, query: str = "") -> Response:
        actor = await auth.validate_session(selected_token(request))
        if "authorization" in request.headers and actor is None:
            raise HttpError(401, "Invalid bearer token")
        return json_response(
            await search.search(query, actor), headers={"Cache-Control": "no-store"}
        )

    router.add_api_route("/api/v1/mtg/power-search", get, methods=["GET"], response_model=None)
    return router
