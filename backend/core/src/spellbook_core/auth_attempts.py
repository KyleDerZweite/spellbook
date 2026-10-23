"""Small per-process fixed-window attempt limits shared by Auth and QR."""

from time import monotonic

from .errors import AuthError


class AttemptLimiter:
    def __init__(self, limit: int, seconds: int = 900, capacity: int = 10000):
        self.limit = limit
        self.seconds = seconds
        self.capacity = capacity
        self._entries: dict[str, tuple[int, float]] = {}

    def take(self, address: str, now: float | None = None) -> None:
        now = monotonic() if now is None else now
        for key, (_, expiry) in list(self._entries.items()):
            if expiry <= now:
                del self._entries[key]
        count, expiry = self._entries.get(address, (0, now + self.seconds))
        if count >= self.limit:
            raise AuthError("Too many attempts. Try again in 15 minutes.")
        if not count and len(self._entries) >= self.capacity:
            raise AuthError("Too many attempts. Try again later.")
        self._entries[address] = (count + 1, expiry)
