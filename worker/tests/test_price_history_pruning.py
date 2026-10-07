import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from worker.price_history import prune_history

pytestmark = pytest.mark.usefixtures("price_evaluation_clock")


def test_new_history_publication_prunes_unheld_public_identity_with_bounded_sql():
    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for actual public pruning")
    schema = "prune_test_" + uuid4().hex
    old, new = uuid4(), uuid4()
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            with psycopg.connect(scoped) as conn:
                conn.execute(
                    (Path(__file__).parents[2] / "frontend/drizzle/0017_optional_prices.sql")
                    .read_text()
                    .replace('"public".', f'"{schema}".')
                )
                conn.execute(
                    "INSERT INTO price_history_publications VALUES"
                    "(%s,'Scryfall','{}'),(%s,'Scryfall','{}')",
                    (old, new),
                )
                conn.execute(
                    "INSERT INTO price_history_printings SELECT %s,md5(i::text)::uuid,'{}',NULL "
                    "FROM generate_series(1,50000)i",
                    (old,),
                )
                conn.execute(
                    "INSERT INTO price_source_history(source,printing_id,finish,day,"
                    "time_precision,source_instant,amount,measure,publication_id,evidence) "
                    "SELECT 'Scryfall',md5(i::text)::uuid,'nonfoil',"
                    "'2026-10-06','Instant','2026-10-06T00:00:00Z',1,'prices.eur',%s,'{}' "
                    "FROM generate_series(1,25000)i",
                    (old,),
                )
                conn.execute("ANALYZE price_source_history")
                conn.execute("ANALYZE price_history_printings")
                conn.execute(
                    "INSERT INTO price_history_printings SELECT %s,md5((i+50000)::text)::uuid,"
                    "'{}',NULL FROM generate_series(1,50000)i",
                    (new,),
                )
                conn.execute(
                    "INSERT INTO price_source_history(source,printing_id,finish,day,"
                    "time_precision,source_instant,amount,measure,publication_id,evidence) "
                    "SELECT 'Scryfall',md5((i+50000)::text)::uuid,'nonfoil',"
                    "'2026-10-07','Instant','2026-10-07T00:00:00Z',1,'prices.eur',%s,'{}' "
                    "FROM generate_series(1,25000)i",
                    (new,),
                )
                conn.execute("SET LOCAL statement_timeout='1500ms'")
                prune_history(conn, "Scryfall", new)
                assert conn.execute(
                    "SELECT count(*) FROM price_history_printings WHERE publication_id=%s", (new,)
                ).fetchone() == (25000,)
                assert conn.execute("SELECT count(*) FROM price_source_history").fetchone() == (
                    50000,
                )
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
