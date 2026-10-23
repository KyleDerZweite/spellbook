"""Inventory/Groups HTTP adapters. Import endpoints are owned by the later resolver slice."""

import math
import re
from typing import cast

from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ValidationError
from spellbook_core.inventory import Inventory
from spellbook_core.inventory_query import InventoryQuery, normalize_inventory_query
from spellbook_core.validation import (
    INVENTORY_SOURCES,
    MISSING,
    js_trim,
    normalize_quantity,
    normalize_source,
)
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
from spellbook_api.http.router import HttpRoute


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


def _query_number(value: str) -> int | float:
    text = js_trim(value)
    if not text:
        return 0
    try:
        if text.lower().startswith(("0x", "0b", "0o")):
            if not re.fullmatch(r"0(?:[xX][0-9a-fA-F]+|[bB][01]+|[oO][0-7]+)", text):
                return float("nan")
            return float(int(text, 0))
        # Number accepts decimal and Infinity, but not Python's inf, nan or underscores.
        if not re.fullmatch(
            r"[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|Infinity)", text
        ):
            return float("nan")
        return float(text)
    except ValueError, OverflowError:
        return float("nan")


def inventory_query_from_url(request: Request) -> InventoryQuery:
    params = request.query_params

    # URLSearchParams.get selects the first repeated value.
    def first(key: str) -> str | None:
        return params.getlist(key)[0] if key in params else None

    input: dict[str, object] = {}
    for key in (
        "q",
        "finish",
        "condition",
        "sort",
        "dir",
        "variant",
        "variantDir",
        "view",
        "group",
    ):
        value = first(key)
        if value is not None and not (key == "variant" and value == ""):
            input[key] = value
    input["sets"] = params.getlist("set")
    if "page" in params:
        page = _query_number(cast(str, first("page")))
        if not math.isfinite(page) or page != int(page) or page < 1 or page > 9007199254740991:
            raise ValidationError("page must be a positive integer")
        input["offset"] = (page - 1) * 50
    for key in ("offset", "limit"):
        value = first(key)
        if value is not None:
            input[key] = _query_number(value)
    return normalize_inventory_query(input)


def create_inventory_routes(
    auth: SessionAuth, inventory: Inventory, origin: str
) -> list[HttpRoute]:
    async def list_inventory(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        revisions = request.query_params.getlist("revision")
        result = await inventory.page(
            actor, inventory_query_from_url(request), revisions[0] if revisions else None
        )
        return json_response(result, status=409 if result["kind"] == "RevisionChanged" else 200)

    async def add_inventory(request: Request, params: dict[str, str]) -> Response:
        return await add_items(request, auth, inventory, origin)

    async def detail(request: Request, params: dict[str, str]) -> Response:
        return await get_entry(request, params["entryId"], auth, inventory, origin)

    async def patch(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        entry_id = require_uuid(decode_parameter(params["entryId"]), "entryId")
        body = await read_json_object(request)
        input: dict[str, object] = {
            "requestId": read_string(body.get("requestId", MISSING), "requestId"),
            "entryId": entry_id,
            "source": "mobile",
        }
        for field in ("quantity", "delta"):
            if field in body:
                input[field] = normalize_quantity(read_number(body[field], field))
        if "notes" in body:
            input["notes"] = read_string(body["notes"], "notes")
            input["notesRevision"] = read_string(
                body.get("notesRevision", MISSING), "notesRevision"
            )
        return json_response(await inventory.patch_entry(actor, input))

    async def remove(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        entry_id = require_uuid(decode_parameter(params["entryId"]), "entryId")
        body = await read_json_object(request)
        return json_response(
            await inventory.remove(
                actor,
                {
                    "entryId": entry_id,
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "expectedQuantity": read_number(
                        body.get("expectedQuantity", MISSING), "expectedQuantity"
                    ),
                    "source": "mobile",
                },
            )
        )

    async def bulk(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.bulk(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId", ""),
                    "source": normalize_source(
                        read_string(body.get("source", MISSING), "source", "mobile"),
                        INVENTORY_SOURCES,
                        "mobile",
                    ),
                    "operations": body["operations"]
                    if isinstance(body.get("operations"), list)
                    else [],
                },
            )
        )

    async def list_groups(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        query = request.query_params

        def first(key: str, fallback: str) -> str:
            return query.getlist(key)[0] if key in query else fallback

        result = await inventory.page(
            actor,
            {
                "view": "groups",
                "offset": _query_number(first("offset", "0")),
                "limit": _query_number(first("limit", "50")),
            },
        )
        if result["kind"] != "Page":
            raise RuntimeError("Initial Groups must be current")
        return json_response(
            {
                "revision": result["revision"],
                "groups": result["groupPage"],
                "count": result["groupCount"],
            }
        )

    async def create_group(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.create_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "name": read_string(body.get("name", MISSING), "name"),
                },
            )
        )

    async def rename_group(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.rename_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "groupId": decode_parameter(params["groupId"]),
                    "name": read_string(body.get("name", MISSING), "name"),
                },
            )
        )

    async def delete_group(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.delete_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "groupId": decode_parameter(params["groupId"]),
                },
            )
        )

    async def memberships(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.replace_memberships(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "entryId": decode_parameter(params["entryId"]),
                    "groupIds": body.get("groupIds", MISSING),
                },
            )
        )

    async def reorder(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await inventory.reorder(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "entryId": decode_parameter(params["entryId"]),
                    "position": body.get("position", MISSING),
                },
            )
        )

    async def locate(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        revisions = request.query_params.getlist("revision")
        if not revisions or not revisions[0]:
            raise HttpError(400, "revision is required")
        result = await inventory.locate(
            actor,
            inventory_query_from_url(request),
            decode_parameter(params["entryId"]),
            revisions[0],
        )
        return json_response(result, status=409 if result["kind"] == "RevisionChanged" else 200)

    base = "/api/mobile/v1/mtg/inventory"
    return [
        HttpRoute("GET", base, list_inventory),
        HttpRoute("POST", base, add_inventory),
        HttpRoute("POST", base + "/batch-add", add_inventory),
        HttpRoute("POST", base + "/bulk", bulk),
        HttpRoute("GET", base + "/groups", list_groups),
        HttpRoute("POST", base + "/groups", create_group),
        HttpRoute("PATCH", base + "/groups/:groupId", rename_group),
        HttpRoute("DELETE", base + "/groups/:groupId", delete_group),
        HttpRoute("GET", base + "/:entryId", detail),
        HttpRoute("PATCH", base + "/:entryId", patch),
        HttpRoute("DELETE", base + "/:entryId", remove),
        HttpRoute("PUT", base + "/:entryId/groups", memberships),
        HttpRoute("PATCH", base + "/:entryId/position", reorder),
        HttpRoute("GET", base + "/:entryId/location", locate),
    ]
