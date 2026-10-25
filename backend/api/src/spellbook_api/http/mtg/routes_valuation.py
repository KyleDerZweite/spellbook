"""Existing public reference and private Inventory value HTTP contracts."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.inventory_value import create_inventory_values
from spellbook_core.mtg.valuation import Valuation
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response


def create_valuation_routes(auth: SessionAuth, valuation: Valuation, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)
    values = create_inventory_values(valuation.pool, valuation, timezone=valuation.timezone)

    async def prices(request: Request) -> Response:
        query = request.query_params
        if set(query) - {"printingId", "finish"} or any(
            len(query.getlist(key)) != 1 for key in ("printingId", "finish")
        ):
            raise HttpError(400, "Supply one printingId and finish")
        response = await valuation.printing_references(
            [{"printingId": query["printingId"], "finish": query["finish"]}]
        )
        return json_response(response, headers={"Cache-Control": "no-store"})

    async def history(request: Request) -> Response:
        query = request.query_params
        if (
            set(query) - {"printingId", "finish", "days", "source"}
            or any(len(query.getlist(key)) != 1 for key in ("printingId", "finish"))
            or len(query.getlist("days")) > 1
        ):
            raise HttpError(400, "Supply one printingId, finish and optional days/source filters")
        input: dict[str, object] = {"printingId": query["printingId"], "finish": query["finish"]}
        if "days" in query:
            if not re.fullmatch("[0-9]{1,2}", query["days"]):
                raise HttpError(400, "History days must be 1 to 90")
            input["days"] = int(query["days"])
        if sources := query.getlist("source"):
            input["sources"] = sources
        response = await valuation.printing_history(input)
        return json_response(response, headers={"Cache-Control": "no-store"})

    async def inventory_prices(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        response = await valuation.inventory_references(actor, body)
        return json_response(response, headers={"Cache-Control": "no-store"})

    async def current_value(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        if request.scope.get("query_string"):
            raise HttpError(400, "Current value accepts no query parameters")
        return json_response(
            await values.current(actor), headers={"Cache-Control": "private, no-store"}
        )

    async def value_history(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        query = request.query_params
        allowed = {"days", "from", "to", "printingId", "finish", "condition"}
        if set(query) - allowed or any(len(query.getlist(key)) > 1 for key in allowed):
            raise HttpError(400, "Invalid history query")
        input: dict[str, object] = dict(query)
        if "days" in query:
            if not re.fullmatch("[1-9][0-9]{0,2}", query["days"]) or int(query["days"]) > 366:
                raise HttpError(400, "History days must be 1 to 366")
            input["days"] = int(query["days"])
        return json_response(
            await values.history(actor, input), headers={"Cache-Control": "private, no-store"}
        )

    router.add_api_route("/api/v1/mtg/prices", prices, methods=["GET"], response_model=None)
    router.add_api_route(
        "/api/v1/mtg/prices/history", history, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/prices", inventory_prices, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/value", current_value, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/value-history", value_history, methods=["GET"], response_model=None
    )
    return router
