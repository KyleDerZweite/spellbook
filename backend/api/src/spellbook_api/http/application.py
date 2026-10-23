"""Explicit representative routes; the neutral artifact remains the schema owner."""

import json
import re
from importlib.resources import files
from pathlib import Path

from fastapi import FastAPI, Request
from spellbook_core.auth import LocalAuth, SessionAuth
from spellbook_core.catalog import Catalog
from spellbook_core.inventory import Inventory
from spellbook_core.profile import Profile
from starlette.responses import Response
from starlette.routing import Route

from spellbook_api.http import routes_account, routes_auth, routes_catalog, routes_inventory
from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.errors import json_response
from spellbook_api.http.router import (
    HttpRoute,
    RawPathRouting,
    RouteRegistry,
    install_error_handlers,
)
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import Configuration


def create_http_application(
    configuration: Configuration,
    *,
    auth: SessionAuth | None = None,
    catalog: Catalog | None = None,
    inventory: Inventory | None = None,
    saved_routes: SavedStateRoutes | None = None,
    admission: RequestAdmission | None = None,
    profile: Profile | None = None,
) -> FastAPI:
    resource = files("spellbook_api").joinpath("openapi.json")
    schema_text = (
        resource.read_text(encoding="utf-8")
        if resource.is_file()
        else (Path(__file__).resolve().parents[5] / "contracts/openapi.json").read_text(
            encoding="utf-8"
        )
    )
    schema = json.loads(schema_text)
    schema["servers"] = [{"url": configuration.public_origin}]
    http = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, redirect_slashes=False)
    http.add_middleware(RawPathRouting)
    install_error_handlers(http)

    async def discovery(request: Request, params: dict[str, str]) -> Response:
        return json_response(schema, headers={"Cache-Control": "public, max-age=3600"})

    routes = [HttpRoute("GET", "/openapi.json", discovery)]
    dependencies = (auth, catalog, inventory, saved_routes)
    if any(item is not None for item in dependencies):
        if auth is None or catalog is None or inventory is None or saved_routes is None:
            raise ValueError("The representative HTTP dependencies must be supplied together")

        async def session(request: Request, params: dict[str, str]) -> Response:
            assert auth is not None
            return await routes_auth.get_session(request, auth, configuration.public_origin)

        async def printing(request: Request, params: dict[str, str]) -> Response:
            assert catalog is not None
            return await routes_catalog.get_printing(request, params["printingId"], catalog)

        async def add(request: Request, params: dict[str, str]) -> Response:
            assert auth is not None and inventory is not None
            return await routes_inventory.add_items(
                request, auth, inventory, configuration.public_origin
            )

        async def entry(request: Request, params: dict[str, str]) -> Response:
            assert auth is not None and inventory is not None
            return await routes_inventory.get_entry(
                request, params["entryId"], auth, inventory, configuration.public_origin
            )

        async def events(request: Request, params: dict[str, str]) -> Response:
            assert saved_routes is not None
            return await saved_routes.handle(request)

        routes.extend(
            [
                HttpRoute("GET", "/api/auth/session", session),
                HttpRoute("GET", "/api/catalog/printings/:printingId", printing),
                HttpRoute("POST", "/api/mobile/v1/mtg/inventory", add),
                HttpRoute("GET", "/api/mobile/v1/mtg/inventory/:entryId", entry),
                HttpRoute("GET", "/api/account/events", events),
            ]
        )
    if isinstance(auth, LocalAuth):
        routes.extend(
            routes_auth.create_auth_routes(
                auth, configuration.public_origin, configuration.trusted_proxy_addresses
            )
        )
        if profile is not None:
            routes.extend(
                routes_account.create_account_routes(
                    auth,
                    profile,
                    configuration.public_origin,
                    configuration.trusted_proxy_addresses,
                )
            )
    elif profile is not None:
        raise ValueError("Profile routes require LocalAuth")
    declared = {
        re.sub(r"\{([^}]+)\}", r":\1", path): tuple(
            method.upper()
            for method in item
            if method in {"get", "post", "put", "patch", "delete"}
        )
        for path, item in schema["paths"].items()
    }
    http.router.routes.append(
        Route(
            "/{path:path}",
            RouteRegistry(
                routes,
                configuration.public_origin,
                auth,
                admission or RequestAdmission(),
                declared,
            ),
        )
    )
    return http
