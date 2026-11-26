"""HTTP adapter tests for public Reference deck routes."""

from unittest.mock import create_autospec

from fastapi.testclient import TestClient
from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.mtg.reference_decks import ReferenceDecks
from test_auth_account import ORIGIN, Dependencies

from spellbook_api.http.application import create_http_application
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import Configuration

DECK_ID = "11111111-1111-4111-8111-111111111111"


def _build_client(reference_decks: ReferenceDecks) -> tuple[TestClient, Dependencies]:
    d = Dependencies()
    app = create_http_application(
        Configuration(ORIGIN),
        auth=d.auth,
        catalog=create_autospec(Catalog, instance=True),
        inventory=create_autospec(Inventory, instance=True),
        saved_routes=create_autospec(SavedStateRoutes, instance=True),
        reference_decks=reference_decks,
    )
    return TestClient(app), d


def test_list_reference_decks_is_public_and_forwards_filters() -> None:
    reference_decks = create_autospec(ReferenceDecks, instance=True)
    reference_decks.list_reference_decks.return_value = {
        "decks": [],
        "total": 0,
        "limit": 25,
        "offset": 5,
        "availableFormats": ["standard", "modern"],
        "sources": [],
    }
    client, d = _build_client(reference_decks)
    with client:
        response = client.get(
            "/api/v1/mtg/reference-decks?format=modern&source=mtggoldfish&q=energy&limit=25&offset=5"
        )
        assert response.status_code == 200
        assert response.json()["total"] == 0
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        reference_decks.list_reference_decks.assert_awaited_once_with(
            format="modern",
            source="mtggoldfish",
            query="energy",
            limit=25,
            offset=5,
        )
        d.auth.validate_session.assert_not_awaited()


def test_list_reference_decks_rejects_bad_query_params() -> None:
    reference_decks = create_autospec(ReferenceDecks, instance=True)
    reference_decks.list_reference_decks.side_effect = ValidationError(
        "Unsupported reference deck format"
    )
    client, _ = _build_client(reference_decks)
    with client:
        assert client.get("/api/v1/mtg/reference-decks?limit=0").status_code == 400
        assert client.get("/api/v1/mtg/reference-decks?limit=101").status_code == 400
        assert client.get("/api/v1/mtg/reference-decks?format=invalid").status_code == 400


def test_get_reference_deck_detail_and_404() -> None:
    reference_decks = create_autospec(ReferenceDecks, instance=True)
    reference_decks.get_reference_deck.side_effect = [
        {"id": DECK_ID, "name": "Burn", "cards": []},
        None,
    ]
    client, d = _build_client(reference_decks)
    with client:
        found = client.get(f"/api/v1/mtg/reference-decks/{DECK_ID}")
        assert found.status_code == 200
        assert found.json()["id"] == DECK_ID
        assert found.headers["cache-control"] == "no-store"
        assert found.headers["x-robots-tag"] == "noindex, nofollow"

        missing = client.get(f"/api/v1/mtg/reference-decks/{DECK_ID}")
        assert missing.status_code == 404
        assert missing.json()["message"] == "Reference deck not found"

        bad_id = client.get("/api/v1/mtg/reference-decks/not-a-uuid")
        assert bad_id.status_code == 400
        d.auth.validate_session.assert_not_awaited()
