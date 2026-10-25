"""Inventory/Groups HTTP adapters, including Arena import preview and commit."""

import math
from typing import Annotated, cast

from fastapi import APIRouter, Depends
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.inventory import Inventory
from spellbook_core.mtg.inventory_query import InventoryQuery, normalize_inventory_query
from spellbook_core.validation import (
    INVENTORY_SOURCES,
    MISSING,
    assert_condition,
    assert_finish,
    normalize_quantity,
    normalize_source,
)
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    read_json_object,
    read_number,
    read_string,
    require_uuid,
)

QUERY_INTEGER = TypeAdapter(int)


async def add_items(
    request: Request, auth: SessionAuth, inventory: Inventory, public_origin: str
) -> Response:
    actor = await require_mobile_auth(request, auth, public_origin)
    body = await read_json_object(request)
    items = body.get("items")
    if not body.get("requestId") or not isinstance(items, list):
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
        read_string(body.get("source", MISSING), "source", "mobile"), INVENTORY_SOURCES, "mobile"
    )
    acknowledgement = await inventory.add_items(
        actor, request_id=request_id, operations=operations, source=source
    )
    return json_response(acknowledgement)


async def get_entry(
    request: Request, entry_id: str, auth: SessionAuth, inventory: Inventory, public_origin: str
) -> Response:
    decoded = entry_id
    actor = await require_mobile_auth(request, auth, public_origin)
    detail = await inventory.get_entry(actor, require_uuid(decoded, "entryId"))
    if detail is None:
        raise HttpError(404, "Inventory entry not found")
    return json_response(detail)


def _query_number(value: str) -> int:
    try:
        return QUERY_INTEGER.validate_python(value)
    except PydanticValidationError:
        raise ValidationError("Invalid integer query parameter") from None


def inventory_query_from_url(request: Request) -> InventoryQuery:
    params = request.query_params

    def scalar(key: str) -> str | None:
        return params.getlist(key)[-1] if key in params else None

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
        value = scalar(key)
        if value is not None and (not (key == "variant" and value == "")):
            input[key] = value
    input["sets"] = params.getlist("set")
    if "page" in params:
        page = _query_number(cast(str, scalar("page")))
        if not math.isfinite(page) or page != int(page) or page < 1 or (page > 9007199254740991):
            raise ValidationError("page must be a positive integer")
        input["offset"] = (page - 1) * 50
    for key in ("offset", "limit"):
        value = scalar(key)
        if value is not None:
            input[key] = _query_number(value)
    return normalize_inventory_query(input)


def create_inventory_routes(auth: SessionAuth, inventory: Inventory, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def list_inventory(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        revisions = request.query_params.getlist("revision")
        result = await inventory.page(
            actor, inventory_query_from_url(request), revisions[-1] if revisions else None
        )
        return json_response(result, status=409 if result["kind"] == "RevisionChanged" else 200)

    async def add_inventory(request: Request) -> Response:
        return await add_items(request, auth, inventory, origin)

    async def detail(request: Request, entryId: UUIDPath) -> Response:
        return await get_entry(request, entryId, auth, inventory, origin)

    async def patch(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        entry_id = entryId
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

    async def remove(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        entry_id = entryId
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

    async def bulk(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
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

    async def list_groups(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        query = request.query_params

        def scalar(key: str, fallback: str) -> str:
            return query.getlist(key)[-1] if key in query else fallback

        result = await inventory.page(
            actor,
            {
                "view": "groups",
                "offset": _query_number(scalar("offset", "0")),
                "limit": _query_number(scalar("limit", "50")),
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

    async def create_group(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.create_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "name": read_string(body.get("name", MISSING), "name"),
                },
            )
        )

    async def rename_group(
        request: Request,
        groupId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.rename_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "groupId": groupId,
                    "name": read_string(body.get("name", MISSING), "name"),
                },
            )
        )

    async def delete_group(
        request: Request,
        groupId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.delete_group(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "groupId": groupId,
                },
            )
        )

    async def memberships(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.replace_memberships(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "entryId": entryId,
                    "groupIds": body.get("groupIds", MISSING),
                },
            )
        )

    async def reorder(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.reorder(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "entryId": entryId,
                    "position": body.get("position", MISSING),
                },
            )
        )

    async def locate(
        request: Request, entryId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        revisions = request.query_params.getlist("revision")
        if not revisions or not revisions[-1]:
            raise HttpError(400, "revision is required")
        result = await inventory.locate(
            actor, inventory_query_from_url(request), entryId, revisions[-1]
        )
        return json_response(result, status=409 if result["kind"] == "RevisionChanged" else 200)

    async def preview_import(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        finish = body.get("defaultFinish")
        condition = body.get("defaultCondition")
        assert_finish("nonfoil" if finish is None else finish)
        assert_condition("NM" if condition is None else condition)
        return json_response(
            await inventory.preview_import(actor, read_string(body.get("text", MISSING), "text"))
        )

    async def commit_import(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await inventory.commit_import(
                actor,
                {
                    "requestId": read_string(body.get("requestId", MISSING), "requestId"),
                    "text": read_string(body.get("text", MISSING), "text"),
                    "defaultFinish": read_string(
                        body.get("defaultFinish", MISSING), "defaultFinish", "nonfoil"
                    ),
                    "defaultCondition": read_string(
                        body.get("defaultCondition", MISSING), "defaultCondition", "NM"
                    ),
                    "source": normalize_source(
                        body.get("source", MISSING), INVENTORY_SOURCES, "import"
                    ),
                },
            )
        )

    router.add_api_route(
        "/api/v1/mtg/inventory", list_inventory, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory", add_inventory, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/batch-add", add_inventory, methods=["POST"], response_model=None
    )
    router.add_api_route("/api/v1/mtg/inventory/bulk", bulk, methods=["POST"], response_model=None)
    router.add_api_route(
        "/api/v1/mtg/inventory/groups", list_groups, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/groups", create_group, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/groups/{groupId}",
        rename_group,
        methods=["PATCH"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/groups/{groupId}",
        delete_group,
        methods=["DELETE"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/import/preview",
        preview_import,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/import/commit", commit_import, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}", detail, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}", patch, methods=["PATCH"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}", remove, methods=["DELETE"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}/groups", memberships, methods=["PUT"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}/position", reorder, methods=["PATCH"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/inventory/{entryId}/location", locate, methods=["GET"], response_model=None
    )
    return router
