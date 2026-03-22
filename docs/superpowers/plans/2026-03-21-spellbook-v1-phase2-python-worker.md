# Spellbook V1 Phase 2: Python Worker (Scryfall Ingestion + MeiliSearch Indexing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python worker that downloads Scryfall bulk card data, normalizes it, and indexes it into MeiliSearch so the frontend can do instant card search.

**Architecture:** The worker is a standalone Python service that runs alongside MeiliSearch. On startup it checks if MeiliSearch is seeded; if not, it downloads Scryfall's Default Cards (~530MB), transforms them, and loads both MeiliSearch indexes. Then it optionally downloads All Cards (~2.5GB) in the background. A scheduler re-checks Scryfall periodically for updates.

**Tech Stack:** Python 3.12+, uv (package manager), ruff (linter/formatter), httpx (HTTP client), meilisearch (Python SDK), orjson (fast JSON), pytest

**Spec:** `docs/superpowers/specs/2026-03-21-spellbook-v1-redesign-design.md` (Sections 4-5)

**Phases Overview:**
- Phase 1 (done): Infrastructure + SpacetimeDB module
- **Phase 2 (this plan):** Python Worker
- Phase 3: SvelteKit Frontend
- Phase 4: Integration, Dockerfiles, deployment docs

---

## Dependencies Rationale

| Package | Why |
|---------|-----|
| `httpx` | Modern HTTP client with streaming download support for 500MB-2.5GB files |
| `meilisearch` | Official MeiliSearch Python SDK for index configuration and document upload |
| `orjson` | 10x faster than stdlib json for parsing 500MB+ card data files |
| `pytest` | Standard Python testing framework |
| `respx` | Mock httpx requests in tests without network access |
| `ruff` | Fast Python linter and formatter, replaces flake8 + black + isort in one tool |

No other dependencies. Config uses `os.environ` (stdlib). Scheduling uses `time.sleep` + `threading` (stdlib).

---

## File Structure

```
worker/
├── pyproject.toml                 # Project config, dependencies, ruff + pytest config
├── uv.lock                       # Lockfile (committed)
├── src/
│   └── worker/
│       ├── __init__.py
│       ├── main.py                # Entry point, startup sequence, scheduling
│       ├── config.py              # Environment variable loading
│       ├── scryfall.py            # Scryfall bulk data API client + download
│       ├── transform.py           # Card normalization for MeiliSearch
│       └── indexer.py             # MeiliSearch index setup + document upload
├── tests/
│   ├── conftest.py                # Shared fixtures
│   ├── fixtures/
│   │   ├── normal_card.json       # Standard single-face card
│   │   ├── dfc_card.json          # Double-faced card (transform layout)
│   │   ├── split_card.json        # Split card (Fire // Ice)
│   │   ├── adventure_card.json    # Adventure card (Bonecrusher Giant)
│   │   └── bulk_data_list.json    # Scryfall bulk-data API response
│   ├── test_config.py
│   ├── test_scryfall.py
│   ├── test_transform.py
│   ├── test_indexer.py
│   └── test_main.py
└── Dockerfile
```

---

### Task 1: Project scaffold

**Files:**
- Create: `worker/pyproject.toml`
- Create: `worker/src/worker/__init__.py`
- Create: `worker/src/worker/main.py` (placeholder)
- Create: `worker/tests/__init__.py` (empty)
- Create: `worker/tests/conftest.py` (empty)

- [ ] **Step 1: Create directory structure**

```bash
cd /home/kyle/CodingProjects/spellbook
mkdir -p worker/src/worker
mkdir -p worker/tests/fixtures
```

- [ ] **Step 2: Create pyproject.toml**

```toml
[project]
name = "spellbook-worker"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.28",
    "meilisearch>=0.33",
    "orjson>=3.10",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "respx>=0.22",
    "ruff>=0.11",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]

[tool.ruff]
target-version = "py312"
line-length = 99

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort
    "UP",   # pyupgrade
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
    "RUF",  # ruff-specific rules
]

[tool.ruff.format]
quote-style = "double"
```

- [ ] **Step 3: Create __init__.py files**

`worker/src/worker/__init__.py`:
```python
```

`worker/tests/__init__.py`:
```python
```

- [ ] **Step 4: Create placeholder main.py**

`worker/src/worker/main.py`:
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")


def main() -> None:
    log.info("Spellbook worker starting")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Create empty conftest.py**

`worker/tests/conftest.py`:
```python
```

- [ ] **Step 6: Install dependencies and verify**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv sync --all-extras
uv run pytest --co -q
```

Expected: No errors, 0 tests collected.

- [ ] **Step 7: Verify ruff works**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors, all files already formatted.

- [ ] **Step 8: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/
git commit -m "feat: scaffold Python worker project with uv + ruff

Dependencies: httpx, meilisearch, orjson. Dev: pytest, respx, ruff."
```

---

### Task 2: Config module

**Files:**
- Create: `worker/src/worker/config.py`
- Create: `worker/tests/test_config.py`

- [ ] **Step 1: Write the config test**

`worker/tests/test_config.py`:
```python
import pytest

from worker.config import WorkerConfig, load_config


class TestLoadConfigDefaults:
    """Test that load_config uses correct defaults when only required vars are set."""

    def test_returns_worker_config(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        cfg = load_config()
        assert isinstance(cfg, WorkerConfig)

    def test_meilisearch_url(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().meilisearch_url == "http://localhost:7700"

    def test_aggressive_preload_default_true(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().aggressive_preload is True

    def test_sync_interval_default_daily(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().sync_interval == "daily"

    def test_languages_default_en(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().languages == ["en"]

    def test_scryfall_url_default(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().scryfall_bulk_url == "https://api.scryfall.com/bulk-data"


class TestLoadConfigCustom:
    """Test that load_config respects custom environment variables."""

    @pytest.fixture(autouse=True)
    def _set_required(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meili:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "key-123")

    def test_custom_meilisearch_url(self):
        assert load_config().meilisearch_url == "http://meili:7700"

    def test_aggressive_preload_false(self, monkeypatch):
        monkeypatch.setenv("AGGRESSIVE_PRELOAD", "false")
        assert load_config().aggressive_preload is False

    def test_aggressive_preload_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("AGGRESSIVE_PRELOAD", "FALSE")
        assert load_config().aggressive_preload is False

    def test_sync_interval_weekly(self, monkeypatch):
        monkeypatch.setenv("SYNC_INTERVAL", "weekly")
        assert load_config().sync_interval == "weekly"

    def test_languages_multiple(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", "en,de,ja")
        assert load_config().languages == ["en", "de", "ja"]

    def test_languages_strips_whitespace(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", " en , de , ja ")
        assert load_config().languages == ["en", "de", "ja"]

    def test_languages_ignores_empty_segments(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", "en,,de,")
        assert load_config().languages == ["en", "de"]


class TestLoadConfigMissingRequired:
    """Test that load_config raises when required env vars are missing."""

    def test_missing_meili_master_key(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.delenv("MEILI_MASTER_KEY", raising=False)
        with pytest.raises(ValueError, match="MEILI_MASTER_KEY"):
            load_config()

    def test_empty_meili_master_key(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "")
        with pytest.raises(ValueError, match="MEILI_MASTER_KEY"):
            load_config()


class TestWorkerConfigImmutability:
    """Verify the config dataclass is frozen."""

    def test_cannot_mutate(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        cfg = load_config()
        with pytest.raises(AttributeError):
            cfg.meilisearch_url = "http://other:7700"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_config.py -v
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement config.py**

`worker/src/worker/config.py`:
```python
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class WorkerConfig:
    meilisearch_url: str
    meili_master_key: str
    aggressive_preload: bool
    sync_interval: str  # "daily" | "weekly" | "manual"
    languages: list[str]
    scryfall_bulk_url: str


def load_config() -> WorkerConfig:
    """Load worker configuration from environment variables."""
    meili_url = os.environ.get("MEILISEARCH_URL", "http://localhost:7700")
    master_key = os.environ.get("MEILI_MASTER_KEY")
    if not master_key:
        raise ValueError("MEILI_MASTER_KEY environment variable is required")

    aggressive = os.environ.get("AGGRESSIVE_PRELOAD", "true").lower() == "true"
    interval = os.environ.get("SYNC_INTERVAL", "daily")
    langs_raw = os.environ.get("LANGUAGES", "en")
    languages = [lang.strip() for lang in langs_raw.split(",") if lang.strip()]

    scryfall_url = os.environ.get(
        "SCRYFALL_BULK_URL", "https://api.scryfall.com/bulk-data"
    )

    return WorkerConfig(
        meilisearch_url=meili_url,
        meili_master_key=master_key,
        aggressive_preload=aggressive,
        sync_interval=interval,
        languages=languages,
        scryfall_bulk_url=scryfall_url,
    )
```

- [ ] **Step 4: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_config.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Lint and format**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/src/worker/config.py worker/tests/test_config.py
git commit -m "feat: add worker config module

Loads MeiliSearch URL, master key, preload and sync settings from env."
```

---

### Task 3: Scryfall client

**Files:**
- Create: `worker/src/worker/scryfall.py`
- Create: `worker/tests/test_scryfall.py`
- Create: `worker/tests/fixtures/bulk_data_list.json`

- [ ] **Step 1: Create the bulk data API fixture**

`worker/tests/fixtures/bulk_data_list.json`:
```json
{
  "object": "list",
  "has_more": false,
  "data": [
    {
      "object": "bulk_data",
      "id": "aaa-111",
      "type": "default_cards",
      "name": "Default Cards",
      "description": "Every card in English",
      "download_uri": "https://data.scryfall.io/default-cards/default-cards-20260321.json",
      "updated_at": "2026-03-21T09:00:00+00:00",
      "size": 529000000,
      "content_type": "application/json",
      "content_encoding": "gzip"
    },
    {
      "object": "bulk_data",
      "id": "bbb-222",
      "type": "all_cards",
      "name": "All Cards",
      "description": "Every card in every language",
      "download_uri": "https://data.scryfall.io/all-cards/all-cards-20260321.json",
      "updated_at": "2026-03-21T09:00:00+00:00",
      "size": 2480000000,
      "content_type": "application/json",
      "content_encoding": "gzip"
    },
    {
      "object": "bulk_data",
      "id": "ccc-333",
      "type": "oracle_cards",
      "name": "Oracle Cards",
      "description": "One per oracle ID",
      "download_uri": "https://data.scryfall.io/oracle-cards/oracle-cards-20260321.json",
      "updated_at": "2026-03-21T09:00:00+00:00",
      "size": 170000000,
      "content_type": "application/json",
      "content_encoding": "gzip"
    }
  ]
}
```

- [ ] **Step 2: Write scryfall client tests**

`worker/tests/test_scryfall.py`:
```python
import json
from pathlib import Path

import httpx
import pytest
import respx

from worker.scryfall import BulkDataInfo, ScryfallClient

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def bulk_list_json():
    return json.loads((FIXTURES / "bulk_data_list.json").read_text())


class TestFetchBulkDataList:
    """Tests for ScryfallClient.fetch_bulk_data_list()."""

    @respx.mock
    def test_returns_all_items(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert len(items) == 3

    @respx.mock
    def test_parses_types(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        types = [item.type for item in items]
        assert types == ["default_cards", "all_cards", "oracle_cards"]

    @respx.mock
    def test_parses_download_uri(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert "default-cards" in items[0].download_uri

    @respx.mock
    def test_parses_size(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        items = client.fetch_bulk_data_list()
        assert items[0].size == 529000000

    @respx.mock
    def test_raises_on_http_error(self):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(500)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        with pytest.raises(httpx.HTTPStatusError):
            client.fetch_bulk_data_list()


class TestGetDownloadInfo:
    """Tests for ScryfallClient.get_download_info()."""

    @respx.mock
    def test_finds_default_cards(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("default_cards")
        assert info is not None
        assert info.type == "default_cards"
        assert "default-cards" in info.download_uri

    @respx.mock
    def test_finds_all_cards(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("all_cards")
        assert info is not None
        assert info.type == "all_cards"

    @respx.mock
    def test_returns_none_for_missing_type(self, bulk_list_json):
        respx.get("https://api.scryfall.com/bulk-data").mock(
            return_value=httpx.Response(200, json=bulk_list_json)
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = client.get_download_info("nonexistent_type")
        assert info is None


class TestDownloadBulkFile:
    """Tests for ScryfallClient.download_bulk_file()."""

    @respx.mock
    def test_downloads_to_path(self, tmp_path):
        cards = [{"id": "card-1", "name": "Test Card"}]
        respx.get("https://data.scryfall.io/default-cards/default-cards-20260321.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/default-cards/default-cards-20260321.json",
            updated_at="2026-03-21T09:00:00+00:00",
            size=100,
        )
        dest = tmp_path / "cards.json"
        client.download_bulk_file(info, dest)
        assert dest.exists()

    @respx.mock
    def test_written_content_is_valid_json(self, tmp_path):
        cards = [{"id": "card-1", "name": "Test Card"}]
        respx.get("https://data.scryfall.io/default-cards/default-cards-20260321.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/default-cards/default-cards-20260321.json",
            updated_at="2026-03-21T09:00:00+00:00",
            size=100,
        )
        dest = tmp_path / "cards.json"
        client.download_bulk_file(info, dest)
        loaded = json.loads(dest.read_text())
        assert len(loaded) == 1
        assert loaded[0]["name"] == "Test Card"

    @respx.mock
    def test_creates_parent_directories(self, tmp_path):
        cards = [{"id": "card-1"}]
        respx.get("https://data.scryfall.io/test.json").mock(
            return_value=httpx.Response(200, content=json.dumps(cards).encode())
        )
        client = ScryfallClient("https://api.scryfall.com/bulk-data")
        info = BulkDataInfo(
            type="default_cards",
            download_uri="https://data.scryfall.io/test.json",
            updated_at="2026-03-21",
            size=10,
        )
        dest = tmp_path / "nested" / "dir" / "cards.json"
        client.download_bulk_file(info, dest)
        assert dest.exists()
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_scryfall.py -v
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement scryfall.py**

`worker/src/worker/scryfall.py`:
```python
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

log = logging.getLogger("worker.scryfall")


@dataclass
class BulkDataInfo:
    type: str
    download_uri: str
    updated_at: str
    size: int


class ScryfallClient:
    """Client for Scryfall's bulk data API."""

    def __init__(self, bulk_url: str = "https://api.scryfall.com/bulk-data") -> None:
        self.bulk_url = bulk_url

    def fetch_bulk_data_list(self) -> list[BulkDataInfo]:
        """Fetch the list of available bulk data files from Scryfall."""
        with httpx.Client() as client:
            resp = client.get(self.bulk_url)
            resp.raise_for_status()
            data = resp.json()

        return [
            BulkDataInfo(
                type=item["type"],
                download_uri=item["download_uri"],
                updated_at=item["updated_at"],
                size=item["size"],
            )
            for item in data["data"]
        ]

    def get_download_info(self, bulk_type: str) -> BulkDataInfo | None:
        """Get download info for a specific bulk data type."""
        items = self.fetch_bulk_data_list()
        for item in items:
            if item.type == bulk_type:
                return item
        return None

    def download_bulk_file(self, info: BulkDataInfo, dest: Path) -> None:
        """Download a bulk data file with streaming to avoid memory issues."""
        log.info(
            "Downloading %s (%d MB) to %s",
            info.type,
            info.size // (1024 * 1024),
            dest,
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=600.0) as client:
            with client.stream("GET", info.download_uri) as resp:
                resp.raise_for_status()
                downloaded = 0
                with open(dest, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if downloaded % (50 * 1024 * 1024) < 8192:
                            log.info(
                                "  %d / %d MB",
                                downloaded // (1024 * 1024),
                                info.size // (1024 * 1024),
                            )
        log.info("Download complete: %s", dest)
```

- [ ] **Step 5: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_scryfall.py -v
```

Expected: All tests PASS.

- [ ] **Step 6: Lint and format**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/src/worker/scryfall.py worker/tests/test_scryfall.py worker/tests/fixtures/bulk_data_list.json
git commit -m "feat: add Scryfall bulk data client

Fetches bulk data list, resolves download URIs, streams large files to disk."
```

---

### Task 4: Card transformation

This is the core logic. Scryfall card objects need normalization into flat MeiliSearch documents.

**Files:**
- Create: `worker/src/worker/transform.py`
- Create: `worker/tests/test_transform.py`
- Create: `worker/tests/fixtures/normal_card.json`
- Create: `worker/tests/fixtures/dfc_card.json`
- Create: `worker/tests/fixtures/split_card.json`
- Create: `worker/tests/fixtures/adventure_card.json`

- [ ] **Step 1: Create test fixture files**

`worker/tests/fixtures/normal_card.json`:
```json
{
  "object": "card",
  "id": "1a05204e-7f55-4bfe-8440-6be38b225c52",
  "oracle_id": "68954295-54e3-4303-a6bc-fc4547a4e3a3",
  "name": "Llanowar Elves",
  "lang": "en",
  "released_at": "2018-04-27",
  "layout": "normal",
  "mana_cost": "{G}",
  "cmc": 1.0,
  "type_line": "Creature — Elf Druid",
  "oracle_text": "{T}: Add {G}.",
  "colors": ["G"],
  "color_identity": ["G"],
  "keywords": [],
  "power": "1",
  "toughness": "1",
  "rarity": "common",
  "set": "dom",
  "set_name": "Dominaria",
  "set_id": "abc-set-id",
  "collector_number": "168",
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/1/a/1a05204e.jpg",
    "normal": "https://cards.scryfall.io/normal/front/1/a/1a05204e.jpg",
    "large": "https://cards.scryfall.io/large/front/1/a/1a05204e.jpg",
    "art_crop": "https://cards.scryfall.io/art_crop/front/1/a/1a05204e.jpg"
  },
  "finishes": ["nonfoil", "foil"],
  "legalities": {
    "standard": "not_legal",
    "modern": "legal",
    "commander": "legal"
  }
}
```

`worker/tests/fixtures/dfc_card.json`:
```json
{
  "object": "card",
  "id": "11bf83bb-c95b-4b4f-9a56-ce7a1816e5db",
  "oracle_id": "23456789-abcd-ef01-2345-6789abcdef01",
  "name": "Delver of Secrets // Insectile Aberration",
  "lang": "en",
  "released_at": "2011-09-30",
  "layout": "transform",
  "mana_cost": "{U}",
  "cmc": 1.0,
  "type_line": "Creature — Human Wizard // Creature — Human Insect",
  "colors": ["U"],
  "color_identity": ["U"],
  "keywords": ["transform"],
  "rarity": "common",
  "set": "isd",
  "set_name": "Innistrad",
  "set_id": "def-set-id",
  "collector_number": "51",
  "image_uris": null,
  "card_faces": [
    {
      "object": "card_face",
      "name": "Delver of Secrets",
      "mana_cost": "{U}",
      "type_line": "Creature — Human Wizard",
      "oracle_text": "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",
      "power": "1",
      "toughness": "1",
      "image_uris": {
        "small": "https://cards.scryfall.io/small/front/1/1/11bf83bb-front.jpg",
        "normal": "https://cards.scryfall.io/normal/front/1/1/11bf83bb-front.jpg"
      }
    },
    {
      "object": "card_face",
      "name": "Insectile Aberration",
      "mana_cost": "",
      "type_line": "Creature — Human Insect",
      "oracle_text": "Flying",
      "power": "3",
      "toughness": "2",
      "image_uris": {
        "small": "https://cards.scryfall.io/small/back/1/1/11bf83bb-back.jpg",
        "normal": "https://cards.scryfall.io/normal/back/1/1/11bf83bb-back.jpg"
      }
    }
  ],
  "finishes": ["nonfoil"],
  "legalities": {
    "standard": "not_legal",
    "modern": "legal",
    "commander": "legal"
  }
}
```

`worker/tests/fixtures/split_card.json`:
```json
{
  "object": "card",
  "id": "ab-split-id-123",
  "oracle_id": "split-oracle-id",
  "name": "Fire // Ice",
  "lang": "en",
  "released_at": "2001-06-01",
  "layout": "split",
  "mana_cost": "{1}{R} // {1}{U}",
  "cmc": 4.0,
  "type_line": "Instant // Instant",
  "oracle_text": null,
  "colors": ["R", "U"],
  "color_identity": ["R", "U"],
  "keywords": [],
  "rarity": "uncommon",
  "set": "apc",
  "set_name": "Apocalypse",
  "set_id": "apc-set-id",
  "collector_number": "128",
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/a/b/ab-split.jpg",
    "normal": "https://cards.scryfall.io/normal/front/a/b/ab-split.jpg"
  },
  "card_faces": [
    {
      "object": "card_face",
      "name": "Fire",
      "mana_cost": "{1}{R}",
      "type_line": "Instant",
      "oracle_text": "Fire deals 2 damage divided as you choose among one or two targets."
    },
    {
      "object": "card_face",
      "name": "Ice",
      "mana_cost": "{1}{U}",
      "type_line": "Instant",
      "oracle_text": "Tap target permanent.\nDraw a card."
    }
  ],
  "finishes": ["nonfoil", "foil"],
  "legalities": {
    "standard": "not_legal",
    "modern": "legal",
    "commander": "legal"
  }
}
```

`worker/tests/fixtures/adventure_card.json`:
```json
{
  "object": "card",
  "id": "cd-adventure-id-456",
  "oracle_id": "adventure-oracle-id",
  "name": "Bonecrusher Giant // Stomp",
  "lang": "en",
  "released_at": "2019-10-04",
  "layout": "adventure",
  "mana_cost": "{2}{R}",
  "cmc": 3.0,
  "type_line": "Creature — Giant // Instant — Adventure",
  "oracle_text": null,
  "colors": ["R"],
  "color_identity": ["R"],
  "keywords": ["adventure"],
  "power": "4",
  "toughness": "3",
  "rarity": "rare",
  "set": "eld",
  "set_name": "Throne of Eldraine",
  "set_id": "eld-set-id",
  "collector_number": "115",
  "image_uris": {
    "small": "https://cards.scryfall.io/small/front/c/d/cd-adventure.jpg",
    "normal": "https://cards.scryfall.io/normal/front/c/d/cd-adventure.jpg"
  },
  "card_faces": [
    {
      "object": "card_face",
      "name": "Bonecrusher Giant",
      "mana_cost": "{2}{R}",
      "type_line": "Creature — Giant",
      "oracle_text": "Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell's controller.",
      "power": "4",
      "toughness": "3"
    },
    {
      "object": "card_face",
      "name": "Stomp",
      "mana_cost": "{1}{R}",
      "type_line": "Instant — Adventure",
      "oracle_text": "Damage can't be prevented this turn. Stomp deals 2 damage to any target."
    }
  ],
  "finishes": ["nonfoil", "foil"],
  "legalities": {
    "standard": "not_legal",
    "modern": "legal",
    "commander": "legal"
  }
}
```

- [ ] **Step 2: Write transformation tests**

`worker/tests/test_transform.py`:
```python
import json
from pathlib import Path

import pytest

from worker.transform import MULTI_FACE_LAYOUTS, SKIP_LAYOUTS, transform_card

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class TestTransformNormalCard:
    """Test transformation of a standard single-face card."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("normal_card.json"))

    def test_id(self, doc):
        assert doc["id"] == "1a05204e-7f55-4bfe-8440-6be38b225c52"

    def test_oracle_id(self, doc):
        assert doc["oracle_id"] == "68954295-54e3-4303-a6bc-fc4547a4e3a3"

    def test_name(self, doc):
        assert doc["name"] == "Llanowar Elves"

    def test_type_line(self, doc):
        assert doc["type_line"] == "Creature — Elf Druid"

    def test_oracle_text(self, doc):
        assert doc["oracle_text"] == "{T}: Add {G}."

    def test_mana_cost(self, doc):
        assert doc["mana_cost"] == "{G}"

    def test_cmc(self, doc):
        assert doc["cmc"] == 1.0

    def test_colors(self, doc):
        assert doc["colors"] == ["G"]

    def test_color_identity(self, doc):
        assert doc["color_identity"] == ["G"]

    def test_rarity(self, doc):
        assert doc["rarity"] == "common"

    def test_set_code(self, doc):
        assert doc["set_code"] == "dom"

    def test_set_name(self, doc):
        assert doc["set_name"] == "Dominaria"

    def test_collector_number(self, doc):
        assert doc["collector_number"] == "168"

    def test_lang(self, doc):
        assert doc["lang"] == "en"

    def test_released_at(self, doc):
        assert doc["released_at"] == "2018-04-27"

    def test_layout(self, doc):
        assert doc["layout"] == "normal"

    def test_power(self, doc):
        assert doc["power"] == "1"

    def test_toughness(self, doc):
        assert doc["toughness"] == "1"

    def test_foil_available(self, doc):
        assert doc["is_foil_available"] is True

    def test_nonfoil_available(self, doc):
        assert doc["is_nonfoil_available"] is True

    def test_image_uri(self, doc):
        assert "normal" in doc["image_uri"]

    def test_image_uri_small(self, doc):
        assert "small" in doc["image_uri_small"]

    def test_no_back_face(self, doc):
        assert "back_face_name" not in doc


class TestTransformDFC:
    """Test transformation of a double-faced card (transform layout)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("dfc_card.json"))

    def test_name_includes_both_faces(self, doc):
        assert doc["name"] == "Delver of Secrets // Insectile Aberration"

    def test_layout(self, doc):
        assert doc["layout"] == "transform"

    def test_image_from_front_face(self, doc):
        assert "front" in doc["image_uri"]
        assert "front" in doc["image_uri_small"]

    def test_oracle_text_from_front(self, doc):
        assert "look at the top card" in doc["oracle_text"]

    def test_back_face_name(self, doc):
        assert doc["back_face_name"] == "Insectile Aberration"

    def test_back_face_image(self, doc):
        assert "back" in doc["back_face_image_uri"]

    def test_foil_unavailable(self, doc):
        assert doc["is_foil_available"] is False

    def test_nonfoil_available(self, doc):
        assert doc["is_nonfoil_available"] is True


class TestTransformSplitCard:
    """Test transformation of a split card (Fire // Ice)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("split_card.json"))

    def test_name(self, doc):
        assert doc["name"] == "Fire // Ice"

    def test_layout(self, doc):
        assert doc["layout"] == "split"

    def test_oracle_text_combines_faces(self, doc):
        assert "Fire deals 2 damage" in doc["oracle_text"]
        assert "Tap target permanent" in doc["oracle_text"]

    def test_has_image(self, doc):
        assert doc["image_uri"] is not None
        assert doc["image_uri"] != ""


class TestTransformAdventure:
    """Test transformation of an adventure card (Bonecrusher Giant)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("adventure_card.json"))

    def test_name(self, doc):
        assert doc["name"] == "Bonecrusher Giant // Stomp"

    def test_layout(self, doc):
        assert doc["layout"] == "adventure"

    def test_oracle_text_combines_faces(self, doc):
        assert "becomes the target" in doc["oracle_text"]
        assert "Damage can't be prevented" in doc["oracle_text"]

    def test_power_toughness(self, doc):
        assert doc["power"] == "4"
        assert doc["toughness"] == "3"


class TestTransformSkipLayouts:
    """Test that non-game card layouts are skipped."""

    @pytest.mark.parametrize(
        "layout",
        ["token", "double_faced_token", "art_series", "emblem", "planar", "scheme", "vanguard"],
    )
    def test_skip_layout_returns_none(self, layout):
        card = {"object": "card", "id": "skip-1", "layout": layout, "name": "Skipped"}
        assert transform_card(card) is None


class TestTransformEdgeCases:
    """Test edge cases and missing data."""

    def test_missing_id_returns_none(self):
        card = {"object": "card", "oracle_id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_missing_oracle_id_returns_none(self):
        card = {"object": "card", "id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_empty_id_returns_none(self):
        card = {"object": "card", "id": "", "oracle_id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_missing_oracle_text_defaults_empty(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Vanilla Creature",
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["oracle_text"] == ""

    def test_null_colors_defaults_empty_list(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Colorless",
            "colors": None,
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["colors"] == []

    def test_etched_foil_counts_as_foil(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Etched",
            "finishes": ["etched"],
        }
        doc = transform_card(card)
        assert doc["is_foil_available"] is True
        assert doc["is_nonfoil_available"] is False

    def test_multi_face_with_empty_faces_falls_back(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "transform",
            "name": "Broken DFC",
            "card_faces": [],
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["oracle_text"] == ""
        assert doc["image_uri"] == ""


class TestLayoutSets:
    """Verify the layout classification sets are correct."""

    def test_skip_layouts_are_non_game(self):
        assert "token" in SKIP_LAYOUTS
        assert "art_series" in SKIP_LAYOUTS
        assert "normal" not in SKIP_LAYOUTS

    def test_multi_face_includes_all_dfc_types(self):
        assert "transform" in MULTI_FACE_LAYOUTS
        assert "modal_dfc" in MULTI_FACE_LAYOUTS
        assert "split" in MULTI_FACE_LAYOUTS
        assert "adventure" in MULTI_FACE_LAYOUTS
        assert "normal" not in MULTI_FACE_LAYOUTS
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_transform.py -v
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement transform.py**

`worker/src/worker/transform.py`:
```python
from __future__ import annotations

# Layouts to skip (not real game cards)
SKIP_LAYOUTS = frozenset({
    "token",
    "double_faced_token",
    "art_series",
    "emblem",
    "planar",
    "scheme",
    "vanguard",
})

# Layouts where oracle_text lives on card_faces
MULTI_FACE_LAYOUTS = frozenset({
    "transform",
    "modal_dfc",
    "split",
    "adventure",
    "flip",
    "reversible_card",
})


def transform_card(raw: dict) -> dict | None:
    """Transform a Scryfall card object into a flat MeiliSearch document.

    Returns None for non-game cards (tokens, art series, etc.)
    """
    layout = raw.get("layout", "")
    if layout in SKIP_LAYOUTS:
        return None

    card_id = raw.get("id", "")
    oracle_id = raw.get("oracle_id", "")
    if not card_id or not oracle_id:
        return None

    # Resolve image URIs (top-level or from front face for DFCs)
    image_uri, image_uri_small = _resolve_images(raw)

    # Resolve oracle text
    oracle_text = _resolve_oracle_text(raw, layout)

    # Resolve finishes
    finishes = raw.get("finishes", [])
    is_foil_available = "foil" in finishes or "etched" in finishes
    is_nonfoil_available = "nonfoil" in finishes

    doc = {
        "id": card_id,
        "oracle_id": oracle_id,
        "name": raw.get("name", ""),
        "lang": raw.get("lang", "en"),
        "released_at": raw.get("released_at", ""),
        "layout": layout,
        "mana_cost": raw.get("mana_cost", ""),
        "cmc": raw.get("cmc", 0.0),
        "type_line": raw.get("type_line", ""),
        "oracle_text": oracle_text,
        "colors": raw.get("colors") or [],
        "color_identity": raw.get("color_identity") or [],
        "keywords": raw.get("keywords") or [],
        "power": raw.get("power"),
        "toughness": raw.get("toughness"),
        "rarity": raw.get("rarity", ""),
        "set_code": raw.get("set", ""),
        "set_name": raw.get("set_name", ""),
        "collector_number": raw.get("collector_number", ""),
        "image_uri": image_uri,
        "image_uri_small": image_uri_small,
        "is_foil_available": is_foil_available,
        "is_nonfoil_available": is_nonfoil_available,
        "legalities": raw.get("legalities") or {},
    }

    # Add back face info for DFCs
    if layout in ("transform", "modal_dfc", "reversible_card"):
        faces = raw.get("card_faces") or []
        if len(faces) >= 2:
            back = faces[1]
            doc["back_face_name"] = back.get("name", "")
            back_imgs = back.get("image_uris") or {}
            doc["back_face_image_uri"] = back_imgs.get("normal", "")

    return doc


def _resolve_images(raw: dict) -> tuple[str, str]:
    """Get normal and small image URIs, handling DFCs."""
    # Try top-level image_uris first
    image_uris = raw.get("image_uris")
    if image_uris:
        return image_uris.get("normal", ""), image_uris.get("small", "")

    # Fall back to front face for DFCs
    faces = raw.get("card_faces") or []
    if faces:
        front_imgs = faces[0].get("image_uris") or {}
        return front_imgs.get("normal", ""), front_imgs.get("small", "")

    return "", ""


def _resolve_oracle_text(raw: dict, layout: str) -> str:
    """Get oracle text, combining faces for multi-face cards."""
    # Single-face: use top-level oracle_text
    if layout not in MULTI_FACE_LAYOUTS:
        return raw.get("oracle_text") or ""

    # Multi-face: combine face texts for searchability
    faces = raw.get("card_faces") or []
    if not faces:
        return raw.get("oracle_text") or ""

    texts = []
    for face in faces:
        text = face.get("oracle_text")
        if text:
            texts.append(text)
    return "\n\n".join(texts)
```

- [ ] **Step 5: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_transform.py -v
```

Expected: All tests PASS.

- [ ] **Step 6: Lint and format**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/src/worker/transform.py worker/tests/test_transform.py worker/tests/fixtures/
git commit -m "feat: add card transformation for MeiliSearch

Normalizes Scryfall card data. Handles DFCs, split cards, adventures.
Skips tokens and art series."
```

---

### Task 5: MeiliSearch indexer

**Files:**
- Create: `worker/src/worker/indexer.py`
- Create: `worker/tests/test_indexer.py`

- [ ] **Step 1: Write indexer tests**

These tests mock the MeiliSearch client to verify index configuration and batch upload logic.

`worker/tests/test_indexer.py`:
```python
from unittest.mock import MagicMock, patch

import pytest

from worker.indexer import INDEX_SETTINGS_ALL, INDEX_SETTINGS_DISTINCT, MeiliIndexer


class TestIndexSettings:
    """Verify the two-index configuration constants."""

    def test_distinct_has_distinct_attribute(self):
        assert INDEX_SETTINGS_DISTINCT["distinctAttribute"] == "oracle_id"

    def test_all_has_no_distinct_attribute(self):
        assert "distinctAttribute" not in INDEX_SETTINGS_ALL

    def test_shared_searchable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["searchableAttributes"]
            == INDEX_SETTINGS_ALL["searchableAttributes"]
        )

    def test_shared_filterable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["filterableAttributes"]
            == INDEX_SETTINGS_ALL["filterableAttributes"]
        )

    def test_shared_sortable_attributes(self):
        assert (
            INDEX_SETTINGS_DISTINCT["sortableAttributes"]
            == INDEX_SETTINGS_ALL["sortableAttributes"]
        )

    def test_searchable_includes_name(self):
        assert "name" in INDEX_SETTINGS_DISTINCT["searchableAttributes"]

    def test_searchable_includes_oracle_text(self):
        assert "oracle_text" in INDEX_SETTINGS_DISTINCT["searchableAttributes"]

    def test_filterable_includes_colors(self):
        assert "colors" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]

    def test_filterable_includes_rarity(self):
        assert "rarity" in INDEX_SETTINGS_DISTINCT["filterableAttributes"]

    def test_filterable_includes_oracle_id(self):
        assert "oracle_id" in INDEX_SETTINGS_ALL["filterableAttributes"]

    def test_typo_tolerance_enabled(self):
        assert INDEX_SETTINGS_DISTINCT["typoTolerance"]["enabled"] is True
        assert INDEX_SETTINGS_ALL["typoTolerance"]["enabled"] is True


class TestConfigureIndexes:
    """Test MeiliIndexer.configure_indexes()."""

    def test_updates_both_indexes(self):
        mock_client = MagicMock()
        mock_distinct = MagicMock()
        mock_all = MagicMock()
        mock_client.index.side_effect = lambda name: {
            "cards_distinct": mock_distinct,
            "cards_all": mock_all,
        }[name]

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        mock_distinct.update_settings.assert_called_once()
        mock_all.update_settings.assert_called_once()

    def test_distinct_index_gets_oracle_id(self):
        mock_client = MagicMock()
        mock_distinct = MagicMock()
        mock_all = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        distinct_settings = mock_distinct.update_settings.call_args[0][0]
        assert distinct_settings["distinctAttribute"] == "oracle_id"

    def test_creates_indexes_with_primary_key(self):
        mock_client = MagicMock()
        mock_distinct = MagicMock()
        mock_all = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        indexer.distinct_index = mock_distinct
        indexer.all_index = mock_all
        indexer.configure_indexes()

        calls = mock_client.create_index.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0] == "cards_distinct"
        assert calls[1][0][0] == "cards_all"


class TestUploadDocuments:
    """Test MeiliIndexer._upload_to_index() batching and task UID tracking."""

    def test_batches_correctly(self):
        mock_index = MagicMock()
        mock_index.add_documents.return_value = MagicMock(task_uid=1)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 3

        docs = [{"id": f"card-{i}", "name": f"Card {i}"} for i in range(7)]
        task_uids = indexer._upload_to_index(mock_index, docs, "test_index")

        # 7 docs / batch_size 3 = 3 batches (3, 3, 1)
        assert mock_index.add_documents.call_count == 3
        assert len(task_uids) == 3

    def test_single_batch_when_under_limit(self):
        mock_index = MagicMock()
        mock_index.add_documents.return_value = MagicMock(task_uid=42)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 100

        docs = [{"id": f"card-{i}"} for i in range(5)]
        task_uids = indexer._upload_to_index(mock_index, docs, "test_index")

        assert mock_index.add_documents.call_count == 1
        assert len(mock_index.add_documents.call_args[0][0]) == 5
        assert task_uids == [42]

    def test_empty_docs_no_calls(self):
        mock_index = MagicMock()

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = MagicMock()
        indexer.batch_size = 100

        task_uids = indexer._upload_to_index(mock_index, [], "test_index")
        mock_index.add_documents.assert_not_called()
        assert task_uids == []


class TestHealthCheck:
    """Test MeiliIndexer.health_check()."""

    def test_returns_true_when_healthy(self):
        mock_client = MagicMock()
        mock_client.health.return_value = {"status": "available"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is True

    def test_returns_false_when_unhealthy(self):
        mock_client = MagicMock()
        mock_client.health.return_value = {"status": "unavailable"}

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is False

    def test_returns_false_on_exception(self):
        mock_client = MagicMock()
        mock_client.health.side_effect = ConnectionError("refused")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        indexer.client = mock_client
        assert indexer.health_check() is False


class TestGetCount:
    """Test MeiliIndexer._get_count()."""

    def test_returns_document_count(self):
        mock_index = MagicMock()
        mock_index.get_stats.return_value = MagicMock(number_of_documents=42000)

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        count = indexer._get_count(mock_index)
        assert count == 42000

    def test_returns_zero_on_error(self):
        mock_index = MagicMock()
        mock_index.get_stats.side_effect = Exception("not found")

        indexer = MeiliIndexer.__new__(MeiliIndexer)
        count = indexer._get_count(mock_index)
        assert count == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_indexer.py -v
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement indexer.py**

`worker/src/worker/indexer.py`:
```python
from __future__ import annotations

import logging
from pathlib import Path

import meilisearch
import orjson

from worker.transform import transform_card

log = logging.getLogger("worker.indexer")

# Spec Section 4: MeiliSearch Index Configuration
_SEARCHABLE = ["name", "type_line", "oracle_text", "set_name"]
_FILTERABLE = [
    "colors",
    "color_identity",
    "rarity",
    "set_code",
    "type_line",
    "mana_cost",
    "is_foil_available",
    "lang",
    "oracle_id",  # needed for printing-picker filter on cards_all
]
_SORTABLE = ["name", "rarity", "set_code", "collector_number"]

INDEX_SETTINGS_DISTINCT: dict = {
    "searchableAttributes": _SEARCHABLE,
    "filterableAttributes": _FILTERABLE,
    "sortableAttributes": _SORTABLE,
    "distinctAttribute": "oracle_id",
    "typoTolerance": {"enabled": True},
}

INDEX_SETTINGS_ALL: dict = {
    "searchableAttributes": _SEARCHABLE,
    "filterableAttributes": _FILTERABLE,
    "sortableAttributes": _SORTABLE,
    "typoTolerance": {"enabled": True},
}


class MeiliIndexer:
    """Manages MeiliSearch index configuration and document upload."""

    def __init__(
        self,
        url: str,
        master_key: str,
        batch_size: int = 20_000,
    ) -> None:
        self.client = meilisearch.Client(url, master_key)
        self.distinct_index = self.client.index("cards_distinct")
        self.all_index = self.client.index("cards_all")
        self.batch_size = batch_size

    def health_check(self) -> bool:
        """Check if MeiliSearch is reachable and healthy."""
        try:
            health = self.client.health()
            return health["status"] == "available"
        except Exception:
            return False

    def configure_indexes(self) -> None:
        """Create indexes and apply settings from spec Section 4."""
        log.info("Configuring cards_distinct index")
        self.client.create_index("cards_distinct", {"primaryKey": "id"})
        self.distinct_index.update_settings(INDEX_SETTINGS_DISTINCT)

        log.info("Configuring cards_all index")
        self.client.create_index("cards_all", {"primaryKey": "id"})
        self.all_index.update_settings(INDEX_SETTINGS_ALL)
        log.info("Index configuration applied")

    def get_distinct_count(self) -> int:
        """Get document count in cards_distinct index."""
        return self._get_count(self.distinct_index)

    def index_from_file(self, file_path: Path) -> int:
        """Read a bulk data JSON file, transform cards, upload to both indexes.

        Cards are sorted by released_at descending (newest first) so that
        MeiliSearch's distinctAttribute keeps the most recent printing.

        Returns the number of documents indexed.
        """
        log.info("Reading %s", file_path)
        raw_data = file_path.read_bytes()
        cards = orjson.loads(raw_data)
        log.info("Parsed %d raw cards", len(cards))

        # Transform and filter
        docs = []
        skipped = 0
        for card in cards:
            doc = transform_card(card)
            if doc is not None:
                docs.append(doc)
            else:
                skipped += 1
        log.info("Transformed %d cards (%d skipped)", len(docs), skipped)

        # Sort by released_at descending (newest first) for distinct dedup
        docs.sort(key=lambda d: d.get("released_at", ""), reverse=True)

        # Upload to both indexes and collect task UIDs
        log.info("Uploading to cards_distinct (%d docs)", len(docs))
        distinct_tasks = self._upload_to_index(self.distinct_index, docs, "cards_distinct")

        log.info("Uploading to cards_all (%d docs)", len(docs))
        all_tasks = self._upload_to_index(self.all_index, docs, "cards_all")

        # Wait for all tasks to complete (atomic sync per spec Section 5)
        all_task_uids = distinct_tasks + all_tasks
        log.info("Waiting for %d MeiliSearch tasks to complete", len(all_task_uids))
        for task_uid in all_task_uids:
            self.client.wait_for_task(task_uid, timeout_in_ms=300_000)
        log.info("All MeiliSearch tasks completed")

        return len(docs)

    def _upload_to_index(
        self,
        index: meilisearch.index.Index,
        docs: list[dict],
        index_name: str,
    ) -> list[int]:
        """Upload documents in batches. Returns list of task UIDs."""
        task_uids: list[int] = []
        total = len(docs)
        for i in range(0, total, self.batch_size):
            batch = docs[i : i + self.batch_size]
            task = index.add_documents(batch)
            task_uids.append(task.task_uid)
            log.info(
                "  %s: batch %d-%d / %d (task %s)",
                index_name,
                i,
                min(i + len(batch), total),
                total,
                task.task_uid,
            )
        return task_uids

    def _get_count(self, index: meilisearch.index.Index) -> int:
        """Get document count for an index."""
        try:
            stats = index.get_stats()
            return stats.number_of_documents
        except Exception:
            return 0
```

- [ ] **Step 4: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_indexer.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Lint and format**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/src/worker/indexer.py worker/tests/test_indexer.py
git commit -m "feat: add MeiliSearch indexer with two-index strategy

cards_distinct (oracle_id dedup) + cards_all (all printings).
Batch upload, sorted by release date for newest-first dedup."
```

---

### Task 6: Main entry point (progressive loading)

**Files:**
- Modify: `worker/src/worker/main.py`
- Create: `worker/tests/test_main.py`

- [ ] **Step 1: Write tests for main module functions**

`worker/tests/test_main.py`:
```python
import json
from unittest.mock import MagicMock, patch

import pytest

from worker.main import load_state, save_state, sync_interval_seconds, wait_for_meilisearch


class TestSyncIntervalSeconds:
    """Test conversion of interval strings to seconds."""

    def test_daily(self):
        assert sync_interval_seconds("daily") == 86400

    def test_weekly(self):
        assert sync_interval_seconds("weekly") == 604800

    def test_manual_returns_none(self):
        assert sync_interval_seconds("manual") is None

    def test_unknown_returns_none(self):
        assert sync_interval_seconds("hourly") is None


class TestWaitForMeilisearch:
    """Test MeiliSearch health check retry logic."""

    def test_returns_immediately_when_healthy(self):
        mock_indexer = MagicMock()
        mock_indexer.health_check.return_value = True
        wait_for_meilisearch(mock_indexer, max_retries=5)
        assert mock_indexer.health_check.call_count == 1

    @patch("worker.main.time.sleep")
    def test_retries_on_failure(self, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.side_effect = [False, False, True]
        wait_for_meilisearch(mock_indexer, max_retries=5)
        assert mock_indexer.health_check.call_count == 3
        assert mock_sleep.call_count == 2

    @patch("worker.main.time.sleep")
    @patch("worker.main.sys.exit")
    def test_exits_after_max_retries(self, mock_exit, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.return_value = False
        wait_for_meilisearch(mock_indexer, max_retries=3)
        mock_exit.assert_called_once_with(1)
        assert mock_indexer.health_check.call_count == 3

    @patch("worker.main.time.sleep")
    def test_exponential_backoff(self, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.side_effect = [False, False, False, True]
        wait_for_meilisearch(mock_indexer, max_retries=5)
        delays = [c[0][0] for c in mock_sleep.call_args_list]
        assert delays[0] == 1.0
        assert delays[1] == 2.0
        assert delays[2] == 4.0

    @patch("worker.main.time.sleep")
    def test_backoff_caps_at_30(self, mock_sleep):
        mock_indexer = MagicMock()
        # Fail 10 times then succeed, delay should cap at 30
        mock_indexer.health_check.side_effect = [False] * 10 + [True]
        wait_for_meilisearch(mock_indexer, max_retries=15)
        delays = [c[0][0] for c in mock_sleep.call_args_list]
        assert max(delays) <= 30.0


class TestStateManagement:
    """Test crash-resume state persistence."""

    def test_load_state_returns_empty_when_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr("worker.main.STATE_FILE", tmp_path / "state.json")
        assert load_state() == {}

    def test_save_and_load_roundtrip(self, tmp_path, monkeypatch):
        state_file = tmp_path / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"default_cards_updated_at": "2026-03-21T09:00:00+00:00"})
        loaded = load_state()
        assert loaded["default_cards_updated_at"] == "2026-03-21T09:00:00+00:00"

    def test_save_creates_parent_dirs(self, tmp_path, monkeypatch):
        state_file = tmp_path / "nested" / "dir" / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"key": "value"})
        assert state_file.exists()

    def test_save_overwrites_existing(self, tmp_path, monkeypatch):
        state_file = tmp_path / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"version": 1})
        save_state({"version": 2})
        loaded = load_state()
        assert loaded["version"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_main.py -v
```

Expected: FAIL (functions not yet implemented).

- [ ] **Step 3: Implement the startup sequence**

Replace `worker/src/worker/main.py`:

```python
from __future__ import annotations

import json
import logging
import sys
import threading
import time
from pathlib import Path

from worker.config import load_config
from worker.indexer import MeiliIndexer
from worker.scryfall import ScryfallClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")

DATA_DIR = Path("/tmp/spellbook-worker")
STATE_FILE = DATA_DIR / "state.json"


def load_state() -> dict:
    """Load persisted worker state (last sync timestamps)."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict) -> None:
    """Persist worker state to disk for crash-resume."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state))


def wait_for_meilisearch(indexer: MeiliIndexer, max_retries: int = 20) -> None:
    """Wait for MeiliSearch to become healthy with exponential backoff."""
    delay = 1.0
    for attempt in range(1, max_retries + 1):
        if indexer.health_check():
            log.info("MeiliSearch is healthy")
            return
        log.warning(
            "MeiliSearch not ready (attempt %d/%d), retrying in %.0fs",
            attempt,
            max_retries,
            delay,
        )
        time.sleep(delay)
        delay = min(delay * 2, 30.0)
    log.error("MeiliSearch did not become healthy after %d retries", max_retries)
    sys.exit(1)


def seed_initial(
    scryfall: ScryfallClient,
    indexer: MeiliIndexer,
) -> None:
    """Download Default Cards and seed both MeiliSearch indexes.

    Checks Scryfall's updated_at timestamp against persisted state to
    skip re-download if data has not changed (spec Section 5, 9).
    """
    info = scryfall.get_download_info("default_cards")
    if info is None:
        log.error("Could not find default_cards in Scryfall bulk data")
        return

    state = load_state()
    last_updated = state.get("default_cards_updated_at")
    if last_updated and last_updated == info.updated_at:
        log.info("Default Cards unchanged since %s, skipping download", last_updated)
        return

    dest = DATA_DIR / "default_cards.json"
    scryfall.download_bulk_file(info, dest)
    count = indexer.index_from_file(dest)
    log.info("Initial seed complete: %d cards indexed", count)

    # Persist timestamp only after successful indexing (crash-resume safe)
    state["default_cards_updated_at"] = info.updated_at
    save_state(state)


def background_full_update(
    scryfall: ScryfallClient,
    indexer: MeiliIndexer,
) -> None:
    """Download All Cards and update both indexes (background).

    Checks Scryfall's updated_at timestamp to skip if unchanged.
    """
    info = scryfall.get_download_info("all_cards")
    if info is None:
        log.warning("Could not find all_cards in Scryfall bulk data")
        return

    state = load_state()
    last_updated = state.get("all_cards_updated_at")
    if last_updated and last_updated == info.updated_at:
        log.info("All Cards unchanged since %s, skipping download", last_updated)
        return

    dest = DATA_DIR / "all_cards.json"
    scryfall.download_bulk_file(info, dest)
    count = indexer.index_from_file(dest)
    log.info("Full update complete: %d cards indexed", count)

    state["all_cards_updated_at"] = info.updated_at
    save_state(state)


def sync_interval_seconds(interval: str) -> int | None:
    """Convert sync interval string to seconds. Returns None for 'manual'."""
    intervals = {
        "daily": 86400,
        "weekly": 604800,
    }
    return intervals.get(interval)


def main() -> None:
    log.info("Spellbook worker starting")
    config = load_config()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    indexer = MeiliIndexer(config.meilisearch_url, config.meili_master_key)
    scryfall = ScryfallClient(config.scryfall_bulk_url)

    # Step 1: Wait for MeiliSearch
    wait_for_meilisearch(indexer)

    # Step 2: Configure indexes
    indexer.configure_indexes()

    # Step 3: Check if seeding is needed
    current_count = indexer.get_distinct_count()
    if current_count < 1000:
        log.info("MeiliSearch has %d cards, seeding required", current_count)
        seed_initial(scryfall, indexer)
    else:
        log.info("MeiliSearch has %d cards, skipping seed", current_count)

    # Step 4: Background full update (if aggressive preload)
    if config.aggressive_preload:
        log.info("Aggressive preload enabled, downloading All Cards in background")
        t = threading.Thread(
            target=background_full_update,
            args=(scryfall, indexer),
            daemon=True,
        )
        t.start()

    # Step 5: Periodic sync loop
    interval = sync_interval_seconds(config.sync_interval)
    if interval is None:
        log.info("Sync interval is 'manual', worker will exit after initial load")
        return

    log.info("Entering sync loop (interval: %s)", config.sync_interval)
    while True:
        time.sleep(interval)
        log.info("Running periodic sync")
        try:
            seed_initial(scryfall, indexer)
            if config.aggressive_preload:
                background_full_update(scryfall, indexer)
        except Exception:
            log.exception("Sync failed, will retry next interval")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run pytest tests/test_main.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Lint and format**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/src/worker/main.py worker/tests/test_main.py
git commit -m "feat: add worker startup sequence with progressive loading

Waits for MeiliSearch, seeds Default Cards, then optionally loads All Cards.
Periodic sync with configurable interval."
```

---

### Task 7: Dockerfile and podman-compose integration

**Files:**
- Create: `worker/Dockerfile`
- Modify: `podman-compose.yml`

- [ ] **Step 1: Create Dockerfile**

`worker/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable

COPY src/ src/

CMD ["uv", "run", "--no-sync", "python", "-m", "worker.main"]
```

- [ ] **Step 2: Add worker service to podman-compose.yml**

Add the `worker` service to `/home/kyle/CodingProjects/spellbook/podman-compose.yml`:

```yaml
  worker:
    build:
      context: ./worker
    environment:
      MEILISEARCH_URL: http://meilisearch:7700
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      AGGRESSIVE_PRELOAD: ${AGGRESSIVE_PRELOAD:-true}
      SYNC_INTERVAL: ${SYNC_INTERVAL:-daily}
      LANGUAGES: ${LANGUAGES:-en}
    depends_on:
      - meilisearch
    restart: unless-stopped
```

Insert this before the `volumes:` section.

- [ ] **Step 3: Verify Dockerfile builds**

```bash
cd /home/kyle/CodingProjects/spellbook
podman build -t spellbook-worker worker/
```

Expected: Build completes with no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add worker/Dockerfile podman-compose.yml
git commit -m "feat: add worker Dockerfile and podman-compose service

Worker container uses uv for dependency management, connects to MeiliSearch."
```

---

### Task 8: Integration smoke test

**Files:** None (runtime verification)

- [ ] **Step 1: Ensure MeiliSearch is running**

```bash
cd /home/kyle/CodingProjects/spellbook
podman-compose up -d meilisearch
curl -s http://localhost:7700/health
```

Expected: `{"status":"available"}`

- [ ] **Step 2: Run the worker locally against live MeiliSearch**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
export MEILISEARCH_URL="http://localhost:7700"
export MEILI_MASTER_KEY=$(grep MEILI_MASTER_KEY ../.env | cut -d= -f2)
export AGGRESSIVE_PRELOAD="false"
export SYNC_INTERVAL="manual"
uv run python -m worker.main
```

Expected output (will take a few minutes for the 530MB download):
```
Spellbook worker starting
MeiliSearch is healthy
Configuring cards_distinct index
Configuring cards_all index
MeiliSearch has 0 cards, seeding required
Downloading default_cards (504 MB) to /tmp/spellbook-worker/default_cards.json
  ... progress logs ...
Download complete: /tmp/spellbook-worker/default_cards.json
Parsed XXXXX raw cards
Transformed XXXXX cards (XXXX skipped)
Uploading to cards_distinct ...
Uploading to cards_all ...
Initial seed complete: XXXXX cards indexed
Sync interval is 'manual', worker will exit after initial load
```

- [ ] **Step 3: Verify MeiliSearch has data**

```bash
# Check document counts
curl -s http://localhost:7700/indexes/cards_distinct/stats -H "Authorization: Bearer $(grep MEILI_MASTER_KEY .env | cut -d= -f2)" | python -m json.tool
curl -s http://localhost:7700/indexes/cards_all/stats -H "Authorization: Bearer $(grep MEILI_MASTER_KEY .env | cut -d= -f2)" | python -m json.tool
```

Expected: Both indexes show a large number of documents (50,000+).

- [ ] **Step 4: Test search**

Note: `MEILISEARCH_SEARCH_KEY` must exist in `.env` (created during Phase 1 setup). This is a read-only key for frontend search. If missing, generate one: `openssl rand -hex 16` and add it to `.env`.

```bash
SEARCH_KEY=$(grep MEILISEARCH_SEARCH_KEY .env | cut -d= -f2)
# Search cards_distinct
curl -s "http://localhost:7700/indexes/cards_distinct/search" \
  -H "Authorization: Bearer ${SEARCH_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "Llanowar Elves", "limit": 3}' | python -m json.tool
```

Expected: JSON response with hits containing "Llanowar Elves" with image URIs, oracle text, etc.

```bash
# Search cards_all (should return multiple printings)
curl -s "http://localhost:7700/indexes/cards_all/search" \
  -H "Authorization: Bearer ${SEARCH_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "Llanowar Elves", "limit": 20}' | python -m json.tool
```

Expected: Multiple printings of Llanowar Elves from different sets.

- [ ] **Step 5: Test distinct deduplication**

```bash
# cards_distinct should return ONE result per unique card name
curl -s "http://localhost:7700/indexes/cards_distinct/search" \
  -H "Authorization: Bearer ${SEARCH_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "Lightning Bolt", "limit": 5}' | python -m json.tool
```

Expected: Only one "Lightning Bolt" result (newest printing).

- [ ] **Step 6: Run full test suite with lint**

```bash
cd /home/kyle/CodingProjects/spellbook/worker
uv run ruff check .
uv run ruff format --check .
uv run pytest -v
```

Expected: All linting passes, all tests PASS.

- [ ] **Step 7: Final commit**

```bash
cd /home/kyle/CodingProjects/spellbook
git add -A
git status
```

If there are uncommitted changes:
```bash
git commit -m "chore: Phase 2 complete, Python worker with Scryfall ingestion

Downloads bulk card data, normalizes for MeiliSearch, indexes both
cards_distinct and cards_all. Ready for Phase 3 (SvelteKit Frontend)."
```

---

## Phase 2 Completion Checklist

- [ ] Worker downloads Scryfall Default Cards (~530MB)
- [ ] Cards are transformed (DFCs, split cards, adventures handled)
- [ ] `cards_distinct` index configured with `distinctAttribute: oracle_id`
- [ ] `cards_all` index configured without distinct attribute
- [ ] Both indexes have searchable, filterable, sortable attributes per spec Section 4
- [ ] `oracle_id` is filterable (required for printing-picker on cards_all)
- [ ] Documents sorted by release date (newest first) for distinct dedup
- [ ] Batch upload to MeiliSearch (not one-at-a-time)
- [ ] Waits for all MeiliSearch tasks to complete (atomic sync per spec Section 5)
- [ ] Health check with retry for MeiliSearch on startup
- [ ] `AGGRESSIVE_PRELOAD=true` triggers All Cards download
- [ ] `SYNC_INTERVAL=daily|weekly` triggers periodic re-sync
- [ ] Checks Scryfall timestamps, downloads only if newer (spec Section 5)
- [ ] Persists ingestion state for crash-resume (spec Section 9)
- [ ] Dockerfile builds and runs (using uv)
- [ ] Worker service added to podman-compose.yml
- [ ] All unit tests pass
- [ ] Ruff linting and formatting passes

## Next Phase

Proceed to **Phase 3: SvelteKit Frontend** - card search UI, collection management, SpacetimeDB real-time sync.
