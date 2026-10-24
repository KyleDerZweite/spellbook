"""Nineteen Deck adapters preserve the existing HTTP contract without schema coercion."""

from collections.abc import Awaitable, Callable

from spellbook_core.auth import SessionAuth
from spellbook_core.errors import ValidationError
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

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    read_json_object,
    read_number,
    read_query_integer,
    read_string,
    require_uuid,
    truthy,
)
from spellbook_api.http.router import HttpRoute

type Handler = Callable[[Request, dict[str, str]], Awaitable[Response]]


def first(request: Request, key: str, fallback: str | None = None) -> str | None:
    values = request.query_params.getlist(key)
    return values[0] if values else fallback


def library_input(request: Request) -> dict[str, object]:
    try:
        result: dict[str, object] = dict(
            query=first(request, "dirQ", ""),
            format=first(request, "dirFormat", ""),
            categoryVersionIds=request.query_params.getlist("dirCategory"),
            sort=first(request, "dirSort", "updated:desc"),
            offset=read_query_integer(first(request, "offset"), "offset", 0),
            limit=read_query_integer(first(request, "limit"), "limit", 40),
        )
        expected = first(request, "expectedRevision")
        expected = first(request, "revision") if expected is None else expected
        if expected is not None:
            result["expectedRevision"] = expected
        # URL parsing normalizes query fields; paging/revision validation belongs to Core.
        normalized = parse_library_input(
            {k: v for k, v in result.items() if k not in ("offset", "limit", "expectedRevision")}
        )["query"]
        return {**result, **normalized}
    except ValidationError, HttpError:
        raise HttpError(400, "Invalid Deck Library query") from None


def create_deck_routes(auth: SessionAuth, decks: Decks, origin: str) -> list[HttpRoute]:
    async def library(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(await decks.get_deck_library(actor, library_input(request)))

    async def categories(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(
            await decks.get_deck_library_categories(
                actor,
                {
                    **library_input(request),
                    "selectedVersionIds": request.query_params.getlist("selectedVersionId"),
                },
            )
        )

    async def locate(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(
            await decks.locate_deck(
                actor, require_uuid(first(request, "deckId")), library_input(request)
            )
        )

    async def snapshot(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(await decks.get_deck_snapshot(actor, "mtg", first(request, "deck")))

    async def create(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        if not truthy(body.get("name", MISSING)):
            raise HttpError(400, "name is required")
        input = dict(
            game="mtg",
            name=read_string(body["name"], "name"),
            description=read_string(body.get("description", MISSING), "description", ""),
            format=read_string(body.get("format", MISSING), "format", "Commander"),
        )
        existing = await decks.get_deck_snapshot(actor, "mtg")
        return json_response([*existing["decks"], await decks.create_deck_record(actor, input)])

    async def choices(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        for key in request.query_params:
            if (
                key not in ("query", "offset", "limit", "selectedDeckId")
                or len(request.query_params.getlist(key)) != 1
            ):
                raise HttpError(400, "Invalid Deck choice query")
        input: dict[str, object] = dict(
            offset=read_query_integer(first(request, "offset"), "offset", 0, 1000000),
            limit=read_query_integer(first(request, "limit"), "limit", 20, 50, 1),
        )
        for key in ("query", "selectedDeckId"):
            value = first(request, key)
            if value is not None:
                input[key] = value
        return json_response(
            await decks.get_deck_choices(actor, input), headers={"cache-control": "no-store"}
        )

    async def import_commit(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
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

    async def import_preview(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        return json_response(
            await decks.preview_mtg_import(
                actor,
                read_string(body.get("text", MISSING), "text", ""),
                read_string(body.get("format", MISSING), "format", ""),
            )
        )

    async def ownership(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(
            await decks.ownership(actor, request.query_params.getlist("canonicalCardId"))
        )

    async def search(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(await decks.search(actor, first(request, "q") or ""))

    async def patch_card(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        entry = require_uuid(decode_parameter(params["entryId"]), "entryId")
        body = await read_json_object(request)
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

    async def remove_card(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        entry = require_uuid(decode_parameter(params["entryId"]), "entryId")
        return json_response(
            await decks.remove_deck_card(
                actor, entry, first(request, "requestId", "") or "", "mobile"
            )
        )

    async def patch(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        deck_id = require_uuid(decode_parameter(params["deckId"]), "deckId")
        body = await read_json_object(request)
        input: dict[str, object] = dict(deckId=deck_id)
        for key in ("name", "description", "format"):
            if key in body:
                input[key] = read_string(body[key], key)
        if "description" in body:
            input["descriptionRevision"] = read_string(
                body.get("descriptionRevision", MISSING), "descriptionRevision", ""
            )
        return json_response(await decks.update_deck(actor, input))

    async def delete(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        await decks.delete_deck(actor, require_uuid(decode_parameter(params["deckId"]), "deckId"))
        return json_response(dict(ok=True))

    async def detail(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        deck_id = require_uuid(decode_parameter(params["deckId"]), "deckId")
        flags = request.query_params.getlist("includeLegality")
        flag = flags[0] if flags else None
        if (
            len(flags) > 1
            or flag not in (None, "true", "false")
            or (
                flag == "false"
                and (
                    len(request.query_params.getlist("selectedOnly")) != 1
                    or first(request, "selectedOnly") != "true"
                )
            )
        ):
            raise HttpError(400, "includeLegality=false requires selectedOnly=true.")
        state = (
            await decks.get_deck(actor, deck_id)
            if first(request, "selectedOnly") == "true"
            else await decks.get_deck_snapshot(actor, "mtg", deck_id)
        )
        if flag == "false":
            return json_response(state, headers={"cache-control": "no-store"})
        legality = await decks.get_deck_legality(actor, deck_id)
        return json_response({**state, **legality}, headers={"cache-control": "no-store"})

    async def availability(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(
            await decks.availability(
                actor, require_uuid(decode_parameter(params["deckId"]), "deckId")
            ),
            headers={"cache-control": "no-store"},
        )

    async def add_card(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        deck_id = require_uuid(decode_parameter(params["deckId"]), "deckId")
        body = await read_json_object(request)
        if any(
            not truthy(body.get(k, MISSING)) for k in ("catalogCardId", "canonicalCardId", "name")
        ):
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

    async def bulk(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        deck_id = require_uuid(decode_parameter(params["deckId"]), "deckId")
        body = await read_json_object(request)
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

    async def export(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        deck_id = require_uuid(decode_parameter(params["deckId"]), "deckId")
        if first(request, "format", "arena") != "arena":
            raise HttpError(400, "Only arena export is supported")
        return Response(
            await decks.export_decklist(actor, deck_id),
            headers={"content-type": "text/plain; charset=utf-8"},
        )

    base = "/api/v1/mtg"
    definitions: list[tuple[str, str, Handler]] = [
        ("GET", "/deck-library", library),
        ("GET", "/deck-library/categories", categories),
        ("GET", "/deck-library/locate", locate),
        ("GET", "/decks", snapshot),
        ("POST", "/decks", create),
        ("GET", "/decks/choices", choices),
        ("POST", "/decks/import/commit", import_commit),
        ("POST", "/decks/import/preview", import_preview),
        ("GET", "/decks/ownership", ownership),
        ("GET", "/decks/search", search),
        ("PATCH", "/deck-cards/:entryId", patch_card),
        ("DELETE", "/deck-cards/:entryId", remove_card),
        ("PATCH", "/decks/:deckId", patch),
        ("DELETE", "/decks/:deckId", delete),
        ("GET", "/decks/:deckId", detail),
        ("GET", "/decks/:deckId/availability", availability),
        ("POST", "/decks/:deckId/cards", add_card),
        ("POST", "/decks/:deckId/cards/bulk", bulk),
        ("GET", "/decks/:deckId/export", export),
    ]
    return [HttpRoute(method, base + path, handler) for method, path, handler in definitions]
