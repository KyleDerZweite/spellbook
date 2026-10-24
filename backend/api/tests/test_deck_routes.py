"""All nineteen Deck routes exercise native dispatch, validation and application calls."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient
from http_helpers import application, native_routes
from spellbook_core.auth import SessionAuth
from spellbook_core.errors import RequestConflictError
from spellbook_core.models import Actor
from spellbook_core.mtg.categories import CategoryMergeConflict
from spellbook_core.mtg.decks import DeckLibraryRevisionChanged, Decks
from spellbook_core.mtg.errors import DeckNotFoundError, DescriptionConflictError

from spellbook_api.http.mtg.routes_decks import create_deck_routes

ORIGIN = "https://spellbook.test"
BASE = "/api/v1/mtg"
DECK = "22222222-2222-4222-8222-222222222222"
ENTRY = "11111111-1111-4111-8111-111111111111"
TOKEN = "a" * 43
ACTOR = Actor("account", "test", "", "", "")
SNAPSHOT: dict[str, object] = dict(
    decks=[],
    deckTotals={},
    deckCovers={},
    deckCards=[],
    availability={},
    valueEstimates=None,
    valuationError=None,
    ownedByCanonical={},
    ownedPrintings=[],
)
ACK = dict(requestId="r", deckId=DECK, revision="2", changes=[], removedEntryIds=[])


@pytest.fixture
def routes() -> Iterator[tuple[Any, TestClient]]:
    auth = create_autospec(SessionAuth, instance=True)
    auth.validate_session.return_value = ACTOR
    auth.require_actor.return_value = ACTOR
    decks = create_autospec(Decks, instance=True)
    defaults: dict[str, object] = dict(
        get_deck_library={"items": []},
        get_deck_library_categories={"selected": []},
        locate_deck={"offset": None},
        get_deck_snapshot=SNAPSHOT,
        create_deck_record={"id": DECK},
        get_deck_choices={"items": [], "selected": None, "nextOffset": None},
        import_text_deck=ACK,
        preview_mtg_import={"resolved": []},
        ownership=[],
        search={"hits": []},
        update_deck_card=ACK,
        remove_deck_card=ACK,
        update_deck={"id": DECK},
        delete_deck=None,
        get_deck=SNAPSHOT,
        get_deck_legality={"warnings": [], "deckDocuments": {}},
        availability={"entries": []},
        add_deck_card=ACK,
        bulk_mutate_deck_cards=ACK,
        export_decklist="Deck\n",
    )
    for method, result in defaults.items():
        getattr(decks, method).return_value = result
    app = application(create_deck_routes(auth, decks, ORIGIN), ORIGIN, auth)
    with TestClient(app, headers={"Authorization": "Bearer " + TOKEN}) as client:
        yield decks, client


def test_factory_matches_all_existing_deck_routes() -> None:
    root = Path(__file__).resolve().parents[3]
    oracle = json.loads((root / "contracts/openapi.json").read_text())
    expected = {
        (method.upper(), path)
        for path, methods in oracle["paths"].items()
        if path.startswith(BASE + "/deck")
        and not (
            path.startswith(BASE + "/decks/")
            and any(
                segment in path.split("/")
                for segment in ("categories", "whole-categories", "category-previews")
            )
        )
        and not path.endswith("/category")
        for method in methods
        if method in ("get", "post", "patch", "delete")
    }
    actual = {
        (method, r.path)
        for r in native_routes(
            create_deck_routes(
                cast(SessionAuth, create_autospec(SessionAuth)),
                cast(Decks, create_autospec(Decks)),
                ORIGIN,
            )
        )
        for method in r.methods or ()
    }
    assert actual == expected and len(actual) == 19


@pytest.mark.parametrize(
    ("method", "path", "body", "application_method"),
    [
        ("GET", "/deck-library", None, "get_deck_library"),
        ("GET", "/deck-library/categories", None, "get_deck_library_categories"),
        ("GET", "/deck-library/locate?deckId=" + DECK, None, "locate_deck"),
        ("GET", "/decks", None, "get_deck_snapshot"),
        ("POST", "/decks", dict(name="Name"), "create_deck_record"),
        ("GET", "/decks/choices", None, "get_deck_choices"),
        (
            "POST",
            "/decks/import/commit",
            dict(name="Imported", text="1 Test", requestId="r"),
            "import_text_deck",
        ),
        ("POST", "/decks/import/preview", dict(text="1 Test"), "preview_mtg_import"),
        ("GET", "/decks/ownership?canonicalCardId=a&canonicalCardId=b", None, "ownership"),
        ("GET", "/decks/search?q=Test", None, "search"),
        ("PATCH", "/deck-cards/" + ENTRY, dict(requestId="r", delta=-2), "update_deck_card"),
        ("DELETE", "/deck-cards/" + ENTRY + "?requestId=r", None, "remove_deck_card"),
        ("PATCH", "/decks/" + DECK, dict(name="Renamed"), "update_deck"),
        ("DELETE", "/decks/" + DECK, None, "delete_deck"),
        ("GET", "/decks/" + DECK, None, "get_deck_snapshot"),
        ("GET", "/decks/" + DECK + "/availability", None, "availability"),
        (
            "POST",
            "/decks/" + DECK + "/cards",
            dict(catalogCardId=ENTRY, canonicalCardId=ENTRY, name="Test", requestId="r"),
            "add_deck_card",
        ),
        (
            "POST",
            "/decks/" + DECK + "/cards/bulk",
            dict(requestId="r", operations=[dict(op="remove", target=dict(entryId=ENTRY))]),
            "bulk_mutate_deck_cards",
        ),
        ("GET", "/decks/" + DECK + "/export", None, "export_decklist"),
    ],
)
def test_every_adapter_calls_its_real_application_method(
    routes: tuple[Any, TestClient], method: str, path: str, body: object, application_method: str
) -> None:
    decks, client = routes
    response = (
        client.request(method, BASE + path, json=body)
        if body is not None
        else client.request(method, BASE + path)
    )
    assert response.status_code == 200, response.text
    operation = getattr(decks, application_method)
    operation.assert_awaited_once()
    assert operation.await_args.args[0] == ACTOR
    if application_method == "export_decklist":
        assert (
            response.text == "Deck\n"
            and response.headers["content-type"] == "text/plain; charset=utf-8"
        )
    if application_method in ("get_deck_choices", "availability") or (
        method == "GET" and path == "/decks/" + DECK
    ):
        assert response.headers["cache-control"] == "no-store"


def test_scalar_queries_select_last_and_array_queries_retain_all_values(
    routes: tuple[Any, TestClient],
) -> None:
    decks, client = routes
    response = client.get(
        BASE
        + "/deck-library?dirQ=first&dirQ=second&offset=bad&offset=1&dirCategory="
        + ENTRY
        + "&dirCategory="
        + DECK
        + "&expectedRevision=1&expectedRevision=2"
    )
    assert response.status_code == 200
    input = decks.get_deck_library.await_args.args[1]
    assert input["query"] == "second" and input["offset"] == 1
    assert input["expectedRevision"] == "2"
    assert input["categoryVersionIds"] == [ENTRY, DECK]
    assert client.get(BASE + "/decks/search?q=first&q=second").status_code == 200
    decks.search.assert_awaited_once_with(ACTOR, "second")
    assert (
        client.get(BASE + "/deck-cards/" + ENTRY + "?requestId=first&requestId=second").status_code
        == 405
    )
    assert (
        client.delete(
            BASE + "/deck-cards/" + ENTRY + "?requestId=first&requestId=second"
        ).status_code
        == 200
    )
    decks.remove_deck_card.assert_awaited_once_with(ACTOR, ENTRY, "second", "mobile")
    assert (
        client.get(BASE + "/decks/" + DECK + "/export?format=invalid&format=arena").status_code
        == 200
    )


@pytest.mark.parametrize(
    "suffix",
    [
        "?includeLegality=false",
        "?selectedOnly=true&includeLegality=false&includeLegality=false",
        "?selectedOnly=true&selectedOnly=true&includeLegality=false",
        "?includeLegality=0",
    ],
)
def test_detail_rejects_invalid_legality_flags_before_reading_deck(
    routes: tuple[Any, TestClient], suffix: str
) -> None:
    decks, client = routes
    response = client.get(BASE + "/decks/" + DECK + suffix)
    assert response.status_code == 400
    decks.get_deck_snapshot.assert_not_awaited()
    decks.get_deck.assert_not_awaited()


@pytest.mark.parametrize(
    ("query", "selected"),
    [
        ("true", True),
        ("false", False),
        ("TRUE", True),
        ("1", True),
        ("0", False),
        ("true&selectedOnly=false", False),
        ("false&selectedOnly=true", True),
        ("unexpected&selectedOnly=true", True),
    ],
)
def test_selected_only_uses_native_boolean_query_and_last_value(
    routes: tuple[Any, TestClient], query: str, selected: bool
) -> None:
    decks, client = routes
    response = client.get(BASE + "/decks/" + DECK + "?selectedOnly=" + query)
    assert response.status_code == 200
    if selected:
        decks.get_deck.assert_awaited_once_with(ACTOR, DECK)
        decks.get_deck_snapshot.assert_not_awaited()
    else:
        decks.get_deck_snapshot.assert_awaited_once_with(ACTOR, "mtg", DECK)
        decks.get_deck.assert_not_awaited()


@pytest.mark.parametrize("query", ["", "unexpected", "true&selectedOnly=unexpected"])
def test_selected_only_rejects_invalid_boolean_before_deck_read(
    routes: tuple[Any, TestClient], query: str
) -> None:
    decks, client = routes
    response = client.get(BASE + "/decks/" + DECK + "?selectedOnly=" + query)
    assert response.status_code == 400
    assert response.json() == {"status": 400, "message": "Invalid request"}
    decks.get_deck_snapshot.assert_not_awaited()
    decks.get_deck.assert_not_awaited()
    decks.get_deck_legality.assert_not_awaited()


@pytest.mark.parametrize("selected", ["true", "TRUE", "1"])
def test_selected_only_omits_legality_lookup_and_head_is_rejected(
    routes: tuple[Any, TestClient], selected: str
) -> None:
    decks, client = routes
    response = client.get(
        BASE + "/decks/" + DECK + "?selectedOnly=" + selected + "&includeLegality=false"
    )
    assert response.status_code == 200 and response.json() == SNAPSHOT
    decks.get_deck.assert_awaited_once_with(ACTOR, DECK)
    decks.get_deck_snapshot.assert_not_awaited()
    decks.get_deck_legality.assert_not_awaited()
    head = client.head(BASE + "/decks/" + DECK + "/export")
    assert head.status_code == 405 and head.content == b""
    assert head.headers["content-type"] == "application/json"


@pytest.mark.parametrize(
    ("path", "body", "message"),
    [
        ("/decks", dict(name=None), "name is required"),
        ("/decks", dict(name=1), "name must be a string"),
        ("/decks/import/preview", dict(text=None), "text must be a string"),
        (
            "/decks/" + DECK + "/cards",
            dict(name="Test"),
            "deckId, catalogCardId, canonicalCardId, and name are required",
        ),
        (
            "/decks/" + DECK + "/cards",
            dict(name="Test", catalogCardId=ENTRY, canonicalCardId=ENTRY, quantity=True),
            "quantity must be a finite number",
        ),
    ],
)
def test_json_presence_and_type_errors_match_node(
    routes: tuple[Any, TestClient], path: str, body: object, message: str
) -> None:
    _, client = routes
    response = client.post(BASE + path, json=body)
    assert response.status_code == 400 and response.json()["message"] == message


def test_patch_keeps_description_revision_delta_and_merge_preview(
    routes: tuple[Any, TestClient],
) -> None:
    decks, client = routes
    assert (
        client.patch(
            BASE + "/decks/" + DECK, json=dict(description="", descriptionRevision="3")
        ).status_code
        == 200
    )
    decks.update_deck.assert_awaited_once_with(
        ACTOR, dict(deckId=DECK, description="", descriptionRevision="3")
    )
    assert (
        client.patch(
            BASE + "/deck-cards/" + ENTRY,
            json=dict(requestId="r", delta=-2, role="sideboard", categoryPreview="token"),
        ).status_code
        == 200
    )
    decks.update_deck_card.assert_awaited_once_with(
        ACTOR, ENTRY, None, "sideboard", "r", -2, "mobile", "token"
    )


@pytest.mark.parametrize(
    ("failure", "status", "kind"),
    [
        (DeckNotFoundError(), 404, "NotFound"),
        (RequestConflictError(), 409, "RequestConflict"),
        (DeckLibraryRevisionChanged("8"), 409, "RevisionChanged"),
        (
            DescriptionConflictError(dict(description="latest", descriptionRevision="4")),
            409,
            "DescriptionConflict",
        ),
        (CategoryMergeConflict(dict(required=True)), 409, "CategoryMergeConflict"),
    ],
)
def test_domain_failures_are_public_without_shared_error_changes(
    routes: tuple[Any, TestClient], failure: Exception, status: int, kind: str
) -> None:
    decks, client = routes
    decks.get_deck_library.side_effect = failure
    response = client.get(BASE + "/deck-library")
    assert response.status_code == status and response.json()["kind"] == kind


def test_choice_queries_reject_repeated_or_unknown_keys(routes: tuple[Any, TestClient]) -> None:
    decks, client = routes
    for suffix in ("?query=one&query=two", "?unknown=x", "?limit=0"):
        assert client.get(BASE + "/decks/choices" + suffix).status_code == 400
    decks.get_deck_choices.assert_not_awaited()
