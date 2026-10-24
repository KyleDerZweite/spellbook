"""Native routing, safe failures, authority and bounded body acceptance."""

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from http_helpers import application
from spellbook_core.auth import TokenSession
from spellbook_core.qr import Redemption
from starlette.requests import Request
from starlette.responses import Response
from test_auth_account import CODE, EXPIRES, ORIGIN, SECRET, TOKEN, Dependencies

from spellbook_api.http.errors import json_response
from spellbook_api.http.policy import HOST_BODY_BYTES


@pytest.mark.parametrize("method", ["HEAD", "OPTIONS", "TRACE", "UNKNOWN"])
def test_native_methods_and_canonical_slashes_do_not_authenticate(method: str) -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.request(method, "/api/v1/account/profile")
        assert response.status_code == 405 and response.headers["allow"] == "GET"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-robots-tag"] == "noindex, nofollow"
        response = client.get("/api/v1/account/profile/", follow_redirects=False)
        assert response.status_code == 404 and "location" not in response.headers
    d.auth.validate_session.assert_not_awaited()


def test_auth_origin_and_throttle_precede_body_decoding() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        foreign = client.post(
            "/api/v1/web/auth/login",
            content="malformed",
            headers={"Origin": "https://foreign.test", "Content-Type": "multipart/form-data"},
        )
        assert foreign.status_code == 403
        d.auth.take_auth_attempt.assert_not_called()
        denied = client.patch(
            "/api/v1/account/profile",
            content="malformed",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + "z" * 43},
        )
        assert denied.status_code == 401
        d.profile.patch.assert_not_awaited()
        malformed = client.post(
            "/api/v1/web/auth/login",
            content="malformed",
            headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data"},
        )
        assert malformed.status_code == 400
        d.auth.take_auth_attempt.assert_called_once()
        d.auth.authenticate.assert_not_awaited()


def test_duplicate_authorization_never_falls_back_to_cookie() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.get(
            "/api/v1/account/profile",
            headers=[
                ("Authorization", "Bearer " + TOKEN),
                ("Authorization", "invalid"),
                ("Cookie", "spellbook_session=" + TOKEN),
            ],
        )
        assert response.status_code == 400
    d.profile.get.assert_not_awaited()


def test_stale_cookie_cleanup_precedes_qr_session_replacement() -> None:
    d = Dependencies()
    d.auth.qr.redeem.return_value = Redemption(
        "browser", "authenticated", TokenSession(TOKEN, EXPIRES)
    )
    with TestClient(d.app) as client:
        response = client.post(
            "/api/v1/auth/qr/token",
            json={"code": CODE},
            headers={
                "Origin": ORIGIN,
                "Cookie": f"spellbook_session=stale; spellbook_qr_requester={CODE}.{SECRET}",
            },
        )
        assert response.status_code == 200
        cookies = response.headers.get_list("set-cookie")
        assert len(cookies) == 3
        assert cookies[0].startswith("spellbook_session=;")
        assert cookies[1].startswith("spellbook_session=" + TOKEN)
        assert cookies[2].startswith("spellbook_qr_requester=;")


def test_limits_validation_headers_and_unexpected_errors_are_safe() -> None:
    router = APIRouter()

    async def consume(request: Request) -> Response:
        await request.body()
        return json_response({})

    async def broken() -> Response:
        raise RuntimeError("private SQL and password")

    async def typed(number: int) -> dict[str, int]:
        return {"number": number}

    router.add_api_route("/api/body", consume, methods=["POST"])
    router.add_api_route("/api/v1/account/broken", broken, methods=["GET"])
    router.add_api_route("/api/typed/{number}", typed, methods=["GET"])
    with TestClient(application(router, ORIGIN), raise_server_exceptions=False) as client:
        response = client.post(
            "/api/body", content=b"x" * (HOST_BODY_BYTES + 1), headers={"Origin": ORIGIN}
        )
        assert response.status_code == 413
        assert response.json()["status"] == 413
        failure = client.get("/api/v1/account/broken")
        assert failure.status_code == 500 and failure.json() == {
            "status": 500,
            "message": "Internal Server Error",
        }
        assert failure.headers["cache-control"] == "no-store"
        invalid = client.get("/api/typed/password")
        assert invalid.status_code == 400 and invalid.json() == {
            "status": 400,
            "message": "Invalid request",
        }
