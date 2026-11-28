"""Demo authority through the full API registry and an isolated PostgreSQL database."""

import os
import re
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock

import psycopg
import pytest
from fastapi.testclient import TestClient
from http_helpers import operations
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from spellbook_core.auth import hash_session_token
from spellbook_core.errors import AuthError
from spellbook_core.passwords import hash_password
from test_auth_account import ORIGIN

from spellbook_api.application import create_application
from spellbook_api.http.types import Configuration

ERROR = {
    "kind": "DEMO_ACCOUNT_READ_ONLY",
    "message": "The shared Demo account is read-only.",
    "status": 403,
}
READ_POSTS: dict[str, dict[str, object]] = {
    "/api/v1/mtg/catalog/search": {"query": "Forest"},
    "/api/v1/mtg/decks/token-preview": {"cards": []},
    "/api/v1/mtg/decks/import/preview": {"text": "1 Forest", "format": "Commander"},
    "/api/v1/mtg/decks/missing-export": {},
    "/api/v1/mtg/inventory/import/preview": {"text": "1 Forest"},
    "/api/v1/mtg/inventory/prices": {"entryIds": ["11111111-1111-4111-8111-111111111111"]},
}
SESSION_POSTS = {"/api/v1/auth/login", "/api/v1/web/auth/login", "/api/v1/auth/logout"}
PLACEHOLDER = "11111111-1111-4111-8111-111111111111"
PASSWORD = "ordinary-fixture-password"


def snapshot(connection: psycopg.Connection[Any]) -> dict[str, list[Any]]:
    tables = connection.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    ).fetchall()
    return {
        name: connection.execute(
            sql.SQL("SELECT row_to_json(t)::text FROM {} t ORDER BY 1").format(
                sql.Identifier(name)
            )
        ).fetchall()
        for (name,) in tables
    }


@pytest.fixture
def demo_database() -> Iterator[tuple[str, psycopg.Connection[Any]]]:
    database = os.getenv("TEST_DATABASE_URL")
    expected_database = os.getenv("DEMO_READ_ONLY_TEST_DATABASE")
    if not database or not expected_database:
        pytest.skip("Requires an explicitly assigned, migrated disposable PostgreSQL database")
    assert conninfo_to_dict(database).get("dbname") == expected_database

    with psycopg.connect(database, autocommit=True) as connection:
        assert not connection.execute(
            "SELECT 1 FROM user_profiles WHERE username = 'demo'"
        ).fetchone()
        try:
            yield database, connection
        finally:
            connection.execute("DELETE FROM user_profiles WHERE username = 'demo'")


def test_demo_writes_do_not_reach_storage_or_scan_worker(
    monkeypatch: pytest.MonkeyPatch, demo_database: tuple[str, psycopg.Connection[Any]]
) -> None:
    database, connection = demo_database
    lifetime = create_application(
        Configuration(ORIGIN, database_url=database, demo_login_enabled=True)
    )
    worker = AsyncMock()
    monkeypatch.setattr(lifetime.http.state.resources.scan_worker, "process", worker)
    api = "/api/v1"
    credentials = f"{api}/auth"
    mtg = f"{api}/mtg"
    qr = f"{credentials}/qr"

    with TestClient(lifetime.http, base_url=ORIGIN) as client:
        normal = client.post(
            f"{credentials}/register", json={"username": "demo", "password": PASSWORD}
        )
        assert normal.status_code == 201, normal.text
        account_id = normal.json()["user"]["accountId"]
        bearer = {"Authorization": "Bearer " + normal.json()["token"]}
        assert "readOnlyDemo" not in client.get(f"{credentials}/session", headers=bearer).json()
        challenge = client.post(f"{qr}/requests", json={"kind": "device"}).json()
        code = challenge["code"]
        approval = client.post(
            f"{qr}/requests/{code}/decision",
            headers=bearer,
            json={"decision": "approve", "confirmed": True},
        )
        assert approval.status_code == 200, approval.text
        deck = client.post(f"{mtg}/decks", headers=bearer, json={"name": "Prepared deck"})
        assert deck.status_code == 200, deck.text
        deck_id = deck.json()[-1]["id"]
        scan = client.post(f"{mtg}/scan/sessions", headers=bearer)
        assert scan.status_code == 200, scan.text
        scan_id = scan.json()["session"]["id"]

        connection.execute(
            "UPDATE local_credentials SET password_hash=%s WHERE account_id=%s",
            (hash_password("demo"), account_id),
        )
        login = client.post(f"{credentials}/login", json={"username": "demo", "password": "demo"})
        assert login.status_code == 200, login.text
        token = login.json()["token"]
        demo_bearer = {"Authorization": "Bearer " + token}
        demo_cookie = {"Cookie": "spellbook_session=" + token, "Origin": ORIGIN}
        # Classification still works on a cache miss while password login is at capacity.
        monkeypatch.setattr(
            lifetime.http.state.resources.passwords,
            "verify",
            AsyncMock(side_effect=AuthError("Authentication is busy. Try again shortly.")),
        )
        linked_token = "d" * 43
        connection.execute(
            "INSERT INTO auth_sessions "
            "(token_hash,account_id,expires_at,created_at,device_id,last_seen_at) "
            "VALUES (%s,%s,now()+interval '1 day',now()-interval '2 days',%s,"
            "now()-interval '2 days')",
            (hash_session_token(linked_token), account_id, PLACEHOLDER),
        )
        before = snapshot(connection)
        linked = client.get(
            f"{credentials}/session", headers={"Authorization": "Bearer " + linked_token}
        )
        assert linked.status_code == 200 and linked.json()["device"]["id"] == PLACEHOLDER
        assert linked.json()["readOnlyDemo"] is True

        for method, template in sorted(operations(lifetime.http)):
            if method not in {"POST", "PUT", "PATCH", "DELETE"} or (
                method == "POST" and (template in READ_POSTS or template in SESSION_POSTS)
            ):
                continue
            concrete = (
                template.replace("{sessionId}", scan_id)
                .replace("{deckId}", deck_id)
                .replace("{code}", code)
            )
            path = re.sub(r"\{[^}]+\}", PLACEHOLDER, concrete)
            for headers in (demo_bearer, demo_cookie):
                body_headers = {"Content-Type": "image/png"} if path.endswith("/frames") else {}
                response = client.request(
                    method, path, headers={**headers, **body_headers}, content=b"invalid body"
                )
                assert response.status_code == 403, (method, path, response.text)
                assert response.json() == ERROR, (method, path, response.text)

        assert (
            client.post(f"{mtg}/decks", headers=demo_bearer, json={"name": "Must not save"}).json()
            == ERROR
        )
        assert (
            client.post(
                f"{mtg}/scan/sessions/{scan_id}/frames",
                headers={**demo_bearer, "Content-Type": "image/png"},
                content=b"\x89PNG\r\n\x1a\nfixture",
            ).json()
            == ERROR
        )
        legacy = client.post(
            f"{qr}/token", json={"code": code, "requesterSecret": challenge["requesterSecret"]}
        )
        assert legacy.status_code == 403 and legacy.json() == ERROR
        for endpoint in (
            f"{credentials}/session",
            f"{api}/account/profile",
            f"{api}/account/devices",
            f"{mtg}/decks",
            f"{mtg}/inventory",
            f"{mtg}/physical-boxes",
            f"{mtg}/scan/sessions/{scan_id}/result",
            f"{qr}/requests/{code}",
        ):
            response = client.get(endpoint, headers=demo_bearer)
            assert response.status_code == 200, (endpoint, response.text)
        for endpoint, payload in READ_POSTS.items():
            if endpoint.endswith("/missing-export"):
                payload = {"deckIds": [deck_id]}
            response = client.post(endpoint, headers=demo_bearer, json=payload)
            # Empty Inventory is expected to return a resource-level 404 for this lookup.
            expected = 404 if endpoint.endswith("/inventory/prices") else 200
            assert response.status_code == expected, (endpoint, response.text)

        assert snapshot(connection) == before
        worker.assert_not_awaited()
        assert client.post(f"{credentials}/logout", headers=demo_bearer).status_code == 204
        assert client.get(f"{credentials}/session", headers=demo_bearer).status_code == 401
