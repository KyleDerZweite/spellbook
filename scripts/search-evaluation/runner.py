"""Opt-in local experiment. Run through pnpm search:evaluate after setup:python."""

import argparse
import hashlib
import json
import math
import statistics
import threading
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import psycopg
from common import ARTIFACTS, connect, query_embedding, write_json
from providers import TARGETS, deck_matches, seed_decks, static_matches

LABELS = {
    "baseline": "Current PostgreSQL",
    "lexical": "Weighted lexical + completion",
    "lexical-scan": "Weighted lexical, exhaustive scan",
    "bm25": "ParadeDB BM25 + typo fallback",
    "vector": "BGE-M3 + exact pgvector",
    "hybrid": "Lexical + exact vector RRF",
    "vector-ann": "BGE-M3 + HNSW",
    "hybrid-ann": "Lexical + HNSW RRF",
}
CACHE = {}
CACHE_LOCK = threading.Lock()


def retrieve(conn, variant, query, embedding=None):
    if variant not in LABELS:
        raise ValueError("Unknown search variant")
    if variant == "bm25":
        from bm25 import search

        return search(query)
    from variants import search

    with conn.transaction():
        if variant.endswith("-ann"):
            if (
                conn.execute(
                    "SELECT to_regclass('eval_cards_hnsw') AS index"
                ).fetchone()["index"]
                is None
            ):
                raise ValueError("Build the HNSW index before evaluating ANN")
            conn.execute("SET LOCAL hnsw.ef_search=100")
            conn.execute("SET LOCAL hnsw.iterative_scan='strict_order'")
        return search(conn, variant, query, embedding=embedding, limit=10)


def search_global(conn, variant, query, *, cache=None, account="owner"):
    if not isinstance(query, str) or len(query) > 300 or variant not in LABELS:
        raise ValueError("Invalid evaluation search")
    started = time.perf_counter()
    local = static_matches(query)
    decks = deck_matches(conn, query, account)
    if not query.strip() or any(row.get("exact") for row in local):
        return {
            "results": local,
            "inference_ms": 0,
            "retrieval_ms": 0,
            "total_ms": (time.perf_counter() - started) * 1000,
            "cache_hit": False,
        }
    if query.lower().startswith("decks containing ") or decks:
        return {
            "results": decks,
            "inference_ms": 0,
            "retrieval_ms": 0,
            "total_ms": (time.perf_counter() - started) * 1000,
            "cache_hit": False,
        }
    embedding, inference_ms, cache_hit = None, 0, False
    if variant.startswith(("vector", "hybrid")):
        with CACHE_LOCK:
            embedding, inference_ms, cache_hit = query_embedding(
                query, CACHE if cache is None else cache
            )
    retrieval_started = time.perf_counter()
    cards = retrieve(conn, variant, query, embedding)
    retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
    return {
        "results": [*local, *cards][:10],
        "inference_ms": inference_ms,
        "retrieval_ms": retrieval_ms,
        "total_ms": (time.perf_counter() - started) * 1000,
        "cache_hit": cache_hit,
    }


def percentile(values, quantile):
    values = sorted(values)
    return values[min(len(values) - 1, max(0, math.ceil(len(values) * quantile) - 1))]


def ann_index():
    started = time.perf_counter()
    with connect() as conn:
        counts = conn.execute(
            "SELECT count(*) AS total,count(embedding) AS embedded FROM eval_cards"
        ).fetchone()
        if counts["total"] != counts["embedded"]:
            raise ValueError("Complete the embedding corpus before indexing it")
        conn.execute("SET maintenance_work_mem='256MB'")
        conn.execute("SET max_parallel_maintenance_workers=0")
        conn.execute(
            "CREATE INDEX eval_cards_hnsw ON eval_cards USING hnsw (embedding vector_cosine_ops)"
        )
        conn.execute("ANALYZE eval_cards")
        info = {
            "build_ms": (time.perf_counter() - started) * 1000,
            "bytes": conn.execute(
                "SELECT pg_relation_size('eval_cards_hnsw') AS n"
            ).fetchone()["n"],
        }
    write_json(ARTIFACTS / "hnsw.json", info)
    print(json.dumps(info))


def benchmark(repeats=5):
    fixture = Path(__file__).with_name("cases.json")
    cases = [
        case
        for case in json.loads(fixture.read_text())["cases"]
        if case["split"] == "test"
    ]
    with connect() as conn:
        count = conn.execute(
            "SELECT count(*) AS total,count(embedding) AS embedded FROM eval_cards"
        ).fetchone()
        if count["total"] != count["embedded"]:
            raise ValueError(
                "Complete all canonical embeddings before comparing retrieval variants"
            )
        seed_decks(conn)
        cache = {}
        cold = []
        for case in cases:
            if case["kind"] in {"card", "none"}:
                _, elapsed, _ = query_embedding(case["query"], cache)
                cold.append({"case": case["id"], "ms": elapsed})
        write_json(ARTIFACTS / "query-embeddings.json", cache)
        observations = []
        # Each variant receives one unmeasured warm-up per query, followed by interleaved trials.
        for case in cases:
            for variant in LABELS:
                search_global(conn, variant, case["query"], cache=cache)
            for trial in range(repeats):
                order = list(LABELS)
                shift = trial % len(order)
                for variant in order[shift:] + order[:shift]:
                    value = search_global(conn, variant, case["query"], cache=cache)
                    observations.append(
                        {
                            "case": case["id"],
                            "variant": variant,
                            "trial": trial,
                            "retrieval_ms": value["retrieval_ms"],
                            "total_ms": value["total_ms"],
                            "results": [
                                {k: v for k, v in row.items() if k != "document"}
                                for row in value["results"]
                            ],
                        }
                    )
            print(
                json.dumps({"completed_case": case["id"], "query": case["query"]}),
                flush=True,
            )
    report = {
        "observed_at": datetime.now(UTC).isoformat(),
        "case_sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
        "repeats": repeats,
        "cases": cases,
        "cold_query_embedding": cold,
        "corpus": json.loads((ARTIFACTS / "corpus.json").read_text()),
        "observations": observations,
    }
    write_json(ARTIFACTS / "results.json", report)
    summarize(report)


def summarize(report):
    summaries = []
    details = []
    for variant, label in LABELS.items():
        by_group = {}
        for case in report["cases"]:
            records = [
                r
                for r in report["observations"]
                if r["case"] == case["id"] and r["variant"] == variant
            ]
            names = [r["name"] for r in records[0]["results"]]
            rank = next(
                (n for n, name in enumerate(names, 1) if name in case["expected"]), None
            )
            known_hit = (
                (rank is not None and rank <= 5) if case["expected"] else not names
            )
            times = [r["total_ms"] for r in records]
            detail = {
                "case": case["id"],
                "variant": variant,
                "query": case["query"],
                "group": case["group"],
                "known_hit_at_5": known_hit,
                "known_rank": rank,
                "top5": names[:5],
                "p50_ms": statistics.median(times),
                "p95_ms": percentile(times, 0.95),
            }
            details.append(detail)
            by_group.setdefault(case["group"], []).append(detail)
        summaries.append(
            {
                "id": variant,
                "label": label,
                "groups": {
                    group: {
                        "cases": len(rows),
                        "known_hits_at_5": sum(r["known_hit_at_5"] for r in rows),
                        "mrr_known": statistics.mean(
                            1 / r["known_rank"] if r["known_rank"] else 0 for r in rows
                        ),
                        "p50_ms": statistics.median(r["p50_ms"] for r in rows),
                    }
                    for group, rows in by_group.items()
                },
                "positive_known_hit_at_5": statistics.mean(
                    r["known_hit_at_5"]
                    for r in details
                    if r["variant"] == variant and r["group"] != "empty"
                ),
                "card_warm_p95_ms": percentile(
                    [
                        r["total_ms"]
                        for r in report["observations"]
                        if r["variant"] == variant
                        and next(c for c in report["cases"] if c["id"] == r["case"])[
                            "kind"
                        ]
                        == "card"
                    ],
                    0.95,
                ),
            }
        )
    summary = {
        "observed_at": report["observed_at"],
        "case_sha256": report["case_sha256"],
        "corpus": report["corpus"],
        "repeats": report["repeats"],
        "variants": summaries,
        "cases": details,
        "cold_embedding_p50_ms": statistics.median(
            r["ms"] for r in report["cold_query_embedding"]
        ),
        "cold_embedding_p95_ms": percentile(
            [r["ms"] for r in report["cold_query_embedding"]], 0.95
        ),
        "limitations": [
            "Agent-authored known answers are incomplete relevance labels.",
            "Warm timings exclude new-query inference, network and UI debounce.",
            "Synthetic Deck scope is not new production authentication evidence.",
            "English Demo corpus; no human usability study or concurrent-load claim.",
        ],
    }
    write_json(ARTIFACTS / "summary.json", summary)
    print(
        json.dumps(
            {
                "variants": [
                    {k: v for k, v in r.items() if k != "groups"} for r in summaries
                ]
            }
        )
    )


def serve(port=5198):
    with connect() as conn:
        seed_decks(conn)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def respond(self, status, payload):
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/state":
                self.respond(404, {"error": "Not found"})
                return
            with connect() as conn:
                count = conn.execute("SELECT count(*) AS n FROM eval_cards").fetchone()[
                    "n"
                ]
            self.respond(
                200,
                {
                    "targets": TARGETS,
                    "cards": count,
                    "variants": [
                        {"id": key, "label": value} for key, value in LABELS.items()
                    ],
                },
            )

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if self.path != "/search" or not 0 < length <= 1024:
                    self.respond(400, {"error": "Invalid search request"})
                    return
                data = json.loads(self.rfile.read(length))
                with connect() as conn:
                    result = search_global(conn, data.get("variant"), data.get("query"))
                self.respond(200, result)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.respond(400, {"error": "Invalid search request"})
            except (psycopg.Error, OSError) as exc:
                print(type(exc).__name__, flush=True)
                self.respond(503, {"error": "Evaluation provider unavailable"})

    print(f"Search evaluation listening on http://127.0.0.1:{port}", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "prepare",
            "names",
            "embed",
            "bm25",
            "index",
            "serve",
            "benchmark",
            "summarize",
        ],
    )
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()
    if args.command == "prepare":
        from prepare import prepare

        prepare()
    elif args.command == "embed":
        from prepare import embeddings

        embeddings(batch_size=64)
    elif args.command == "names":
        from prepare import name_index

        name_index()
    elif args.command == "bm25":
        from bm25 import prepare

        prepare()
    elif args.command == "index":
        ann_index()
    elif args.command == "serve":
        serve()
    elif args.command == "benchmark":
        benchmark(args.repeats)
    else:
        summarize(json.loads((ARTIFACTS / "results.json").read_text()))
