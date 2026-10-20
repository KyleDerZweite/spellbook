from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from worker.combo import DEFAULT_COMBO_LIMITS, ComboLimits
from worker.price_artifacts import DEFAULT_PRICE_LIMITS, PriceLimits


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str
    catalog_source: str
    sync_interval: str
    scryfall_bulk_url: str
    data_dir: Path
    cardmarket_prices_enabled: bool = False
    mtgjson_prices_enabled: bool = False
    price_limits: PriceLimits = DEFAULT_PRICE_LIMITS
    commander_spellbook_enabled: bool = False
    combo_limits: ComboLimits = DEFAULT_COMBO_LIMITS


def boolean_setting(name):
    value = os.environ.get(name, "false")
    if value not in ("true", "false"):
        raise ValueError(f"{name} must be true or false")
    return value == "true"


def combo_limits():
    values = {}
    for name, default in DEFAULT_COMBO_LIMITS.__dict__.items():
        variable = f"COMBO_{name.upper()}"
        raw = os.environ.get(variable, str(default))
        if not raw.isascii() or not raw.isdigit() or len(raw) > 15 or int(raw) <= 0:
            raise ValueError(f"{variable} must be a positive integer")
        values[name] = int(raw)
    return ComboLimits(**values)


def price_limits():
    values = {}
    for name, default in DEFAULT_PRICE_LIMITS.__dict__.items():
        variable = f"PRICE_{name.upper()}"
        raw = os.environ.get(variable, str(default))
        if not raw.isascii() or not raw.isdigit() or len(raw) > 15 or int(raw) <= 0:
            raise ValueError(f"{variable} must be a positive integer")
        values[name] = int(raw)
    return PriceLimits(**values)


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
        cardmarket_prices_enabled=boolean_setting("CARDMARKET_PRICES_ENABLED"),
        mtgjson_prices_enabled=boolean_setting("MTGJSON_PRICES_ENABLED"),
        price_limits=price_limits(),
        commander_spellbook_enabled=boolean_setting("COMMANDER_SPELLBOOK_ENABLED"),
        combo_limits=combo_limits(),
    )
