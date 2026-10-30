"""Additive, once-only Dashboard demonstration using active Catalog identities."""

from uuid import NAMESPACE_URL, uuid5

from spellbook_core.passwords import _derive

from . import OperatorError
from .demo import Client
from .fixtures import Record

SENTINEL = "spellbook-demo-dashboard-v1"
NAME = "Printing mix · Demo"


def plan_scenario(
    holdings: list[Record], catalog: list[Record]
) -> tuple[list[Record], list[Record]]:
    """Plan all additions before writing; disjoint canonical identities prevent leakage."""
    owned = {str(row["canonical_card_id"]) for row in holdings}
    sets = {row["set_code"] for row in holdings}
    additions: list[Record] = []
    used = set(owned)
    quantities = (20, 12, 8, 6, 5, 4, 3, 2, 1, 1, 1, 1)
    for card in catalog:
        if len(sets) >= 12:
            break
        oracle = str(card["oracle_id"])
        if (
            card["set_code"] not in sets
            and oracle not in used
            and card.get("is_nonfoil_available", True)
        ):
            additions.append(dict(card, quantity=quantities[len(additions)]))
            sets.add(card["set_code"])
            used.add(oracle)
    if len(sets) < 12:
        raise OperatorError("Active Catalog cannot supply twelve distinct Inventory Sets.")
    all_owned = used
    missing = next((card for card in catalog if str(card["oracle_id"]) not in all_owned), None)
    if missing is None:
        raise OperatorError("Active Catalog cannot supply a missing identity.")
    # Reserve alternate canonical identities before allocating exact copies.
    entries: list[Record] = []
    for target, pool, mode in ((24, holdings, "alternate"), (68, holdings, "exact")):
        remaining = target
        taken: set[str] = set()
        for row in pool:
            oracle = str(row["canonical_card_id"])
            if oracle in taken:
                continue
            if any(str(e["oracle_id"]) == oracle for e in entries):
                continue
            candidates = [
                c
                for c in catalog
                if str(c["oracle_id"]) == oracle
                and (
                    (str(c["id"]) == str(row["catalog_card_id"]))
                    if mode == "exact"
                    else str(c["id"]) not in {str(h["catalog_card_id"]) for h in holdings}
                )
            ]
            if not candidates:
                continue
            key = "catalog_card_id" if mode == "exact" else "canonical_card_id"
            available = sum(h["quantity"] for h in holdings if str(h[key]) == str(row[key]))
            quantity = min(remaining, available)
            entries.append(dict(candidates[0], quantity=quantity, role="main"))
            taken.add(oracle)
            remaining -= quantity
            if not remaining:
                break
        if remaining:
            raise OperatorError(f"Inventory cannot supply {target} {mode} copies without overlap.")
    entries.append(dict(missing, quantity=8, role="main"))
    return additions, entries


def seed_dashboard(client: Client) -> Record:
    """Caller owns transaction and seed advisory lock. No fixture publication or history writes."""
    users = client.execute(
        "SELECT account_id,username FROM user_profiles LIMIT 2 FOR UPDATE"
    ).fetchall()
    credentials = client.execute(
        "SELECT account_id,username,password_hash FROM local_credentials LIMIT 2 FOR UPDATE"
    ).fetchall()
    if len(users) != 1 or users[0]["username"] != "demo" or len(credentials) != 1:
        raise OperatorError("Requires the sole Demo account and credential.")
    account = users[0]["account_id"]
    credential = credentials[0]
    if credential["account_id"] != account or credential["username"] != "demo":
        raise OperatorError("Demo credential identity differs.")
    try:
        scheme, salt, digest = credential["password_hash"].split("$")
        valid = scheme == "scrypt" and _derive("demo", salt, digest, False)
    except ValueError, TypeError:
        valid = False
    if not valid:
        raise OperatorError("Requires the actual Demo password.")
    inventories = client.execute(
        "SELECT id,game FROM inventories WHERE account_id=%s LIMIT 2 FOR UPDATE", (account,)
    ).fetchall()
    if len(inventories) != 1 or inventories[0]["game"] != "mtg":
        raise OperatorError("Requires one MTG Demo Inventory.")
    inventory = inventories[0]["id"]
    if client.execute(
        "SELECT 1 FROM inventory_mutation_requests WHERE account_id=%s AND request_id=%s",
        (account, SENTINEL),
    ).fetchone():
        return {
            "status": "preserved",
            "message": "Dashboard scenario already applied. Edits preserved.",
        }
    if client.execute(
        "SELECT 1 FROM decks WHERE account_id=%s AND game='mtg' AND name=%s", (account, NAME)
    ).fetchone():
        raise OperatorError("Dashboard Deck name already exists without seed receipt.")
    holdings = client.execute(
        "SELECT * FROM inventory_cards WHERE account_id=%s AND inventory_id=%s AND game='mtg' "
        "ORDER BY spellbook_position,id LIMIT 10001",
        (account, inventory),
    ).fetchall()
    if len(holdings) > 10000:
        raise OperatorError("Dashboard scenario supports at most 10000 Inventory entries.")
    client.execute("SELECT pg_advisory_xact_lock(%s,%s)", (1936747619, 1))
    # Bounded deterministic candidates: owned canonical cards plus one candidate per new Set.
    catalog = client.execute(
        """WITH active AS (SELECT p.* FROM catalog_printings p JOIN catalog_state s
           ON s.active_generation=p.generation_id WHERE p.lang='en'), candidates AS (
           SELECT a.* FROM active a WHERE a.oracle_id::text=ANY(%s)
           UNION (SELECT DISTINCT ON (set_code) a.* FROM active a
           WHERE NOT (a.oracle_id::text=ANY(%s))
           AND a.document->>'is_nonfoil_available'='true' ORDER BY set_code,id))
           SELECT id::text,oracle_id::text,name,set_code,document->>'image_uri' image_uri
           FROM candidates ORDER BY set_code,id LIMIT 20001""",
        (
            [str(h["canonical_card_id"]) for h in holdings],
            [str(h["canonical_card_id"]) for h in holdings],
        ),
    ).fetchall()
    if len(catalog) > 20000:
        raise OperatorError("Dashboard Catalog candidate bound exceeded.")
    additions, entries = plan_scenario(holdings, catalog)
    commander = client.execute(
        "SELECT canonical_card_id FROM deck_cards c JOIN decks d ON d.id=c.deck_id "
        "WHERE d.account_id=%s AND d.game='mtg' AND d.name='Upgrades Unleashed' "
        "AND c.role='commander' ORDER BY c.id LIMIT 1",
        (account,),
    ).fetchone()
    for entry in entries:
        if commander and entry["oracle_id"] == commander["canonical_card_id"]:
            entry["role"] = "commander"
    deck = str(uuid5(NAMESPACE_URL, f"{SENTINEL}/{account}/deck"))
    client.execute(
        "INSERT INTO decks(id,account_id,game,name,format,description,composition_revision) "
        "VALUES(%s,%s,'mtg',%s,'Commander',%s,1)",
        (deck, account, NAME, "Demo availability example. Not a legality recommendation."),
    )
    for entry in entries:
        client.execute(
            "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
            "canonical_card_id,name,set_code,image_uri,quantity,role) "
            "VALUES(%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,%s)",
            (
                str(uuid5(NAMESPACE_URL, f"{deck}/{entry['id']}")),
                deck,
                account,
                entry["id"],
                entry["oracle_id"],
                entry["name"],
                entry["set_code"],
                entry["image_uri"],
                entry["quantity"],
                entry["role"],
            ),
        )
    position = max((h["spellbook_position"] for h in holdings), default=-1) + 1
    for index, entry in enumerate(additions):
        client.execute(
            "INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,"
            "canonical_card_id,name,set_code,image_uri,quantity,finish,condition,"
            "spellbook_position,notes) VALUES(%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,"
            "'nonfoil','NM',%s,'')",
            (
                str(uuid5(NAMESPACE_URL, f"{deck}/inventory/{entry['id']}")),
                inventory,
                account,
                entry["id"],
                entry["oracle_id"],
                entry["name"],
                entry["set_code"],
                entry["image_uri"],
                entry["quantity"],
                position + index,
            ),
        )
    client.execute(
        "UPDATE inventories SET revision=revision+1 WHERE id=%s AND account_id=%s",
        (inventory, account),
    )
    client.execute(
        "INSERT INTO deck_library_state(account_id,revision) VALUES(%s,1) "
        "ON CONFLICT(account_id) DO UPDATE SET revision=deck_library_state.revision+1",
        (account,),
    )
    client.execute(
        "INSERT INTO inventory_mutation_requests(account_id,request_id,source,status) "
        "VALUES(%s,%s,'demo-dashboard','applied')",
        (account, SENTINEL),
    )
    return {"status": "applied", "message": "Dashboard scenario applied. Printing mix: 68/24/8."}
