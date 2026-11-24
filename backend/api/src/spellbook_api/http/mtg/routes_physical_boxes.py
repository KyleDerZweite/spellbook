"""Physical Box registry and linked-device identity resolution."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.physical_boxes import PhysicalBoxes
from starlette.responses import Response

from spellbook_api.http.auth import require_account_owner
from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response

BASE = "/api/v1/mtg/physical-boxes"


def create_physical_box_routes(auth: SessionAuth, boxes: PhysicalBoxes, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def owner(request: Request) -> Actor:
        return await require_account_owner(request, auth, origin)

    owner_body = body_dependency(owner, 65536)

    async def list_boxes(actor: Annotated[Actor, Depends(owner)]) -> Response:
        return json_response(await boxes.list(actor))

    async def get_box(
        boxId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        box = await boxes.get(actor, boxId)
        if box is None:
            raise HttpError(404, "Physical Box not found")
        return json_response(box)

    async def create_box(
        actor: Annotated[Actor, Depends(owner)],
        body: Annotated[dict[str, object], Depends(owner_body)],
    ) -> Response:
        if body.keys() != {"name", "requestId"}:
            raise HttpError(400, "Supply a name and requestId")
        return json_response(
            await boxes.create(actor, body["name"], body["requestId"]), status=201
        )

    async def update_box(
        boxId: UUIDPath,
        actor: Annotated[Actor, Depends(owner)],
        body: Annotated[dict[str, object], Depends(owner_body)],
    ) -> Response:
        box = await boxes.update(actor, boxId, body)
        if box is None:
            raise HttpError(404, "Physical Box not found")
        return json_response(box)

    router.add_api_route(BASE, list_boxes, methods=["GET"], response_model=None)
    router.add_api_route(BASE, create_box, methods=["POST"], response_model=None)
    router.add_api_route(BASE + "/{boxId}", get_box, methods=["GET"], response_model=None)
    router.add_api_route(BASE + "/{boxId}", update_box, methods=["PATCH"], response_model=None)
    return router
