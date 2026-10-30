"""Local-only configuration and inference for the opt-in search experiment."""

import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / ".local" / "search-evaluation"
MODEL = "bge-m3"


def configure():
    for line in (
        (ROOT / ".env").read_text().splitlines() if (ROOT / ".env").exists() else []
    ):
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value)
    url = os.environ.get("SEARCH_EVALUATION_DATABASE_URL", "")
    parsed = urlparse(url)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.path.startswith(
        "/spellbook_search_eval_"
    ):
        raise ValueError(
            "Set SEARCH_EVALUATION_DATABASE_URL to the assigned loopback evaluation DB"
        )
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    return url


def connect():
    return psycopg.connect(configure(), autocommit=True, row_factory=dict_row)


def embed(texts):
    started = time.perf_counter()
    payload = json.dumps({"model": MODEL, "input": texts, "truncate": False}).encode()
    request = Request(
        "http://127.0.0.1:11434/api/embed",
        payload,
        {"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=300) as response:
        result = json.load(response)
    vectors = result["embeddings"]
    if len(vectors) != len(texts) or any(len(vector) != 1024 for vector in vectors):
        raise ValueError("Unexpected bge-m3 embedding dimensions or count")
    return vectors, (time.perf_counter() - started) * 1000


def query_embedding(query, cache):
    if query in cache:
        return cache[query], 0.0, True
    vectors, elapsed = embed([query])
    cache[query] = vectors[0]
    return vectors[0], elapsed, False


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)
