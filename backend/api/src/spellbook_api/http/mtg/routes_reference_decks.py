"""Public MTG Reference deck reads."""

from typing import Annotated

from fastapi import APIRouter, Query
from spellbook_core.mtg.reference_decks import ReferenceDecks
from starlette.responses import Response

from spellbook_api.http.dependencies import UUIDPath
from spellbook_api.http.errors import HttpError, json_response

BASE = "/api/v1/mtg/reference-decks"


def create_reference_deck_routes(reference_decks: ReferenceDecks) -> APIRouter:
    router = APIRouter()

    async def list_reference_decks(
        format: str | None = None,
        source: str | None = None,
        q: str | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    ) -> Response:
        result = await reference_decks.list_reference_decks(
            format=format,
            source=source,
            query=q,
            limit=limit,
            offset=offset,
        )
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def get_reference_deck(deckId: UUIDPath) -> Response:
        deck = await reference_decks.get_reference_deck(deckId)
        if deck is None:
            raise HttpError(404, "Reference deck not found")
        return json_response(deck, headers={"Cache-Control": "no-store"})

    router.add_api_route(BASE, list_reference_decks, methods=["GET"], response_model=None)
    router.add_api_route(
        BASE + "/{deckId}", get_reference_deck, methods=["GET"], response_model=None
    )
    return router
