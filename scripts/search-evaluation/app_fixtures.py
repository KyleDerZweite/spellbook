"""Create real Demo Deck destinations through the owned disposable API."""

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5

from common import ARTIFACTS, connect, write_json
from providers import seed_decks


def api(path, body=None, token=None):
    headers = {"Origin": "http://localhost:5173", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(
        Request("http://127.0.0.1:3001/api/v1" + path, data, headers), timeout=30
    ) as response:
        return json.load(response) if response.status != 204 else None


def prepare():
    with connect() as conn:
        seed_decks(conn)
        try:
            api("/mtg/decks/choices")
        except HTTPError as exc:
            assert exc.code == 401
        else:
            raise ValueError("Expected anonymous Deck access to be rejected")
        auth = api("/auth/login", {"username": "demo", "password": "demo"})
        token = auth["token"]
        try:
            account = conn.execute(
                "SELECT account_id::text FROM user_profiles WHERE username='demo'"
            ).fetchone()
            if account is None or account["account_id"] != auth["user"]["accountId"]:
                raise ValueError(
                    "The API is not using the assigned disposable Demo account"
                )
            fixtures = conn.execute(
                "SELECT id::text,name,cards FROM eval_decks WHERE account_id='owner' ORDER BY id"
            ).fetchall()
            for fixture in fixtures:
                choices = api(
                    "/mtg/decks/choices?query=" + fixture["name"].replace(" ", "%20"),
                    token=token,
                )["items"]
                selected = next(
                    (row for row in choices if row["name"] == fixture["name"]), None
                )
                if selected is None:
                    decks = api(
                        "/mtg/decks",
                        {"name": fixture["name"], "format": "Commander"},
                        token,
                    )
                    selected = next(
                        row for row in decks if row["name"] == fixture["name"]
                    )
                for card in conn.execute(
                    "SELECT id::text,document FROM eval_cards WHERE id=ANY(%s)",
                    (fixture["cards"],),
                ).fetchall():
                    doc = card["document"]
                    api(
                        f"/mtg/decks/{selected['id']}/cards",
                        {
                            "catalogCardId": doc["id"],
                            "canonicalCardId": card["id"],
                            "name": doc["name"],
                            "setCode": doc["set_code"],
                            "imageUri": doc["image_uri"],
                            "quantity": 1,
                            "role": "main",
                            "requestId": str(
                                uuid5(NAMESPACE_URL, selected["id"] + card["id"])
                            ),
                        },
                        token,
                    )
                snapshot = api("/mtg/decks?deck=" + selected["id"], token=token)
                actual = {row["canonicalCardId"] for row in snapshot["deckCards"]}
                assert {str(value) for value in fixture["cards"]} <= actual
                conn.execute(
                    "UPDATE eval_decks SET target_id=%s WHERE id=%s",
                    (selected["id"], fixture["id"]),
                )
        finally:
            api("/auth/logout", {}, token)
    result = {
        "anonymous_deck_read": 401,
        "verified_deck_destinations": len(fixtures),
        "method": "Actual Demo API create/add/snapshot; fixture session revoked afterward",
    }
    write_json(ARTIFACTS / "app-fixtures.json", result)
    print(json.dumps(result))


if __name__ == "__main__":
    prepare()
