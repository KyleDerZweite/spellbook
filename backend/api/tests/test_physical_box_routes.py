"""Native Physical Box adapter contract and authentication fences."""

from unittest.mock import create_autospec

from fastapi.testclient import TestClient
from spellbook_core.mtg.physical_boxes import PhysicalBoxes
from test_auth_account import ACTOR, ORIGIN, TOKEN, Dependencies
from test_linked_devices import BEARER, device_session

from spellbook_api.http.mtg.routes_physical_boxes import BASE, create_physical_box_routes

BOX_ID = "6f107d8b-8f65-4f4e-9834-70b5d4b86612"
MISSING = "6f107d8b-8f65-4f4e-9834-70b5d4b86613"
DETAIL = f"{BASE}/{BOX_ID}"
BOX = {"id": BOX_ID, "name": "Blue", "condition": [{"field": "printedColor", "oneOf": ["blue"]}]}


def test_linked_device_can_resolve_but_cannot_manage_registry() -> None:
    dependencies = Dependencies()
    device_session(dependencies)
    boxes = create_autospec(PhysicalBoxes, instance=True)
    boxes.get.side_effect = lambda actor, box_id: BOX if box_id == BOX_ID else None
    dependencies.app.include_router(create_physical_box_routes(dependencies.auth, boxes, ORIGIN))
    with TestClient(dependencies.app) as client:
        assert client.get(DETAIL).status_code == 401
        response = client.get(DETAIL, headers=BEARER)
        assert response.status_code == 200
        assert response.json() == BOX
        assert response.headers["Cache-Control"] == "private, no-store"
        boxes.get.assert_awaited_once_with(ACTOR, BOX_ID)
        missing = client.get(f"{BASE}/{MISSING}", headers=BEARER)
        assert missing.status_code == 404
        assert missing.json() == {"message": "Physical Box not found", "status": 404}
        assert missing.headers["Cache-Control"] == "private, no-store"
        assert client.get(f"{BASE}/invalid", headers=BEARER).status_code == 400
        for method, path in (("GET", BASE), ("POST", BASE), ("PATCH", DETAIL)):
            response = client.request(method, path, headers=BEARER, json={"name": "New"})
            assert response.status_code == 403
            assert response.json()["kind"] == "DeviceSessionForbidden"
    boxes.list.assert_not_awaited()
    boxes.create.assert_not_awaited()
    boxes.update.assert_not_awaited()


def test_cookie_owner_writes_require_origin_and_scope_inputs() -> None:
    dependencies = Dependencies()
    boxes = create_autospec(PhysicalBoxes, instance=True)
    boxes.list.return_value = [BOX]
    boxes.create.return_value = {**BOX, "condition": None}
    boxes.update.return_value = {**BOX, "condition": None}
    dependencies.app.include_router(create_physical_box_routes(dependencies.auth, boxes, ORIGIN))
    with TestClient(dependencies.app, base_url=ORIGIN) as client:
        client.cookies.set("spellbook_session", TOKEN)
        assert client.get(BASE).json() == [BOX]
        assert client.post(BASE, json={"name": "Blue"}).status_code == 403
        headers = {"Origin": ORIGIN}
        response = client.post(BASE, json={"name": "Blue", "id": BOX_ID}, headers=headers)
        assert response.status_code == 400
        boxes.create.assert_not_awaited()
        created = client.post(BASE, json={"name": "Blue", "requestId": BOX_ID}, headers=headers)
        assert created.status_code == 201
        assert created.json() == {**BOX, "condition": None}
        boxes.create.assert_awaited_once_with(ACTOR, "Blue", BOX_ID)
        updated = client.patch(DETAIL, json={"condition": None}, headers=headers)
        assert updated.status_code == 200
        boxes.update.assert_awaited_once_with(ACTOR, BOX_ID, {"condition": None})
