"""Local disk HTTP cache and fair rate limiter for external DeckSource providers."""

from __future__ import annotations

import hashlib
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

import httpx

DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class RateLimiter:
    """Enforce a minimum interval between consecutive outbound requests."""

    def __init__(
        self,
        min_interval_seconds: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self._min_interval = max(0.0, float(min_interval_seconds))
        self._clock = clock
        self._sleeper = sleeper
        self._last_request_at: float | None = None

    def wait(self) -> None:
        now = self._clock()
        if self._last_request_at is not None and self._min_interval > 0:
            elapsed = now - self._last_request_at
            remaining = self._min_interval - elapsed
            if remaining > 0:
                self._sleeper(remaining)
                now = self._clock()
        self._last_request_at = now


class HttpDiskCache:
    """Simple TTL-bounded local file cache keyed by SHA-256 of the request URL."""

    def __init__(
        self,
        cache_dir: Path,
        ttl_seconds: int,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._cache_dir = cache_dir
        self._ttl_seconds = max(0, int(ttl_seconds))
        self._clock = clock

    def _entry_path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return self._cache_dir / f"{digest}.cache"

    def get(self, url: str) -> str | None:
        if self._ttl_seconds <= 0:
            return None
        path = self._entry_path(url)
        try:
            stat = path.stat()
        except OSError:
            return None
        if self._clock() - stat.st_mtime > self._ttl_seconds:
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return None

    def put(self, url: str, content: str) -> None:
        if self._ttl_seconds <= 0:
            return
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        target = self._entry_path(url)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=self._cache_dir, delete=False
        ) as temp:
            temp.write(content)
            temp_path = Path(temp.name)
        temp_path.replace(target)


class CachedHttpFetcher:
    """Bounded, rate-limited, locally cached HTTP GET fetcher for text/HTML feeds."""

    def __init__(
        self,
        client: httpx.Client,
        cache: HttpDiskCache,
        rate_limiter: RateLimiter,
        *,
        max_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> None:
        self._client = client
        self._cache = cache
        self._rate_limiter = rate_limiter
        self._max_bytes = max_bytes

    def fetch_text(self, url: str) -> str:
        cached = self._cache.get(url)
        if cached is not None:
            return cached

        self._rate_limiter.wait()
        chunks: list[bytes] = []
        total = 0
        with self._client.stream("GET", url) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > self._max_bytes:
                    raise ValueError("Reference deck response exceeded maximum byte limit")
                chunks.append(chunk)
            encoding = response.encoding or "utf-8"
        text = b"".join(chunks).decode(encoding, errors="replace")
        self._cache.put(url, text)
        return text
