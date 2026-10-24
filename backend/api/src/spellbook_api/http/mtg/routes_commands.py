"""Closed browser commands delegate unchanged retry payloads to Core."""

from pydantic import ValidationError
from spellbook_core.auth import SessionAuth
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.inventory import Inventory
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.mtg.command_models import COMMAND
from spellbook_api.http.parsing import read_json_object
from spellbook_api.http.router import HttpRoute


def create_command_routes(
    auth: SessionAuth, inventory: Inventory, decks: Decks, origin: str
) -> list[HttpRoute]:
    async def command(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        try:
            parsed = COMMAND.validate_python(await read_json_object(request, 1024 * 1024))
        except ValidationError:
            raise HttpError(400, "Invalid web command") from None
        # TypedDict inputs preserve omitted keys and original scalar types without defaults.
        value = parsed.model_dump()["input"]
        result: object
        match parsed.operation:
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

    return [HttpRoute("POST", "/api/v1/mtg/commands", command)]
