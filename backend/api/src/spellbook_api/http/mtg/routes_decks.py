"""Nineteen Deck adapters preserve the existing HTTP contract without schema coercion."""

from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.decks import Decks
from spellbook_core.mtg.decks.library import parse_library_input
from spellbook_core.validation import (
    DECK_SOURCES,
    MISSING,
    assert_request_id,
    normalize_quantity,
    normalize_source,
)
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    read_number,
    read_query_integer,
    read_string,
    require_uuid,
)


def scalar(request: Request, key: str, fallback: str | None = None) -> str | None:
    values = request.query_params.getlist(key)
    return values[-1] if values else fallback


def library_input(request: Request) -> dict[str, object]:
    try:
        result: dict[str, object] = dict(
            query=scalar(request, "dirQ", ""),
            format=scalar(request, "dirFormat", ""),
            categoryVersionIds=request.query_params.getlist("dirCategory"),
            sort=scalar(request, "dirSort", "updated:desc"),
            offset=read_query_integer(scalar(request, "offset"), "offset", 0),
            limit=read_query_integer(scalar(request, "limit"), "limit", 40),
        )
        expected = scalar(request, "expectedRevision")
        expected = scalar(request, "revision") if expected is None else expected
        if expected is not None:
            result["expectedRevision"] = expected
        normalized = parse_library_input(
            {k: v for k, v in result.items() if k not in ("offset", "limit", "expectedRevision")}
        )["query"]
        return {**result, **normalized}
    except ValidationError, HttpError:
        raise HttpError(400, "Invalid Deck Library query") from None


def create_deck_routes(auth: SessionAuth, decks: Decks, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def library(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(await decks.get_deck_library(actor, library_input(request)))

    async def categories(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(
            await decks.get_deck_library_categories(
                actor,
                {
                    **library_input(request),
                    "selectedVersionIds": request.query_params.getlist("selectedVersionId"),
                },
            )
        )

    async def locate(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(
            await decks.locate_deck(
                actor, require_uuid(scalar(request, "deckId")), library_input(request)
            )
        )

    async def snapshot(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(await decks.get_deck_snapshot(actor, "mtg", scalar(request, "deck")))

    async def create(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        if not body.get("name"):
            raise HttpError(400, "name is required")
        input = dict(
            game="mtg",
            name=read_string(body["name"], "name"),
            description=read_string(body.get("description", MISSING), "description", ""),
            format=read_string(body.get("format", MISSING), "format", "Commander"),
        )
        existing = await decks.get_deck_snapshot(actor, "mtg")
        return json_response([*existing["decks"], await decks.create_deck_record(actor, input)])

    async def choices(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        for key in request.query_params:
            if (
                key not in ("query", "offset", "limit", "selectedDeckId")
                or len(request.query_params.getlist(key)) != 1
            ):
                raise HttpError(400, "Invalid Deck choice query")
        input: dict[str, object] = dict(
            offset=read_query_integer(scalar(request, "offset"), "offset", 0, 1000000),
            limit=read_query_integer(scalar(request, "limit"), "limit", 20, 50, 1),
        )
        for key in ("query", "selectedDeckId"):
            value = scalar(request, key)
            if value is not None:
                input[key] = value
        return json_response(
            await decks.get_deck_choices(actor, input), headers={"cache-control": "no-store"}
        )

    async def import_commit(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        input: dict[str, object] = dict(game="mtg")
        for key, fallback in (
            ("requestId", ""),
            ("source", "import"),
            ("name", ""),
            ("description", ""),
            ("format", "Commander"),
            ("text", ""),
        ):
            input[key] = read_string(body.get(key, MISSING), key, fallback)
        return json_response(await decks.import_text_deck(actor, input))

    async def import_preview(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await decks.preview_mtg_import(
                actor,
                read_string(body.get("text", MISSING), "text", ""),
                read_string(body.get("format", MISSING), "format", ""),
            )
        )

    async def ownership(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(
            await decks.ownership(actor, request.query_params.getlist("canonicalCardId"))
        )

    async def search(
        request: Request, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(await decks.search(actor, scalar(request, "q") or ""))

    async def patch_card(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        entry = entryId
        return json_response(
            await decks.update_deck_card(
                actor,
                entry,
                normalize_quantity(read_number(body["quantity"], "quantity"))
                if "quantity" in body
                else None,
                read_string(body["role"], "role") if "role" in body else None,
                read_string(body.get("requestId", MISSING), "requestId", ""),
                read_number(body["delta"], "delta") if "delta" in body else None,
                "mobile",
                read_string(body["categoryPreview"], "categoryPreview")
                if "categoryPreview" in body
                else None,
            )
        )

    async def remove_card(
        request: Request, entryId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        entry = entryId
        return json_response(
            await decks.remove_deck_card(
                actor, entry, scalar(request, "requestId", "") or "", "mobile"
            )
        )

    async def patch(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        deck_id = deckId
        input: dict[str, object] = dict(deckId=deck_id)
        for key in ("name", "description", "format"):
            if key in body:
                input[key] = read_string(body[key], key)
        if "description" in body:
            input["descriptionRevision"] = read_string(
                body.get("descriptionRevision", MISSING), "descriptionRevision", ""
            )
        return json_response(await decks.update_deck(actor, input))

    async def delete(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        await decks.delete_deck(actor, deckId)
        return json_response(dict(ok=True))

    async def detail(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        deck_id = deckId
        flags = request.query_params.getlist("includeLegality")
        flag = flags[0] if flags else None
        if (
            len(flags) > 1
            or flag not in (None, "true", "false")
            or (
                flag == "false"
                and (
                    len(request.query_params.getlist("selectedOnly")) != 1
                    or scalar(request, "selectedOnly") != "true"
                )
            )
        ):
            raise HttpError(400, "includeLegality=false requires selectedOnly=true.")
        state = (
            await decks.get_deck(actor, deck_id)
            if scalar(request, "selectedOnly") == "true"
            else await decks.get_deck_snapshot(actor, "mtg", deck_id)
        )
        if flag == "false":
            return json_response(state, headers={"cache-control": "no-store"})
        legality = await decks.get_deck_legality(actor, deck_id)
        return json_response({**state, **legality}, headers={"cache-control": "no-store"})

    async def availability(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(
            await decks.availability(actor, deckId),
            headers={"cache-control": "no-store"},
        )

    async def add_card(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        deck_id = deckId
        if any(not body.get(k) for k in ("catalogCardId", "canonicalCardId", "name")):
            raise HttpError(400, "deckId, catalogCardId, canonicalCardId, and name are required")
        input: dict[str, object] = dict(
            deckId=deck_id,
            quantity=normalize_quantity(read_number(body.get("quantity", MISSING), "quantity", 1)),
        )
        for key, fallback in (
            ("catalogCardId", ""),
            ("canonicalCardId", ""),
            ("name", ""),
            ("setCode", ""),
            ("imageUri", ""),
            ("role", "main"),
            ("requestId", ""),
        ):
            input[key] = read_string(body.get(key, MISSING), key, fallback)
        return json_response(await decks.add_deck_card(actor, input))

    async def bulk(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        deck_id = deckId
        return json_response(
            await decks.bulk_mutate_deck_cards(
                actor,
                dict(
                    deckId=deck_id,
                    requestId=assert_request_id(
                        read_string(body.get("requestId", MISSING), "requestId", "")
                    ),
                    source=normalize_source(
                        read_string(body.get("source", MISSING), "source", "mobile"),
                        DECK_SOURCES,
                        "mobile",
                    ),
                    game="mtg",
                    operations=body["operations"]
                    if isinstance(body.get("operations"), list)
                    else [],
                ),
            )
        )

    async def export(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        deck_id = deckId
        if scalar(request, "format", "arena") != "arena":
            raise HttpError(400, "Only arena export is supported")
        return Response(
            await decks.export_decklist(actor, deck_id),
            headers={"content-type": "text/plain; charset=utf-8"},
        )

    router.add_api_route("/api/v1/mtg/deck-library", library, methods=["GET"], response_model=None)
    router.add_api_route(
        "/api/v1/mtg/deck-library/categories", categories, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/deck-library/locate", locate, methods=["GET"], response_model=None
    )
    router.add_api_route("/api/v1/mtg/decks", snapshot, methods=["GET"], response_model=None)
    router.add_api_route("/api/v1/mtg/decks", create, methods=["POST"], response_model=None)
    router.add_api_route(
        "/api/v1/mtg/decks/choices", choices, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/import/commit", import_commit, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/import/preview", import_preview, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/ownership", ownership, methods=["GET"], response_model=None
    )
    router.add_api_route("/api/v1/mtg/decks/search", search, methods=["GET"], response_model=None)
    router.add_api_route(
        "/api/v1/mtg/deck-cards/{entryId}", patch_card, methods=["PATCH"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/deck-cards/{entryId}", remove_card, methods=["DELETE"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}", patch, methods=["PATCH"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}", delete, methods=["DELETE"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}", detail, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/availability",
        availability,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/cards", add_card, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/cards/bulk", bulk, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/export", export, methods=["GET"], response_model=None
    )
    return router
