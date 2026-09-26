from __future__ import annotations

import logging
import zlib
from dataclasses import dataclass
from pathlib import Path

import httpx

log = logging.getLogger("worker.scryfall")

_DOWNLOAD_CHUNK_SIZE = 1 << 20  # 1 MiB
_GZIP_MAGIC = b"\x1f\x8b"


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
        """Fetch the list of available bulk data files from Scryfall.

        Scryfall renamed the download fields: ``download_uri``/``size`` became
        ``jsonl_download_uri``/``compressed_size``. Both spellings are accepted
        so either API version parses.
        """
        with httpx.Client() as client:
            resp = client.get(self.bulk_url)
            resp.raise_for_status()
            data = resp.json()

        return [
            BulkDataInfo(
                type=item["type"],
                download_uri=item.get("jsonl_download_uri") or item["download_uri"],
                updated_at=item["updated_at"],
                size=item.get("compressed_size") or item.get("size") or 0,
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
        """Download a bulk data file with streaming to avoid memory issues.

        Current bulk payloads are gzip-compressed JSON Lines. Compression is
        detected from the first bytes and undone while streaming, so ``dest``
        always holds plain text for the indexer.
        """
        log.info(
            "Downloading %s (%.1f MB compressed) to %s",
            info.type,
            info.size / (1024 * 1024),
            dest,
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        downloaded = 0
        gzipped: bool | None = None
        decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
        with (
            httpx.Client(timeout=600.0) as client,
            client.stream("GET", info.download_uri) as resp,
        ):
            resp.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=_DOWNLOAD_CHUNK_SIZE):
                    if not chunk:
                        continue
                    if gzipped is None:
                        gzipped = chunk[:2] == _GZIP_MAGIC
                        if not gzipped:
                            log.info("Bulk payload is not gzip, storing as-is")
                    f.write(decompressor.decompress(chunk) if gzipped else chunk)
                    downloaded += len(chunk)
                    if downloaded % (50 * 1024 * 1024) < _DOWNLOAD_CHUNK_SIZE:
                        log.info("  %.0f MB downloaded", downloaded / (1024 * 1024))
                if gzipped:
                    f.write(decompressor.flush())
        log.info("Download complete: %s", dest)
