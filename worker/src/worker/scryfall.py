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
        with (
            httpx.Client(timeout=600.0) as client,
            client.stream("GET", info.download_uri) as resp,
        ):
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
