"""Opt-in canonical-card retrieval experiments, independent of production APIs.

Lexical deliberately adds alias/token completion, joined names and weighted prefix
FTS. Only the final alphabetic token is a prefix; numbers remain complete tokens.
The simple dictionary preserves tap/untap and performs no stemming or translation.
Typo fallback applies to names only and requires literal numeric-token agreement.
These are retrieval rules, not MTG negation or numeric-reasoning guarantees.
"""

from __future__ import annotations

import math
import re
from typing import Any
from urllib.parse import urlencode

VARIANTS = ("baseline", "lexical", "vector", "hybrid")
CANDIDATES = 100
RRF_K = 60
DIMENSIONS = 1024


def _query(value: str) -> str:
    if not isinstance(value, str) or len(value.encode("utf-16-le")) // 2 > 300:
        raise ValueError("query must be a string of at most 300 UTF-16 code units")
    return value.strip()


def _tokens(query: str) -> list[str]:
    return re.findall(r"[^\W_]+", query.lower(), flags=re.UNICODE)


def _tsquery(tokens: list[str], *, completion: bool) -> str:
    # Tokens contain letters and digits only. Quote lexemes anyway so user input
    # can never supply tsquery operators, quotes, weights or negation.
    return " & ".join(
        "'" + token + "'" + (":*" if completion and i == len(tokens) - 1 and token.isalpha() else "")
        for i, token in enumerate(tokens)
    )


def _result(row: dict[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["id"] = str(result["id"])
    result["kind"] = "card"
    destination = {"q": result["name"], "oracle_id": result["id"]}
    document = result.get("document")
    if isinstance(document, dict) and document.get("id"):
        destination["printing"] = str(document["id"])
    result["href"] = "/mtg/search?" + urlencode(destination)
    result["score"] = float(result["score"])
    return result


def _lexical(conn: Any, query: str) -> list[dict[str, Any]]:
    tokens = _tokens(query)
    params = {
        "query": query.lower(),
        "joined": "".join(tokens),
        "ts": _tsquery(tokens, completion=not query[-1:].isspace()),
        "numbers": [t for t in tokens if t.isdecimal()],
        "fuzzy": len(query) >= 3 and bool(tokens),
        "candidates": CANDIDATES,
    }
    # Every canonical row is scored before the bounded candidate LIMIT. No
    # alphabetical pre-limit can hide a stronger alias, name or rule-text match.
    sql = """
    WITH input AS (SELECT %(query)s::text AS q, %(joined)s::text AS joined,
        to_tsquery('simple', %(ts)s) AS ts),
    matches AS (
      SELECT c.id,c.name,c.oracle_text,c.type_line,c.document,
        EXISTS (SELECT 1 FROM unnest(c.names) n WHERE lower(n)=i.q)
          OR c.name_key=i.q AS exact,
        i.joined<>'' AND c.joined_name=i.joined AS joined,
        EXISTS (SELECT 1 FROM unnest(c.names) n
          WHERE to_tsvector('simple',n) @@ i.ts) AS name_match,
        c.search_vector @@ i.ts AS text_match,
        ts_rank_cd(c.search_vector,i.ts) AS rank,
        greatest(similarity(c.name_key,i.q),
          coalesce((SELECT max(similarity(lower(n),i.q)) FROM unnest(c.names) n),0)) AS typo
      FROM eval_cards c CROSS JOIN input i
    ), ranked AS (
      SELECT *, CASE WHEN exact THEN 6 WHEN joined THEN 5
        WHEN name_match THEN 4 WHEN text_match THEN 2 ELSE 1 END AS tier
      FROM matches
      WHERE exact OR joined OR name_match OR text_match OR
        (%(fuzzy)s AND typo >= 0.3 AND NOT EXISTS (
          SELECT 1 FROM unnest(%(numbers)s::text[]) n
          WHERE NOT EXISTS (SELECT 1 FROM unnest(string_to_array(
            regexp_replace(lower(name),'[^[:alnum:]]+',' ','g'),' ')) word
            WHERE word=n)))
    )
    SELECT id,name,oracle_text,type_line,document,exact,
      CASE WHEN tier>=4 THEN 'name' WHEN tier=2 THEN 'rule text' ELSE 'name typo' END AS reason,
      tier + CASE WHEN tier=1 THEN typo ELSE rank END AS score
    FROM ranked ORDER BY tier DESC, score DESC, id LIMIT %(candidates)s
    """
    from psycopg.rows import dict_row

    with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(sql, params)
        return [_result(row) for row in cursor.fetchall()]


def _vector_literal(embedding: list[float] | None) -> str:
    if embedding is None:
        raise ValueError("vector and hybrid search require a precomputed query embedding")
    if len(embedding) != DIMENSIONS or any(
        isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
        for v in embedding
    ):
        raise ValueError(f"embedding must contain {DIMENSIONS} finite numbers")
    if not any(embedding):
        raise ValueError("cosine search requires a nonzero embedding")
    return "[" + ",".join(str(float(v)) for v in embedding) + "]"


def _vector(conn: Any, literal: str) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row

    # MATERIALIZED computes every distance before ordering, including when the
    # caller has installed an ANN index. This variant is the exact-scan control.
    with conn.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """WITH distances AS MATERIALIZED (
              SELECT id,name,oracle_text,type_line,document,
                embedding <=> %s::vector AS distance FROM eval_cards
              WHERE embedding IS NOT NULL)
            SELECT id,name,oracle_text,type_line,document,
              1-distance AS score,'semantic' AS reason,false AS exact
            FROM distances ORDER BY distance,id LIMIT %s""",
            (literal, CANDIDATES),
        )
        return [_result(row) for row in cursor.fetchall()]


def _fuse(lexical: list[dict[str, Any]], vector: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for lane, rows in (("lexical", lexical), ("vector", vector)):
        seen: set[str] = set()
        for rank, row in enumerate(rows[:CANDIDATES], 1):
            key = str(row["id"])
            if key in seen:
                continue
            seen.add(key)
            if key not in merged:
                merged[key] = {**row, "score": 0.0, "exact": False, "reason": ""}
            result = merged[key]
            result["score"] += 1 / (RRF_K + rank)
            result["exact"] |= lane == "lexical" and bool(row.get("exact"))
            reason = str(row["reason"])
            result["reason"] = (result["reason"] + " + " + reason).strip(" +")
    return sorted(merged.values(), key=lambda row: (-bool(row["exact"]), -row["score"], row["id"]))


def _baseline(conn: Any, query: str, limit: int) -> list[dict[str, Any]]:
    from psycopg import RawCursor
    from psycopg.rows import tuple_row
    from spellbook_core.mtg.catalog_query import parse_catalog_search_request, search_sql

    sql, values = search_sql(parse_catalog_search_request({"query": query, "limit": limit}))
    with RawCursor(conn, row_factory=tuple_row) as cursor:
        cursor.execute(sql, values)
        documents = cursor.fetchone()[0]
    return [
        _result({"id": doc["oracle_id"], "name": doc["name"], "document": doc,
                 "oracle_text": doc.get("oracle_text"), "type_line": doc.get("type_line"),
                 "score": 1 / rank, "reason": "production name/rule text"})
        for rank, doc in enumerate(documents, 1)
    ]


def search(conn: Any, variant: str, query: str, *, embedding: list[float] | None = None,
           limit: int = 10) -> list[dict[str, Any]]:
    """Return bounded canonical results; baseline score encodes production order.

    Empty/punctuation-only experimental queries return no suggestions. Baseline
    still accepts punctuation as literal production input. No embedding fallback.
    """
    if variant not in VARIANTS:
        raise ValueError(f"unknown search variant: {variant}")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 0 <= limit <= CANDIDATES:
        raise ValueError(f"limit must be an integer between 0 and {CANDIDATES}")
    normalized = _query(query)
    literal = _vector_literal(embedding) if variant in ("vector", "hybrid") else None
    if not normalized or limit == 0:
        return []
    if variant == "baseline":
        return _baseline(conn, normalized, limit)
    if variant == "vector":
        return _vector(conn, literal)[:limit]
    if not _tokens(normalized):
        return []
    # Retain trailing whitespace for completed-final-token semantics.
    lexical = _lexical(conn, query.lstrip())
    return (lexical if variant == "lexical" else _fuse(lexical, _vector(conn, literal)))[:limit]
