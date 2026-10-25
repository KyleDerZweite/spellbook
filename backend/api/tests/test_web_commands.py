"""Closed browser command authority, original payloads and public error mapping."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient
from http_helpers import application
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import RequestConflictError
from spellbook_core.models import Actor
from spellbook_core.mtg.categories import CategoryMergeConflict, CategoryUnavailable
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.errors import DeckNotFoundError
from spellbook_core.mtg.inventory import Inventory

from spellbook_api.http.mtg.routes_commands import create_command_routes

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
    app = application(create_command_routes(auth, inventory, decks, ORIGIN), ORIGIN, auth)
    with TestClient(app, raise_server_exceptions=False) as client:
        client.headers.update({"origin": ORIGIN, "cookie": "spellbook_session=" + TOKEN})
        yield client, auth, inventory, decks


INPUTS: dict[str, dict[str, object]] = {
    "inventory.add": dict(
        requestId="requestId",
        catalogCardId="catalogCardId",
        finish="finish",
        condition="condition",
        quantity=2,
    ),
    "inventory.patchEntry": dict(requestId="requestId", entryId="entryId"),
    "inventory.remove": dict(requestId="requestId", entryId="entryId", expectedQuantity=2),
    "decks.createRecord": dict(
        game="mtg", name="name", description="description", format="format"
    ),
    "decks.addCatalogCard": dict(
        deckId="deckId",
        catalogCardId="catalogCardId",
        quantity=2,
        role="role",
        requestId="requestId",
    ),
    "decks.changePrinting": dict(
        entryId="entryId",
        catalogCardId="catalogCardId",
        quantity=2,
        role="role",
        requestId="requestId",
    ),
    "decks.updateCard": dict(entryId="entryId", requestId="requestId"),
    "decks.removeCard": dict(entryId="entryId", requestId="requestId"),
    "decks.importInto": dict(deckId="deckId", text="text", requestId="requestId"),
}


def input_for(operation: str) -> dict[str, object]:
    return dict(INPUTS[operation])


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


@pytest.mark.parametrize("operation", INPUTS)
@pytest.mark.parametrize("field", ["source", "actor", "accountId", "unknown"])
def test_commands_reject_caller_authority_and_unknown_fields(
    target: tuple[TestClient, Any, Any, Any], operation: str, field: str
) -> None:
    client, _, _, _ = target
    response = client.post(
        PATH, json={"operation": operation, "input": {**input_for(operation), field: "forged"}}
    )
    assert response.status_code == 400
    assert response.json() == {"status": 400, "message": "Invalid web command"}


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


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"operation": "unknown", "input": {}},
        {"operation": 1, "input": {}},
        {"operation": "inventory.remove"},
        {"operation": "inventory.remove", "input": []},
        {"operation": "inventory.remove", "input": None},
        {"operation": "inventory.remove", "input": INPUTS["inventory.remove"], "actor": "forged"},
        {
            "operation": "decks.createRecord",
            "input": {**INPUTS["decks.createRecord"], "game": "other"},
        },
    ],
)
def test_invalid_envelopes_use_safe_error_response(
    target: tuple[TestClient, Any, Any, Any], body: object
) -> None:
    client, _, inventory, decks = target
    response = client.post(PATH, json=body)
    assert response.status_code == 400
    assert response.json() == {"status": 400, "message": "Invalid web command"}
    assert not inventory.mock_calls and not decks.mock_calls


@pytest.mark.parametrize(
    "operation,field",
    [(operation, field) for operation, fields in INPUTS.items() for field in fields],
)
@pytest.mark.parametrize("mode", ["missing", "null", "wrong-type"])
def test_required_fields_are_strict_and_never_defaulted(
    target: tuple[TestClient, Any, Any, Any], operation: str, field: str, mode: str
) -> None:
    client, _, inventory, decks = target
    value = input_for(operation)
    if mode == "missing":
        del value[field]
    else:
        value[field] = None if mode == "null" else False
    response = client.post(PATH, json={"operation": operation, "input": value})
    assert response.status_code == 400
    assert response.json() == {"status": 400, "message": "Invalid web command"}
    assert not inventory.mock_calls and not decks.mock_calls


OPTIONAL_INPUTS: list[tuple[str, str, dict[str, object]]] = [
    ("inventory.add", "add", dict(notes="", notesRevision="7")),
    (
        "inventory.patchEntry",
        "patch_entry",
        dict(quantity=0, delta=-2.5, notes="", notesRevision="8"),
    ),
    ("decks.changePrinting", "change_deck_printing", dict(categoryPreview="preview")),
    (
        "decks.updateCard",
        "update_deck_card",
        dict(quantity=0, delta=-2.5, role="", categoryPreview=""),
    ),
]


@pytest.mark.parametrize("operation,method,optional", OPTIONAL_INPUTS)
def test_optional_values_reach_core_without_normalization(
    target: tuple[TestClient, Any, Any, Any],
    operation: str,
    method: str,
    optional: dict[str, object],
) -> None:
    client, _, inventory, decks = target
    handler = getattr(inventory if operation.startswith("inventory.") else decks, method)
    handler.return_value = {"requestId": "receipt"}
    value = {**input_for(operation), **optional}
    response = client.post(PATH, json={"operation": operation, "input": value})
    assert response.status_code == 200
    if operation == "decks.updateCard":
        handler.assert_awaited_once_with(ACTOR, "entryId", 0, "", "requestId", -2.5, "web", "")
    else:
        expected = {**value, "source": "web"} if operation.startswith("inventory.") else value
        handler.assert_awaited_once_with(ACTOR, expected)


@pytest.mark.parametrize(
    "operation,field",
    [(operation, field) for operation, _, fields in OPTIONAL_INPUTS for field in fields],
)
def test_optional_keys_accept_absence_but_reject_null(
    target: tuple[TestClient, Any, Any, Any], operation: str, field: str
) -> None:
    client, _, inventory, decks = target
    value = {**input_for(operation), field: None}
    response = client.post(PATH, json={"operation": operation, "input": value})
    assert response.status_code == 400
    assert not inventory.mock_calls and not decks.mock_calls


@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_nonfinite_command_numbers_are_rejected(
    target: tuple[TestClient, Any, Any, Any], number: str
) -> None:
    client, _, inventory, _ = target
    response = client.post(
        PATH,
        content='{"operation":"inventory.remove","input":'
        '{"requestId":"r","entryId":"e","expectedQuantity":' + number + "}}",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400
    inventory.remove.assert_not_awaited()


@pytest.mark.parametrize(
    "cause,status,body",
    [
        (DeckNotFoundError(), 404, {"kind": "NotFound"}),
        (
            CategoryMergeConflict({"required": True}),
            409,
            {"kind": "CategoryMergeConflict", "preview": {"required": True}},
        ),
        (CategoryUnavailable(), 503, {"kind": "CategoryUnavailable"}),
        (RuntimeError("private database details"), 500, {}),
    ],
)
def test_command_domain_errors_use_central_public_mapping(
    target: tuple[TestClient, Any, Any, Any],
    cause: Exception,
    status: int,
    body: dict[str, object],
) -> None:
    client, _, _, decks = target
    decks.remove_deck_card.side_effect = cause
    response = client.post(
        PATH, json={"operation": "decks.removeCard", "input": input_for("decks.removeCard")}
    )
    assert response.status_code == status
    assert response.json() == {
        "status": status,
        "message": "Internal Server Error" if status == 500 else str(cause),
        **body,
    }
