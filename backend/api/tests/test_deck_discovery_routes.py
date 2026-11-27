"""HTTP adapter tests for authenticated SuperBrew deck discovery routes."""

from unittest.mock import create_autospec

from fastapi.testclient import TestClient
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.errors import DeckNotFoundError
from spellbook_core.mtg.inventory import Inventory
from test_auth_account import ORIGIN, Dependencies

from spellbook_api.http.application import create_http_application
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import Configuration

REF_DECK_ID = "11111111-1111-4111-8111-111111111111"
NEW_DECK_ID = "22222222-2222-4222-8222-222222222222"
TOKEN = "a" * 43
ACTOR = Actor("account", "test", "", "", "")


def _build_client(decks: Decks, *, authenticated: bool = True) -> tuple[TestClient, Dependencies]:
    d = Dependencies()
    if authenticated:
        d.auth.validate_session.return_value = ACTOR
        d.auth.require_actor.return_value = ACTOR
    app = create_http_application(
        Configuration(ORIGIN),
        auth=d.auth,
        catalog=create_autospec(Catalog, instance=True),
        inventory=create_autospec(Inventory, instance=True),
        saved_routes=create_autospec(SavedStateRoutes, instance=True),
        decks=decks,
    )
    return TestClient(app), d


def test_discovery_requires_authentication() -> None:
    decks = create_autospec(Decks, instance=True)
    client, _ = _build_client(decks, authenticated=False)
    with client:
        response = client.get("/api/v1/mtg/decks/discovery")
        assert response.status_code == 401
        decks.discover_reference_decks.assert_not_awaited()


def test_discovery_forwards_filters_and_sets_private_cache_policy() -> None:
    decks = create_autospec(Decks, instance=True)
    decks.discover_reference_decks.return_value = {
        "decks": [],
        "total": 0,
        "limit": 20,
        "offset": 10,
        "inventoryMode": "free",
        "sort": "ownership:desc",
        "assembledDeckCount": 2,
        "valuationAvailable": True,
        "evaluatedAt": "2026-11-27T10:00:00.000Z",
        "availableFormats": ["standard", "modern"],
        "sources": [],
    }
    client, _ = _build_client(decks)
    with client:
        response = client.get(
            "/api/v1/mtg/decks/discovery"
            "?format=modern&source=mtggoldfish&q=energy"
            "&maxMissingCost=50.5&minOwnership=75"
            "&inventoryMode=free&sort=ownership:desc&limit=20&offset=10",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        assert response.json()["assembledDeckCount"] == 2
        decks.discover_reference_decks.assert_awaited_once()
        _, kwargs = decks.discover_reference_decks.call_args
        assert kwargs == {
            "format": "modern",
            "source": "mtggoldfish",
            "query": "energy",
            "max_missing_cost": 50.5,
            "min_ownership": 75.0,
            "inventory_mode": "free",
            "sort": "ownership:desc",
            "limit": 20,
            "offset": 10,
        }


def test_discovery_rejects_invalid_numeric_params() -> None:
    decks = create_autospec(Decks, instance=True)
    decks.discover_reference_decks.side_effect = ValidationError("Invalid filter")
    client, _ = _build_client(decks)
    with client:
        headers = {"Authorization": f"Bearer {TOKEN}"}
        assert (
            client.get(
                "/api/v1/mtg/decks/discovery?maxMissingCost=abc", headers=headers
            ).status_code
            == 400
        )
        assert (
            client.get("/api/v1/mtg/decks/discovery?minOwnership=xyz", headers=headers).status_code
            == 400
        )
        assert (
            client.get("/api/v1/mtg/decks/discovery?limit=0", headers=headers).status_code == 400
        )
        assert (
            client.get("/api/v1/mtg/decks/discovery?format=bad", headers=headers).status_code
            == 400
        )


def test_copy_reference_deck_creates_standalone_deck_and_handles_404() -> None:
    decks = create_autospec(Decks, instance=True)
    decks.copy_reference_deck.side_effect = [
        {
            "deck": {
                "id": NEW_DECK_ID,
                "game": "mtg",
                "name": "Boros Energy",
                "description": "Copied from mtggoldfish",
                "format": "Modern",
                "assembled": False,
                "descriptionRevision": "1",
                "createdAt": "2026-11-27T10:00:00.000Z",
                "updatedAt": "2026-11-27T10:00:00.000Z",
            },
            "copiedCards": 75,
            "skippedCards": 0,
        },
        DeckNotFoundError(),
    ]
    client, _ = _build_client(decks)
    with client:
        headers = {"Authorization": f"Bearer {TOKEN}", "Origin": ORIGIN}
        unauth_client, _ = _build_client(decks, authenticated=False)
        with unauth_client:
            assert (
                unauth_client.post(
                    f"/api/v1/mtg/decks/discovery/{REF_DECK_ID}/copy",
                    headers={"Origin": ORIGIN},
                ).status_code
                == 401
            )
        assert (
            client.post("/api/v1/mtg/decks/discovery/not-a-uuid/copy", headers=headers).status_code
            == 400
        )

        created = client.post(f"/api/v1/mtg/decks/discovery/{REF_DECK_ID}/copy", headers=headers)
        assert created.status_code == 200
        assert created.json()["deck"]["id"] == NEW_DECK_ID
        assert created.json()["copiedCards"] == 75

        missing = client.post(f"/api/v1/mtg/decks/discovery/{REF_DECK_ID}/copy", headers=headers)
        assert missing.status_code == 404
