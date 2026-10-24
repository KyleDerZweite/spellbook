"""Account-scoped MTG Dashboard adapter."""

from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.dashboard import Dashboard
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import actor_dependency
from spellbook_api.http.errors import json_response


def create_dashboard_routes(auth: SessionAuth, dashboard: Dashboard, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def get_dashboard(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(await dashboard.get(actor), headers={"Cache-Control": "no-store"})

    router.add_api_route(
        "/api/v1/mtg/dashboard", get_dashboard, methods=["GET"], response_model=None
    )
    return router
