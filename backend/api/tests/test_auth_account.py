"""Production registry and real HTTP parsers with isolated application-boundary doubles."""

import asyncio
from typing import Any
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient
from spellbook_core.auth import Authenticated, LocalAuth, TokenSession
from spellbook_core.auth_attempts import AttemptLimiter
from spellbook_core.catalog import Catalog
from spellbook_core.errors import AuthError
from spellbook_core.inventory import Inventory
from spellbook_core.models import Actor, SessionInfo
from spellbook_core.profile import Profile, ProfileError, default_profile_card
from spellbook_core.qr import QrAuth, QrAuthError, Redemption
from spellbook_core.validation import MISSING

from spellbook_api.application import ApplicationResources, create_application
from spellbook_api.http.application import create_http_application
from spellbook_api.http.errors import HttpError
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import Configuration

ORIGIN = "https://candidate.example"
TOKEN = "a" * 43
CODE = "b" * 43
SECRET = "c" * 43
EXPIRES = "2099-01-01T00:00:00.000Z"
ACTOR = Actor("fixture-account", "alice", "", "wizard", "grove")


class Dependencies:
    def __init__(self, *, demo_mode: bool = False, trusted: tuple[str, ...] = ()) -> None:
        self.auth: Any = create_autospec(LocalAuth, instance=True)
        self.auth.qr = create_autospec(QrAuth, instance=True)
        self.auth.demo_mode = demo_mode
        self.auth.validate_session.side_effect = lambda token: ACTOR if token == TOKEN else None
        self.auth.require_actor.return_value = ACTOR
        self.auth.inspect_session.return_value = SessionInfo(ACTOR, EXPIRES)
        self.auth.authenticate.return_value = Authenticated(ACTOR, TokenSession(TOKEN, EXPIRES))
        self.auth.change_password.return_value = TokenSession(TOKEN, EXPIRES)
        self.auth.qr.create.side_effect = lambda kind, address: {
            "code": CODE,
            "kind": kind,
            "requesterSecret": SECRET,
            "expiresAt": EXPIRES,
            "interval": 3,
        }
        self.auth.qr.inspect.return_value = {
            "code": CODE,
            "kind": "browser",
            "status": "pending",
            "expiresAt": EXPIRES,
        }
        self.auth.qr.decide.return_value = {
            "code": CODE,
            "kind": "device",
            "status": "approved",
            "expiresAt": EXPIRES,
        }
        self.auth.qr.redeem.return_value = Redemption("device", "pending")
        self.profile: Any = create_autospec(Profile, instance=True)
        self.settings = {
            "user": ACTOR.to_dto(),
            "card": default_profile_card("alice"),
            "totals": None,
            "statsError": "unavailable",
        }
        self.profile.get.return_value = self.settings
        self.profile.patch.return_value = self.settings
        self.app = create_http_application(
            Configuration(ORIGIN, demo_mode=demo_mode, trusted_proxy_addresses=trusted),
            auth=self.auth,
            profile=self.profile,
            catalog=create_autospec(Catalog, instance=True),
            inventory=create_autospec(Inventory, instance=True),
            saved_routes=create_autospec(SavedStateRoutes, instance=True),
        )


@pytest.mark.parametrize("mode,status", [("login", 200), ("register", 201)])
def test_json_credentials_are_registered_without_cookie_or_envelope_drift(
    mode: str, status: int
) -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.post(
            "/api/auth/" + mode,
            json={"username": " ALICE ", "password": "functional-password", "artworkId": None},
        )
    assert response.status_code == status
    assert response.json() == {"user": ACTOR.to_dto(), "token": TOKEN, "expiresAt": EXPIRES}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    assert "set-cookie" not in response.headers
    d.auth.authenticate.assert_awaited_once_with(
        mode, " ALICE ", "functional-password", {"artworkId": None}
    )
    d.auth.take_auth_attempt.assert_called_once_with("testclient")


@pytest.mark.parametrize(
    "mode,status,message",
    [
        ("login", 401, "Invalid username or password"),
        ("register", 400, "Unable to create an account with those details"),
    ],
)
def test_json_credential_failure_and_foreign_origin(mode: str, status: int, message: str) -> None:
    d = Dependencies()
    d.auth.authenticate.return_value = None
    with TestClient(d.app) as client:
        denied = client.post("/api/auth/" + mode, json={}, headers={"Origin": "null"})
        assert denied.status_code == 403
        d.auth.take_auth_attempt.assert_not_called()
        response = client.post("/api/auth/" + mode, json={})
    assert response.status_code == status
    assert response.json() == {"status": status, "message": message}


def test_forms_take_attempt_before_decoding_preserve_first_values_and_safe_draft() -> None:
    d = Dependencies()
    limiter = AttemptLimiter(20)
    d.auth.take_auth_attempt.side_effect = limiter.take
    d.auth.authenticate.return_value = None
    with TestClient(d.app) as client:
        response = client.post(
            "/api/web/v1/auth/register",
            content="username=%F0%9F%94%AE&username=second&password=x&artworkId=tide",
            headers={"Origin": ORIGIN, "Content-Type": "application/x-www-form-urlencoded"},
        )
        assert response.status_code == 400
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "message": "Unable to create an account with those details.",
            "username": "🔮",
            "artworkId": "tide",
        }
        assert "password" not in response.text
        d.auth.authenticate.assert_awaited_once_with("register", "🔮", "x", {"artworkId": "tide"})
        for _ in range(19):
            assert (
                client.post(
                    "/api/web/v1/auth/login",
                    content="bad",
                    headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data"},
                ).status_code
                == 400
            )
        limited = client.post(
            "/api/web/v1/auth/login",
            content="bad",
            headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data"},
        )
        assert limited.status_code == 429
        assert limited.json()["message"] == "Too many attempts. Try again in 15 minutes."
    assert d.auth.authenticate.await_count == 1


def test_multipart_form_string_and_file_entries_and_missing_origin() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        forbidden = client.post(
            "/api/web/v1/auth/login", data={"username": "alice", "password": "secret"}
        )
        assert forbidden.status_code == 403
        d.auth.take_auth_attempt.assert_not_called()
        response = client.post(
            "/api/web/v1/auth/login",
            files=[("username", (None, "alice")), ("password", (None, "functional-password"))],
            headers={"Origin": ORIGIN},
        )
        assert response.status_code == 200
        d.auth.authenticate.assert_awaited_once_with("login", "alice", "functional-password", {})
        d.auth.authenticate.reset_mock()
        d.auth.authenticate.return_value = None
        response = client.post(
            "/api/web/v1/auth/login",
            files={
                "username": ("account.txt", b"alice"),
                "password": (None, "functional-password"),
            },
            headers={"Origin": ORIGIN},
        )
        assert response.status_code == 400 and response.json()["username"] == ""
        assert not isinstance(d.auth.authenticate.call_args.args[1], str)
        d.auth.authenticate.reset_mock()
        empty = client.post(
            "/api/web/v1/auth/login",
            content=b"--empty--\r\n",
            headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data; boundary=empty"},
        )
        assert empty.status_code == 400
        assert empty.json() == {"message": "Invalid username or password.", "username": ""}
        d.auth.authenticate.assert_awaited_once_with("login", None, None, {})


def test_logout_explicit_bearer_only_and_native_bodyless_exception() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.post("/api/auth/logout", headers={"Authorization": "Bearer " + TOKEN})
        assert response.status_code == 204 and response.content == b""
        d.auth.revoke_session.assert_awaited_once_with(TOKEN)
        denied = client.post(
            "/api/auth/logout", headers={"Authorization": "Bearer " + TOKEN, "Origin": "null"}
        )
        assert denied.status_code == 403
        cookie = client.post(
            "/api/auth/logout", headers={"Cookie": "spellbook_session=" + TOKEN, "Origin": ORIGIN}
        )
        assert cookie.status_code == 401 and cookie.json()["message"] == "Bearer token required"
        malformed = client.post(
            "/api/auth/logout", headers={"Authorization": "invalid", "Origin": ORIGIN}
        )
        assert malformed.status_code == 401


def test_profile_patch_error_shape_and_explicit_bearer_precedence() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        profile = client.get("/api/account/profile", headers={"Authorization": "Bearer " + TOKEN})
        assert profile.json() == d.settings
        d.profile.patch.side_effect = ProfileError(
            "Check the card fields and try again.",
            {"toughness": "Fill both Power and Toughness, or leave both empty."},
        )
        error = client.patch(
            "/api/account/profile",
            json={"profileCard": {"power": "1"}},
            headers={"Authorization": "Bearer " + TOKEN},
        )
        assert error.status_code == 400
        assert error.json() == {
            "kind": "ValidationFailed",
            "message": "Check the card fields and try again.",
            "fields": {"toughness": "Fill both Power and Toughness, or leave both empty."},
        }
        assert error.headers["cache-control"] == "no-store"
        invalid = client.get(
            "/api/account/profile",
            headers={"Cookie": "spellbook_session=" + TOKEN, "Authorization": "invalid"},
        )
        assert invalid.status_code == 401 and invalid.json()["message"] == "Invalid bearer token"
        d.profile.patch.reset_mock()
        denied = client.patch(
            "/api/account/profile", json={}, headers={"Cookie": "spellbook_session=" + TOKEN}
        )
        assert denied.status_code == 403
        d.profile.patch.assert_not_awaited()


@pytest.mark.parametrize("bearer", [True, False])
def test_password_rotation_cookie_selection_and_field_rejection(bearer: bool) -> None:
    d = Dependencies()
    headers = (
        {"Authorization": "Bearer " + TOKEN}
        if bearer
        else {"Cookie": "spellbook_session=" + TOKEN, "Origin": ORIGIN}
    )
    with TestClient(d.app) as client:
        response = client.post(
            "/api/account/password",
            json={"currentPassword": "old-password", "newPassword": "new-password"},
            headers=headers,
        )
        assert response.status_code == 200 and response.json() == {
            "token": TOKEN,
            "expiresAt": EXPIRES,
        }
        assert ("set-cookie" in response.headers) is not bearer
        bad = client.post(
            "/api/account/password",
            json={"currentPassword": None, "newPassword": "new-password"},
            headers=headers,
        )
        assert bad.status_code == 400 and bad.json()["message"] == "Invalid password fields"
        d.auth.change_password.return_value = None
        wrong = client.post(
            "/api/account/password",
            json={"currentPassword": "old", "newPassword": "new-password"},
            headers=headers,
        )
        assert (
            wrong.status_code == 400
            and wrong.json()["message"] == "Unable to change password with those details"
        )


def test_native_password_bridge_retains_errors_never_passwords_and_demo_is_immutable() -> None:
    d = Dependencies()
    headers = {"Cookie": "spellbook_session=" + TOKEN, "Origin": ORIGIN}
    with TestClient(d.app) as client:
        invalid = client.post(
            "/api/web/v1/password",
            data={"currentPassword": "", "newPassword": "short", "confirmPassword": "different"},
            headers=headers,
        )
        assert invalid.status_code == 400
        assert set(invalid.json()["errors"]) == {
            "currentPassword",
            "newPassword",
            "confirmPassword",
        }
        assert "short" not in invalid.text and "different" not in invalid.text
        d.auth.change_password.assert_not_awaited()
        valid = {
            "currentPassword": "old-password",
            "newPassword": "new-valid-password",
            "confirmPassword": "new-valid-password",
        }
        success = client.post("/api/web/v1/password", data=valid, headers=headers)
        assert success.json() == {"success": True, "token": TOKEN, "expiresAt": EXPIRES}
        assert "Max-Age=2592000; HttpOnly; SameSite=Lax; Secure" in success.headers["set-cookie"]
        d.auth.change_password.return_value = None
        wrong = client.post("/api/web/v1/password", data=valid, headers=headers)
        assert wrong.json()["errors"] == {
            "currentPassword": "Enter your current password and try again."
        }
    demo = Dependencies(demo_mode=True)
    with TestClient(demo.app) as client:
        response = client.post("/api/web/v1/password", data={}, headers=headers)
    assert response.status_code == 403
    demo.auth.take_auth_attempt.assert_not_called()


def test_qr_browser_cookie_secrecy_order_and_terminal_cleanup() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.post(
            "/api/auth/qr/requests", json={"kind": "browser"}, headers={"Origin": ORIGIN}
        )
        assert response.status_code == 201
        assert response.json() == {
            "code": CODE,
            "kind": "browser",
            "expiresAt": EXPIRES,
            "interval": 3,
            "verificationUri": ORIGIN + "/auth/approve?code=" + CODE,
        }
        assert SECRET not in response.text
        assert response.headers["set-cookie"] == (
            f"spellbook_qr_requester={CODE}.{SECRET}; Path=/api/auth/qr; "
            "Max-Age=300; HttpOnly; SameSite=Lax; Secure"
        )
        d.auth.qr.redeem.return_value = Redemption(
            "browser", "authenticated", TokenSession(TOKEN, EXPIRES)
        )
        authenticated = client.post(
            "/api/auth/qr/token",
            json={"code": CODE},
            headers={
                "Origin": ORIGIN,
                "Cookie": f"spellbook_session=stale; spellbook_qr_requester={CODE}.{SECRET}",
            },
        )
        assert authenticated.json() == {"status": "authenticated", "expiresAt": EXPIRES}
        cookies = authenticated.headers.get_list("set-cookie")
        assert len(cookies) == 3
        assert cookies[0].startswith("spellbook_session=; ")
        assert cookies[1].startswith("spellbook_session=" + TOKEN)
        assert cookies[2].startswith("spellbook_qr_requester=; ")
        requester = d.auth.qr.redeem.call_args.args[1]
        assert requester.requester_secret is MISSING and requester.browser_secret == SECRET
        d.auth.qr.redeem.return_value = Redemption("browser", "expired")
        expired = client.post(
            "/api/auth/qr/token",
            json={"code": CODE},
            headers={"Origin": ORIGIN, "Cookie": f"spellbook_qr_requester={CODE}.{SECRET}"},
        )
        assert expired.json() == {"status": "expired"}
        assert expired.headers["set-cookie"].startswith("spellbook_qr_requester=;")


def test_qr_device_has_private_token_and_domain_errors_keep_kind_without_status_field() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        created = client.post("/api/auth/qr/requests", json={"kind": "device"})
        assert created.status_code == 201 and created.json()["requesterSecret"] == SECRET
        assert "set-cookie" not in created.headers
        d.auth.qr.redeem.return_value = Redemption(
            "device", "authenticated", TokenSession(TOKEN, EXPIRES)
        )
        redeemed = client.post(
            "/api/auth/qr/token", json={"code": CODE, "requesterSecret": SECRET}
        )
        assert redeemed.json() == {"status": "authenticated", "expiresAt": EXPIRES, "token": TOKEN}
        assert "set-cookie" not in redeemed.headers
        d.auth.qr.redeem.side_effect = QrAuthError(
            "Unauthenticated", "Invalid requester credentials"
        )
        error = client.post("/api/auth/qr/token", json={"code": CODE, "requesterSecret": SECRET})
        assert error.status_code == 401 and error.json() == {
            "kind": "Unauthenticated",
            "message": "Invalid requester credentials",
        }
        null_secret = client.post(
            "/api/auth/qr/token", json={"code": CODE, "requesterSecret": None}
        )
        assert null_secret.status_code == 400
        assert null_secret.json() == {"status": 400, "message": "Invalid requester secret"}


@pytest.mark.parametrize("operation", ["inspect", "decide"])
def test_qr_signed_in_routes_decode_code_once_and_require_explicit_decision(
    operation: str,
) -> None:
    d = Dependencies()
    headers = {"Authorization": "Bearer " + TOKEN}
    with TestClient(d.app) as client:
        if operation == "inspect":
            response = client.get("/api/auth/qr/requests/" + CODE, headers=headers)
            d.auth.qr.inspect.assert_awaited_once_with(ACTOR, CODE, "testclient")
        else:
            response = client.post(
                "/api/auth/qr/requests/" + CODE + "/decision",
                json={"decision": "approve"},
                headers=headers,
            )
            d.auth.qr.decide.assert_awaited_once_with(ACTOR, CODE, "approve", "testclient")
        assert response.status_code == 200
        encoded = client.get("/api/auth/qr/requests/%62" + CODE[1:], headers=headers)
        assert encoded.status_code == 200
        d.auth.qr.inspect.assert_awaited_with(ACTOR, CODE, "testclient")
        invalid = client.get("/api/auth/qr/requests/%2562" + CODE[1:], headers=headers)
        assert invalid.status_code == 400 and invalid.json()["message"] == "Invalid QR code"


def test_auth_busy_and_predecode_proxy_address_limits() -> None:
    d = Dependencies(trusted=("127.0.0.1",))
    with TestClient(d.app, client=("127.0.0.1", 1234)) as client:
        client.post(
            "/api/auth/login", json={}, headers={"X-Spellbook-Client-Address": "::ffff:192.0.2.1"}
        )
        d.auth.take_auth_attempt.assert_called_with("192.0.2.1")
        client.post(
            "/api/auth/login",
            json={},
            headers={
                "X-Spellbook-Client-Address": "192.0.2.1, 192.0.2.2",
                "X-Forwarded-For": "192.0.2.3",
            },
        )
        d.auth.take_auth_attempt.assert_called_with("127.0.0.1")
        d.auth.authenticate.side_effect = AuthError("Authentication is busy. Try again shortly.")
        busy = client.post("/api/auth/login", json={})
        assert busy.status_code == 429
    with TestClient(d.app, client=("192.0.2.8", 1234)) as client:
        client.post(
            "/api/auth/login", json={}, headers={"X-Spellbook-Client-Address": "192.0.2.1"}
        )
        d.auth.take_auth_attempt.assert_called_with("192.0.2.8")


def test_production_factory_registers_auth_and_profile_without_starting_database() -> None:
    lifetime = create_application(
        Configuration(ORIGIN, database_url="postgresql://localhost/unused-fixture")
    )
    resources: ApplicationResources = lifetime.http.state.resources
    assert isinstance(resources.auth, LocalAuth) and isinstance(resources.profile, Profile)
    client = TestClient(lifetime.http)
    try:
        # Construction owns no opened pool. Validation must reject before any SQL.
        response = client.post("/api/auth/login", json={"username": None, "password": None})
        assert (
            response.status_code == 401
            and response.json()["message"] == "Invalid username or password"
        )
        for path in ("/api/account/profile", "/api/auth/session"):
            response = client.get(path)
            assert (
                response.status_code == 401
                and response.json()["message"] == "Authentication required"
            )
        options = client.options("/api/account/profile")
        assert (
            options.status_code == 204 and options.headers["allow"] == "GET, HEAD, PATCH, OPTIONS"
        )
    finally:
        client.close()
    asyncio.run(lifetime.close())


def test_trusted_proxy_configuration_rejects_chains_and_keeps_valid_ipv6_forms() -> None:
    config = Configuration.from_environment(
        {
            "APP_ORIGIN": ORIGIN,
            "DEMO_MODE": "true",
            "API_TRUSTED_PROXY_ADDRESSES": " ::ffff:192.0.2.1, ::ffff:c000:201, ::1 ",
        }
    )
    assert config.demo_mode
    assert config.trusted_proxy_addresses == ("192.0.2.1", "::ffff:c000:201", "::1")
    with pytest.raises(ValueError, match="IP addresses only"):
        Configuration.from_environment(
            {"APP_ORIGIN": ORIGIN, "API_TRUSTED_PROXY_ADDRESSES": "localhost"}
        )


def test_qr_browser_origin_and_existing_session_conflicts_precede_creation() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        for headers in ({}, {"Origin": "null"}, {"Origin": "https://foreign.example"}):
            response = client.post(
                "/api/auth/qr/requests", json={"kind": "browser"}, headers=headers
            )
            assert response.status_code == 403
        signed_in = client.post(
            "/api/auth/qr/requests",
            json={"kind": "browser"},
            headers={"Origin": ORIGIN, "Cookie": "spellbook_session=" + TOKEN},
        )
        assert signed_in.status_code == 409
        assert signed_in.json() == {"status": 409, "message": "This browser is already signed in."}
    d.auth.qr.create.assert_not_awaited()


@pytest.mark.parametrize(
    "body,status,message",
    [
        ({"kind": "device", "accountId": "forged"}, 400, "Unknown QR fields"),
        ({"kind": None}, 400, "Invalid QR kind"),
        ({"kind": "x" * 1100}, 413, "Request body exceeds the size limit"),
    ],
)
def test_qr_creation_rejects_unknown_fields_and_oversized_inputs(
    body: dict[str, object], status: int, message: str
) -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        response = client.post("/api/auth/qr/requests", json=body)
    assert response.status_code == status
    assert response.json() == {"status": status, "message": message}
    assert response.headers["cache-control"] == "no-store"
    d.auth.qr.create.assert_not_awaited()


@pytest.mark.parametrize("mode", ["login", "register"])
@pytest.mark.parametrize(
    "encoding,payload,expected",
    [
        ("quoted-printable", b"functional=20password", "functional=20password"),
        ("base64", b"ZnVuY3Rpb25hbCBwYXNzd29yZA==", "functional password"),
        ("8bit", b"functional=20password", "functional=20password"),
        ("BASE64", b"ZnVuY3Rpb25hbCBwYXNzd29yZA==", "ZnVuY3Rpb25hbCBwYXNzd29yZA=="),
    ],
)
def test_multipart_credentials_match_node_transfer_encoding(
    mode: str, encoding: str, payload: bytes, expected: str
) -> None:
    d = Dependencies()
    raw = (
        b'--test\r\nContent-Disposition: form-data; name="username"\r\n\r\nalice\r\n'
        b'--test\r\nContent-Disposition: form-data; name="password"\r\n'
        b"Content-Transfer-Encoding: " + encoding.encode() + b"\r\n\r\n" + payload + b"\r\n"
        b'--test\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecond\r\n'
        b"--test--\r\n"
    )
    with TestClient(d.app) as client:
        response = client.post(
            "/api/web/v1/auth/" + mode,
            content=raw,
            headers={"Origin": ORIGIN, "Content-Type": "multipart/form-data; boundary=test"},
        )
    assert response.status_code == 200
    d.auth.authenticate.assert_awaited_once_with(mode, "alice", expected, {})
    d.auth.take_auth_attempt.assert_called_once_with("testclient")


def test_multipart_literal_bytes_keep_utf8_replacement_and_file_content() -> None:
    from starlette.requests import Request
    from starlette.types import Message

    from spellbook_api.http.parsing import FormFile, read_form_data

    async def scenario() -> None:
        raw = (
            b'--test\r\nContent-Disposition: form-data; name="text"\r\n'
            b"Content-Transfer-Encoding: quoted-printable\r\n\r\n\xff=20\r\n"
            b'--test\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\n'
            b"Content-Transfer-Encoding: 8bit\r\n\r\n\xff=20\r\n--test--\r\n"
        )

        async def receive() -> Message:
            return {"type": "http.request", "body": raw}

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "headers": [
                    (b"content-type", b"multipart/form-data; boundary=test"),
                    (b"content-length", str(len(raw)).encode()),
                ],
            },
            receive,
        )
        assert await read_form_data(request) == {
            "text": "\ufffd=20",
            "file": FormFile("test.bin", b"\xff=20"),
        }
        with pytest.raises(HttpError, match="Request body exceeds"):
            await read_form_data(Request(request.scope, receive), max_bytes=1)

    asyncio.run(scenario())
