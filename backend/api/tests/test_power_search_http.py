"""Optional HTTP session selection, fail-closed bearer and bounded Core validation."""

from typing import cast
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from http_helpers import application
from spellbook_core.auth import SessionAuth
from spellbook_core.mtg.power_search import PowerSearch, query_parameters
from test_auth_account import ACTOR, ORIGIN, TOKEN

from spellbook_api.http.mtg.routes_power_search import create_power_search_routes


def test_optional_session_and_literal_account_parameter() -> None:
    auth = AsyncMock(spec=SessionAuth)
    search = AsyncMock(spec=PowerSearch)

    async def run(query: str, actor: object) -> dict[str, object]:
        query_parameters(query)
        return dict(
            query=query,
            accountId=ACTOR.account_id if actor else None,
            generationId=None,
            cards=[],
            inventory=[],
            decks=[],
        )

    search.search.side_effect = run
    auth.validate_session.return_value = None
    http = application(
        create_power_search_routes(cast(SessionAuth, auth), cast(PowerSearch, search)), ORIGIN
    )
    with TestClient(http) as client:
        result = client.get(
            "/api/v1/mtg/power-search", params={"query": "Sol Ring", "accountId": "forged"}
        )
        assert result.status_code == 200 and result.json()["accountId"] is None
        assert result.headers["cache-control"] == "no-store"
        for header in ("Bearer invalid", "Bearer " + TOKEN):
            assert (
                client.get(
                    "/api/v1/mtg/power-search", headers={"authorization": header}
                ).status_code
                == 401
            )
        assert (
            client.get("/api/v1/mtg/power-search", params={"query": "😀" * 151}).status_code == 400
        )
        auth.validate_session.return_value = ACTOR
        result = client.get(
            "/api/v1/mtg/power-search", headers={"cookie": "spellbook_session=" + TOKEN}
        )
        assert result.status_code == 200 and result.json()["accountId"] == ACTOR.account_id
