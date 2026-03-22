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

    scryfall_url = os.environ.get("SCRYFALL_BULK_URL", "https://api.scryfall.com/bulk-data")

    return WorkerConfig(
        meilisearch_url=meili_url,
        meili_master_key=master_key,
        aggressive_preload=aggressive,
        sync_interval=interval,
        languages=languages,
        scryfall_bulk_url=scryfall_url,
    )
