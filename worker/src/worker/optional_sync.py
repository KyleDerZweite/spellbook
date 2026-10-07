"""Scheduled explicit public adapters; failures are isolated per provider."""

from __future__ import annotations

import hashlib
import logging
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from worker.optional_prices import CardmarketAdapter, MTGJSONAdapter

log = logging.getLogger(__name__)
CARDMARKET_PRODUCTS = (
    "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json"
)
CARDMARKET_GUIDE = (
    "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json"
)
MTGJSON_IDENTIFIERS = "https://mtgjson.com/api/v5/AllIdentifiers.json.gz"
MTGJSON_TODAY = "https://mtgjson.com/api/v5/AllPricesToday.json.gz"
MTGJSON_HISTORY = "https://mtgjson.com/api/v5/AllPrices.json.gz"


def download_artifact(client, url, destination: Path, limits, *, import_deadline=None):
    started = time.monotonic()
    deadline = min(
        started + limits.download_seconds,
        import_deadline if import_deadline is not None else float("inf"),
    )
    if time.monotonic() >= deadline:
        raise ValueError("Artifact download deadline exceeded")
    digest, total = hashlib.sha256(), 0
    remaining = deadline - time.monotonic()
    timeout = httpx.Timeout(
        min(limits.progress_seconds, remaining), connect=min(limits.connect_seconds, remaining)
    )
    with client.stream("GET", url, timeout=timeout) as response:
        response.raise_for_status()
        # Automatic Content-Encoding decoding would break the byte-bound digest.
        if response.headers.get("content-encoding", "identity") != "identity":
            raise ValueError("Unexpected artifact transport encoding")
        expected = response.headers.get("content-length")
        if expected is not None and (
            not expected.isdigit() or int(expected) > limits.compressed_bytes
        ):
            raise ValueError("Artifact compressed byte limit exceeded")
        with destination.open("wb") as output:
            for chunk in response.iter_raw():
                if time.monotonic() >= deadline:
                    raise ValueError("Artifact download deadline exceeded")
                total += len(chunk)
                if total > limits.compressed_bytes:
                    raise ValueError("Artifact compressed byte limit exceeded")
                digest.update(chunk)
                output.write(chunk)
        if time.monotonic() >= deadline:
            raise ValueError("Artifact download deadline exceeded")
        if expected is not None and total != int(expected):
            raise ValueError("Incomplete artifact download")
        return {
            "downloadUri": url,
            "payloadDigest": digest.hexdigest(),
            "compressedBytes": total,
            "etag": response.headers.get("etag"),
            "lastModified": response.headers.get("last-modified"),
            "downloadedAt": datetime.now(UTC).isoformat(),
        }


def _sync(config, publisher, source, artifacts, adapter_type):
    publication_started = False
    started = time.monotonic()
    deadline = started + config.price_limits.import_seconds
    try:
        config.data_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=f"{source.lower()}-", dir=config.data_dir
        ) as directory:
            directory = Path(directory)
            transfers, paths = {}, []
            timeout = httpx.Timeout(
                config.price_limits.progress_seconds, connect=config.price_limits.connect_seconds
            )
            with httpx.Client(
                timeout=timeout, follow_redirects=True, headers={"accept-encoding": "identity"}
            ) as client:
                for name, url in artifacts:
                    path = directory / name
                    transfers[name] = download_artifact(
                        client, url, path, config.price_limits, import_deadline=deadline
                    )
                    paths.append(path)
                    if (
                        sum(p.stat().st_size for p in directory.iterdir())
                        > config.price_limits.staging_bytes
                    ):
                        raise ValueError("Price staging byte limit exceeded")
                    if time.monotonic() - started > config.price_limits.import_seconds:
                        raise ValueError("Optional import deadline exceeded")
            with adapter_type(
                *paths, directory / "stage.sqlite", config.price_limits, import_deadline=deadline
            ) as adapter:
                adapter.metadata["artifacts"] = transfers
                remaining = config.price_limits.import_seconds - (time.monotonic() - started)
                if remaining <= 0:
                    raise ValueError("Optional import deadline exceeded")
                # Publication owns its rollback/failure transaction once entered.
                from dataclasses import replace

                adapter.limits = replace(
                    adapter.limits,
                    publication_seconds=min(
                        adapter.limits.publication_seconds, max(1, int(remaining))
                    ),
                )
                publication_started = True
                if source == "Cardmarket":
                    publisher.publish_cardmarket(adapter)
                else:
                    publisher.publish_mtgjson(adapter)
    except Exception as cause:
        if not publication_started:
            try:
                publisher.record_failure(source, cause)
            except Exception as status_error:
                log.error(
                    "%s failure status unavailable (%s)", source, type(status_error).__name__
                )
        raise


def sync_cardmarket(config, publisher):
    _sync(
        config,
        publisher,
        "Cardmarket",
        [("products.json", CARDMARKET_PRODUCTS), ("guide.json", CARDMARKET_GUIDE)],
        CardmarketAdapter,
    )


def sync_mtgjson(config, publisher):
    _sync(
        config,
        publisher,
        "MTGJSON",
        [
            ("identifiers.json.gz", MTGJSON_IDENTIFIERS),
            ("today.json.gz", MTGJSON_TODAY),
            ("history.json.gz", MTGJSON_HISTORY),
        ],
        MTGJSONAdapter,
    )


def sync_optional_sources(config, publisher):
    successful = True
    for source, enabled, sync in (
        ("Cardmarket", config.cardmarket_prices_enabled, sync_cardmarket),
        ("MTGJSON", config.mtgjson_prices_enabled, sync_mtgjson),
    ):
        try:
            publisher.set_enabled(source, enabled)
            if enabled:
                sync(config, publisher)
        except Exception as cause:
            successful = False
            log.error("%s refresh failed (%s)", source, type(cause).__name__)
    return successful
