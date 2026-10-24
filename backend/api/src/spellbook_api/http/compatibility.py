"""Direct legacy dispatch, preserving the authenticated mobile Catalog contract."""

from collections.abc import Mapping

from spellbook_core.auth import SessionAuth
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.paths import legacy_paths
from spellbook_api.http.router import Handler, HttpRoute


def authenticated_catalog(handler: Handler, auth: SessionAuth, origin: str) -> Handler:
    async def handle(request: Request, params: dict[str, str]) -> Response:
        await require_mobile_auth(request, auth, origin)
        return await handler(request, params)

    return handle


def compatibility_routes(
    routes: list[HttpRoute], auth: SessionAuth | None, origin: str
) -> list[HttpRoute]:
    aliases = []
    for route in routes:
        for path in legacy_paths(route.path):
            handler = route.handle
            if route.path.startswith("/api/v1/mtg/catalog/") and path.startswith("/api/mobile/"):
                assert auth is not None
                handler = authenticated_catalog(handler, auth, origin)
            aliases.append(HttpRoute(route.method, path, handler))
    return aliases


def compatibility_methods(
    declared: Mapping[str, tuple[str, ...]],
) -> dict[str, tuple[str, ...]]:
    return {alias: methods for path, methods in declared.items() for alias in legacy_paths(path)}
