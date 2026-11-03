"""Actual two-account HTTP scope checks and local global-search timings."""

import hashlib
import json
import secrets
import statistics
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, uuid4, uuid5

from app_fixtures import api, prepare
from common import ARTIFACTS, connect, write_json
from runner import percentile


def main():
    prepare()
    owner = api("/auth/login", {"username": "demo", "password": "demo"})
    token = owner["token"]
    other_issued = False
    other_token = secrets.token_urlsafe(32)
    other = str(uuid4())
    other_username = "power_search_fixture_" + other[:8]
    evidence = {"checks": [], "observations": []}
    try:
        with connect() as conn:
            account = conn.execute(
                "SELECT account_id FROM user_profiles WHERE username='demo'"
            ).fetchone()["account_id"]
            if account != owner["user"]["accountId"]:
                raise ValueError(
                    "The API is not using the assigned disposable Demo database"
                )
            # Session fixtures use the real HTTP SessionAuth issuer, never a forged Actor.
            conn.execute(
                "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s) "
                "ON CONFLICT(account_id) DO NOTHING",
                (other, other_username),
            )
            conn.execute(
                "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                (
                    hashlib.sha256(other_token.encode()).hexdigest(),
                    other,
                    datetime.now(UTC) + timedelta(hours=1),
                ),
            )
            other_issued = True
            sol = conn.execute(
                "SELECT id::text,document FROM eval_cards WHERE name='Sol Ring'"
            ).fetchone()
        for actor_token, request_key, quantity in [
            (token, "owner", 3),
            (other_token, "other", 1),
        ]:
            api(
                "/mtg/inventory",
                {
                    "requestId": str(
                        uuid5(
                            NAMESPACE_URL,
                            "power-search-real-sol-inventory"
                            if request_key == "owner"
                            else "power-search-other-inventory",
                        )
                    ),
                    "source": "mobile",
                    "items": [
                        {
                            "catalogCardId": sol["document"]["id"],
                            "quantity": quantity,
                            "finish": "nonfoil",
                            "condition": "NM",
                        }
                    ],
                },
                actor_token,
            )
        choices = api(
            "/mtg/decks/choices?query=Private%20search%20verification",
            token=other_token,
        )["items"]
        selected = next(
            (d for d in choices if d["name"] == "Private search verification"), None
        )
        if selected is None:
            decks = api(
                "/mtg/decks",
                {"name": "Private search verification", "format": "Commander"},
                other_token,
            )
            selected = next(
                d for d in decks if d["name"] == "Private search verification"
            )
        api(
            f"/mtg/decks/{selected['id']}/cards",
            {
                "catalogCardId": sol["document"]["id"],
                "canonicalCardId": sol["id"],
                "name": "Sol Ring",
                "setCode": sol["document"]["set_code"],
                "imageUri": sol["document"]["image_uri"],
                "quantity": 1,
                "role": "main",
                "requestId": str(uuid5(NAMESPACE_URL, "power-search-other-deck-card")),
            },
            other_token,
        )
        guest = api("/mtg/power-search?query=Sol%20Ring")
        first = api("/mtg/power-search?query=Sol%20Ring", token=token)
        second = api("/mtg/power-search?query=Sol%20Ring", token=other_token)
        assert (
            guest["accountId"] is None and not guest["inventory"] and not guest["decks"]
        )
        assert first["accountId"] == account and second["accountId"] == other
        assert (
            first["cards"][0]["canonicalCardId"]
            == first["inventory"][0]["canonicalCardId"]
            == sol["id"]
        )
        assert any(d.get("deckName") == "Elven Expedition" for d in first["decks"])
        assert not any(
            d.get("deckName") == "Private search verification" for d in first["decks"]
        )
        assert second["inventory"][0]["quantity"] == 1
        assert [d.get("deckName") for d in second["decks"]] == [
            "Private search verification"
        ]
        forged = api(
            "/mtg/power-search?" + urlencode({"query": "Sol Ring", "accountId": other}),
            token=token,
        )
        assert forged == first
        evidence["checks"] += [
            "Real guest HTTP response contains no private rows",
            "Two fixture sessions validated by real HTTP SessionAuth isolate Inventory and Deck rows",
            "Supplied accountId cannot change private scope",
            "A real canonical card occurs in all three sources and multiple owner Decks",
        ]
        queries = [
            "Sol Ring",
            "sol ri",
            "llan el",
            "solring",
            "rystic study",
            "draw cards",
            "so",
            "draw",
        ]
        for query in queries:
            path = "/mtg/power-search?" + urlencode({"query": query})
            for name, credential in [("guest", None), ("owner", token)]:
                api(path, token=credential)
                for trial in range(5):
                    started = time.perf_counter()
                    value = api(path, token=credential)
                    evidence["observations"].append(
                        {
                            "scope": name,
                            "query": query,
                            "trial": trial,
                            "ms": (time.perf_counter() - started) * 1000,
                            "cards": [c["name"] for c in value["cards"]],
                            "inventory_count": len(value["inventory"]),
                            "deck_count": len(value["decks"]),
                        }
                    )
        evidence["latency"] = [
            {
                "scope": scope,
                "query": query,
                "p50_ms": statistics.median(
                    row["ms"]
                    for row in evidence["observations"]
                    if row["scope"] == scope and row["query"] == query
                ),
                "p95_ms": percentile(
                    [
                        row["ms"]
                        for row in evidence["observations"]
                        if row["scope"] == scope and row["query"] == query
                    ],
                    0.95,
                ),
            }
            for scope in ["guest", "owner"]
            for query in queries
        ]
        evidence["limits"] = (
            "Single-user loopback API timings include HTTP but exclude the Web proxy, UI debounce and rendering; five warm repetitions per query/scope. Other-account data is a disposable session/record fixture, not an onboarding test."
        )
        evidence["status"] = "passed"
    finally:
        api("/auth/logout", {}, token)
        if other_issued:
            api("/auth/logout", {}, other_token)
            with connect() as conn:
                conn.execute(
                    "DELETE FROM user_profiles WHERE account_id=%s AND username=%s",
                    (other, other_username),
                )
    write_json(ARTIFACTS / "power-http.json", evidence)
    print(
        json.dumps(
            {
                "status": evidence["status"],
                "checks": evidence["checks"],
                "latency": evidence["latency"],
            }
        )
    )


if __name__ == "__main__":
    main()
