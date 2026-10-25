"""The existing seventeen Category/Library/whole HTTP routes, without schema coercion."""

from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.categories import Categories
from spellbook_core.mtg.categories.common import Document
from spellbook_core.validation import MISSING
from starlette.requests import Request

from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError
from spellbook_api.http.parsing import read_query_integer, read_string, require_uuid


def _fields(body: Document, allowed: list[str], *, whole: bool = False) -> None:
    if any(k not in allowed for k in body):
        raise HttpError(
            400,
            "Unsupported whole-deck category fields"
            if whole
            else "Unsupported category request fields",
        )


def _scalar_query(request: Request, name: str) -> str | None:
    """Match URLSearchParams.get while selected IDs retain getlist semantics."""
    return request.query_params.get(name)


def _page(request: Request) -> Document:
    return dict(
        offset=read_query_integer(_scalar_query(request, "offset"), "offset", 0),
        limit=read_query_integer(_scalar_query(request, "limit"), "limit", 50, 100, 1),
    )


def create_category_routes(auth: SessionAuth, categories: Categories, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def library(request: Request, actor: Annotated[Actor, Depends(authenticated)]) -> object:
        page = _page(request)
        scope = _scalar_query(request, "scope")
        if scope is not None:
            page["scope"] = scope
        return await categories.get_library(actor, page)

    async def save(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        return await categories.save_definition(actor, body)

    async def choices(request: Request, actor: Annotated[Actor, Depends(authenticated)]) -> object:
        query = request.query_params
        return await categories.get_rule_choices(
            actor,
            dict(
                tagQuery=_scalar_query(request, "tagQuery") or "",
                cardQuery=_scalar_query(request, "cardQuery") or "",
                outcomeQuery=_scalar_query(request, "outcomeQuery") or "",
                tagIds=query.getlist("tagId"),
                oracleIds=query.getlist("oracleId"),
                outcomeIds=query.getlist("outcomeId"),
            ),
        )

    async def definition(
        request: Request, originId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> object:
        return await categories.get_definition(actor, originId)

    async def archive(
        request: Request,
        originId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "expectedLibraryRevision", "archived"])
        return await categories.archive_definition(actor, {**body, "originId": originId})

    async def get_preview(
        request: Request, previewId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> object:
        return await categories.get_category_preview(
            actor, dict(previewId=previewId, **_page(request))
        )

    async def commit(
        request: Request,
        previewId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId"])
        return await categories.commit_category_change(actor, {**body, "previewId": previewId})

    async def set_entry(
        request: Request,
        entryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 16384))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["deckId", "categoryId", "expectedDecisionRevision", "requestId"])
        return await categories.set_entry_category(actor, {**body, "entryId": entryId})

    async def get_entries(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> object:
        return await categories.get_deck_entry_categories(actor, deckId)

    async def initialize(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 16384))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId"])
        return await categories.initialize_deck_categories(actor, {**body, "deckId": deckId})

    async def merge(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 16384))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["entryId", "catalogCardId", "role", "quantity"])
        return await categories.preview_entry_merge(actor, {**body, "deckId": deckId})

    async def preview(
        request: Request,
        deckId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "scope", "mode", "restoreOriginIds"])
        return await categories.preview_category_change(actor, {**body, "deckId": deckId})

    async def get_whole(
        request: Request, deckId: UUIDPath, actor: Annotated[Actor, Depends(authenticated)]
    ) -> object:
        return await categories.get_deck_whole_categories(actor, deckId)

    async def patch_whole(
        request: Request,
        deckId: UUIDPath,
        versionId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "expectedDecisionRevision", "name", "manual"], whole=True)
        if "name" in body and "manual" in body:
            raise HttpError(400, "Unsupported whole-deck category fields")
        value = dict(
            requestId=require_uuid(body.get("requestId")),
            deckId=deckId,
            versionId=versionId,
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

    async def delete_whole(
        request: Request,
        deckId: UUIDPath,
        versionId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "expectedDecisionRevision"], whole=True)
        return await categories.remove_whole_category(
            actor,
            dict(
                requestId=require_uuid(body.get("requestId")),
                deckId=deckId,
                versionId=versionId,
                expectedDecisionRevision=read_string(
                    body.get("expectedDecisionRevision", MISSING), "expectedDecisionRevision"
                ),
            ),
        )

    async def rename_local(
        request: Request,
        deckId: UUIDPath,
        categoryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "expectedDecisionRevision", "name"])
        return await categories.rename_local_category(
            actor, {**body, "deckId": deckId, "categoryId": categoryId}
        )

    async def remove_local(
        request: Request,
        deckId: UUIDPath,
        categoryId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 65536))],
        actor: Annotated[Actor, Depends(authenticated)],
    ) -> object:
        _fields(body, ["requestId", "expectedDecisionRevision", "replacementCategoryId"])
        return await categories.remove_local_category(
            actor, {**body, "deckId": deckId, "categoryId": categoryId}
        )

    router.add_api_route(
        "/api/v1/mtg/category-definitions", library, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/category-definitions", save, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/category-rule-choices", choices, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/category-definitions/{originId}/archive",
        archive,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/category-previews/{previewId}",
        get_preview,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/category-previews/{previewId}/commit",
        commit,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/deck-cards/{entryId}/category",
        set_entry,
        methods=["PATCH"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/categories", get_entries, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/categories/initialize",
        initialize,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/categories/merge-preview",
        merge,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/category-previews",
        preview,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/whole-categories",
        get_whole,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/category-definitions/{originId}",
        definition,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/whole-categories/{versionId}",
        patch_whole,
        methods=["PATCH"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/whole-categories/{versionId}",
        delete_whole,
        methods=["DELETE"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/categories/{categoryId}",
        rename_local,
        methods=["PATCH"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/decks/{deckId}/categories/{categoryId}",
        remove_local,
        methods=["DELETE"],
        response_model=None,
    )
    return router
