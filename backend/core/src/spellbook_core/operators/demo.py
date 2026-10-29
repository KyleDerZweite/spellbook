"""Disposable Demo setup using the unchanged SQL schema and publisher lock."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from spellbook_core.passwords import hash_password

from . import OperatorError
from .fixtures import DemoBundle, Precon, Record, matches_legacy

type Client = psycopg.Connection[dict[str, Any]]


def require_demo_database(url: str | None) -> None:
    try:
        parsed = urlsplit(url or "")
        valid = (
            parsed.scheme in ("postgres", "postgresql")
            and parsed.path.endswith(("_demo", "_design"))
            and parsed.path.count("/") == 1
            and conninfo_to_dict(url or "").get("dbname") == parsed.path[1:]
        )
    except ValueError, psycopg.Error:
        valid = False
    if not valid:
        raise OperatorError("Requires a database name ending in _demo or _design.")


@contextmanager
def _client(url: str) -> Iterator[Client]:
    require_demo_database(url)
    try:
        connection = psycopg.connect(
            url, autocommit=True, row_factory=dict_row, connect_timeout=10
        )
    except psycopg.Error, ValueError:
        raise OperatorError("Demo database connection failed.") from None
    with connection:
        yield connection


def publish_demo_catalog(client: Client, bundle: DemoBundle) -> None:
    """Caller owns the transaction. Exhaust integrity checks even on an existing generation."""
    manifest = bundle.manifest
    generation = manifest.generation_id
    client.execute("SELECT pg_advisory_xact_lock(%s,%s)", (1936747619, 1))
    existing = client.execute(
        """SELECT source_type,source_updated_at,document_count,schema_version
           FROM catalog_generations WHERE id=%s""",
        (generation,),
    ).fetchone()
    if existing:
        counts = client.execute(
            """SELECT (SELECT count(*) FROM catalog_printings WHERE generation_id=%s) printings,
               (SELECT count(*) FROM catalog_oracle_facts WHERE generation_id=%s) facts""",
            (generation, generation),
        ).fetchone()
        if (
            existing["source_type"] != "demo-bundle"
            or existing["source_updated_at"] != manifest.bundle_version
            or existing["document_count"] != manifest.documents
            or existing["schema_version"] != manifest.transform_version
            or counts is None
            or counts["printings"] != manifest.documents
            or counts["facts"] != manifest.documents
        ):
            raise OperatorError("Existing Demo Catalog generation is inconsistent.")
        for _batch in bundle.batches():
            pass
    else:
        client.execute(
            """INSERT INTO catalog_generations
               (id,source_type,source_updated_at,document_count,schema_version)
               VALUES(%s,'demo-bundle',%s,%s,%s)""",
            (generation, manifest.bundle_version, manifest.documents, manifest.transform_version),
        )
        for batch in bundle.batches():
            client.execute(
                """INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,
                   printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,
                   legalities,search_name,search_text,document)
                   SELECT %s,d.id,d.oracle_id,d.name,d.normalized_name,d.printed_name,d.lang,
                   d.set_code,d.collector_number,d.rarity,d.cmc,d.colors,d.card_types,d.legalities,
                   r.search_name,r.search_text,r.document
                   FROM jsonb_to_recordset(%s::jsonb)
                   r(document jsonb,search_name text,search_text text)
                   CROSS JOIN LATERAL jsonb_to_record(r.document) d(id uuid,oracle_id uuid,
                   name text,normalized_name text,printed_name text,lang text,set_code text,
                   collector_number text,rarity text,cmc double precision,colors text[],
                   card_types text[],legalities jsonb)""",
                (generation, Jsonb(batch)),
            )
            client.execute(
                """INSERT INTO catalog_oracle_facts
                   (generation_id,printing_id,raw_oracle_id,types,transform_version)
                   SELECT %s,(r.document->>'id')::uuid,r.raw_oracle_id,r.types,%s
                   FROM jsonb_to_recordset(%s::jsonb)
                   r(document jsonb,raw_oracle_id uuid,types text[])""",
                (generation, manifest.transform_version, Jsonb(batch)),
            )
        client.execute(
            "UPDATE catalog_generations SET published_at=now() WHERE id=%s", (generation,)
        )
    client.execute(
        """INSERT INTO catalog_state(id,active_generation,updated_at) VALUES(1,%s,now())
           ON CONFLICT(id) DO UPDATE SET previous_generation=catalog_state.active_generation,
           active_generation=excluded.active_generation,updated_at=now()
           WHERE catalog_state.active_generation IS DISTINCT FROM excluded.active_generation""",
        (generation,),
    )


def insert_precon(client: Client, account: str, inventory: str, precon: Precon) -> str:
    """Caller owns the transaction and Inventory parent lock, as in the native operator."""
    deck = str(uuid4())
    client.execute(
        """INSERT INTO decks(id,account_id,game,name,format,description)
           VALUES(%s,%s,'mtg',%s,'Commander',%s)""",
        (deck, account, precon.name, precon.description),
    )
    for entry in precon.cards:
        d = entry["card"]
        client.execute(
            """INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,
               name,set_code,image_uri,quantity,role)
               VALUES(%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,%s)""",
            (
                str(uuid4()),
                deck,
                account,
                d["id"],
                d["oracle_id"],
                d["name"],
                d["set_code"],
                d["image_uri"],
                entry["quantity"],
                entry["role"],
            ),
        )
    for position, entry in enumerate([*precon.cards, *precon.inventory_extras]):
        d = entry["card"]
        client.execute(
            """INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,
               canonical_card_id,name,set_code,image_uri,quantity,finish,condition,
               spellbook_position,notes) VALUES(%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,%s,%s,%s,'')""",
            (
                str(uuid4()),
                inventory,
                account,
                d["id"],
                d["oracle_id"],
                d["name"],
                d["set_code"],
                d["image_uri"],
                entry["quantity"],
                entry["finish"],
                entry["condition"],
                position,
            ),
        )
    client.execute("UPDATE inventories SET revision=revision+1 WHERE id=%s", (inventory,))
    return deck


def seed_demo(
    url: str,
    bundle: DemoBundle,
    precon: Precon,
    *,
    reset: bool = False,
    timezone: str = "Europe/Berlin",
) -> Record:
    from .demo_history import seed_demo_history

    with _client(url) as client:
        try:
            with client.transaction():
                client.execute("SELECT pg_advisory_xact_lock(hashtext('spellbook-demo-seed'))")
                users = client.execute("SELECT account_id,username FROM user_profiles").fetchall()
                if not reset and (len(users) > 1 or any(u["username"] != "demo" for u in users)):
                    raise OperatorError("Database contains other users.")
                publish_demo_catalog(client, bundle)
                if reset:
                    client.execute("DELETE FROM user_profiles")
                elif any(u["username"] == "demo" for u in users):
                    seed_demo_history(client, str(users[0]["account_id"]), precon, timezone)
                    return {
                        "status": "preserved",
                        "message": "Demo is already seeded. Existing edits preserved.",
                    }
                account, inventory = str(uuid4()), str(uuid4())
                client.execute(
                    "INSERT INTO user_profiles(account_id,username) VALUES(%s,'demo')",
                    (account,),
                )
                client.execute(
                    """INSERT INTO local_credentials(account_id,username,password_hash)
                       VALUES(%s,'demo',%s)""",
                    (account, hash_password("demo")),
                )
                client.execute(
                    """INSERT INTO decks(id,account_id,game,name,format)
                       VALUES(%s,%s,'mtg','Next brew','Commander')""",
                    (str(uuid4()), account),
                )
                client.execute(
                    "INSERT INTO inventories(id,account_id,game) VALUES(%s,%s,'mtg')",
                    (inventory, account),
                )
                client.execute("SELECT id FROM inventories WHERE id=%s FOR UPDATE", (inventory,))
                insert_precon(client, account, inventory, precon)
                seed_demo_history(client, account, precon, timezone)
        except OperatorError, psycopg.Error, ValueError, OSError:
            raise OperatorError("Demo seed failed; transaction rolled back.") from None
    return {"status": "seeded", "message": "Demo ready. Username: demo. Password: demo."}


def replace_demo_inventory(
    url: str,
    precon: Precon,
    legacy: list[Record],
    *,
    apply: bool = False,
) -> Record:
    with _client(url) as client:
        try:
            with client.transaction():
                if not apply:
                    client.execute("SET TRANSACTION READ ONLY")
                return replace_in_transaction(client, precon, legacy, apply=apply)
        except psycopg.Error, ValueError:
            raise OperatorError(
                "Demo Inventory replacement failed; transaction rolled back."
            ) from None


def replace_in_transaction(
    client: Client,
    precon: Precon,
    legacy: list[Record],
    *,
    apply: bool = False,
) -> Record:
    """The wrapper owns BEGIN/COMMIT; preview is a read-only transaction."""
    lock = " FOR UPDATE" if apply else ""
    users = client.execute("SELECT account_id,username FROM user_profiles" + lock).fetchall()
    if len(users) != 1 or users[0]["username"] != "demo":
        raise OperatorError("Requires the sole Demo account.")
    account = users[0]["account_id"]
    credentials = client.execute(
        "SELECT account_id,username FROM local_credentials" + lock
    ).fetchall()
    if len(credentials) != 1 or credentials[0] != {"account_id": account, "username": "demo"}:
        raise OperatorError("Demo credential identity differs.")
    inventories = client.execute(
        "SELECT id,game,revision FROM inventories WHERE account_id=%s" + lock,
        (account,),
    ).fetchall()
    if len(inventories) != 1 or inventories[0]["game"] != "mtg":
        raise OperatorError("Requires one MTG Demo Inventory.")
    inventory = str(inventories[0]["id"])
    named = client.execute(
        "SELECT id FROM decks WHERE account_id=%s AND lower(name)=lower(%s)",
        (account, precon.name),
    ).fetchone()
    if named:
        return {
            "status": "preserved",
            "account": account,
            "inventory": inventory,
            "reason": (
                "A named precon Deck already exists. Inventory and all Deck edits preserved."
            ),
        }
    dependencies = client.execute(
        """SELECT
           (SELECT count(*) FROM inventory_groups WHERE inventory_id=%s) groups,
           (SELECT count(*) FROM inventory_group_memberships m JOIN inventory_cards c
            ON c.id=m.entry_id WHERE c.inventory_id=%s) memberships,
           (SELECT count(*) FROM inventory_mutation_requests WHERE account_id=%s
            AND (source <> 'web' OR status <> 'applied')) receipts""",
        (inventory, inventory, account),
    ).fetchone()
    if dependencies is None or any(dependencies.values()):
        raise OperatorError(
            "Inventory has Boxes, memberships or receipts other than completed web mutations. "
            "Replacement refused."
        )
    actual = client.execute(
        "SELECT * FROM inventory_cards WHERE inventory_id=%s ORDER BY spellbook_position",
        (inventory,),
    ).fetchall()
    if str(inventories[0]["revision"]) not in ("0", "1") or not matches_legacy(actual, legacy):
        raise OperatorError(
            "Inventory differs from the original 43-entry, 72-copy starter. Replacement refused."
        )
    catalog = client.execute(
        """SELECT count(*) count FROM catalog_printings p
           JOIN catalog_state s ON s.active_generation=p.generation_id
           JOIN jsonb_to_recordset(%s::jsonb)
           e(id uuid,oracle_id uuid,name text,set_code text,lang text,collector_number text)
           ON p.id=e.id AND p.oracle_id=e.oracle_id AND p.name=e.name AND p.set_code=e.set_code
           AND p.lang=e.lang AND p.collector_number=e.collector_number""",
        (Jsonb([e["card"] for e in precon.cards]),),
    ).fetchone()
    if catalog is None or catalog["count"] != len(precon.cards):
        raise OperatorError("Active Catalog does not contain the precon fixture identities.")
    if apply:
        client.execute("DELETE FROM inventory_cards WHERE inventory_id=%s", (inventory,))
        insert_precon(client, account, inventory, precon)
    return {
        "status": "applied" if apply else "preview",
        "account": account,
        "inventory": inventory,
        "previousEntries": 43,
        "previousCopies": 72,
        "entries": 76,
        "copies": 101,
        "deck": precon.name,
    }
