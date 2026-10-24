"""Inventory route factory with actual adapters, parsing, Core normalization and registry.

SQL integration is covered by the separately guarded Core tests, not by these receipts.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock, create_autospec, patch

import pytest
from fastapi.testclient import TestClient
from http_helpers import application, native_routes
from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.errors import InventoryQuantityChangedError, NotesConflictError
from spellbook_core.mtg.inventory import (
    Inventory,
    InventoryAcknowledgement,
    RecordedInventoryMutation,
)

from spellbook_api.http.mtg.routes_inventory import create_inventory_routes

ORIGIN = "https://spellbook.test"
BASE = "/api/v1/mtg/inventory"
ENTRY = "11111111-1111-4111-8111-111111111111"
GROUP = "22222222-2222-4222-8222-222222222222"
TOKEN = "a" * 43
ACTOR = Actor("account", "test", "", "", "")
ACK: InventoryAcknowledgement = {
    "requestId": "r",
    "inventoryId": None,
    "revision": "9",
    "changes": [],
    "removedEntryIds": [],
    "groups": [],
    "removedGroupIds": [],
    "memberships": [],
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


def test_factory_matches_openapi_inventory_operations() -> None:
    inventory = cast(Inventory, create_autospec(Inventory))
    auth = cast(SessionAuth, create_autospec(SessionAuth))
    actual = {
        (method, route.path)
        for route in native_routes(create_inventory_routes(auth, inventory, ORIGIN))
        for method in route.methods or ()
    }
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/openapi.json").read_text()
    )
    expected = {
        (method.upper(), path)
        for path, item in schema["paths"].items()
        if path.startswith(BASE)
        and path not in {BASE + "/prices", BASE + "/value", BASE + "/value-history"}
        for method in item
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert actual == expected


@pytest.mark.parametrize(
    ("method", "path", "body", "expected", "source"),
    [
        (
            "POST",
            "",
            {"items": [{"catalogCardId": ENTRY}]},
            {
                "op": "add",
                "catalogCardId": ENTRY,
                "finish": "nonfoil",
                "condition": "NM",
                "quantity": 1,
            },
            "mobile",
        ),
        (
            "POST",
            "/batch-add",
            {
                "items": [
                    {"catalogCardId": ENTRY, "quantity": 2, "notes": "", "notesRevision": "0"}
                ]
            },
            {
                "op": "add",
                "catalogCardId": ENTRY,
                "finish": "nonfoil",
                "condition": "NM",
                "quantity": 2,
                "notes": "",
                "notesRevision": "0",
            },
            "mobile",
        ),
        (
            "POST",
            "/bulk",
            {"operations": [{"op": "decrement", "target": {"entryId": ENTRY}, "quantity": 4}]},
            {"op": "patch", "entryId": ENTRY, "floor": 0, "delta": -4},
            "mobile",
        ),
        (
            "PATCH",
            "/" + ENTRY,
            {"quantity": 4},
            {"op": "patch", "entryId": ENTRY, "floor": 1, "quantity": 4},
            "mobile",
        ),
        (
            "DELETE",
            "/" + ENTRY,
            {"expectedQuantity": 4},
            {"op": "remove", "entryId": ENTRY, "expectedQuantity": 4},
            "mobile",
        ),
        (
            "POST",
            "/groups",
            {"name": "  Box 🔮  "},
            {"op": "group-create", "name": "Box 🔮"},
            "web",
        ),
        (
            "PATCH",
            "/groups/" + GROUP,
            {"name": "Renamed"},
            {"op": "group-rename", "groupId": GROUP, "name": "Renamed"},
            "web",
        ),
        ("DELETE", "/groups/" + GROUP, {}, {"op": "group-delete", "groupId": GROUP}, "web"),
        (
            "PUT",
            "/" + ENTRY + "/groups",
            {"groupIds": [GROUP, GROUP.upper()]},
            {"op": "memberships", "entryId": ENTRY, "groupIds": [GROUP]},
            "web",
        ),
        (
            "PATCH",
            "/" + ENTRY + "/position",
            {"position": 3},
            {"op": "reorder", "entryId": ENTRY, "position": 3},
            "web",
        ),
    ],
)
def test_http_mutations_reach_the_shared_normalized_receipt_path(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
    method: str,
    path: str,
    body: dict[str, object],
    expected: dict[str, object],
    source: str,
) -> None:
    auth, _, client, prepare = routes
    response = client.request(
        method, BASE + path, json={"requestId": " r ", "ignored": True, **body}
    )
    assert response.status_code == 200 and response.json() == ACK
    assert prepare.await_args is not None
    actor, intent, _ = prepare.await_args.args
    assert actor is ACTOR and intent.request_id == "r" and intent.source == source
    assert intent.operations == (expected,)
    auth.validate_session.assert_awaited_with(TOKEN)


@pytest.mark.parametrize(
    ("method", "path", "body", "message"),
    [
        ("POST", "", {"items": [None]}, "Each inventory item must be an object"),
        (
            "POST",
            "",
            {"items": [{"catalogCardId": ENTRY, "quantity": None}]},
            "quantity must be a finite number",
        ),
        ("POST", "/bulk", {"operations": "bad"}, "Supply 1 to 1000 Inventory operations"),
        (
            "POST",
            "/bulk",
            {"operations": [{"op": "bad", "target": {"entryId": ENTRY}}]},
            "Unsupported Inventory operation",
        ),
        ("PATCH", "/" + ENTRY, {"quantity": True}, "quantity must be a finite number"),
        ("PATCH", "/" + ENTRY, {"quantity": 2, "delta": 1}, "Supply quantity or delta, not both"),
        ("PATCH", "/" + ENTRY, {"notes": "draft"}, "Invalid Notes revision"),
        ("POST", "/groups", {"name": " "}, "Group name must contain 1 to 64 characters"),
        ("PUT", "/" + ENTRY + "/groups", {"groupIds": None}, "Invalid groupIds"),
        ("PATCH", "/" + ENTRY + "/position", {"position": -1}, "Invalid display position"),
    ],
)
def test_http_rejects_actual_invalid_inputs_without_writing(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
    method: str,
    path: str,
    body: dict[str, object],
    message: str,
) -> None:
    _, _, client, prepare = routes
    response = client.request(method, BASE + path, json={"requestId": "r", **body})
    assert response.status_code == 400 and response.json() == {"status": 400, "message": message}
    prepare.assert_not_awaited()


def test_page_query_numbers_repeats_and_revision_status(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
) -> None:
    _, inventory, client, _ = routes
    with patch.object(
        inventory, "page", AsyncMock(return_value={"kind": "RevisionChanged", "revision": "9"})
    ) as page:
        response = client.get(
            BASE + "?q=first&q=second&set=ABC&set=abc&set=def&page=3&offset=32"
            "&limit=200&variant=&revision=7&revision=8&ignored=x"
        )
        assert response.status_code == 409
        assert page.await_args is not None
        _, query, revision = page.await_args.args
        assert query["q"] == "second" and query["sets"] == ["abc", "def"]
        assert query["offset"] == 32 and query["limit"] == 200 and query["variant"] is None
        assert revision == "8"
        page.reset_mock()
        for query_text, _message in [
            ("page=0", "page must be a positive integer"),
            ("page=1.5", "page must be a positive integer"),
            ("page=NaN", "page must be a positive integer"),
            ("offset=ten", "offset must be a nonnegative integer"),
            ("offset=0x1_0", "offset must be a nonnegative integer"),
            ("offset=0b1_0", "offset must be a nonnegative integer"),
            ("limit=Infinity", "limit must be between 1 and 500"),
        ]:
            invalid = client.get(BASE + "?" + query_text)
            assert invalid.status_code == 400
        page.assert_not_awaited()


def test_group_directory_location_and_detail_statuses(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
) -> None:
    _, inventory, client, _ = routes
    with patch.object(
        inventory,
        "page",
        AsyncMock(
            return_value={
                "kind": "Page",
                "revision": "9",
                "groupPage": [{"id": GROUP, "name": "Box", "entryCount": 1, "quantity": 3}],
                "groupCount": 1,
            }
        ),
    ) as page:
        response = client.get(BASE + "/groups?offset=1&limit=10")
        assert response.json() == {
            "revision": "9",
            "groups": [{"id": GROUP, "name": "Box", "entryCount": 1, "quantity": 3}],
            "count": 1,
        }
        page.assert_awaited_once_with(ACTOR, {"view": "groups", "offset": 1, "limit": 10})
    with patch.object(
        inventory,
        "locate",
        AsyncMock(return_value={"kind": "Location", "revision": "9", "index": None}),
    ) as locate:
        assert (
            client.get(BASE + "/" + ENTRY + "/location").json()["message"]
            == "revision is required"
        )
        response = client.get(BASE + "/" + ENTRY + "/location?revision=9")
        assert response.status_code == 200 and response.json()["index"] is None
        locate.return_value = {"kind": "RevisionChanged", "revision": "10"}
        assert client.get(BASE + "/" + ENTRY + "/location?revision=9").status_code == 409
    with patch.object(inventory, "get_entry", AsyncMock(return_value=None)):
        response = client.get(BASE + "/" + ENTRY)
        assert (
            response.status_code == 404
            and response.json()["message"] == "Inventory entry not found"
        )


@pytest.mark.parametrize(
    "cause",
    [
        InventoryQuantityChangedError(None),
        NotesConflictError({"entryId": ENTRY, "notes": "latest", "notesRevision": "2"}),
    ],
)
def test_conflicts_preserve_latest_null_and_notes_fields(
    routes: tuple[Any, Inventory, TestClient, AsyncMock], cause: Exception
) -> None:
    _, inventory, client, _ = routes
    with patch.object(inventory, "patch_entry", AsyncMock(side_effect=cause)):
        response = client.patch(BASE + "/" + ENTRY, json={"requestId": "r", "quantity": 2})
    assert response.status_code == 409
    if isinstance(cause, InventoryQuantityChangedError):
        assert "latestQuantity" in response.json() and response.json()["latestQuantity"] is None
    else:
        assert response.json()["notes"] == "latest" and response.json()["notesRevision"] == "2"


def test_cookie_origin_explicit_bearer_and_malformed_path_precedence(
    routes: tuple[Any, Inventory, TestClient, AsyncMock],
) -> None:
    auth, _, client, prepare = routes
    client.headers.pop("Authorization")
    client.headers["Cookie"] = "spellbook_session=" + TOKEN
    assert client.post(BASE + "/groups", json={"requestId": "r", "name": "Box"}).status_code == 403
    assert (
        client.post(
            BASE + "/groups", headers={"Origin": ORIGIN}, json={"requestId": "r", "name": "Box"}
        ).status_code
        == 200
    )
    auth.validate_session.return_value = None
    assert (
        client.post(
            BASE + "/groups",
            headers={"Authorization": "invalid", "Origin": ORIGIN},
            json={"requestId": "r", "name": "Box"},
        ).status_code
        == 401
    )
    auth.validate_session.reset_mock()
    response = client.patch(BASE + "/groups/%FF", json={"requestId": "r", "name": "Box"})
    assert response.status_code == 401
    assert auth.validate_session.await_count >= 1
    assert prepare.await_count == 1
