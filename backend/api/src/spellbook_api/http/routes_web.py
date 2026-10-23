"""Closed browser commands delegate unchanged retry payloads to Core."""

from typing import Any, cast

from spellbook_core.auth import SessionAuth
from spellbook_core.decks import Decks
from spellbook_core.inventory import Inventory
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import read_json_object, read_number, read_string
from spellbook_api.http.router import HttpRoute
from spellbook_api.http.routes_decks import deck_http_error

FIELDS: dict[str, dict[str, str]] = {
    "inventory.add": {
        "requestId": "string",
        "catalogCardId": "string",
        "finish": "string",
        "condition": "string",
        "quantity": "number",
        "notes": "string?",
        "notesRevision": "string?",
    },
    "inventory.patchEntry": {
        "requestId": "string",
        "entryId": "string",
        "quantity": "number?",
        "delta": "number?",
        "notes": "string?",
        "notesRevision": "string?",
    },
    "inventory.remove": {"requestId": "string", "entryId": "string", "expectedQuantity": "number"},
    "decks.createRecord": {
        "game": "string",
        "name": "string",
        "description": "string",
        "format": "string",
    },
    "decks.addCatalogCard": {
        "deckId": "string",
        "catalogCardId": "string",
        "quantity": "number",
        "role": "string",
        "requestId": "string",
    },
    "decks.changePrinting": {
        "entryId": "string",
        "catalogCardId": "string",
        "quantity": "number",
        "role": "string",
        "requestId": "string",
        "categoryPreview": "string?",
    },
    "decks.updateCard": {
        "entryId": "string",
        "quantity": "number?",
        "role": "string?",
        "requestId": "string",
        "delta": "number?",
        "categoryPreview": "string?",
    },
    "decks.removeCard": {"entryId": "string", "requestId": "string"},
    "decks.importInto": {"deckId": "string", "text": "string", "requestId": "string"},
}


def read_command(body: dict[str, object]) -> tuple[str, dict[str, Any]]:
    if any(key not in {"operation", "input"} for key in body):
        raise HttpError(400, "Unsupported web command fields")
    operation, value = body.get("operation"), body.get("input")
    if not isinstance(operation, str) or operation not in FIELDS:
        raise HttpError(400, "Unsupported web command operation")
    if not isinstance(value, dict):
        raise HttpError(400, "Web command input must be an object")
    schema = FIELDS[operation]
    if any(key not in schema for key in value):
        raise HttpError(400, "Unsupported web command input fields")
    for key, kind in schema.items():
        if key not in value and kind.endswith("?"):
            continue
        if kind.startswith("number"):
            read_number(value.get(key), key)
        else:
            read_string(value.get(key), key)
    if operation == "decks.createRecord" and value["game"] != "mtg":
        raise HttpError(400, "Only mtg is supported")
    return operation, cast(dict[str, Any], value)


def create_web_routes(
    auth: SessionAuth, inventory: Inventory, decks: Decks, origin: str
) -> list[HttpRoute]:
    async def command(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        operation, value = read_command(await read_json_object(request, 1024 * 1024))
        result: object
        try:
            match operation:
                case "inventory.add":
                    result = await inventory.add(actor, {**value, "source": "web"})
                case "inventory.patchEntry":
                    result = await inventory.patch_entry(actor, {**value, "source": "web"})
                case "inventory.remove":
                    result = await inventory.remove(actor, {**value, "source": "web"})
                case "decks.createRecord":
                    result = await decks.create_deck_record(actor, value)
                case "decks.addCatalogCard":
                    result = await decks.add_catalog_card_to_deck(actor, value)
                case "decks.changePrinting":
                    result = await decks.change_deck_printing(actor, value)
                case "decks.updateCard":
                    result = await decks.update_deck_card(
                        actor,
                        value["entryId"],
                        value.get("quantity"),
                        value.get("role"),
                        value["requestId"],
                        value.get("delta"),
                        "web",
                        value.get("categoryPreview"),
                    )
                case "decks.removeCard":
                    result = await decks.remove_deck_card(
                        actor, value["entryId"], value["requestId"], "web"
                    )
                case "decks.importInto":
                    result = await decks.import_into_deck(actor, value)
                case _:
                    raise AssertionError("Validated command has no handler")
            return json_response(result)
        except Exception as cause:
            raise deck_http_error(cause) from None

    return [HttpRoute("POST", "/api/web/v1/commands", command)]
