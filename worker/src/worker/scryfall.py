from __future__ import annotations

import logging
import zlib
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx

log = logging.getLogger("worker.scryfall")


def _decode_bulk_chunks(chunks: Iterable[bytes]) -> Iterator[bytes]:
    """Decode plain or gzip data, validating every gzip member with bounded output."""
    chunks = iter(chunks)
    prefix = b""
    while len(prefix) < 2:
        chunk = next(chunks, None)
        if chunk is None:
            break
        prefix += chunk
    if not prefix.startswith(b"\x1f\x8b"):
        yield prefix
        yield from chunks
        return

    decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
    chunk = prefix
    while True:
        while chunk:
            if decoder.eof:
                decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
            yield decoder.decompress(chunk, max_length=1 << 20)
            chunk = decoder.unused_data if decoder.eof else decoder.unconsumed_tail
        chunk = next(chunks, None)
        if chunk is None:
            break
    if not decoder.eof:
        raise ValueError("Incomplete gzip bulk file")


@dataclass
class BulkDataInfo:
    type: str
    download_uri: str
    updated_at: str
    size: int
    descriptor_id: str | None = None


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
                descriptor_id=item.get("id"),
                type=item["type"],
                download_uri=item.get("jsonl_download_uri") or item["download_uri"],
                updated_at=item["updated_at"],
                size=item.get("compressed_size", item.get("size", 0)),
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
            client.stream(
                "GET", info.download_uri, headers={"Accept-Encoding": "identity"}
            ) as resp,
        ):
            resp.raise_for_status()
            chunks = resp.iter_raw(chunk_size=8192)
            encoding = resp.headers.get("content-encoding", "identity").lower()
            if encoding == "gzip":
                chunks = _decode_bulk_chunks(chunks)
            elif encoding != "identity":
                raise ValueError(f"Unsupported bulk content encoding: {encoding}")
            downloaded = 0
            with open(dest, "wb") as f:
                for chunk in _decode_bulk_chunks(chunks):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if downloaded % (50 * 1024 * 1024) < 8192:
                        log.info(
                            "  %d MB written",
                            downloaded // (1024 * 1024),
                        )
        if downloaded == 0:
            raise ValueError("Bulk download contains no data")
        log.info("Download complete: %s", dest)
