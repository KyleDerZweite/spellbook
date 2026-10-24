"""Import HTTP adapters through the real router and Core normalization."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, create_autospec, patch

import pytest
from fastapi.testclient import TestClient
from http_helpers import application
from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryAcknowledgement,
    RecordedInventoryMutation,
)
from spellbook_core.mtg.inventory_import import ImportPreview

from spellbook_api.http.mtg.routes_inventory import create_inventory_routes

BASE = "/api/v1/mtg/inventory"
ORIGIN = "https://spellbook.test"
TOKEN = "a" * 43
ACTOR = Actor("import-account", "test", "", "", "")
PREVIEW: ImportPreview = {
    "parsed": [],
    "resolved": [],
    "unresolved": [],
    "ambiguous": [],
    "warnings": [],
}
ACK: InventoryAcknowledgement = {
    "requestId": "r",
    "inventoryId": None,
    "revision": "4",
    "changes": [],
    "removedEntryIds": [],
    "groups": [],
    "removedGroupIds": [],
    "memberships": [],
    "import": {"resolvedCount": 1, "unresolvedCount": 0, "ambiguousCount": 0},
}


@pytest.fixture
def routes() -> Iterator[tuple[Any, Inventory, TestClient, AsyncMock]]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.return_value = ACTOR
    auth.require_actor.return_value = ACTOR
    inventory = Inventory(create_autospec(ConnectionPool), create_autospec(Catalog), auth)
    http = application(create_inventory_routes(auth, inventory, ORIGIN), ORIGIN, auth)
    with (
        patch.object(
            inventory, "prepare", AsyncMock(return_value=RecordedInventoryMutation(ACK))
        ) as prepare,
        TestClient(http, headers={"Authorization": "Bearer " + TOKEN}) as client,
    ):
        yield auth, inventory, client, prepare


@pytest.mark.parametrize(
    "body", [{}, {"text": ""}, {"text": "1 Opt", "defaultFinish": None, "defaultCondition": None}]
)
def test_preview_preserves_current_import_defaults(
    routes: tuple[Any, Inventory, TestClient, AsyncMock], body: dict[str, object]
) -> None:
    auth, inventory, client, prepare = routes
    with patch.object(inventory, "preview_import", AsyncMock(return_value=PREVIEW)) as preview:
        response = client.post(BASE + "/import/preview", json=body)
    assert response.status_code == 200 and response.json() == PREVIEW
    preview.assert_awaited_once_with(ACTOR, body.get("text", ""))
    auth.validate_session.assert_awaited_once_with(TOKEN)
    prepare.assert_not_awaited()


def test_commit_uses_core_normalized_import_identity(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
) -> None:
    auth, _, client, prepare = routes
    response = client.post(
        BASE + "/import/commit",
        json={"requestId": " r ", "text": " 1 Opt\r\n2 Island\r ", "ignored": True},
    )
    assert response.status_code == 200 and response.json() == ACK
    assert prepare.await_args is not None
    actor, intent, _ = prepare.await_args.args
    assert actor is ACTOR and intent.request_id == "r" and intent.source == "import"
    assert intent.import_input == {
        "text": "1 Opt\n2 Island",
        "finish": "nonfoil",
        "condition": "NM",
    }
    auth.validate_session.assert_awaited_once_with(TOKEN)


@pytest.mark.parametrize(
    ("endpoint", "body", "message"),
    [
        ("preview", {"text": None}, "text must be a string"),
        ("preview", {"defaultFinish": "etched"}, "Invalid finish: etched"),
        ("preview", {"defaultFinish": 1}, "value must be a string"),
        ("preview", {"defaultCondition": "mint"}, "Invalid condition: mint"),
        ("commit", {}, "requestId is required"),
        ("commit", {"requestId": "r", "text": None}, "text must be a string"),
        ("commit", {"requestId": "r", "defaultFinish": None}, "defaultFinish must be a string"),
        (
            "commit",
            {"requestId": "r", "defaultCondition": None},
            "defaultCondition must be a string",
        ),
        ("commit", {"requestId": "r", "source": None}, "source must be a string"),
        ("commit", {"requestId": "r", "source": "other"}, "Invalid source: other"),
        (
            "commit",
            {"requestId": "r", "text": "🔮" * 100001},
            "text must be a string of at most 200000 characters",
        ),
    ],
)
def test_import_validation_preserves_route_errors(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
    endpoint: str,
    body: dict[str, object],
    message: str,
) -> None:
    _, _, client, prepare = routes
    response = client.post(BASE + "/import/" + endpoint, json=body)
    assert response.status_code == 400 and response.json() == {"status": 400, "message": message}
    prepare.assert_not_awaited()


@pytest.mark.parametrize("endpoint", ["preview", "commit"])
def test_import_auth_precedes_body_parsing_and_cookie_origin_is_required(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
    endpoint: str,
) -> None:
    auth, inventory, client, prepare = routes
    with patch.object(inventory, "preview_import", AsyncMock(return_value=PREVIEW)):
        client.headers.pop("Authorization")
        auth.validate_session.return_value = None
        assert (
            client.post(
                BASE + "/import/" + endpoint, headers={"Origin": ORIGIN}, content="invalid"
            ).status_code
            == 401
        )
        auth.validate_session.return_value = ACTOR
        client.headers["Cookie"] = "spellbook_session=" + TOKEN
        assert client.post(BASE + "/import/" + endpoint, content="invalid").status_code == 403
        response = client.post(
            BASE + "/import/" + endpoint,
            headers={"Origin": ORIGIN},
            json={"requestId": "r", "text": "1 Opt"},
        )
        assert response.status_code == 200
        auth.validate_session.reset_mock()
        auth.validate_session.side_effect = lambda token: ACTOR if token == TOKEN else None
        assert (
            client.post(
                BASE + "/import/" + endpoint,
                headers={"Authorization": "invalid", "Origin": ORIGIN},
                content="invalid",
            ).status_code
            == 401
        )
        # Registry cleanup checks the cookie; route authentication still rejects the bearer.
        assert [args.args[0] for args in auth.validate_session.await_args_list] == [TOKEN, None]
        assert prepare.await_count == (1 if endpoint == "commit" else 0)
