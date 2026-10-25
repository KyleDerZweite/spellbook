"""Public MTG Catalog reads."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.errors import CatalogPrintingNotFoundError
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import UUIDPath, body_dependency
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import read_query_integer, require_uuid


async def get_printing(request: Request, printing_id: str, catalog: Catalog) -> Response:
    """printing_id is a decoded path value validated by the native endpoint."""
    try:
        printing = await catalog.get_catalog_printing(require_uuid(printing_id, "printingId"))
    except CatalogPrintingNotFoundError as cause:
        raise HttpError(404, str(cause)) from None
    return json_response(printing, headers={"Cache-Control": "no-store"})


def create_catalog_routes(catalog: Catalog) -> APIRouter:
    router = APIRouter()

    async def search_get(
        q: str = "",
        limit: Annotated[int, Query(ge=0, le=500)] = 20,
        offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
    ) -> Response:
        result = await catalog.search_catalog_request(
            {"query": q, "limit": limit, "offset": offset}
        )
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def search_post(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(None, 1048576))],
    ) -> Response:
        result = await catalog.search_catalog_request(body)
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def printings(request: Request, oracleId: UUIDPath) -> Response:
        query = dict(request.query_params)
        result = await catalog.get_printings(
            oracleId,
            read_query_integer(query.get("limit"), "limit", 100, 100, 1),
            read_query_integer(query.get("offset"), "offset", 0, 1000000),
        )
        return json_response(result)

    async def singleton(request: Request, printingId: UUIDPath) -> Response:
        return await get_printing(request, printingId, catalog)

    router.add_api_route(
        "/api/v1/mtg/catalog/search", search_get, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/catalog/search", search_post, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/catalog/cards/{oracleId}/printings",
        printings,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/catalog/printings/{printingId}",
        singleton,
        methods=["GET"],
        response_model=None,
    )
    return router
