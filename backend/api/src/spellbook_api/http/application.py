"""Explicit integrated routes; the neutral artifact remains the schema owner."""

import json
from importlib.resources import files
from pathlib import Path

from fastapi import FastAPI, Request
from spellbook_core.auth import LocalAuth, SessionAuth
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.categories import Categories
from spellbook_core.mtg.dashboard import Dashboard
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.mtg.scan import Scan
from spellbook_core.mtg.valuation import Valuation
from spellbook_core.profile import Profile
from starlette.responses import Response

from spellbook_api.http import routes_account, routes_auth
from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.errors import json_response
from spellbook_api.http.mtg import (
    routes_catalog,
    routes_categories,
    routes_commands,
    routes_dashboard,
    routes_decks,
    routes_inventory,
    routes_scan,
    routes_valuation,
)
from spellbook_api.http.policy import configure_http
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
    configure_http(http, configuration.public_origin, auth, admission)

    async def discovery(request: Request) -> Response:
        return json_response(schema, headers={"Cache-Control": "public, max-age=3600"})

    http.add_api_route("/openapi.json", discovery, methods=["GET"], response_model=None)
    dependencies = (auth, catalog, inventory, saved_routes)
    if any(item is not None for item in dependencies):
        if auth is None or catalog is None or inventory is None or saved_routes is None:
            raise ValueError("The HTTP dependencies must be supplied together")

        async def session(request: Request) -> Response:
            assert auth is not None
            return await routes_auth.get_session(request, auth, configuration.public_origin)

        async def events(request: Request) -> Response:
            assert saved_routes is not None
            return await saved_routes.handle(request)

        http.add_api_route("/api/v1/auth/session", session, methods=["GET"], response_model=None)
        http.add_api_route("/api/v1/account/events", events, methods=["GET"], response_model=None)
        http.include_router(routes_catalog.create_catalog_routes(catalog))
    if valuation is not None:
        if auth is None:
            raise ValueError("Valuation routes require Auth")
        http.include_router(
            routes_valuation.create_valuation_routes(auth, valuation, configuration.public_origin)
        )
    # Literal value reads must be registered before Inventory's {entryId} route.
    if inventory is not None:
        assert auth is not None
        http.include_router(
            routes_inventory.create_inventory_routes(auth, inventory, configuration.public_origin)
        )
    if scan is not None:
        if auth is None:
            raise ValueError("Scan routes require Auth")
        http.include_router(
            routes_scan.create_scan_routes(auth, scan, configuration.public_origin)
        )
    if categories is not None:
        if auth is None:
            raise ValueError("Category routes require Auth")
        http.include_router(
            routes_categories.create_category_routes(auth, categories, configuration.public_origin)
        )
    if decks is not None:
        if auth is None or inventory is None:
            raise ValueError("Deck and web routes require Auth and Inventory")
        http.include_router(
            routes_decks.create_deck_routes(auth, decks, configuration.public_origin)
        )
        http.include_router(
            routes_commands.create_command_routes(
                auth, inventory, decks, configuration.public_origin
            )
        )
    if isinstance(auth, LocalAuth):
        http.include_router(
            routes_auth.create_auth_routes(
                auth, configuration.public_origin, configuration.trusted_proxy_addresses
            )
        )
        if profile is not None:
            http.include_router(
                routes_account.create_account_routes(
                    auth,
                    profile,
                    configuration.public_origin,
                    configuration.trusted_proxy_addresses,
                )
            )
    elif profile is not None or dashboard is not None:
        raise ValueError("Account routes require LocalAuth")
    if dashboard is not None and profile is None:
        raise ValueError("Dashboard routes require Profile")
    if dashboard is not None:
        assert auth is not None
        http.include_router(
            routes_dashboard.create_dashboard_routes(auth, dashboard, configuration.public_origin)
        )
    return http
