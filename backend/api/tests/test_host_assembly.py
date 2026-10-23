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
from spellbook_api.http.routes_scan import create_scan_routes
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
        (create_inventory_routes(resources.auth, resources.inventory, ORIGIN), 16),
        (create_catalog_routes(resources.auth, resources.catalog, ORIGIN), 7),
        (create_valuation_routes(resources.auth, resources.valuation, ORIGIN), 5),
        (create_scan_routes(resources.auth, resources.scan, ORIGIN), 7),
    ):
        assert len(routes) == expected
        assert {(route.method, route.path) for route in routes} <= installed
    assert ("GET", "/api/account/dashboard") in installed
    assert resources.scan._inventory is resources.inventory
    assert resources.scan._storage is resources.scan_storage
    assert resources.scan._worker is resources.scan_worker
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
    scans = AsyncMock(return_value=[])
    monkeypatch.setattr(resources.catalog, "search_catalog_request", catalog)
    monkeypatch.setattr(resources.inventory, "page", groups)
    monkeypatch.setattr(resources.valuation, "printing_references", prices)
    monkeypatch.setattr(resources.dashboard, "get", dashboard)
    monkeypatch.setattr(resources.scan, "list_sessions", scans)
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
        response = client.get("/api/mobile/v1/mtg/scan/sessions", headers=headers)
        assert response.status_code == 200 and response.json() == {"sessions": []}
        assert response.headers["cache-control"] == "no-store"
        scans.assert_awaited_once_with(ACTOR)
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


def test_scan_environment_is_typed_and_discovery_constructs_no_scan_adapters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from spellbook_api import application

    config = Configuration.from_environment(
        {
            "APP_ORIGIN": ORIGIN,
            "SCAN_STORAGE_DRIVER": "s3",
            "SCAN_LOCAL_STORAGE_DIR": "/retained/scans",
            "SCAN_WORKER_URL": "http://retained-worker:8087",
            "S3_ENDPOINT": "http://objects.test",
            "S3_REGION": "eu-central-1",
            "S3_BUCKET": "retained",
            "S3_ACCESS_KEY_ID": "synthetic-access",
            "S3_SECRET_ACCESS_KEY": "synthetic-secret",
            "S3_FORCE_PATH_STYLE": "false",
        }
    )
    assert config.scan_worker_url == "http://retained-worker:8087"
    assert config.scan_storage.storage_driver == "s3"
    assert config.scan_storage.local_storage_dir == "/retained/scans"
    assert config.scan_storage.s3_endpoint == "http://objects.test"
    assert config.scan_storage.s3_region == "eu-central-1"
    assert config.scan_storage.s3_bucket == "retained"
    assert config.scan_storage.s3_force_path_style == "false"
    assert config.scan_storage.s3_access_key_id == "synthetic-access"
    assert config.scan_storage.s3_secret_access_key == "synthetic-secret"
    assert "synthetic-secret" not in repr(config) and "synthetic-access" not in repr(config)
    defaults = Configuration(ORIGIN)
    assert defaults.scan_worker_url == "http://scan-worker:8080"
    assert defaults.scan_storage.local_storage_dir == "/app/storage/scans"

    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("Discovery must not construct Scan IO adapters")

    monkeypatch.setattr(application, "create_scan_storage", forbidden)
    monkeypatch.setattr(application, "HttpScanWorker", forbidden)
    lifetime = create_application(config)
    with TestClient(lifetime.http) as client:
        assert client.get("/openapi.json").status_code == 200
        assert client.get("/api/mobile/v1/mtg/scan/sessions").status_code == 404
    asyncio.run(lifetime.close())
