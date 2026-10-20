"""Direct adapters for the representative items-add and entry-detail workflow."""

from spellbook_core.auth import SessionAuth
from spellbook_core.inventory import Inventory
from spellbook_core.validation import INVENTORY_SOURCES, MISSING, normalize_source
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    read_json_object,
    read_number,
    read_string,
    require_uuid,
    truthy,
)


async def add_items(
    request: Request,
    auth: SessionAuth,
    inventory: Inventory,
    public_origin: str,
) -> Response:
    actor = await require_mobile_auth(request, auth, public_origin)
    body = await read_json_object(request)
    items = body.get("items")
    if not truthy(body.get("requestId", MISSING)) or not isinstance(items, list):
        raise HttpError(400, "requestId and items are required")
    operations: list[dict[str, object]] = []
    for item in items:
        if not isinstance(item, dict):
            raise HttpError(400, "Each inventory item must be an object")
        operation: dict[str, object] = {
            "op": "add",
            "catalogCardId": read_string(item.get("catalogCardId", MISSING), "catalogCardId"),
            "finish": read_string(item.get("finish", MISSING), "finish", "nonfoil"),
            "condition": read_string(item.get("condition", MISSING), "condition", "NM"),
            "quantity": read_number(item.get("quantity", MISSING), "quantity", 1),
        }
        if "notes" in item:
            operation["notes"] = read_string(item["notes"], "notes")
            if "notesRevision" in item:
                operation["notesRevision"] = read_string(item["notesRevision"], "notesRevision")
        operations.append(operation)
    request_id = read_string(body["requestId"], "requestId")
    source = normalize_source(
        read_string(body.get("source", MISSING), "source", "mobile"),
        INVENTORY_SOURCES,
        "mobile",
    )
    acknowledgement = await inventory.add_items(
        actor,
        request_id=request_id,
        operations=operations,
        source=source,
    )
    return json_response(acknowledgement)


async def get_entry(
    request: Request,
    entry_id: str,
    auth: SessionAuth,
    inventory: Inventory,
    public_origin: str,
) -> Response:
    # Raw matching precedes this handler. Decode before auth, as Node's router does.
    decoded = decode_parameter(entry_id)
    actor = await require_mobile_auth(request, auth, public_origin)
    detail = await inventory.get_entry(actor, require_uuid(decoded, "entryId"))
    if detail is None:
        raise HttpError(404, "Inventory entry not found")
    return json_response(detail)
