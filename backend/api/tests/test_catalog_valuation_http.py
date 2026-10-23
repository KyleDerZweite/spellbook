"""Direct route-factory adapters preserve authentication order and wire errors."""

import asyncio
import json
from typing import Any
from unittest.mock import create_autospec
from urllib.parse import urlencode

import pytest
from spellbook_api.http.errors import error_response
from spellbook_api.http.router import HttpRoute
from spellbook_api.http.routes_catalog import create_catalog_routes
from spellbook_api.http.routes_valuation import create_valuation_routes
from spellbook_core.auth import SessionAuth
from spellbook_core.catalog import Catalog
from spellbook_core.db import ConnectionPool
from spellbook_core.errors import CatalogPrintingNotFoundError
from spellbook_core.inventory_value import InventoryValues
from spellbook_core.models import Actor
from spellbook_core.valuation import PriceReadUnavailable, Valuation
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message

ORIGIN = "https://spellbook.test"
PRINTING = "11111111-1111-4111-8111-111111111111"
ACTOR = Actor("adapter-account", "adapter", "", "", "")


def request(
    *,
    method: str = "GET",
    query: str = "",
    body: object = None,
    bearer: str | None = None,
    origin: str | None = None,
) -> Request:
    raw = json.dumps(body).encode()
    headers = {"content-type": "application/json", "content-length": str(len(raw))}
    if bearer is not None:
        headers["authorization"] = bearer
    if origin is not None:
        headers["origin"] = origin

    async def receive() -> Message:
        return {"type": "http.request", "body": raw, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/",
            "query_string": query.encode(),
            "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
        },
        receive,
    )


def dependencies() -> tuple[Any, Any, Any]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.return_value = ACTOR
    catalog = create_autospec(Catalog, instance=True)
    catalog.search_catalog_request.return_value = {"hits": [], "query": ""}
    catalog.get_printings.return_value = {"hits": []}
    valuation = create_autospec(Valuation, instance=True)
    valuation.pool = create_autospec(ConnectionPool, instance=True)
    valuation.timezone = "Europe/Berlin"
    valuation.printing_references.return_value = {"results": []}
    valuation.printing_history.return_value = {"points": []}
    valuation.inventory_references.return_value = {"results": []}
    return auth, catalog, valuation


async def invoke(route: HttpRoute, req: Request, params: dict[str, str] | None = None) -> Response:
    try:
        return await route.handle(req, params or {})
    except Exception as cause:
        return error_response(cause)


def test_catalog_mobile_aliases_authenticate_before_validation_and_public_is_open() -> None:
    async def scenario() -> None:
        auth, catalog, _ = dependencies()
        routes = create_catalog_routes(auth, catalog, ORIGIN)
        public = next(r for r in routes if r.method == "GET" and r.path == "/api/catalog/search")
        response = await invoke(public, request(query="q=%C3%84ther&limit=0"))
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        auth.validate_session.assert_not_awaited()
        catalog.search_catalog_request.assert_awaited_once_with(
            {"query": "Äther", "limit": 0, "offset": 0}
        )
        auth.validate_session.return_value = None
        for route in routes:
            if "/mobile/" in route.path:
                response = await invoke(
                    route,
                    request(method=route.method, query="limit=bad", body=None),
                    {"oracleId": "bad"},
                )
                assert response.status_code == 401
        catalog.get_printings.assert_not_awaited()

    asyncio.run(scenario())


def test_catalog_singleton_and_printings_preserve_validation_and_cache() -> None:
    async def scenario() -> None:
        auth, catalog, _ = dependencies()
        routes = create_catalog_routes(auth, catalog, ORIGIN)
        singleton = next(r for r in routes if r.path == "/api/catalog/printings/:printingId")
        catalog.get_catalog_printing.side_effect = CatalogPrintingNotFoundError()
        response = await invoke(singleton, request(), {"printingId": PRINTING})
        assert response.status_code == 404
        assert json.loads(bytes(response.body))["message"] == "Catalog printing not found"
        printings = next(r for r in routes if r.path == "/api/catalog/cards/:oracleId/printings")
        response = await invoke(printings, request(query="limit=0"), {"oracleId": PRINTING})
        assert response.status_code == 400
        catalog.get_printings.assert_not_awaited()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "query",
    ["printingId=x", "printingId=x&finish=foil&finish=foil", "printingId=x&finish=foil&unknown=1"],
)
def test_prices_reject_duplicate_or_unknown_query_fields(query: str) -> None:
    async def scenario() -> None:
        auth, _, valuation = dependencies()
        route = create_valuation_routes(auth, valuation, ORIGIN)[0]
        assert (await invoke(route, request(query=query))).status_code == 400
        valuation.printing_references.assert_not_awaited()

    asyncio.run(scenario())


def test_public_prices_are_open_private_prices_require_auth_and_errors_are_503() -> None:
    async def scenario() -> None:
        auth, _, valuation = dependencies()
        routes = create_valuation_routes(auth, valuation, ORIGIN)
        query = urlencode({"printingId": PRINTING, "finish": "nonfoil"})
        response = await invoke(routes[0], request(query=query, bearer="invalid"))
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        auth.validate_session.assert_not_awaited()
        valuation.printing_references.side_effect = PriceReadUnavailable()
        response = await invoke(routes[0], request(query=query))
        assert response.status_code == 503
        assert json.loads(bytes(response.body)) == {
            "message": "Reference prices are temporarily unavailable.",
            "status": 503,
        }
        auth.validate_session.return_value = None
        response = await invoke(routes[2], request(method="POST", body=[]))
        assert response.status_code == 401
        valuation.inventory_references.assert_not_awaited()

    asyncio.run(scenario())


def test_value_history_rejects_duplicate_filters_and_current_rejects_queries() -> None:
    async def scenario() -> None:
        auth, _, valuation = dependencies()
        routes = create_valuation_routes(auth, valuation, ORIGIN)
        for query in ("days=0", "days=1&days=2", "accountId=forged", "days=1.0"):
            response = await invoke(routes[4], request(query=query))
            assert response.status_code == 400
        assert (await invoke(routes[3], request(query="anything=1"))).status_code == 400

    asyncio.run(scenario())


def test_private_value_cache_policy_and_actor_forwarding(monkeypatch: pytest.MonkeyPatch) -> None:
    async def scenario() -> None:
        auth, _, valuation = dependencies()
        values = create_autospec(InventoryValues, instance=True)
        values.current.return_value = {"estimate": {"coveredValue": "0.00"}}
        values.history.return_value = {"points": []}
        monkeypatch.setattr(
            "spellbook_api.http.routes_valuation.create_inventory_values", lambda *a, **kw: values
        )
        routes = create_valuation_routes(auth, valuation, ORIGIN)
        for route in routes[3:]:
            response = await invoke(route, request())
            assert response.status_code == 200
            assert response.headers["cache-control"] == "private, no-store"
        values.current.assert_awaited_once_with(ACTOR)
        values.history.assert_awaited_once_with(ACTOR, {})

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "path",
    [
        "/api/catalog/search",
        "/api/mobile/v1/mtg/search",
        "/api/catalog/cards/:oracleId/printings",
        "/api/mobile/v1/mtg/cards/:oracleId/printings",
    ],
)
@pytest.mark.parametrize(
    "query,status,error_field",
    [
        ("q=first&q=second&limit=3&limit=20&offset=7&offset=40", 200, None),
        ("q=first&q=second&limit=3&limit=bad&offset=7&offset=bad", 200, None),
        ("q=first&q=second&limit=bad&limit=20&offset=7&offset=40", 400, "limit"),
        ("limit=3&limit=20&offset=bad&offset=7", 400, "offset"),
        ("limit=bad&limit=20&offset=bad&offset=7", 400, "limit"),
        ("limit=&limit=20&offset=7&offset=40", 400, "limit"),
        ("limit=3&limit=20&offset=&offset=7", 400, "offset"),
    ],
)
def test_catalog_get_queries_select_first_repeated_value(
    path: str, query: str, status: int, error_field: str | None
) -> None:
    async def scenario() -> None:
        auth, catalog, _ = dependencies()
        route = next(
            route
            for route in create_catalog_routes(auth, catalog, ORIGIN)
            if route.method == "GET" and route.path == path
        )
        response = await invoke(
            route, request(query=query, bearer="Bearer " + "a" * 43), {"oracleId": PRINTING}
        )
        assert response.status_code == status
        if "/mobile/" in path:
            auth.validate_session.assert_awaited_once_with("a" * 43)
        else:
            auth.validate_session.assert_not_awaited()
        if error_field is not None:
            assert json.loads(bytes(response.body))["message"].startswith(
                f"{error_field} must be an integer"
            )
            catalog.search_catalog_request.assert_not_awaited()
            catalog.get_printings.assert_not_awaited()
        elif path.endswith("/search"):
            catalog.search_catalog_request.assert_awaited_once_with(
                {"query": "first", "limit": 3, "offset": 7}
            )
        else:
            catalog.get_printings.assert_awaited_once_with(PRINTING, 3, 7)

    asyncio.run(scenario())


@pytest.mark.parametrize("path", ["/api/catalog/search", "/api/mobile/v1/mtg/search"])
def test_catalog_search_preserves_first_empty_query_and_post_json_input(path: str) -> None:
    async def scenario() -> None:
        auth, catalog, _ = dependencies()
        routes = create_catalog_routes(auth, catalog, ORIGIN)
        for method, expected in [
            ("GET", {"query": "", "limit": 20, "offset": 0}),
            ("POST", {"query": "from JSON", "limit": 4, "offset": 8}),
        ]:
            route = next(
                route for route in routes if route.path == path and route.method == method
            )
            response = await invoke(
                route,
                request(
                    method=method,
                    query="q=&q=ignored&limit=bad&limit=20"
                    if method == "POST"
                    else "q=&q=ignored",
                    body={"query": "from JSON", "limit": 4, "offset": 8},
                    bearer="Bearer " + "a" * 43,
                ),
            )
            assert response.status_code == 200
            catalog.search_catalog_request.assert_awaited_once_with(expected)
            catalog.search_catalog_request.reset_mock()

    asyncio.run(scenario())
