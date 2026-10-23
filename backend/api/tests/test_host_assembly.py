"""Production assembly exercises each integrated factory and the account dashboard."""

import asyncio
from typing import cast
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from spellbook_core.profile import SUMMARY_RANGE_MESSAGE, SummaryRangeError
from starlette.routing import Route
from test_auth_account import ACTOR, ORIGIN, TOKEN

from spellbook_api.application import ApplicationResources, create_application
from spellbook_api.http.router import RouteRegistry
from spellbook_api.http.routes_catalog import create_catalog_routes
from spellbook_api.http.routes_inventory import create_inventory_routes
from spellbook_api.http.routes_valuation import create_valuation_routes
from spellbook_api.http.types import Configuration


@pytest.mark.parametrize("timezone", ["UTC", "America/New_York", " Europe/Berlin ", ""])
def test_value_calendar_configuration_is_normalized_before_resource_construction(
    timezone: str,
) -> None:
    config = Configuration.from_environment(
        {"APP_ORIGIN": ORIGIN, "VALUE_HISTORY_TIMEZONE": timezone}
    )
    assert config.value_history_timezone == (timezone.strip() or "Europe/Berlin")
    with pytest.raises(ValueError, match="VALUE_HISTORY_TIMEZONE"):
        Configuration(ORIGIN, value_history_timezone="invalid-zone")


def test_production_assembly_registers_and_dispatches_all_integrated_factories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lifetime = create_application(
        Configuration(
            ORIGIN, database_url="postgresql://localhost/unused", value_history_timezone="UTC"
        )
    )
    resources: ApplicationResources = lifetime.http.state.resources
    registry = cast(RouteRegistry, cast(Route, lifetime.http.router.routes[-1]).app)
    installed = {(route.method, route.path) for route in registry._routes}
    assert len(installed) == len(registry._routes)
    for routes, expected in (
        (create_inventory_routes(resources.auth, resources.inventory, ORIGIN), 14),
        (create_catalog_routes(resources.auth, resources.catalog, ORIGIN), 7),
        (create_valuation_routes(resources.auth, resources.valuation, ORIGIN), 5),
    ):
        assert len(routes) == expected
        assert {(route.method, route.path) for route in routes} <= installed
    assert ("GET", "/api/account/dashboard") in installed
    assert resources.dashboard._values is resources.inventory_values
    assert resources.inventory_values.valuation is resources.valuation
    assert resources.inventory_values.timezone == resources.valuation.timezone == "UTC"
    monkeypatch.setattr(
        resources.auth,
        "validate_session",
        AsyncMock(side_effect=lambda token: ACTOR if token == TOKEN else None),
    )
    catalog = AsyncMock(return_value={"catalog": True})
    groups = AsyncMock(
        return_value={"kind": "Page", "revision": "1", "groupPage": [], "groupCount": 0}
    )
    prices = AsyncMock(return_value={"prices": True})
    dashboard = AsyncMock(return_value={"summary": True})
    monkeypatch.setattr(resources.catalog, "search_catalog_request", catalog)
    monkeypatch.setattr(resources.inventory, "page", groups)
    monkeypatch.setattr(resources.valuation, "printing_references", prices)
    monkeypatch.setattr(resources.dashboard, "get", dashboard)
    client = TestClient(lifetime.http)
    try:
        assert client.get("/api/catalog/search?q=Test").json() == {"catalog": True}
        headers = {"Authorization": "Bearer " + TOKEN}
        assert client.get("/api/mobile/v1/mtg/inventory/groups", headers=headers).json() == {
            "revision": "1",
            "groups": [],
            "count": 0,
        }
        response = client.get(
            "/api/mobile/v1/mtg/prices?printingId=11111111-1111-4111-8111-111111111111&finish=foil"
        )
        assert response.json() == {"prices": True}
        response = client.get("/api/account/dashboard", headers=headers)
        assert response.json() == {"summary": True}
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        dashboard.assert_awaited_once_with(ACTOR)
        assert client.head("/api/account/dashboard", headers=headers).content == b""
        options = client.options("/api/account/dashboard")
        assert options.status_code == 204 and options.headers["allow"] == "GET, HEAD, OPTIONS"
        assert client.post("/api/account/dashboard", headers=headers).status_code == 405
        assert client.get("/api/account/dashboard").status_code == 401
        assert (
            client.get(
                "/api/account/dashboard", headers={**headers, "Origin": "https://foreign.example"}
            ).status_code
            == 200
        )
        dashboard.side_effect = SummaryRangeError()
        failure = client.get("/api/account/dashboard", headers=headers)
        assert failure.status_code == 503
        assert failure.json() == {"status": 503, "message": SUMMARY_RANGE_MESSAGE}
        assert failure.headers["cache-control"] == "no-store"
        catalog.assert_awaited_once()
        groups.assert_awaited_once()
        prices.assert_awaited_once()
    finally:
        client.close()
        asyncio.run(lifetime.close())
