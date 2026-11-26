from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from worker.price_artifacts import DEFAULT_PRICE_LIMITS, PriceLimits
from worker.reference_decks.mtggoldfish import DEFAULT_MTGGOLDFISH_BASE_URL
from worker.reference_decks.sync import AVAILABLE_REFERENCE_DECK_SOURCES


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
    reference_decks_enabled: bool = False
    reference_deck_sources: tuple[str, ...] = ("mtggoldfish",)
    reference_decks_local_dir: Path | None = None
    reference_decks_cache_ttl_seconds: int = 21600
    reference_decks_rate_limit_ms: int = 1500
    reference_decks_max_per_format: int = 20
    mtggoldfish_base_url: str = DEFAULT_MTGGOLDFISH_BASE_URL


def boolean_setting(name):
    value = os.environ.get(name, "false")
    if value not in ("true", "false"):
        raise ValueError(f"{name} must be true or false")
    return value == "true"


def price_limits():
    values = {}
    for name, default in DEFAULT_PRICE_LIMITS.__dict__.items():
        variable = f"PRICE_{name.upper()}"
        raw = os.environ.get(variable, str(default))
        if not raw.isascii() or not raw.isdigit() or len(raw) > 15 or int(raw) <= 0:
            raise ValueError(f"{variable} must be a positive integer")
        values[name] = int(raw)
    return PriceLimits(**values)


def _nonnegative_int(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    if not raw.isascii() or not raw.isdigit() or len(raw) > 15:
        raise ValueError(f"{name} must be a non-negative integer")
    return int(raw)


def _positive_int(name: str, default: int) -> int:
    value = _nonnegative_int(name, default)
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _reference_deck_sources() -> tuple[str, ...]:
    raw = os.environ.get("REFERENCE_DECK_SOURCES", "mtggoldfish")
    sources = tuple(dict.fromkeys(item.strip() for item in raw.split(",") if item.strip()))
    if not sources:
        raise ValueError("REFERENCE_DECK_SOURCES must list at least one source")
    unknown = [item for item in sources if item not in AVAILABLE_REFERENCE_DECK_SOURCES]
    if unknown:
        raise ValueError(
            "REFERENCE_DECK_SOURCES must contain only: "
            + ", ".join(AVAILABLE_REFERENCE_DECK_SOURCES)
        )
    return sources


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
    local_dir_raw = os.environ.get("REFERENCE_DECKS_LOCAL_DIR", "").strip()
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
        reference_decks_enabled=boolean_setting("REFERENCE_DECKS_ENABLED"),
        reference_deck_sources=_reference_deck_sources(),
        reference_decks_local_dir=Path(local_dir_raw) if local_dir_raw else None,
        reference_decks_cache_ttl_seconds=_nonnegative_int(
            "REFERENCE_DECKS_CACHE_TTL_SECONDS", 21600
        ),
        reference_decks_rate_limit_ms=_nonnegative_int("REFERENCE_DECKS_RATE_LIMIT_MS", 1500),
        reference_decks_max_per_format=_positive_int("REFERENCE_DECKS_MAX_PER_FORMAT", 20),
        mtggoldfish_base_url=os.environ.get("MTGGOLDFISH_BASE_URL", DEFAULT_MTGGOLDFISH_BASE_URL),
    )
