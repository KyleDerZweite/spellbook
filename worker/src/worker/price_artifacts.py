"""Bounded complete public artifacts with exact numeric tokens."""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path


@dataclass(frozen=True)
class PriceLimits:
    compressed_bytes: int = 512 * 1024**2
    decompressed_bytes: int = 8 * 1024**3
    record_bytes: int = 2 * 1024**2
    progress_seconds: int = 30
    connect_seconds: int = 10
    download_seconds: int = 600
    parse_seconds: int = 600
    publication_seconds: int = 600
    import_seconds: int = 1800
    staging_bytes: int = 12 * 1024**3

    def __post_init__(self):
        if any(type(value) is not int or value <= 0 for value in self.__dict__.values()):
            raise ValueError("Price limits must be positive integers")


class NumericToken(str):
    """A JSON numeric token, never a binary floating-point value."""


DEFAULT_PRICE_LIMITS = PriceLimits()


def numeric_token(value: str) -> NumericToken:
    if len(value) > 128:
        raise ValueError("Numeric token exceeds 128 characters")
    return NumericToken(value)


def reject_constant(_value):
    raise ValueError("Non-finite JSON number")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def money(value) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, NumericToken) or len(value) > 128:
        raise ValueError("Selected price must be an exact JSON number")
    match = re.fullmatch(r"(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?", value)
    if not match or match[1]:
        raise ValueError("Invalid nonnegative price")
    exponent = match[4] or "0"
    if len(exponent.lstrip("+-").lstrip("0")) > 3 or abs(int(exponent)) > 128:
        raise ValueError("Price exponent exceeds 128")
    normalized = format(Decimal(value), "f")
    whole, _, fraction = normalized.partition(".")
    fraction = fraction.rstrip("0")
    normalized = (whole.lstrip("0") or "0") + ("." + fraction if fraction else "")
    if len(normalized) > 128 or len(fraction) > 18:
        raise ValueError("Normalized price exceeds decimal bounds")
    return normalized, str(value)


def identifier(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", value):
        raise ValueError("Invalid positive integer identifier")
    if int(value) > 9223372036854775807:
        raise ValueError("Identifier exceeds integer bounds")
    return str(int(value))


class ArtifactRecords:
    """Stream one root collection while validating the complete artifact."""

    def __init__(self, path: Path, collection: str, mapping: bool, limits=DEFAULT_PRICE_LIMITS):
        self.path, self.collection, self.mapping, self.limits = path, collection, mapping, limits
        self.metadata: dict = {}
        self.decompressed_bytes = 0
        self.digest = ""
        self._decompressed_digest = hashlib.sha256()
        self._buffer = ""
        self._eof = False
        self._started = time.monotonic()
        self._decoder = json.JSONDecoder(
            parse_float=numeric_token,
            parse_int=numeric_token,
            parse_constant=reject_constant,
            object_pairs_hook=unique_object,
        )

    def _fill(self):
        if time.monotonic() - self._started > self.limits.parse_seconds:
            raise ValueError("Artifact parse deadline exceeded")
        chunk = self._source.read(65536)
        encoded = chunk.encode("utf-8")
        self.decompressed_bytes += len(encoded)
        self._decompressed_digest.update(encoded)
        if self.decompressed_bytes > self.limits.decompressed_bytes:
            raise ValueError("Decompressed artifact byte limit exceeded")
        if not chunk:
            self._eof = True
        self._buffer += chunk

    def _ready(self):
        self._buffer = self._buffer.lstrip()
        while not self._buffer and not self._eof:
            self._fill()
            self._buffer = self._buffer.lstrip()
        return self._buffer[:1]

    def _take(self, expected):
        if self._ready() != expected:
            raise ValueError("Malformed complete JSON artifact")
        self._buffer = self._buffer[1:]

    def _value(self):
        self._ready()
        while True:
            if time.monotonic() - self._started > self.limits.parse_seconds:
                raise ValueError("Artifact parse deadline exceeded")
            try:
                value, end = self._decoder.raw_decode(self._buffer)
                if end == len(self._buffer) and not self._eof:
                    self._fill()
                    continue
                if len(self._buffer[:end].encode("utf-8")) > self.limits.record_bytes:
                    raise ValueError("Artifact record byte limit exceeded")
                self._buffer = self._buffer[end:]
                return value
            except json.JSONDecodeError as cause:
                if self._eof:
                    raise ValueError("Incomplete or malformed JSON artifact") from cause
                if len(self._buffer.encode("utf-8")) > self.limits.record_bytes:
                    raise ValueError("Artifact record byte limit exceeded") from cause
                self._fill()

    def __iter__(self):
        if self.path.stat().st_size > self.limits.compressed_bytes:
            raise ValueError("Compressed artifact byte limit exceeded")
        with self.path.open("rb") as payload:
            self.digest = hashlib.file_digest(payload, "sha256").hexdigest()
        opener = gzip.open if self.path.suffix == ".gz" else Path.open
        with opener(self.path, "rt", encoding="utf-8", newline="") as self._source:
            self._take("{")
            root_keys = set()
            seen_collection = False
            while self._ready() != "}":
                key = self._value()
                if type(key) is not str or key in root_keys:
                    raise ValueError("Invalid or duplicate root key")
                root_keys.add(key)
                self._take(":")
                if key != self.collection:
                    self.metadata[key] = self._value()
                else:
                    seen_collection = True
                    start, end = ("{", "}") if self.mapping else ("[", "]")
                    self._take(start)
                    index = 0
                    while self._ready() != end:
                        item_key = self._value() if self.mapping else str(index)
                        if self.mapping:
                            if type(item_key) is not str:
                                raise ValueError("Invalid mapping key")
                            self._take(":")
                        value = self._value()
                        if not isinstance(value, dict):
                            raise ValueError("Source record must be an object")
                        yield item_key, value
                        index += 1
                        if self._ready() == end:
                            break
                        self._take(",")
                        if self._ready() == end:
                            raise ValueError("Trailing collection comma")
                    self._take(end)
                if self._ready() == "}":
                    break
                self._take(",")
                if self._ready() == "}":
                    raise ValueError("Trailing root comma")
            self._take("}")
            if self._ready() or not seen_collection:
                raise ValueError("Missing collection or trailing JSON content")

    def evidence(self):
        return {
            "payloadDigest": self.digest,
            "compressedBytes": self.path.stat().st_size,
            "decompressedBytes": self.decompressed_bytes,
            "decompressedDigest": self._decompressed_digest.hexdigest(),
        }
