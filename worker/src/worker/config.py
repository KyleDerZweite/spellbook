from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str
    catalog_source: str
    sync_interval: str
    scryfall_bulk_url: str
    data_dir: Path


def load_config() -> WorkerConfig:
    """Load and validate catalog synchronization settings."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")
    source = os.environ.get("CATALOG_SOURCE", "all_cards")
    if source not in ("all_cards", "default_cards"):
        raise ValueError("CATALOG_SOURCE must be all_cards or default_cards")
    interval = os.environ.get("SYNC_INTERVAL", "daily")
    if interval not in ("daily", "weekly", "manual"):
        raise ValueError("SYNC_INTERVAL must be daily, weekly, or manual")
    return WorkerConfig(
        database_url=database_url,
        catalog_source=source,
        sync_interval=interval,
        scryfall_bulk_url=os.environ.get(
            "SCRYFALL_BULK_URL", "https://api.scryfall.com/bulk-data"
        ),
        data_dir=Path(os.environ.get("WORKER_DATA_DIR", "/tmp/spellbook-worker")),
    )
