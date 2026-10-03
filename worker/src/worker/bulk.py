from __future__ import annotations

import json
from collections.abc import Iterator
from typing import IO

_STREAM_CHUNK_SIZE = 1 << 20
_SKIP_CHARS = " \t\n\r"


def _iter_json_array(fh: IO[str]) -> Iterator[dict]:
    """Yield each top-level object in a JSON array without holding the full
    document in memory.

    Uses ``json.JSONDecoder.raw_decode`` over a sliding buffer. Works for the
    Scryfall bulk file shape (``[\\n  {...},\\n  {...},\\n  ...]``) and any
    other valid JSON array of objects.
    """
    decoder = json.JSONDecoder()
    buf = ""
    started = False
    expect_separator = False
    after_comma = False
    finished = False
    while True:
        chunk = fh.read(_STREAM_CHUNK_SIZE)
        if chunk:
            buf += chunk
        if not started:
            stripped = buf.lstrip(_SKIP_CHARS)
            if not stripped:
                if not chunk:
                    raise ValueError("expected JSON array at top level")
                buf = stripped
                continue
            if stripped[0] != "[":
                raise ValueError("expected JSON array at top level")
            buf = stripped[1:]
            started = True

        while True:
            buf = buf.lstrip(_SKIP_CHARS)
            if not buf:
                break
            if finished:
                raise ValueError("trailing data after JSON array")
            if buf[0] == "]":
                if after_comma:
                    raise ValueError("trailing comma in JSON array")
                finished = True
                buf = buf[1:]
                continue
            if expect_separator:
                if buf[0] != ",":
                    raise ValueError("expected comma between JSON array elements")
                buf = buf[1:]
                expect_separator = False
                after_comma = True
                continue
            try:
                obj, end = decoder.raw_decode(buf)
            except json.JSONDecodeError:
                # Need more data in the buffer to finish decoding.
                break
            if not isinstance(obj, dict):
                raise ValueError("expected card object in JSON array")
            yield obj
            buf = buf[end:]
            expect_separator = True
            after_comma = False

        if not chunk:
            if not finished:
                raise ValueError("incomplete or malformed JSON array")
            return


def _iter_jsonl(fh: IO[str]) -> Iterator[dict]:
    """Reject invalid records instead of swapping a partial catalog into service."""
    for line_number, line in enumerate(fh, start=1):
        if not line.strip():
            continue
        try:
            card = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON on bulk line {line_number}") from exc
        if not isinstance(card, dict):
            raise ValueError(f"Expected card object on bulk line {line_number}")
        yield card


def _iter_bulk_cards(fh: IO[str]) -> Iterator[dict]:
    """Detect the bulk format without loading the catalog into memory."""
    while char := fh.read(1):
        if char not in _SKIP_CHARS:
            break
    fh.seek(0)
    if char == "[":
        yield from _iter_json_array(fh)
    elif char == "{":
        yield from _iter_jsonl(fh)
    else:
        raise ValueError("expected JSON array or JSON Lines bulk file")
