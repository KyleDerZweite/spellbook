"""Existing public reference and private Inventory value HTTP contracts."""

import re

from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ActorError, ValidationError
from spellbook_core.inventory_value import create_inventory_values
from spellbook_core.valuation import InventoryPriceNotFound, Valuation
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import read_json_object
from spellbook_api.http.router import Handler, HttpRoute


def price_read_error(cause: Exception) -> HttpError:
    if isinstance(cause, HttpError):
        return cause
    if isinstance(cause, ActorError):
        return HttpError(401, "Authentication required")
    if isinstance(cause, InventoryPriceNotFound):
        return HttpError(404, "Inventory entry not found.")
    if isinstance(cause, ValidationError):
        return HttpError(400, str(cause))
    return HttpError(503, "Reference prices are temporarily unavailable.")


def create_valuation_routes(
    auth: SessionAuth, valuation: Valuation, origin: str
) -> list[HttpRoute]:
    values = create_inventory_values(valuation.pool, valuation, timezone=valuation.timezone)

    async def prices(request: Request, params: dict[str, str]) -> Response:
        query = request.query_params
        if set(query) - {"printingId", "finish"} or any(
            len(query.getlist(key)) != 1 for key in ("printingId", "finish")
        ):
            raise HttpError(400, "Supply one printingId and finish")
        response = await valuation.printing_references(
            [{"printingId": query["printingId"], "finish": query["finish"]}]
        )
        return json_response(response, headers={"Cache-Control": "no-store"})

    async def history(request: Request, params: dict[str, str]) -> Response:
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

    async def inventory_prices(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        response = await valuation.inventory_references(actor, await read_json_object(request))
        return json_response(response, headers={"Cache-Control": "no-store"})

    async def current_value(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        if request.scope.get("query_string"):
            raise HttpError(400, "Current value accepts no query parameters")
        return json_response(
            await values.current(actor), headers={"Cache-Control": "private, no-store"}
        )

    async def value_history(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
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

    def mapped(handler: Handler) -> Handler:
        async def handle(request: Request, params: dict[str, str]) -> Response:
            try:
                return await handler(request, params)
            except Exception as cause:
                raise price_read_error(cause) from None

        return handle

    return [
        HttpRoute("GET", "/api/mobile/v1/mtg/prices", mapped(prices)),
        HttpRoute("GET", "/api/mobile/v1/mtg/prices/history", mapped(history)),
        HttpRoute("POST", "/api/mobile/v1/mtg/inventory/prices", mapped(inventory_prices)),
        HttpRoute("GET", "/api/mobile/v1/mtg/inventory/value", mapped(current_value)),
        HttpRoute("GET", "/api/mobile/v1/mtg/inventory/value-history", mapped(value_history)),
    ]
