"""Native HTTP test assembly using the same policy as the production app."""

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute, iter_route_contexts
from spellbook_core.auth import SessionAuth

from spellbook_api.http.policy import configure_http


def application(router: APIRouter, origin: str, auth: SessionAuth | None = None) -> FastAPI:
    http = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, redirect_slashes=False)
    configure_http(http, origin, auth)
    http.include_router(router)
    return http


def operations(router: APIRouter | FastAPI) -> set[tuple[str, str]]:
    return {
        (method, route.path)
        for route in iter_route_contexts(router.routes)
        if route.path is not None
        for method in route.methods or ()
    }


def native_routes(router: APIRouter) -> list[APIRoute]:
    return [route for route in router.routes if isinstance(route, APIRoute)]
