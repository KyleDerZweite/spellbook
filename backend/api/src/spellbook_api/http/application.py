"""Explicit integrated routes; the neutral artifact remains the schema owner."""

import json
import re
from importlib.resources import files
from pathlib import Path

from fastapi import FastAPI, Request
from spellbook_core.auth import LocalAuth, SessionAuth
from spellbook_core.catalog import Catalog
from spellbook_core.categories import Categories
from spellbook_core.dashboard import Dashboard
from spellbook_core.decks import Decks
from spellbook_core.inventory import Inventory
from spellbook_core.profile import Profile
from spellbook_core.scan import Scan
from spellbook_core.valuation import Valuation
from starlette.responses import Response
from starlette.routing import Route

from spellbook_api.http import (
    routes_account,
    routes_auth,
    routes_catalog,
    routes_categories,
    routes_decks,
    routes_inventory,
    routes_scan,
    routes_valuation,
    routes_web,
)
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
    valuation: Valuation | None = None,
    dashboard: Dashboard | None = None,
    scan: Scan | None = None,
    categories: Categories | None = None,
    decks: Decks | None = None,
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
            raise ValueError("The HTTP dependencies must be supplied together")

        async def session(request: Request, params: dict[str, str]) -> Response:
            assert auth is not None
            return await routes_auth.get_session(request, auth, configuration.public_origin)

        async def events(request: Request, params: dict[str, str]) -> Response:
            assert saved_routes is not None
            return await saved_routes.handle(request)

        routes.extend(
            [
                HttpRoute("GET", "/api/auth/session", session),
                HttpRoute("GET", "/api/account/events", events),
            ]
        )
        routes.extend(
            routes_catalog.create_catalog_routes(auth, catalog, configuration.public_origin)
        )
        routes.extend(
            routes_inventory.create_inventory_routes(auth, inventory, configuration.public_origin)
        )
    if valuation is not None:
        if auth is None:
            raise ValueError("Valuation routes require Auth")
        routes.extend(
            routes_valuation.create_valuation_routes(auth, valuation, configuration.public_origin)
        )
    if scan is not None:
        if auth is None:
            raise ValueError("Scan routes require Auth")
        routes.extend(routes_scan.create_scan_routes(auth, scan, configuration.public_origin))
    if categories is not None:
        if auth is None:
            raise ValueError("Category routes require Auth")
        routes.extend(
            routes_categories.create_category_routes(auth, categories, configuration.public_origin)
        )
    if decks is not None:
        if auth is None or inventory is None:
            raise ValueError("Deck and web routes require Auth and Inventory")
        routes.extend(routes_decks.create_deck_routes(auth, decks, configuration.public_origin))
        routes.extend(
            routes_web.create_web_routes(auth, inventory, decks, configuration.public_origin)
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
                    dashboard=dashboard,
                )
            )
    elif profile is not None or dashboard is not None:
        raise ValueError("Account routes require LocalAuth")
    if dashboard is not None and profile is None:
        raise ValueError("Dashboard routes require Profile")
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
