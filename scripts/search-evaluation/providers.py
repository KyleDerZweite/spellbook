"""Synthetic Deck scope and static navigation shared by the experiment and UI."""

import json
import unicodedata
from pathlib import Path
from urllib.parse import urlencode

TARGETS = json.loads((Path(__file__).parent / "targets.json").read_text())


def normalize(text):
    return " ".join(
        "".join(
            c
            for c in unicodedata.normalize("NFKD", text.lower())
            if not unicodedata.combining(c)
        ).split()
    )


def static_matches(query):
    query = normalize(query)
    if not query:
        return [
            {**row, "score": 1, "reason": "Page", "exact": False} for row in TARGETS[:5]
        ]
    matches = []
    for row in TARGETS:
        aliases = [normalize(alias) for alias in [row["name"], *row["aliases"]]]
        exact = query in aliases
        if exact or any(
            all(
                any(word.startswith(token) for word in alias.split())
                for token in query.split()
            )
            for alias in aliases
        ):
            matches.append(
                {**row, "exact": exact, "score": 2 if exact else 1, "reason": "Page"}
            )
    return sorted(matches, key=lambda row: (-row["score"], row["id"]))


def seed_decks(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS eval_decks (
        id uuid PRIMARY KEY, account_id text NOT NULL, name text NOT NULL,
        aliases text[] NOT NULL, cards uuid[] NOT NULL, target_id uuid
    )""")
    conn.execute("ALTER TABLE eval_decks ADD COLUMN IF NOT EXISTS target_id uuid")
    fixtures = [
        (
            "00000000-0000-4000-8000-000000000001",
            "owner",
            "Elven Expedition",
            ["elfball"],
            ["Sol Ring", "Llanowar Elves"],
        ),
        (
            "00000000-0000-4000-8000-000000000002",
            "owner",
            "Dimir Control",
            ["dimir control"],
            ["Counterspell", "Brainstorm"],
        ),
        (
            "00000000-0000-4000-8000-000000000003",
            "other",
            "Private Rival Deck",
            ["elfball"],
            ["Sol Ring", "Counterspell"],
        ),
    ]
    for identifier, account, name, aliases, names in fixtures:
        cards = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM eval_cards WHERE name=ANY(%s)", (names,)
            ).fetchall()
        ]
        conn.execute(
            """INSERT INTO eval_decks (id,account_id,name,aliases,cards) VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT(id) DO NOTHING""",
            (identifier, account, name, aliases, cards),
        )


def deck_matches(conn, query, account="owner"):
    if account not in {"owner", "other", "guest"}:
        raise ValueError("Unknown synthetic account")
    if account == "guest" or not query.strip():
        return []
    prefix = "decks containing "
    contents = query.lower().startswith(prefix)
    if contents:
        text = query[len(prefix) :].strip()
        rows = conn.execute(
            """SELECT DISTINCT d.id::text,d.name,d.target_id::text,c.name AS card
            FROM eval_decks d JOIN eval_cards c ON c.id=ANY(d.cards)
            WHERE d.account_id=%s AND lower(c.name)=lower(%s) ORDER BY d.name,d.id::text
        """,
            (account, text),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT id::text,name,target_id::text,NULL AS card FROM eval_decks
            WHERE account_id=%s AND (name ILIKE %s OR %s=ANY(aliases)) ORDER BY name,id
        """,
            (
                account,
                "%" + query.replace("%", "\\%").replace("_", "\\_") + "%",
                normalize(query),
            ),
        ).fetchall()
    return [
        {
            **row,
            "kind": "deck",
            "score": 1,
            "href": "/mtg/decks?" + urlencode({"deck": row["target_id"]})
            if row["target_id"]
            else "/mtg/decks",
            "reason": f"Contains {row['card']}"
            if row["card"]
            else "Deck name or alias",
        }
        for row in rows
    ]
