"""Optional real ParadeDB comparison on its separately assigned disposable DB."""

import json
import os
import re
import time
from urllib.parse import urlencode, urlparse

import psycopg
from common import ARTIFACTS, configure, connect, write_json
from psycopg.rows import dict_row


def connection():
    configure()
    url = os.environ.get("SEARCH_EVALUATION_BM25_URL", "")
    parsed = urlparse(url)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.path.startswith(
        "/spellbook_search_eval_"
    ):
        raise ValueError(
            "Set SEARCH_EVALUATION_BM25_URL to its assigned loopback experiment DB"
        )
    return psycopg.connect(url, autocommit=True, row_factory=dict_row)


def prepare():
    started = time.perf_counter()
    with connect() as source, connection() as target:
        target.execute("CREATE EXTENSION IF NOT EXISTS pg_search")
        target.execute("""CREATE TABLE eval_bm25 (
            id bigint PRIMARY KEY, oracle_id uuid NOT NULL, name text NOT NULL,
            oracle_text text NOT NULL, type_line text NOT NULL, document jsonb NOT NULL
        )""")
        rows = source.execute(
            "SELECT id,name,oracle_text,type_line,document FROM eval_cards ORDER BY id"
        ).fetchall()
        with target.cursor().copy("COPY eval_bm25 FROM STDIN") as copy:
            for number, row in enumerate(rows, 1):
                copy.write_row(
                    (
                        number,
                        row["id"],
                        row["name"],
                        row["oracle_text"],
                        row["type_line"],
                        json.dumps(row["document"]),
                    )
                )
        index_start = time.perf_counter()
        target.execute(
            "CREATE INDEX eval_bm25_search ON eval_bm25 USING paradedb (id,name,oracle_text,type_line)"
        )
        info = {
            "rows": len(rows),
            "index_ms": (time.perf_counter() - index_start) * 1000,
            "prepare_ms": (time.perf_counter() - started) * 1000,
            "extension": target.execute(
                "SELECT extversion FROM pg_extension WHERE extname='pg_search'"
            ).fetchone()["extversion"],
            "postgres": target.execute("SHOW server_version").fetchone()[
                "server_version"
            ],
            "index_bytes": target.execute(
                "SELECT pg_relation_size('eval_bm25_search') AS n"
            ).fetchone()["n"],
        }
    write_json(ARTIFACTS / "bm25.json", info)
    print(json.dumps(info))


def search(query, limit=10):
    if not query.strip():
        return []
    tokens = re.findall(r"[^\W_]+", query.lower())
    if not tokens:
        return []
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT oracle_id::text AS id,name,oracle_text,type_line,document,
                paradedb.score(id)::float8 AS score
            FROM eval_bm25 WHERE id @@@ paradedb.boolean(should => ARRAY[
                paradedb.boost(5,paradedb.match('name',%s,conjunction_mode=>true)),
                paradedb.boost(4,paradedb.phrase_prefix('name',%s)),
                paradedb.match('oracle_text',%s,conjunction_mode=>true),
                paradedb.boost(2,paradedb.match('type_line',%s,conjunction_mode=>true))
            ]) ORDER BY paradedb.score(id) DESC,id LIMIT %s
        """,
            (query, tokens, query, query, limit),
        ).fetchall()
        if not rows and len(query.strip()) >= 3:
            rows = conn.execute(
                """
                SELECT oracle_id::text AS id,name,oracle_text,type_line,document,
                    paradedb.score(id)::float8 AS score
                FROM eval_bm25 WHERE id @@@ paradedb.match('name',%s,
                    distance=>1,transposition_cost_one=>true,conjunction_mode=>true)
                ORDER BY paradedb.score(id) DESC,id LIMIT %s
            """,
                (query, limit),
            ).fetchall()
    return [
        {
            **row,
            "kind": "card",
            "reason": "BM25 name/type/rules",
            "href": "/mtg/search?"
            + urlencode({"q": row["name"], "printing": row["document"]["id"]}),
        }
        for row in rows
    ]
