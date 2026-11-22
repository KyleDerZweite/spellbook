"""Linked device HTTP contract with application-boundary doubles."""

from typing import Literal

import pytest
from fastapi.testclient import TestClient
from spellbook_core.devices import DeviceSessionError
from spellbook_core.models import SessionDevice, SessionInfo
from spellbook_core.qr import QrAuthError
from test_auth_account import ACTOR, CODE, EXPIRES, ORIGIN, TOKEN, Dependencies

BEARER = {"Authorization": f"Bearer {TOKEN}"}
DEVICE_ID = "6f1c2b8e-4c1a-4d8e-9b2f-0a1b2c3d4e5f"
DEVICE = {
    "id": DEVICE_ID,
    "name": "Cardstation",
    "type": "cardstation",
    "createdAt": EXPIRES,
    "lastSeenAt": EXPIRES,
    "expiresAt": EXPIRES,
}


def device_session(d: Dependencies) -> None:
    session = SessionInfo(ACTOR, EXPIRES, SessionDevice(DEVICE_ID, "Cardstation", "cardstation"))
    d.auth.actor_session.return_value = session
    d.auth.inspect_session.return_value = session


def test_session_reports_device_identity_or_null() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        assert client.get("/api/v1/auth/session", headers=BEARER).json()["device"] is None
        device_session(d)
        assert client.get("/api/v1/auth/session", headers=BEARER).json() == {
            "user": ACTOR.to_dto(),
            "expiresAt": EXPIRES,
            "device": {"id": DEVICE_ID, "name": "Cardstation", "type": "cardstation"},
        }


def test_qr_device_metadata_reaches_core_and_unknown_fields_stay_rejected() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        created = client.post(
            "/api/v1/auth/qr/requests",
            json={"kind": "device", "deviceName": " Station ", "deviceType": "cardstation"},
        )
        assert created.status_code == 201
        d.auth.qr.create.assert_awaited_once_with(
            "device", "testclient", " Station ", "cardstation"
        )
        unknown = client.post(
            "/api/v1/auth/qr/requests", json={"kind": "device", "deviceSerial": "x"}
        )
        assert unknown.status_code == 400


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("POST", "/api/v1/account/password", {"currentPassword": "a", "newPassword": "b"}),
        ("POST", f"/api/v1/auth/qr/requests/{CODE}/decision", {"decision": "approve"}),
        ("GET", "/api/v1/account/devices", None),
        ("PATCH", f"/api/v1/account/devices/{DEVICE_ID}", {"name": "New"}),
        ("DELETE", f"/api/v1/account/devices/{DEVICE_ID}", None),
    ],
)
def test_device_sessions_are_forbidden_on_owner_operations(
    method: str, path: str, body: dict[str, str] | None
) -> None:
    d = Dependencies()
    device_session(d)
    with TestClient(d.app) as client:
        response = client.request(method, path, json=body, headers=BEARER)
    assert response.status_code == 403
    assert response.json()["kind"] == "DeviceSessionForbidden"
    d.auth.change_password.assert_not_awaited()
    d.auth.qr.decide.assert_not_awaited()
    d.auth.devices.list.assert_not_awaited()
    d.auth.devices.rename.assert_not_awaited()
    d.auth.devices.revoke.assert_not_awaited()


def test_device_session_password_form_is_forbidden_and_inspect_is_allowed() -> None:
    d = Dependencies()
    device_session(d)
    with TestClient(d.app) as client:
        form = client.post(
            "/api/v1/web/password",
            content="currentPassword=a&newPassword=b&confirmPassword=b",
            headers={
                **BEARER,
                "Origin": ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        assert form.status_code == 403
        assert form.json()["kind"] == "DeviceSessionForbidden"
        inspect = client.get(f"/api/v1/auth/qr/requests/{CODE}", headers=BEARER)
        assert inspect.status_code == 200


def test_list_rename_and_revoke_linked_devices() -> None:
    d = Dependencies()
    d.auth.devices.list.return_value = {"devices": [DEVICE]}
    d.auth.devices.rename.return_value = {**DEVICE, "name": "Desk"}
    with TestClient(d.app) as client:
        listed = client.get("/api/v1/account/devices", headers=BEARER)
        assert listed.status_code == 200
        assert listed.headers["cache-control"] == "no-store"
        assert listed.json() == {"devices": [DEVICE]}
        renamed = client.patch(
            f"/api/v1/account/devices/{DEVICE_ID}", json={"name": "Desk"}, headers=BEARER
        )
        assert renamed.json()["name"] == "Desk"
        d.auth.devices.rename.assert_awaited_once_with(ACTOR, DEVICE_ID, "Desk")
        extra = client.patch(
            f"/api/v1/account/devices/{DEVICE_ID}",
            json={"name": "Desk", "type": "other"},
            headers=BEARER,
        )
        assert extra.status_code == 400
        # Native bearer clients may revoke without Origin or a body.
        revoked = client.delete(f"/api/v1/account/devices/{DEVICE_ID}", headers=BEARER)
        assert revoked.status_code == 204
        d.auth.devices.revoke.assert_awaited_once_with(ACTOR, DEVICE_ID)
        cookie = client.delete(
            f"/api/v1/account/devices/{DEVICE_ID}",
            headers={"Cookie": f"spellbook_session={TOKEN}"},
        )
        assert cookie.status_code == 403


@pytest.mark.parametrize("kind,status", [("NotFound", 404), ("ValidationFailed", 400)])
def test_device_domain_errors_keep_kind_and_status(
    kind: Literal["NotFound", "ValidationFailed"], status: int
) -> None:
    d = Dependencies()
    d.auth.devices.rename.side_effect = DeviceSessionError(kind, "failure")
    d.auth.devices.revoke.side_effect = DeviceSessionError(kind, "failure")
    with TestClient(d.app) as client:
        renamed = client.patch(
            f"/api/v1/account/devices/{DEVICE_ID}", json={"name": "x"}, headers=BEARER
        )
        revoked = client.delete(f"/api/v1/account/devices/{DEVICE_ID}", headers=BEARER)
    for response in (renamed, revoked):
        assert response.status_code == status
        assert response.json() == {"kind": kind, "message": "failure", "status": status}


def test_device_confirmation_is_forwarded_and_type_checked() -> None:
    d = Dependencies()
    with TestClient(d.app) as client:
        path = f"/api/v1/auth/qr/requests/{CODE}/decision"
        ok = client.post(path, json={"decision": "approve", "confirmed": True}, headers=BEARER)
        assert ok.status_code == 200
        d.auth.qr.decide.assert_awaited_once_with(ACTOR, CODE, "approve", "testclient", True)
        bad = client.post(path, json={"decision": "approve", "confirmed": "yes"}, headers=BEARER)
        assert bad.status_code == 400
        d.auth.qr.decide.side_effect = QrAuthError("ConfirmationRequired", "Confirm it.")
        required = client.post(path, json={"decision": "approve"}, headers=BEARER)
    assert required.status_code == 400
    assert required.json() == {
        "kind": "ConfirmationRequired",
        "message": "Confirm it.",
        "status": 400,
    }
