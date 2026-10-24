"""Account-scoped MTG Dashboard adapter."""

from spellbook_core.auth import SessionAuth
from spellbook_core.mtg.dashboard import Dashboard
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import json_response
from spellbook_api.http.router import HttpRoute


def create_dashboard_routes(
    auth: SessionAuth, dashboard: Dashboard, origin: str
) -> list[HttpRoute]:
    async def get_dashboard(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(await dashboard.get(actor), headers={"Cache-Control": "no-store"})

    return [HttpRoute("GET", "/api/v1/mtg/dashboard", get_dashboard)]
