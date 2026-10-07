from __future__ import annotations

import json
import logging
import tempfile
import time
from pathlib import Path

from worker.catalog import CatalogPublisher
from worker.config import load_config
from worker.optional_publication import OptionalPricePublisher
from worker.optional_sync import sync_optional_sources
from worker.oracle_tags import OracleTagsPublisher
from worker.scryfall import ScryfallClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("worker")
DEFAULT_DATA_DIR = Path("/tmp/spellbook-worker")


def state_file(data_dir: Path) -> Path:
    return data_dir / "state.json"


def load_state(data_dir: Path = DEFAULT_DATA_DIR) -> dict:
    path = state_file(data_dir)
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_state(state: dict, data_dir: Path = DEFAULT_DATA_DIR) -> None:
    """Write operator status atomically; PostgreSQL owns publication metadata."""
    path = state_file(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=data_dir, delete=False) as temporary:
        temporary.write(json.dumps(state))
    Path(temporary.name).replace(path)


def wait_for_database(publisher: CatalogPublisher, max_retries: int = 20) -> None:
    delay = 1.0
    for attempt in range(1, max_retries + 1):
        if publisher.health_check():
            return
        log.warning("Catalog database not ready (attempt %d/%d)", attempt, max_retries)
        if attempt < max_retries:
            time.sleep(delay)
            delay = min(delay * 2, 30.0)
    raise RuntimeError("Catalog database migrations are not ready")


def sync_catalog(
    scryfall: ScryfallClient,
    publisher: CatalogPublisher,
    source: str,
    data_dir: Path = DEFAULT_DATA_DIR,
) -> None:
    """Synchronize exactly one configured source, retaining the last good catalog."""
    publication_started = False
    try:
        info = scryfall.get_download_info(source)
        if info is None:
            raise ValueError("Configured Scryfall bulk source was not found")
        if publisher.is_current(info):
            log.info("Catalog source %s is already current", source)
            return
        data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="catalog-", dir=data_dir) as download_dir:
            dest = Path(download_dir) / "cards.json"
            scryfall.download_bulk_file(info, dest)
            publication_started = True
            count = publisher.publish(dest, info)
    except Exception as exc:
        # Database and HTTP exceptions can contain credentials or document data.
        if not publication_started:
            try:
                publisher.record_failure(source, exc)
            except Exception:
                log.warning("Could not persist refresh status")
        save_state({"source": source, "lastError": type(exc).__name__}, data_dir)
        raise
    save_state(
        {
            "source": source,
            "lastSuccessfulSyncAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "lastIndexedDocumentCount": count,
            "lastError": None,
        },
        data_dir,
    )
    log.info("Published %d catalog printings from %s", count, source)


def sync_oracle_tags(
    scryfall: ScryfallClient, publisher: OracleTagsPublisher, data_dir: Path
) -> None:
    publication_started = False
    try:
        info = scryfall.get_download_info("oracle_tags")
        if info is None:
            raise ValueError("Oracle Tags bulk source was not found")
        data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="oracle-tags-", dir=data_dir) as download_dir:
            path = Path(download_dir) / "tags.jsonl"
            scryfall.download_bulk_file(info, path)
            publication_started = True
            publisher.publish(
                path,
                {
                    "id": info.descriptor_id,
                    "type": info.type,
                    "updated_at": info.updated_at,
                    "download_uri": info.download_uri,
                },
            )
    except Exception as cause:
        if not publication_started:
            publisher.record_failure(cause)
        raise


def sync_interval_seconds(interval: str) -> int | None:
    return {"daily": 86400, "weekly": 604800, "manual": None}[interval]


def main() -> None:
    try:
        config = load_config()
        config.data_dir.mkdir(parents=True, exist_ok=True)
        publisher = CatalogPublisher(config.database_url)
        scryfall = ScryfallClient(config.scryfall_bulk_url)
        wait_for_database(publisher)
    except Exception as exc:
        log.error("Worker startup failed (%s)", type(exc).__name__)
        raise SystemExit(1) from None
    tags_publisher = OracleTagsPublisher(config.database_url)
    interval = sync_interval_seconds(config.sync_interval)
    optional_publisher = OptionalPricePublisher(config.database_url, config.price_limits)
    while True:
        successful = True
        try:
            sync_catalog(scryfall, publisher, config.catalog_source, config.data_dir)
        except Exception as exc:
            log.error("Catalog synchronization failed (%s)", type(exc).__name__)
            successful = False
        # Independent public sources still attempt their refresh after a baseline failure.
        if not sync_optional_sources(config, optional_publisher):
            successful = False
        try:
            sync_oracle_tags(scryfall, tags_publisher, config.data_dir)
        except Exception as exc:
            log.error("Oracle Tags synchronization failed (%s)", type(exc).__name__)
            successful = False
        if interval is None:
            if not successful:
                raise SystemExit(1) from None
            return
        time.sleep(interval)


if __name__ == "__main__":
    main()
