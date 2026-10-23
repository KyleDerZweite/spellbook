"""The existing seventeen Category/Library/whole HTTP routes, without schema coercion."""

from collections.abc import Awaitable, Callable

from spellbook_core.auth import SessionAuth
from spellbook_core.categories import Categories
from spellbook_core.categories.common import (
    CategoryConflict,
    CategoryMergeConflict,
    CategoryNotFound,
    CategoryPreviewCapacity,
    CategoryPreviewExpired,
    CategoryUnavailable,
    Document,
    LibraryConflict,
)
from spellbook_core.validation import MISSING
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    read_json_object,
    read_query_integer,
    read_string,
    require_uuid,
)
from spellbook_api.http.router import HttpRoute

type Command = Callable[[Request, dict[str, str]], Awaitable[object]]


def _fields(body: Document, allowed: list[str], *, whole: bool = False) -> None:
    if any(k not in allowed for k in body):
        raise HttpError(
            400,
            "Unsupported whole-deck category fields"
            if whole
            else "Unsupported category request fields",
        )


def _page(request: Request) -> Document:
    return dict(
        offset=read_query_integer(request.query_params.get("offset"), "offset", 0),
        limit=read_query_integer(request.query_params.get("limit"), "limit", 50, 100, 1),
    )


def category_http_error(cause: Exception) -> HttpError:
    """Domain-specific mapping stays with this adapter; unknown failures remain private."""
    body: Document = dict(kind=getattr(cause, "kind", ""), message=str(cause))
    if isinstance(cause, CategoryNotFound):
        return HttpError(404, body)
    if isinstance(cause, CategoryConflict):
        return HttpError(409, {**body, "latest": cause.latest})
    if isinstance(cause, CategoryMergeConflict):
        return HttpError(409, {**body, "preview": cause.preview})
    if isinstance(cause, (LibraryConflict, CategoryPreviewExpired)):
        return HttpError(409, body)
    if isinstance(cause, (CategoryPreviewCapacity, CategoryUnavailable)):
        return HttpError(503, body)
    raise cause


def create_category_routes(
    auth: SessionAuth, categories: Categories, origin: str
) -> list[HttpRoute]:
    async def library(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        page = _page(request)
        if "scope" in request.query_params:
            page["scope"] = request.query_params["scope"]
        return await categories.get_library(actor, page)

    async def save(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        return await categories.save_definition(actor, await read_json_object(request, 65536))

    async def choices(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        query = request.query_params
        return await categories.get_rule_choices(
            actor,
            dict(
                tagQuery=query.get("tagQuery", ""),
                cardQuery=query.get("cardQuery", ""),
                outcomeQuery=query.get("outcomeQuery", ""),
                tagIds=query.getlist("tagId"),
                oracleIds=query.getlist("oracleId"),
                outcomeIds=query.getlist("outcomeId"),
            ),
        )

    async def definition(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        return await categories.get_definition(actor, require_uuid(params["originId"]))

    async def archive(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "expectedLibraryRevision", "archived"])
        return await categories.archive_definition(
            actor, {**body, "originId": require_uuid(params["originId"])}
        )

    async def get_preview(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        return await categories.get_category_preview(
            actor, dict(previewId=require_uuid(params["previewId"]), **_page(request))
        )

    async def commit(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId"])
        return await categories.commit_category_change(
            actor, {**body, "previewId": require_uuid(params["previewId"])}
        )

    async def set_entry(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 16384)
        _fields(body, ["deckId", "categoryId", "expectedDecisionRevision", "requestId"])
        return await categories.set_entry_category(
            actor, {**body, "entryId": require_uuid(params["entryId"])}
        )

    async def get_entries(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        return await categories.get_deck_entry_categories(actor, require_uuid(params["deckId"]))

    async def initialize(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 16384)
        _fields(body, ["requestId"])
        return await categories.initialize_deck_categories(
            actor, {**body, "deckId": require_uuid(params["deckId"])}
        )

    async def merge(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 16384)
        _fields(body, ["entryId", "catalogCardId", "role", "quantity"])
        return await categories.preview_entry_merge(
            actor, {**body, "deckId": require_uuid(params["deckId"])}
        )

    async def preview(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "scope", "mode", "restoreOriginIds"])
        return await categories.preview_category_change(
            actor, {**body, "deckId": require_uuid(params["deckId"])}
        )

    async def get_whole(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        return await categories.get_deck_whole_categories(actor, require_uuid(params["deckId"]))

    async def patch_whole(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "expectedDecisionRevision", "name", "manual"], whole=True)
        if "name" in body and "manual" in body:
            raise HttpError(400, "Unsupported whole-deck category fields")
        value = dict(
            requestId=require_uuid(body.get("requestId")),
            deckId=require_uuid(params["deckId"]),
            versionId=require_uuid(params["versionId"]),
            expectedDecisionRevision=read_string(
                body.get("expectedDecisionRevision", MISSING), "expectedDecisionRevision"
            ),
        )
        if "name" in body:
            return await categories.rename_whole_category(
                actor, {**value, "name": read_string(body["name"], "name")}
            )
        if body.get("manual") not in ("Include", "Exclude"):
            raise HttpError(400, "Select Include or Exclude")
        return await categories.set_whole_category(actor, {**value, "manual": body["manual"]})

    async def delete_whole(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "expectedDecisionRevision"], whole=True)
        return await categories.remove_whole_category(
            actor,
            dict(
                requestId=require_uuid(body.get("requestId")),
                deckId=require_uuid(params["deckId"]),
                versionId=require_uuid(params["versionId"]),
                expectedDecisionRevision=read_string(
                    body.get("expectedDecisionRevision", MISSING), "expectedDecisionRevision"
                ),
            ),
        )

    async def rename_local(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "expectedDecisionRevision", "name"])
        return await categories.rename_local_category(
            actor,
            {
                **body,
                "deckId": require_uuid(params["deckId"]),
                "categoryId": require_uuid(params["categoryId"]),
            },
        )

    async def remove_local(request: Request, params: dict[str, str]) -> object:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request, 65536)
        _fields(body, ["requestId", "expectedDecisionRevision", "replacementCategoryId"])
        return await categories.remove_local_category(
            actor,
            {
                **body,
                "deckId": require_uuid(params["deckId"]),
                "categoryId": require_uuid(params["categoryId"]),
            },
        )

    def route(method: str, path: str, command: Command) -> HttpRoute:
        async def handle(request: Request, params: dict[str, str]) -> Response:
            try:
                decoded = {key: decode_parameter(value) for key, value in params.items()}
                return json_response(await command(request, decoded))
            except (
                CategoryNotFound,
                CategoryConflict,
                CategoryMergeConflict,
                LibraryConflict,
                CategoryPreviewExpired,
                CategoryUnavailable,
                CategoryPreviewCapacity,
            ) as cause:
                raise category_http_error(cause) from None

        return HttpRoute(method, "/api/mobile/v1/mtg" + path, handle)

    return [
        route("GET", "/category-definitions", library),
        route("POST", "/category-definitions", save),
        route("GET", "/category-rule-choices", choices),
        route("POST", "/category-definitions/:originId/archive", archive),
        route("GET", "/category-previews/:previewId", get_preview),
        route("POST", "/category-previews/:previewId/commit", commit),
        route("PATCH", "/deck-cards/:entryId/category", set_entry),
        route("GET", "/decks/:deckId/categories", get_entries),
        route("POST", "/decks/:deckId/categories/initialize", initialize),
        route("POST", "/decks/:deckId/categories/merge-preview", merge),
        route("POST", "/decks/:deckId/category-previews", preview),
        route("GET", "/decks/:deckId/whole-categories", get_whole),
        route("GET", "/category-definitions/:originId", definition),
        route("PATCH", "/decks/:deckId/whole-categories/:versionId", patch_whole),
        route("DELETE", "/decks/:deckId/whole-categories/:versionId", delete_whole),
        route("PATCH", "/decks/:deckId/categories/:categoryId", rename_local),
        route("DELETE", "/decks/:deckId/categories/:categoryId", remove_local),
    ]
