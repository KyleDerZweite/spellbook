import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from worker.catalog import CatalogPublisher
from worker.optional_prices import CardmarketAdapter, MTGJSONAdapter
from worker.optional_publication import OptionalPricePublisher
from worker.scryfall import BulkDataInfo


@pytest.fixture
def public_database():
    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for real publication evidence")
    schema = "optional_test_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            with psycopg.connect(scoped) as conn:
                for name in (
                    "0006_postgres_catalog.sql",
                    "0015_scryfall_prices.sql",
                    "0017_optional_prices.sql",
                ):
                    conn.execute(
                        (Path(__file__).parents[2] / "frontend/drizzle" / name)
                        .read_text()
                        .replace('"public".', f'"{schema}".')
                    )
            yield scoped
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_optional_complete_null_replaces_current_without_touching_baseline(
    public_database, tmp_path
):
    raw = json.loads((Path(__file__).parent / "fixtures/normal_card.json").read_text())
    raw["cardmarket_id"] = 7
    payload = tmp_path / "baseline.jsonl"
    payload.write_text(json.dumps(raw) + "\n")
    baseline = CatalogPublisher(public_database)
    baseline.publish(
        payload,
        BulkDataInfo(
            "all_cards", "fixture://scryfall", "2026-10-06T00:00:00Z", payload.stat().st_size
        ),
    )
    publisher = OptionalPricePublisher(public_database)
    publisher.set_enabled("Cardmarket", True)
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        '{"version":1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}'
    )
    for index, amount in enumerate(("1.25", "null")):
        guide.write_text(
            (
                '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idP'
                'roduct":7,"trend":'
            )
            + amount
            + "}]}"
        )
        with CardmarketAdapter(products, guide, tmp_path / f"stage-{index}.sqlite") as adapter:
            publisher.publish_cardmarket(adapter)
    with psycopg.connect(public_database) as conn:
        assert conn.execute(
            "SELECT amount FROM optional_price_observations o JOIN optional_price"
            "_state s ON s.active_publication=o.publication_id WHERE s.source='Ca"
            "rdmarket' AND o.finish='nonfoil'"
        ).fetchone() == (None,)
        assert conn.execute("SELECT count(*) FROM price_publications").fetchone() == (1,)
        assert conn.execute("SELECT count(*) FROM optional_price_publications").fetchone() == (2,)
        assert conn.execute(
            "SELECT count(*) FROM price_source_history WHERE source='Cardmarket'"
        ).fetchone() == (0,)


def test_failed_optional_transaction_preserves_current_and_replay_is_idempotent(
    public_database, tmp_path
):
    raw = json.loads((Path(__file__).parent / "fixtures/normal_card.json").read_text())
    raw["cardmarket_id"] = 7
    payload = tmp_path / "baseline.jsonl"
    payload.write_text(json.dumps(raw) + "\n")
    CatalogPublisher(public_database).publish(
        payload,
        BulkDataInfo(
            "all_cards", "fixture://scryfall", "2026-10-06T00:00:00Z", payload.stat().st_size
        ),
    )
    publisher = OptionalPricePublisher(public_database)
    publisher.set_enabled("Cardmarket", True)
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        '{"version":1,"createdAt":"2026-10-06T00:00:00Z","products":[{"idProduct":7}]}'
    )

    def publish(amount, index):
        guide.write_text(
            '{"version":1,"createdAt":"2026-10-07T00:00:00Z","priceGuides":[{"idProduct":7,"trend":'
            + amount
            + "}]}"
        )
        with CardmarketAdapter(products, guide, tmp_path / f"stage-{index}.sqlite") as adapter:
            return publisher.publish_cardmarket(adapter)

    original = publish("1.25", 0)
    with psycopg.connect(public_database) as conn:
        conn.execute(
            "CREATE FUNCTION reject_fixture_price() RETURNS trigger LANGUAGE plpgsql AS $$ "
            "BEGIN IF NEW.amount=999 THEN RAISE EXCEPTION 'Fixture failure'; END IF; "
            "RETURN NEW; END $$"
        )
        conn.execute(
            "CREATE TRIGGER reject_fixture_price BEFORE INSERT ON optional_price_observations "
            "FOR EACH ROW EXECUTE FUNCTION reject_fixture_price()"
        )
    with pytest.raises(psycopg.Error):
        publish("999", 1)
    with psycopg.connect(public_database) as conn:
        assert conn.execute(
            "SELECT active_publication,refresh_status->>'kind' FROM optional_price_state "
            "WHERE source='Cardmarket'"
        ).fetchone() == (original, "Failed")
        assert conn.execute("SELECT count(*) FROM optional_price_publications").fetchone() == (1,)
        assert conn.execute(
            "SELECT amount FROM price_source_history WHERE source='Cardmarket'"
        ).fetchone() == (1.25,)
        conn.execute("DROP TRIGGER reject_fixture_price ON optional_price_observations")
    assert publish("1.25", 2) == original
    with psycopg.connect(public_database) as conn:
        assert conn.execute("SELECT count(*) FROM optional_price_publications").fetchone() == (1,)
        assert conn.execute(
            "SELECT count(*) FROM price_history_days WHERE source='Cardmarket'"
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT refresh_status->>'kind' FROM optional_price_state WHERE source='Cardmarket'"
        ).fetchone() == ("Succeeded",)
        assert conn.execute(
            "SELECT count(*) FROM price_history_publications WHERE source='Cardmarket'"
        ).fetchone() == (1,)


def test_mtgjson_public_history_normalizes_evidence_and_never_supplies_current(
    public_database, tmp_path
):
    raw = json.loads((Path(__file__).parent / "fixtures/normal_card.json").read_text())
    payload = tmp_path / "baseline.jsonl"
    payload.write_text(json.dumps(raw) + "\n")
    CatalogPublisher(public_database).publish(
        payload,
        BulkDataInfo(
            "all_cards", "fixture://scryfall", "2026-10-06T00:00:00Z", payload.stat().st_size
        ),
    )
    publisher = OptionalPricePublisher(public_database)
    publisher.set_enabled("MTGJSON", True)
    product = "01b47f91-ffff-5954-af7a-add84b7c513c"
    meta = {"date": "2026-10-06", "version": "fixture"}
    identifiers, today, history = (
        tmp_path / name for name in ("ids.json", "today.json", "history.json")
    )
    identifiers.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {product: {"uuid": product, "identifiers": {"scryfallId": raw["id"]}}},
            }
        )
    )
    today.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {
                    product: {
                        "paper": {
                            "cardmarket": {
                                "currency": "EUR",
                                "retail": {"normal": {"2026-10-05": 99}},
                            }
                        }
                    }
                },
            }
        )
    )
    history.write_text(
        json.dumps(
            {
                "meta": meta,
                "data": {
                    product: {
                        "paper": {
                            "cardmarket": {
                                "currency": "EUR",
                                "retail": {"normal": {"2026-10-05": 0, "2026-10-06": 1.01}},
                            }
                        }
                    }
                },
            }
        )
    )
    with MTGJSONAdapter(identifiers, today, history, tmp_path / "stage.sqlite") as adapter:
        original = publisher.publish_mtgjson(adapter)
    with psycopg.connect(public_database) as conn:
        assert conn.execute(
            "SELECT amount FROM optional_price_observations "
            "WHERE publication_id=%s AND finish='nonfoil'",
            (original,),
        ).fetchone() == (None,)
        assert conn.execute(
            "SELECT count(*) FROM price_source_history WHERE source='MTGJSON'"
        ).fetchone() == (2,)
        assert conn.execute(
            "SELECT count(*) FROM price_history_publications WHERE source='MTGJSON'"
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT count(*) FROM price_history_printings WHERE publication_id=%s", (original,)
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT evidence->>'pointArtifact' FROM price_history_publications "
            "WHERE publication_id=%s",
            (original,),
        ).fetchone() == ("AllPrices",)
    history.write_text(json.dumps({"meta": meta, "data": {}}))
    with MTGJSONAdapter(identifiers, today, history, tmp_path / "next.sqlite") as adapter:
        publisher.publish_mtgjson(adapter)
    with psycopg.connect(public_database) as conn:
        assert conn.execute(
            "SELECT count(*) FROM price_source_history WHERE source='MTGJSON'"
        ).fetchone() == (0,)
        assert conn.execute(
            "SELECT count(*) FROM price_history_publications WHERE source='MTGJSON'"
        ).fetchone() == (0,)
