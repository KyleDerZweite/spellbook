"""All Category adapters through the actual registry, with fake application/auth seams."""

import json
from typing import cast
from unittest.mock import AsyncMock, create_autospec

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.router import RawPathRouting, RouteRegistry
from spellbook_api.http.routes_categories import create_category_routes
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
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.models import Actor

ORIGIN = "https://category.example"
ID = "00000000-0000-4000-8000-000000000001"
PREFIX = "/api/mobile/v1/mtg"
ACTOR = Actor("category-account", "category-user", "", "", "")
TOKEN = "a" * 43


class Adapters:
    def __init__(self) -> None:
        self.auth = cast(SessionAuth, create_autospec(SessionAuth, instance=True))
        self.categories = cast(Categories, create_autospec(Categories, instance=True))
        cast(AsyncMock, self.auth.validate_session).return_value = ACTOR
        self.routes = create_category_routes(self.auth, self.categories, ORIGIN)

    def client(self) -> TestClient:
        http = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
        http.mount(
            "/", RawPathRouting(RouteRegistry(self.routes, ORIGIN, self.auth, RequestAdmission()))
        )
        return TestClient(http)


CASES: list[tuple[str, str, Document | None, str, object]] = [
    (
        "GET",
        "/category-definitions?scope=entry&offset=2&limit=9",
        None,
        "get_library",
        dict(scope="entry", offset=2, limit=9),
    ),
    (
        "POST",
        "/category-definitions",
        dict(name="é", requestId=ID),
        "save_definition",
        dict(name="é", requestId=ID),
    ),
    (
        "GET",
        "/category-rule-choices?tagId="
        + ID
        + "&oracleId="
        + ID
        + "&outcomeId=2244&outcomeQuery=Infinite",
        None,
        "get_rule_choices",
        dict(
            tagQuery="",
            cardQuery="",
            outcomeQuery="Infinite",
            tagIds=[ID],
            oracleIds=[ID],
            outcomeIds=["2244"],
        ),
    ),
    (
        "POST",
        f"/category-definitions/{ID}/archive",
        dict(requestId=ID, archived=True),
        "archive_definition",
        dict(requestId=ID, archived=True, originId=ID),
    ),
    (
        "GET",
        f"/category-previews/{ID}?offset=3&limit=4",
        None,
        "get_category_preview",
        dict(previewId=ID, offset=3, limit=4),
    ),
    (
        "POST",
        f"/category-previews/{ID}/commit",
        dict(requestId=ID),
        "commit_category_change",
        dict(requestId=ID, previewId=ID),
    ),
    (
        "PATCH",
        f"/deck-cards/{ID}/category",
        dict(requestId=ID, categoryId=None, deckId=ID),
        "set_entry_category",
        dict(requestId=ID, categoryId=None, deckId=ID, entryId=ID),
    ),
    ("GET", f"/decks/{ID}/categories", None, "get_deck_entry_categories", ID),
    (
        "POST",
        f"/decks/{ID}/categories/initialize",
        dict(requestId=ID),
        "initialize_deck_categories",
        dict(requestId=ID, deckId=ID),
    ),
    (
        "POST",
        f"/decks/{ID}/categories/merge-preview",
        dict(entryId=ID, catalogCardId=ID, role="main", quantity=2),
        "preview_entry_merge",
        dict(entryId=ID, catalogCardId=ID, role="main", quantity=2, deckId=ID),
    ),
    (
        "POST",
        f"/decks/{ID}/category-previews",
        dict(requestId=ID, scope="entry", mode="Review", restoreOriginIds=[]),
        "preview_category_change",
        dict(requestId=ID, scope="entry", mode="Review", restoreOriginIds=[], deckId=ID),
    ),
    ("GET", f"/decks/{ID}/whole-categories", None, "get_deck_whole_categories", ID),
    ("GET", f"/category-definitions/{ID}", None, "get_definition", ID),
    (
        "PATCH",
        f"/decks/{ID}/whole-categories/{ID}",
        dict(requestId=ID, expectedDecisionRevision="2", manual="Include"),
        "set_whole_category",
        dict(
            requestId=ID, expectedDecisionRevision="2", manual="Include", deckId=ID, versionId=ID
        ),
    ),
    (
        "PATCH",
        f"/decks/{ID}/whole-categories/{ID}",
        dict(requestId=ID, expectedDecisionRevision="2", name="Café"),
        "rename_whole_category",
        dict(requestId=ID, expectedDecisionRevision="2", name="Café", deckId=ID, versionId=ID),
    ),
    (
        "DELETE",
        f"/decks/{ID}/whole-categories/{ID}",
        dict(requestId=ID, expectedDecisionRevision="2"),
        "remove_whole_category",
        dict(requestId=ID, expectedDecisionRevision="2", deckId=ID, versionId=ID),
    ),
    (
        "PATCH",
        f"/decks/{ID}/categories/{ID}",
        dict(name="Local", expectedDecisionRevision="2"),
        "rename_local_category",
        dict(name="Local", expectedDecisionRevision="2", deckId=ID, categoryId=ID),
    ),
    (
        "DELETE",
        f"/decks/{ID}/categories/{ID}",
        dict(replacementCategoryId=None, expectedDecisionRevision="2"),
        "remove_local_category",
        dict(replacementCategoryId=None, expectedDecisionRevision="2", deckId=ID, categoryId=ID),
    ),
]


@pytest.mark.parametrize("method,path,body,function,expected", CASES)
def test_every_route_forwards_native_contract_and_preserves_response(
    method: str, path: str, body: Document | None, function: str, expected: object
) -> None:
    adapters = Adapters()
    handler = cast(AsyncMock, getattr(adapters.categories, function))
    wire = dict(requestId=ID, categoryId=None, label="Café 😀", revision="9007199254740993")
    handler.return_value = wire
    with adapters.client() as client:
        response = client.request(
            method, PREFIX + path, json=body, headers=dict(authorization="Bearer " + TOKEN)
        )
    assert response.status_code == 200
    assert response.json() == wire
    handler.assert_awaited_once_with(ACTOR, expected)
    assert len(adapters.routes) == 17


@pytest.mark.parametrize(
    "cause,status,extra",
    [
        (CategoryNotFound(), 404, {}),
        (
            CategoryConflict(dict(decisionRevision="9")),
            409,
            dict(latest=dict(decisionRevision="9")),
        ),
        (CategoryMergeConflict(dict(required=True)), 409, dict(preview=dict(required=True))),
        (LibraryConflict(), 409, {}),
        (CategoryPreviewExpired(), 409, {}),
        (CategoryPreviewCapacity(), 503, {}),
        (CategoryUnavailable(), 503, {}),
        (RequestConflictError(), 409, {}),
    ],
)
def test_domain_failures_keep_original_status_kind_and_conflict_fields(
    cause: Exception, status: int, extra: Document
) -> None:
    adapters = Adapters()
    cast(AsyncMock, adapters.categories.get_library).side_effect = cause
    with adapters.client() as client:
        response = client.get(
            PREFIX + "/category-definitions", headers=dict(authorization="Bearer " + TOKEN)
        )
    assert response.status_code == status
    assert response.json() == dict(
        status=status,
        kind="RequestConflict"
        if isinstance(cause, RequestConflictError)
        else getattr(cause, "kind", None),
        message=str(cause),
        **extra,
    )


def test_validation_and_infrastructure_errors_remain_distinct() -> None:
    adapters = Adapters()
    with adapters.client() as client:
        cast(AsyncMock, adapters.categories.get_library).side_effect = ValidationError(
            "Invalid Library scope"
        )
        response = client.get(
            PREFIX + "/category-definitions", headers=dict(authorization="Bearer " + TOKEN)
        )
        assert response.json() == dict(status=400, message="Invalid Library scope")
        cast(AsyncMock, adapters.categories.get_library).side_effect = RuntimeError("private SQL")
        response = client.get(
            PREFIX + "/category-definitions", headers=dict(authorization="Bearer " + TOKEN)
        )
        assert response.json() == dict(status=500, message="Internal Server Error")


def test_unsupported_fields_body_cap_and_conflicting_whole_commands() -> None:
    adapters = Adapters()
    with adapters.client() as client:
        headers = dict(authorization="Bearer " + TOKEN)
        for path, body in [
            (f"/decks/{ID}/categories/initialize", dict(requestId=ID, extra=True)),
            (f"/decks/{ID}/whole-categories/{ID}", dict(name="x", manual="Include")),
        ]:
            method = "PATCH" if "whole-categories" in path else "POST"
            response = client.request(method, PREFIX + path, json=body, headers=headers)
            assert response.status_code == 400
        response = client.post(
            PREFIX + f"/decks/{ID}/categories/initialize",
            content=json.dumps(dict(requestId="x" * 17000)),
            headers={**headers, "content-type": "application/json"},
        )
        assert response.status_code == 413
        assert (
            client.get(PREFIX + "/category-definitions?limit=0", headers=headers).status_code
            == 400
        )
    cast(AsyncMock, adapters.categories.initialize_deck_categories).assert_not_awaited()


def test_named_path_decoding_auth_precedence_and_cookie_origin() -> None:
    adapters = Adapters()
    cast(AsyncMock, adapters.categories.get_definition).return_value = dict(originId=ID)
    with adapters.client() as client:
        response = client.get(
            PREFIX + "/category-definitions/%30" + ID[1:],
            headers=dict(authorization="Bearer " + TOKEN),
        )
        assert response.status_code == 200
        cast(AsyncMock, adapters.categories.get_definition).assert_awaited_once_with(ACTOR, ID)

        # Invalid explicit bearer cannot fall back to a cookie.
        async def validate(token: str | None) -> Actor | None:
            return ACTOR if token == TOKEN else None

        cast(AsyncMock, adapters.auth.validate_session).side_effect = validate
        response = client.get(
            PREFIX + "/category-definitions",
            headers=dict(authorization="bad", cookie="spellbook_session=" + TOKEN),
        )
        assert response.status_code == 401
        response = client.post(
            PREFIX + f"/decks/{ID}/categories/initialize",
            json=dict(requestId=ID),
            headers=dict(cookie="spellbook_session=" + TOKEN, origin="https://foreign.example"),
        )
        assert response.status_code == 403


def test_category_route_pairs_equal_the_frozen_openapi_contract() -> None:
    import re
    from pathlib import Path

    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts/openapi.json").read_text()
    )
    expected = {
        (method.upper(), path)
        for path, methods in schema["paths"].items()
        for method in methods
        if method in {"get", "post", "patch", "delete"}
        and ("categor" in path)
        and not path.startswith(PREFIX + "/deck-library/")
    }
    actual = {
        (route.method, re.sub(r":([A-Za-z]+)", r"{\1}", route.path)) for route in Adapters().routes
    }
    assert actual == expected


@pytest.mark.parametrize(
    "path,function,identity",
    [
        ("/category-definitions", "get_library", {}),
        (f"/category-previews/{ID}", "get_category_preview", {"previewId": ID}),
    ],
)
def test_repeated_pagination_uses_first_scalar_values(
    path: str, function: str, identity: Document
) -> None:
    adapters = Adapters()
    handler = cast(AsyncMock, getattr(adapters.categories, function))
    handler.return_value = {}
    with adapters.client() as client:
        response = client.get(
            PREFIX + path + "?offset=2&offset=bad&limit=1&limit=101",
            headers=dict(authorization="Bearer " + TOKEN),
        )
    assert response.status_code == 200
    handler.assert_awaited_once_with(ACTOR, {**identity, "offset": 2, "limit": 1})


@pytest.mark.parametrize("path", ["/category-definitions", f"/category-previews/{ID}"])
@pytest.mark.parametrize("query", ["limit=101&limit=1", "offset=bad&offset=2"])
def test_later_valid_scalar_does_not_replace_invalid_first_value(path: str, query: str) -> None:
    adapters = Adapters()
    with adapters.client() as client:
        response = client.get(
            PREFIX + path + "?" + query,
            headers=dict(authorization="Bearer " + TOKEN),
        )
    assert response.status_code == 400
    cast(AsyncMock, adapters.categories.get_library).assert_not_awaited()
    cast(AsyncMock, adapters.categories.get_category_preview).assert_not_awaited()


@pytest.mark.parametrize("scope", ["entry", ""])
def test_repeated_scope_preserves_first_value_including_empty(scope: str) -> None:
    adapters = Adapters()
    handler = cast(AsyncMock, adapters.categories.get_library)
    handler.return_value = {}
    with adapters.client() as client:
        response = client.get(
            PREFIX + "/category-definitions?scope=" + scope + "&scope=deck",
            headers=dict(authorization="Bearer " + TOKEN),
        )
    assert response.status_code == 200
    handler.assert_awaited_once_with(ACTOR, dict(scope=scope, offset=0, limit=50))


@pytest.mark.parametrize("search", ["Café", ""])
def test_repeated_rule_search_uses_first_scalars_and_retains_all_selected_ids(search: str) -> None:
    adapters = Adapters()
    handler = cast(AsyncMock, adapters.categories.get_rule_choices)
    handler.return_value = {}
    second_id = "00000000-0000-4000-8000-000000000002"
    with adapters.client() as client:
        response = client.get(
            PREFIX + "/category-rule-choices",
            params=[
                ("tagQuery", search),
                ("tagQuery", "later tag"),
                ("cardQuery", search),
                ("cardQuery", "later card"),
                ("outcomeQuery", search),
                ("outcomeQuery", "later outcome"),
                ("tagId", ID),
                ("tagId", second_id),
                ("oracleId", second_id),
                ("oracleId", ID),
                ("outcomeId", "2244"),
                ("outcomeId", "21"),
            ],
            headers=dict(authorization="Bearer " + TOKEN),
        )
    assert response.status_code == 200
    handler.assert_awaited_once_with(
        ACTOR,
        dict(
            tagQuery=search,
            cardQuery=search,
            outcomeQuery=search,
            tagIds=[ID, second_id],
            oracleIds=[second_id, ID],
            outcomeIds=["2244", "21"],
        ),
    )
