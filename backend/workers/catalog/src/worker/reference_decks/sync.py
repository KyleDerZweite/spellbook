"""Coordinator for optional Reference deck ingestion in the catalog worker."""

from __future__ import annotations

import logging
from contextlib import ExitStack
from typing import TYPE_CHECKING

import httpx

from worker.reference_decks.base import MTG_FORMATS, DeckSource
from worker.reference_decks.cache import CachedHttpFetcher, HttpDiskCache, RateLimiter
from worker.reference_decks.local_dec import LocalDecDeckSource
from worker.reference_decks.mtggoldfish import MTGGoldfishDeckSource
from worker.reference_decks.publisher import ReferenceDeckPublisher

if TYPE_CHECKING:
    from worker.config import WorkerConfig

log = logging.getLogger(__name__)

AVAILABLE_REFERENCE_DECK_SOURCES: tuple[str, ...] = ("mtggoldfish", "local_dec")


def build_deck_source(source_name: str, config: WorkerConfig, stack: ExitStack) -> DeckSource:
    if source_name == "local_dec":
        local_dir = config.reference_decks_local_dir or (config.data_dir / "reference-decks")
        return LocalDecDeckSource(local_dir)
    if source_name == "mtggoldfish":
        client = stack.enter_context(
            httpx.Client(
                timeout=httpx.Timeout(30.0, connect=10.0),
                follow_redirects=True,
                headers={"User-Agent": "Spellbook/0.1 (Reference Deck Indexer)"},
            )
        )
        cache = HttpDiskCache(
            config.data_dir / "reference-decks-cache" / "mtggoldfish",
            ttl_seconds=config.reference_decks_cache_ttl_seconds,
        )
        rate_limiter = RateLimiter(config.reference_decks_rate_limit_ms / 1000.0)
        fetcher = CachedHttpFetcher(client, cache, rate_limiter)
        return MTGGoldfishDeckSource(
            fetcher,
            base_url=config.mtggoldfish_base_url,
            max_decks_per_format=config.reference_decks_max_per_format,
        )
    raise ValueError(f"Unsupported reference deck source: {source_name}")


def sync_reference_decks(
    config: WorkerConfig,
    publisher: ReferenceDeckPublisher,
    *,
    formats: tuple[str, ...] = MTG_FORMATS,
) -> bool:
    """Synchronize configured reference deck sources; isolate failures per source."""
    if not config.reference_decks_enabled:
        return True

    successful = True
    selected = set(config.reference_deck_sources)
    for source_name in AVAILABLE_REFERENCE_DECK_SOURCES:
        enabled = source_name in selected
        if not enabled:
            try:
                publisher.set_enabled(source_name, False)
            except Exception as cause:
                successful = False
                log.error(
                    "Reference deck source %s status update failed (%s)",
                    source_name,
                    type(cause).__name__,
                )
            continue

        try:
            with ExitStack() as stack:
                source = build_deck_source(source_name, config, stack)
                raw_decks = source.fetch_decks(formats)
            count = publisher.publish_source(source_name, raw_decks)
            log.info("Published %d reference decks from %s", count, source_name)
        except Exception as cause:
            successful = False
            try:
                publisher.record_failure(source_name, cause)
            except Exception as status_error:
                log.error(
                    "Reference deck source %s failure status unavailable (%s)",
                    source_name,
                    type(status_error).__name__,
                )
            log.error("Reference deck sync failed for %s (%s)", source_name, type(cause).__name__)
    return successful
