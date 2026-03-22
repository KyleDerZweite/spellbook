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
