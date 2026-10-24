"""Closed browser command authority, original payloads and public error mapping."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import create_autospec

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import RequestConflictError
from spellbook_core.models import Actor
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.inventory import Inventory
from starlette.routing import Route

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.mtg.routes_commands import FIELDS, create_command_routes
from spellbook_api.http.router import RouteRegistry

ORIGIN = "https://spellbook.test"
TOKEN = "a" * 43
ACTOR = Actor("account", "test", "", "", "")
PATH = "/api/v1/mtg/commands"


@pytest.fixture
def target() -> Iterator[tuple[TestClient, Any, Any, Any]]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.side_effect = lambda token: ACTOR if token == TOKEN else None
    inventory = create_autospec(Inventory, instance=True)
    decks = create_autospec(Decks, instance=True)
    app = FastAPI()
    app.router.routes.append(
        Route(
            "/{path:path}",
            RouteRegistry(
                create_command_routes(auth, inventory, decks, ORIGIN),
                ORIGIN,
                auth,
                RequestAdmission(),
            ),
        )
    )
    with TestClient(app) as client:
        client.headers.update({"origin": ORIGIN, "cookie": "spellbook_session=" + TOKEN})
        yield client, auth, inventory, decks


def input_for(operation: str) -> dict[str, object]:
    value: dict[str, object] = {
        key: 2 if kind == "number" else key
        for key, kind in FIELDS[operation].items()
        if not kind.endswith("?")
    }
    if operation == "decks.createRecord":
        value["game"] = "mtg"
    return value


@pytest.mark.parametrize("mode", ["cookie", "bearer"])
@pytest.mark.parametrize(
    "operation,method",
    [
        ("inventory.add", "add"),
        ("inventory.patchEntry", "patch_entry"),
        ("inventory.remove", "remove"),
        ("decks.createRecord", "create_deck_record"),
        ("decks.addCatalogCard", "add_catalog_card_to_deck"),
        ("decks.changePrinting", "change_deck_printing"),
        ("decks.updateCard", "update_deck_card"),
        ("decks.removeCard", "remove_deck_card"),
        ("decks.importInto", "import_into_deck"),
    ],
)
def test_each_command_preserves_original_input_and_receipt(
    target: tuple[TestClient, Any, Any, Any], operation: str, method: str, mode: str
) -> None:
    client, _, inventory, decks = target
    if mode == "bearer":
        client.headers.pop("cookie")
        client.headers.pop("origin")
        client.headers["authorization"] = "Bearer " + TOKEN
    handler = getattr(inventory if operation.startswith("inventory.") else decks, method)
    receipt = {"requestId": "original", "revision": "7", "changes": []}
    handler.return_value = receipt
    value = input_for(operation)
    response = client.post(PATH, json={"operation": operation, "input": value})
    assert response.status_code == 200
    assert response.json() == receipt
    assert response.headers["cache-control"] == "no-store"
    if operation == "decks.updateCard":
        handler.assert_awaited_once_with(
            ACTOR, "entryId", None, None, "requestId", None, "web", None
        )
    elif operation == "decks.removeCard":
        handler.assert_awaited_once_with(ACTOR, "entryId", "requestId", "web")
    else:
        expected = {**value, "source": "web"} if operation.startswith("inventory.") else value
        handler.assert_awaited_once_with(ACTOR, expected)


@pytest.mark.parametrize("operation", FIELDS)
@pytest.mark.parametrize("field", ["source", "actor", "accountId", "unknown"])
def test_commands_reject_caller_authority_and_unknown_fields(
    target: tuple[TestClient, Any, Any, Any], operation: str, field: str
) -> None:
    client, _, _, _ = target
    response = client.post(
        PATH, json={"operation": operation, "input": {**input_for(operation), field: "forged"}}
    )
    assert response.status_code == 400
    assert response.json()["message"] == "Unsupported web command input fields"


def test_cookie_identity_origin_and_failure_order(
    target: tuple[TestClient, Any, Any, Any],
) -> None:
    client, _, inventory, _ = target
    command = {"operation": "inventory.remove", "input": input_for("inventory.remove")}
    # Direct API calls keep explicit Authorization precedence; SSR selects its cookie upstream.
    inventory.remove.return_value = {}
    assert (
        client.post(PATH, json=command, headers={"authorization": "Bearer invalid"}).status_code
        == 401
    )
    client.headers.pop("cookie")
    assert (
        client.post(
            PATH,
            content="invalid",
            headers={"authorization": "Bearer " + TOKEN, "content-type": "application/json"},
        ).status_code
        == 400
    )
    client.headers["cookie"] = "spellbook_session=" + TOKEN
    assert (
        client.post(
            PATH,
            content="invalid",
            headers={"origin": "https://foreign.test", "content-type": "application/json"},
        ).status_code
        == 403
    )
    inventory.remove.assert_not_awaited()


@pytest.mark.parametrize("bad", [None, True, "2", [], {}])
def test_numeric_types_are_not_coerced(
    target: tuple[TestClient, Any, Any, Any], bad: object
) -> None:
    client, _, inventory, _ = target
    value = {**input_for("inventory.remove"), "expectedQuantity": bad}
    response = client.post(PATH, json={"operation": "inventory.remove", "input": value})
    assert response.status_code == 400
    inventory.remove.assert_not_awaited()


def test_conflict_mapping_and_cookie_cleanup(target: tuple[TestClient, Any, Any, Any]) -> None:
    client, _, _, decks = target
    decks.remove_deck_card.side_effect = RequestConflictError()
    response = client.post(
        PATH, json={"operation": "decks.removeCard", "input": input_for("decks.removeCard")}
    )
    assert response.status_code == 409
    assert response.json()["kind"] == "RequestConflict"
    client.headers["cookie"] = "spellbook_session=stale"
    response = client.post(PATH, json={})
    assert response.status_code == 401
    assert response.headers.get_list("set-cookie") == [
        "spellbook_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"
    ]
