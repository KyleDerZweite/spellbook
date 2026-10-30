"""Build a disposable canonical search projection and resumable real embeddings."""

import json
import time
from urllib.request import urlopen

from common import ARTIFACTS, MODEL, connect, embed, write_json


def prepare():
    started = time.perf_counter()
    with connect() as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS eval_cards (
                id uuid PRIMARY KEY, name text NOT NULL, names text[] NOT NULL,
                oracle_text text NOT NULL, type_line text NOT NULL,
                name_key text NOT NULL, joined_name text NOT NULL,
                search_vector tsvector NOT NULL, embedding vector(1024), document jsonb NOT NULL
            )
        """)
        count = conn.execute("SELECT count(*) AS n FROM eval_cards").fetchone()["n"]
        if count:
            raise ValueError(
                "Projection already exists; reuse it or assign another disposable DB"
            )
        conn.execute("""
            INSERT INTO eval_cards
            WITH source AS MATERIALIZED (
                SELECT p.* FROM catalog_printings p
                JOIN catalog_state s ON s.active_generation=p.generation_id AND s.id=1
            ), aliases AS (
                SELECT oracle_id,array_agg(DISTINCT alias ORDER BY alias) AS names
                FROM source CROSS JOIN LATERAL unnest(ARRAY[
                    name, printed_name, document->>'back_face_name'
                ]) alias WHERE alias IS NOT NULL AND alias<>'' GROUP BY oracle_id
            ), representatives AS (
                SELECT DISTINCT ON (oracle_id) oracle_id,name,document
                FROM source ORDER BY oracle_id,(lang='en') DESC,
                    document->>'released_at' DESC,id
            )
            SELECT r.oracle_id,r.name,a.names,coalesce(document->>'oracle_text',''),
                coalesce(document->>'type_line',''),lower(r.name),
                regexp_replace(lower(r.name),'[^[:alnum:]]','','g'),
                setweight(to_tsvector('simple',array_to_string(a.names,' ')),'A') ||
                setweight(to_tsvector('simple',coalesce(document->>'type_line','')),'B') ||
                setweight(to_tsvector('simple',coalesce(document->>'oracle_text','')),'C'),
                NULL,r.document
            FROM representatives r JOIN aliases a USING(oracle_id)
        """)
        conn.execute(
            "CREATE INDEX eval_cards_names ON eval_cards USING gin(name_key gin_trgm_ops)"
        )
        conn.execute(
            "CREATE INDEX eval_cards_words ON eval_cards USING gin(search_vector)"
        )
        conn.execute(
            "CREATE INDEX eval_cards_joined ON eval_cards(joined_name text_pattern_ops)"
        )
        conn.execute("ANALYZE eval_cards")
        info = conn.execute("""
            SELECT count(*) AS cards,
                (SELECT count(*) FROM catalog_printings) AS printings,
                (SELECT active_generation::text FROM catalog_state WHERE id=1) AS generation,
                version() AS postgres,
                pg_total_relation_size('eval_cards') AS projection_bytes
            FROM eval_cards
        """).fetchone()
    info["prepare_ms"] = (time.perf_counter() - started) * 1000
    write_json(ARTIFACTS / "corpus.json", info)
    print(json.dumps(info))


def name_index():
    started = time.perf_counter()
    with connect() as conn:
        conn.execute("""CREATE TABLE eval_names AS
            SELECT DISTINCT id,lower(a.name) AS name_key,to_tsvector('simple',a.name) AS words
            FROM eval_cards CROSS JOIN LATERAL unnest(names) a(name)""")
        conn.execute(
            "CREATE INDEX eval_names_trigram ON eval_names USING gin(name_key gin_trgm_ops)"
        )
        conn.execute("CREATE INDEX eval_names_words ON eval_names USING gin(words)")
        conn.execute("CREATE INDEX eval_names_exact ON eval_names(name_key)")
        conn.execute("ANALYZE eval_names")
        info = conn.execute(
            "SELECT count(*) AS rows,pg_total_relation_size('eval_names') AS bytes FROM eval_names"
        ).fetchone()
    info["build_ms"] = (time.perf_counter() - started) * 1000
    write_json(ARTIFACTS / "names.json", info)
    print(json.dumps(info))


def embeddings(batch_size=16, maximum=None):
    started = time.perf_counter()
    completed = 0
    with urlopen("http://127.0.0.1:11434/api/tags", timeout=10) as response:
        models = json.load(response)["models"]
    model = next(row for row in models if row["name"].split(":")[0] == MODEL)
    manifest = ARTIFACTS / "embeddings.json"
    with connect() as conn:
        counts = conn.execute(
            "SELECT count(*) AS total,count(embedding) AS embedded FROM eval_cards"
        ).fetchone()
        previous = json.loads(manifest.read_text()) if manifest.exists() else None
        if counts["embedded"] and (
            not previous or previous["digest"] != model["digest"]
        ):
            raise ValueError(
                "Existing embeddings have no matching model manifest; use a fresh experiment DB"
            )
        if counts["embedded"] == counts["total"] and previous:
            print(json.dumps(previous))
            return
        write_json(
            manifest,
            {
                **counts,
                "model": MODEL,
                "digest": model["digest"],
                "dimensions": 1024,
                "elapsed_s": 0,
                "new_embeddings": 0,
            },
        )
        remaining = conn.execute("""
            SELECT id::text,name,type_line,oracle_text FROM eval_cards
            WHERE embedding IS NULL ORDER BY id
        """).fetchall()
        if maximum is not None:
            remaining = remaining[:maximum]
        for offset in range(0, len(remaining), batch_size):
            batch = remaining[offset : offset + batch_size]
            texts = [
                f"{row['name']}\n{row['type_line']}\n{row['oracle_text']}"
                for row in batch
            ]
            vectors, _ = embed(texts)
            with conn.transaction(), conn.cursor() as cursor:
                cursor.executemany(
                    "UPDATE eval_cards SET embedding=%s::vector WHERE id=%s",
                    [
                        (json.dumps(vector), row["id"])
                        for row, vector in zip(batch, vectors, strict=True)
                    ],
                )
            completed += len(batch)
            if completed % 256 == 0 or completed == len(remaining):
                print(
                    json.dumps(
                        {
                            "embedded": completed,
                            "requested": len(remaining),
                            "elapsed_s": round(time.perf_counter() - started, 2),
                        }
                    ),
                    flush=True,
                )
        counts = conn.execute(
            "SELECT count(*) AS total,count(embedding) AS embedded FROM eval_cards"
        ).fetchone()
    info = {
        **counts,
        "model": MODEL,
        "digest": model["digest"],
        "dimensions": 1024,
        "elapsed_s": time.perf_counter() - started,
        "new_embeddings": completed,
    }
    write_json(ARTIFACTS / "embeddings.json", info)
    print(json.dumps(info))
