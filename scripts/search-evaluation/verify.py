"""Actual database checks and filtered ANN recall against exact vector results."""

import json
import statistics
import time

from common import ARTIFACTS, connect, query_embedding, write_json
from providers import deck_matches, seed_decks
from runner import retrieve
from variants import _tsquery, _vector_literal, search


def nodes(value):
    found = []
    if isinstance(value, dict):
        if "Node Type" in value:
            found.append(
                value["Node Type"]
                + (":" + value["Index Name"] if "Index Name" in value else "")
            )
        for child in value.values():
            found.extend(nodes(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(nodes(child))
    return found


def verify():
    report = json.loads((ARTIFACTS / "results.json").read_text())
    cache = json.loads((ARTIFACTS / "query-embeddings.json").read_text())
    evidence = {"checks": [], "recall": [], "filtered": [], "tuning": []}
    with connect() as conn:
        seed_decks(conn)
        assert [
            r["name"] for r in deck_matches(conn, "decks containing Sol Ring", "owner")
        ] == ["Elven Expedition"]
        assert [
            r["name"] for r in deck_matches(conn, "decks containing Sol Ring", "other")
        ] == ["Private Rival Deck"]
        assert deck_matches(conn, "decks containing Sol Ring", "guest") == []
        evidence["checks"].append(
            "Synthetic owner/other/guest predicates isolate Deck-content results"
        )
        for mode in ["baseline", "lexical", "lexical-scan"]:
            search(conn, mode, "'; DROP TABLE eval_cards; --", limit=5)
        assert (
            conn.execute("SELECT count(*) AS n FROM eval_cards").fetchone()["n"]
            == 34948
        )
        assert not conn.execute(
            "SELECT to_tsvector('simple','untap') @@ to_tsquery('simple',%s) AS found",
            (_tsquery(["tap"], completion=True),),
        ).fetchone()["found"]
        evidence["checks"].append(
            "Bound parameters preserve the corpus; tap prefixes do not match untap"
        )
        for case in report["cases"]:
            if case["kind"] not in {"card", "none"}:
                continue
            vector = cache[case["query"]]
            exact = retrieve(conn, "vector", case["query"], vector)
            ids = {row["id"] for row in exact}
            for ef in [40, 100, 200, 400]:
                with conn.transaction():
                    conn.execute(f"SET LOCAL hnsw.ef_search={ef}")
                    conn.execute("SET LOCAL hnsw.iterative_scan='strict_order'")
                    started = time.perf_counter()
                    approximate = search(
                        conn, "vector-ann", case["query"], embedding=vector
                    )
                    elapsed = (time.perf_counter() - started) * 1000
                row = {
                    "case": case["id"],
                    "ef_search": ef,
                    "recall_at_10": len(ids & {r["id"] for r in approximate})
                    / len(ids),
                    "ms": elapsed,
                }
                evidence["tuning"].append(row)
                if ef == 100:
                    evidence["recall"].append(row)
        vector, _ms, _hit = query_embedding("counter target spell", cache)
        literal = _vector_literal(vector)
        for title, condition in [
            ("all", "true"),
            ("artifact", "type_line ILIKE '%%Artifact%%'"),
            ("sparse-id", "id::text LIKE '00%%'"),
        ]:
            exact_sql = f"""WITH distances AS MATERIALIZED (
                SELECT id::text,embedding <=> %s::vector AS distance FROM eval_cards
                WHERE embedding IS NOT NULL AND {condition})
                SELECT id FROM distances ORDER BY distance,id LIMIT 10"""
            exact = {
                row["id"] for row in conn.execute(exact_sql, (literal,)).fetchall()
            }
            ann_sql = f"""SELECT id::text FROM eval_cards WHERE embedding IS NOT NULL AND {condition}
                ORDER BY embedding <=> %s::vector LIMIT 10"""
            for title_setting, ef, iteration in [
                ("default", 40, "off"),
                ("iterative", 100, "strict_order"),
            ]:
                with conn.transaction():
                    conn.execute(f"SET LOCAL hnsw.ef_search={ef}")
                    conn.execute(f"SET LOCAL hnsw.iterative_scan='{iteration}'")
                    started = time.perf_counter()
                    actual = {
                        row["id"]
                        for row in conn.execute(ann_sql, (literal,)).fetchall()
                    }
                    elapsed = (time.perf_counter() - started) * 1000
                    plan = conn.execute(
                        "EXPLAIN (FORMAT JSON) " + ann_sql, (literal,)
                    ).fetchone()["QUERY PLAN"]
                evidence["filtered"].append(
                    {
                        "scope": title,
                        "setting": title_setting,
                        "returned": len(actual),
                        "expected": len(exact),
                        "recall_at_10": len(exact & actual) / len(exact),
                        "ms": elapsed,
                        "plan": nodes(plan),
                    }
                )
    evidence["mean_recall_at_10"] = statistics.mean(
        row["recall_at_10"] for row in evidence["recall"]
    )
    evidence["minimum_recall_at_10"] = min(
        row["recall_at_10"] for row in evidence["recall"]
    )
    write_json(ARTIFACTS / "verification.json", evidence)
    print(json.dumps(evidence))


if __name__ == "__main__":
    verify()
