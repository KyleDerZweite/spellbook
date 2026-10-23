"""Public Catalog reads and authenticated mobile aliases."""

from spellbook_core.auth import SessionAuth
from spellbook_core.catalog import Catalog
from spellbook_core.errors import CatalogPrintingNotFoundError
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    read_json_object,
    read_query_integer,
    require_uuid,
)
from spellbook_api.http.router import Handler, HttpRoute


async def get_printing(request: Request, printing_id: str, catalog: Catalog) -> Response:
    """printing_id is the raw named segment from the shared registry."""
    try:
        printing = await catalog.get_catalog_printing(
            require_uuid(decode_parameter(printing_id), "printingId")
        )
    except CatalogPrintingNotFoundError as cause:
        raise HttpError(404, str(cause)) from None
    return json_response(printing, headers={"Cache-Control": "no-store"})


def create_catalog_routes(auth: SessionAuth, catalog: Catalog, origin: str) -> list[HttpRoute]:
    async def search_get(request: Request, params: dict[str, str]) -> Response:
        query = request.query_params
        result = await catalog.search_catalog_request(
            {
                "query": query.get("q", ""),
                "limit": read_query_integer(query.get("limit"), "limit", 20, 500),
                "offset": read_query_integer(query.get("offset"), "offset", 0, 1000000),
            }
        )
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def search_post(request: Request, params: dict[str, str]) -> Response:
        result = await catalog.search_catalog_request(await read_json_object(request))
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def printings(request: Request, params: dict[str, str]) -> Response:
        query = request.query_params
        result = await catalog.get_printings(
            require_uuid(decode_parameter(params["oracleId"]), "oracleId"),
            read_query_integer(query.get("limit"), "limit", 100, 100, 1),
            read_query_integer(query.get("offset"), "offset", 0, 1000000),
        )
        return json_response(result)

    async def singleton(request: Request, params: dict[str, str]) -> Response:
        return await get_printing(request, params["printingId"], catalog)

    def mobile(handler: Handler) -> Handler:
        async def handle(request: Request, params: dict[str, str]) -> Response:
            await require_mobile_auth(request, auth, origin)
            return await handler(request, params)

        return handle

    return [
        HttpRoute("GET", "/api/catalog/search", search_get),
        HttpRoute("POST", "/api/catalog/search", search_post),
        HttpRoute("GET", "/api/mobile/v1/mtg/search", mobile(search_get)),
        HttpRoute("POST", "/api/mobile/v1/mtg/search", mobile(search_post)),
        HttpRoute("GET", "/api/catalog/cards/:oracleId/printings", printings),
        HttpRoute("GET", "/api/mobile/v1/mtg/cards/:oracleId/printings", mobile(printings)),
        HttpRoute("GET", "/api/catalog/printings/:printingId", singleton),
    ]
