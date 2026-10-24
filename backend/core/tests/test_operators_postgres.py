"""Opt-in operators on an exclusively assigned, empty, already migrated Demo database.

Set SPELLBOOK_OPERATORS_NATIVE_DATABASE to the assigned _demo/_design database
name and TEST_DATABASE_URL through its protected environment. No schema setup,
container, lease acquisition, automatic migration or production invocation occurs.
"""

import json
import os
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from test_operator_fixtures import FIXTURES, small_bundle

from spellbook_core.operators import OperatorError
from spellbook_core.operators.demo import (
    Client,
    publish_demo_catalog,
    replace_demo_inventory,
    require_demo_database,
    seed_demo,
)
from spellbook_core.operators.fixtures import legacy_inventory, load_precon, verify_bundle
from spellbook_core.operators.local_password import set_local_password
from spellbook_core.passwords import _derive

pytestmark = pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_OPERATORS_NATIVE_DATABASE"),
    reason="Requires an exclusive empty migrated disposable Demo database assignment",
)


@pytest.fixture
def database() -> Iterator[tuple[str, Client]]:
    url = os.environ["TEST_DATABASE_URL"]
    target = os.environ["SPELLBOOK_OPERATORS_NATIVE_DATABASE"]
    require_demo_database(url)
    assert conninfo_to_dict(url).get("dbname") == target, "Assigned database mismatch"
    with psycopg.connect(url, autocommit=True, row_factory=dict_row) as client:
        assert client.execute("SELECT 1 FROM user_profiles LIMIT 1").fetchone() is None
        assert client.execute("SELECT 1 FROM catalog_generations LIMIT 1").fetchone() is None
        ledger = client.execute(
            "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
        ).fetchall()
        assert len(ledger) == 25, "Requires the complete existing migrated schema"
        try:
            yield url, client
        finally:
            client.execute("DROP TRIGGER IF EXISTS operator_test_reject ON deck_cards")
            client.execute("DROP FUNCTION IF EXISTS operator_test_reject()")
            # All accounts/generations were created by this test in the asserted empty target.
            client.execute("DELETE FROM user_profiles")
            client.execute(
                "UPDATE catalog_state SET active_generation=NULL,previous_generation=NULL"
            )
            client.execute("DELETE FROM catalog_generations")
            assert (
                client.execute(
                    "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
                ).fetchall()
                == ledger
            )


def account(client: Client, username: str) -> str:
    identifier = str(uuid4())
    client.execute(
        "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)",
        (identifier, username),
    )
    client.execute(
        "INSERT INTO local_credentials(account_id,username,password_hash) "
        "VALUES(%s,%s,'test-only')",
        (identifier, username),
    )
    return identifier


def session(client: Client, owner: str) -> None:
    client.execute(
        """INSERT INTO auth_sessions(token_hash,account_id,expires_at)
           VALUES(%s,%s,now()+interval '1 day')""",
        (uuid4().hex, owner),
    )


def snapshot(client: Client) -> object:
    return client.execute(
        """SELECT (SELECT jsonb_agg(p ORDER BY account_id) FROM user_profiles p) profiles,
           (SELECT jsonb_agg(c ORDER BY account_id) FROM local_credentials c) credentials,
           (SELECT jsonb_agg(s ORDER BY token_hash) FROM auth_sessions s) sessions,
           (SELECT jsonb_agg(c ORDER BY id) FROM inventory_cards c) cards,
           (SELECT jsonb_agg(i ORDER BY id) FROM inventories i) inventories,
           (SELECT jsonb_agg(d ORDER BY id) FROM decks d) decks,
           (SELECT jsonb_agg(d ORDER BY id) FROM deck_cards d) entries,
           (SELECT jsonb_agg(c ORDER BY id) FROM catalog_state c) catalog"""
    ).fetchone()


def test_recovery_revokes_all_owned_sessions_and_retains_foreign_data(
    database: tuple[str, Client],
) -> None:
    url, client = database
    owner, foreign = account(client, "owner"), account(client, "foreign")
    for identifier in (owner, owner, owner, foreign):
        session(client, identifier)
    # Recovery deliberately has no Demo suffix policy, including percent-encoded
    # database paths that connect to the same assigned target.
    target = os.environ["SPELLBOOK_OPERATORS_NATIVE_DATABASE"]
    recovery_url = url.replace(target, target[:-1] + f"%{ord(target[-1]):02x}")
    for password in ("p" * 12, "😀" * 64):
        assert set_local_password(recovery_url, owner, " Renamed_Owner ", password).endswith(
            "Existing sessions revoked."
        )
        saved = client.execute(
            "SELECT username,password_hash FROM local_credentials WHERE account_id=%s",
            (owner,),
        ).fetchone()
        assert saved and saved["username"] == "renamed_owner"
        _, salt, digest = saved["password_hash"].split("$")
        assert _derive(password, salt, digest, False)
    assert client.execute(
        "SELECT account_id FROM auth_sessions ORDER BY account_id"
    ).fetchall() == [{"account_id": foreign}]
    assert client.execute(
        "SELECT username FROM user_profiles WHERE account_id=%s",
        (owner,),
    ).fetchone() == {"username": "renamed_owner"}


def test_recovery_collision_missing_account_and_invalid_password_are_atomic(
    database: tuple[str, Client],
) -> None:
    url, client = database
    owner = account(client, "owner")
    account(client, "taken")
    session(client, owner)
    before = snapshot(client)
    for identifier, username, password, message in (
        (owner, "taken", "valid-password", "transaction rolled back"),
        (str(uuid4()), "missing", "valid-password", "Account does not exist"),
        (owner, "owner", "short", "12 to 128"),
    ):
        with pytest.raises(OperatorError, match=message):
            set_local_password(url, identifier, username, password)
        assert snapshot(client) == before


def test_seed_rolls_back_catalog_on_late_digest_failure(
    database: tuple[str, Client],
    tmp_path: Path,
) -> None:
    url, client = database
    bundle = small_bundle(tmp_path)
    broken = replace(bundle, manifest=replace(bundle.manifest, jsonl_sha256="0" * 64))
    before = snapshot(client)
    with pytest.raises(OperatorError, match="transaction rolled back"):
        seed_demo(url, broken, load_precon(FIXTURES))
    assert snapshot(client) == before
    assert client.execute("SELECT id FROM catalog_generations").fetchall() == []


def test_full_seed_preserves_edits_validates_reruns_and_explicitly_resets(
    database: tuple[str, Client],
) -> None:
    url, client = database
    precon, bundle = load_precon(FIXTURES), verify_bundle(FIXTURES)
    assert seed_demo(url, bundle, precon)["status"] == "seeded"
    assert client.execute(
        "SELECT count(*) entries,sum(quantity)::int copies FROM inventory_cards"
    ).fetchone() == {"entries": 76, "copies": 101}
    assert client.execute("SELECT sum(quantity)::int copies FROM deck_cards").fetchone() == {
        "copies": 100,
    }
    client.execute("UPDATE inventory_cards SET notes='owned edit' WHERE spellbook_position=0")
    before = snapshot(client)
    assert seed_demo(url, bundle, precon)["status"] == "preserved"
    assert snapshot(client) == before
    broken = replace(bundle, manifest=replace(bundle.manifest, jsonl_sha256="0" * 64))
    with pytest.raises(OperatorError, match="payload integrity"), client.transaction():
        publish_demo_catalog(client, broken)
    assert snapshot(client) == before
    account(client, "private_owner")
    private = snapshot(client)
    with pytest.raises(OperatorError, match="transaction rolled back"):
        seed_demo(url, bundle, precon)
    assert snapshot(client) == private
    assert seed_demo(url, bundle, precon, reset=True)["status"] == "seeded"
    assert client.execute("SELECT username FROM user_profiles").fetchall() == [
        {"username": "demo"}
    ]


def legacy_setup(client: Client) -> tuple[str, str]:
    owner, inventory = account(client, "demo"), str(uuid4())
    client.execute(
        "INSERT INTO inventories(id,account_id,game) VALUES(%s,%s,'mtg')",
        (inventory, owner),
    )
    for entry in legacy_inventory(FIXTURES):
        client.execute(
            """INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,
               canonical_card_id,name,set_code,image_uri,quantity,finish,condition,
               spellbook_position,notes) VALUES(%s,%s,%s,'mtg',%s,%s,%s,%s,%s,%s,%s,%s,%s,'')""",
            (
                str(uuid4()),
                inventory,
                owner,
                entry["catalog_card_id"],
                entry["canonical_card_id"],
                entry["name"],
                entry["set_code"],
                entry["image_uri"],
                entry["quantity"],
                entry["finish"],
                entry["condition"],
                entry["spellbook_position"],
            ),
        )
    generation = str(uuid4())
    client.execute(
        """INSERT INTO catalog_generations
           (id,source_type,source_updated_at,document_count,schema_version)
           VALUES(%s,'operator-test',now(),75,2)""",
        (generation,),
    )
    for entry in load_precon(FIXTURES).cards:
        d = entry["card"]
        client.execute(
            """INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,
               printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,
               legalities,search_name,search_text,document)
               VALUES(%s,%s,%s,%s,%s,'',%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s)""",
            (
                generation,
                d["id"],
                d["oracle_id"],
                d["name"],
                d["normalized_name"],
                d["lang"],
                d["set_code"],
                d["collector_number"],
                d["rarity"],
                d["cmc"],
                d["colors"],
                d["card_types"],
                Jsonb(d["legalities"]),
                d["normalized_name"],
                Jsonb(d),
            ),
        )
    client.execute(
        "INSERT INTO catalog_state(id,active_generation) VALUES(1,%s) "
        "ON CONFLICT(id) DO UPDATE SET active_generation=EXCLUDED.active_generation",
        (generation,),
    )
    return owner, inventory


@pytest.mark.parametrize("revision", [0, 1])
def test_replacement_preview_apply_and_replay_preserve_receipts(
    database: tuple[str, Client],
    revision: int,
) -> None:
    url, client = database
    owner, inventory = legacy_setup(client)
    client.execute("UPDATE inventories SET revision=%s WHERE id=%s", (revision, inventory))
    request = str(uuid4())
    client.execute(
        """INSERT INTO inventory_mutation_requests
           (account_id,request_id,source,status,acknowledgement)
           VALUES(%s,%s,'web','applied',%s)""",
        (owner, request, Jsonb({"original": "receipt"})),
    )
    receipts = client.execute("SELECT * FROM inventory_mutation_requests").fetchall()
    precon, legacy = load_precon(FIXTURES), legacy_inventory(FIXTURES)
    before = snapshot(client)
    assert replace_demo_inventory(url, precon, legacy)["status"] == "preview"
    assert snapshot(client) == before
    with psycopg.connect(url, autocommit=True) as listener:
        listener.execute("LISTEN spellbook_saved_state")
        assert replace_demo_inventory(url, precon, legacy, apply=True)["status"] == "applied"
        events = [json.loads(n.payload) for n in listener.notifies(timeout=2, stop_after=2)]
    assert {event["topic"] for event in events} == {"inventory", "decks"}
    assert {event["accountId"] for event in events} == {owner}
    assert client.execute(
        "SELECT revision FROM inventories WHERE id=%s", (inventory,)
    ).fetchone() == {
        "revision": revision + 1,
    }
    assert client.execute(
        "SELECT count(*) entries,sum(quantity)::int copies FROM inventory_cards"
    ).fetchone() == {"entries": 76, "copies": 101}
    client.execute(
        "UPDATE inventory_cards SET notes='later owned edit' WHERE spellbook_position=0"
    )
    saved = snapshot(client)
    assert replace_demo_inventory(url, precon, legacy, apply=True)["status"] == "preserved"
    assert snapshot(client) == saved
    assert client.execute("SELECT * FROM inventory_mutation_requests").fetchall() == receipts


def test_replacement_refuses_edits_dependencies_missing_catalog_and_rolls_back_sql_failure(
    database: tuple[str, Client],
) -> None:
    url, client = database
    owner, inventory = legacy_setup(client)
    precon, legacy = load_precon(FIXTURES), legacy_inventory(FIXTURES)
    client.execute("UPDATE inventory_cards SET notes='edit' WHERE spellbook_position=0")
    before = snapshot(client)
    with pytest.raises(OperatorError, match="differs"):
        replace_demo_inventory(url, precon, legacy, apply=True)
    assert snapshot(client) == before
    client.execute("UPDATE inventory_cards SET notes='' WHERE spellbook_position=0")
    group = str(uuid4())
    client.execute(
        "INSERT INTO inventory_groups(id,inventory_id,name) VALUES(%s,%s,'Box')",
        (group, inventory),
    )
    with pytest.raises(OperatorError, match="Boxes"):
        replace_demo_inventory(url, precon, legacy, apply=True)
    client.execute("DELETE FROM inventory_groups WHERE id=%s", (group,))
    request = str(uuid4())
    for source, status in (("web", "pending"), ("scan_review", "applied")):
        client.execute(
            """INSERT INTO inventory_mutation_requests(account_id,request_id,source,status)
               VALUES(%s,%s,%s,%s) ON CONFLICT(account_id,request_id)
               DO UPDATE SET source=EXCLUDED.source,status=EXCLUDED.status""",
            (owner, request, source, status),
        )
        with pytest.raises(OperatorError, match="receipts"):
            replace_demo_inventory(url, precon, legacy, apply=True)
    client.execute(
        "DELETE FROM inventory_mutation_requests WHERE account_id=%s AND request_id=%s",
        (owner, request),
    )
    client.execute(
        "UPDATE catalog_printings SET name='wrong' WHERE id=%s", (precon.cards[0]["card"]["id"],)
    )
    with pytest.raises(OperatorError, match="Active Catalog"):
        replace_demo_inventory(url, precon, legacy, apply=True)
    client.execute(
        "UPDATE catalog_printings SET name=%s WHERE id=%s",
        (precon.cards[0]["card"]["name"], precon.cards[0]["card"]["id"]),
    )
    client.execute(
        """CREATE FUNCTION operator_test_reject() RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN RAISE EXCEPTION 'test-only rejection'; END $$"""
    )
    client.execute(
        """CREATE TRIGGER operator_test_reject BEFORE INSERT ON deck_cards
           FOR EACH ROW EXECUTE FUNCTION operator_test_reject()"""
    )
    before = snapshot(client)
    with pytest.raises(OperatorError, match="transaction rolled back"):
        replace_demo_inventory(url, precon, legacy, apply=True)
    assert snapshot(client) == before
