"""Deterministic local .dec directory DeckSource provider."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from worker.reference_decks.base import (
    MTG_FORMATS,
    RawReferenceDeck,
    parse_decklist_text,
)

log = logging.getLogger(__name__)
MAX_DEC_FILE_BYTES = 512 * 1024


def _humanize_stem(stem: str) -> str:
    return " ".join(part.capitalize() for part in stem.replace("_", "-").split("-") if part)


def _parse_meta_share(raw: str | None) -> float | None:
    if raw is None:
        return None
    cleaned = raw.strip().rstrip("%").strip()
    try:
        value = float(cleaned)
    except ValueError:
        return None
    if 0.0 <= value <= 100.0:
        return round(value, 2)
    return None


class LocalDecDeckSource:
    """Read reference decks from a local directory of .dec files.

    Supports both:
    - `<root>/<format>/<deck>.dec`
    - `<root>/<deck>.dec` with a `// Format: <format>` or `# Format: <format>` header comment.
    """

    source_id = "local_dec"

    def __init__(self, root_dir: Path) -> None:
        self._root_dir = root_dir

    def supported_formats(self) -> frozenset[str]:
        return frozenset(MTG_FORMATS)

    def fetch_decks(self, formats: Sequence[str]) -> list[RawReferenceDeck]:
        supported = self.supported_formats()
        requested = {fmt.lower() for fmt in formats if fmt.lower() in supported}
        skipped = [fmt for fmt in formats if fmt.lower() not in supported]
        if skipped:
            log.info("Skipping unsupported local_dec formats: %s", ", ".join(skipped))

        if not self._root_dir.exists() or not self._root_dir.is_dir():
            raise FileNotFoundError(f"Reference deck directory not found: {self._root_dir}")
        if not requested:
            return []

        decks: list[RawReferenceDeck] = []
        for path in sorted(self._root_dir.rglob("*.dec")):
            if not path.is_file():
                continue
            try:
                stat = path.stat()
                if stat.st_size > MAX_DEC_FILE_BYTES:
                    log.warning("Skipping oversized .dec file: %s", path.name)
                    continue
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                log.warning("Could not read .dec file: %s", path.name)
                continue

            relative = path.relative_to(self._root_dir)
            metadata, cards = parse_decklist_text(text)
            if not cards:
                continue

            inferred_format = (
                relative.parts[0].lower()
                if len(relative.parts) >= 2
                else metadata.get("format", "").strip().lower()
            )
            if inferred_format not in requested:
                continue

            name = (metadata.get("name") or _humanize_stem(path.stem)).strip()[:200]
            if not name:
                continue
            archetype = (metadata.get("archetype") or "").strip()[:200] or None
            source_url = (metadata.get("url") or "").strip()[:1000] or None
            meta_share = _parse_meta_share(metadata.get("metashare") or metadata.get("meta_share"))
            updated_at = datetime.fromtimestamp(stat.st_mtime, tz=UTC)

            decks.append(
                RawReferenceDeck(
                    source=self.source_id,
                    external_id=relative.as_posix()[:256],
                    name=name,
                    format=inferred_format,
                    cards=cards,
                    archetype=archetype,
                    source_url=source_url,
                    meta_share=meta_share,
                    source_updated_at=updated_at,
                )
            )
        return decks
