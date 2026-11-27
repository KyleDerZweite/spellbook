"""MTGGoldfish metagame DeckSource provider with local caching and rate limiting."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

from worker.reference_decks.base import (
    RawReferenceDeck,
    parse_decklist_text,
)
from worker.reference_decks.cache import CachedHttpFetcher

log = logging.getLogger(__name__)

DEFAULT_MTGGOLDFISH_BASE_URL = "https://www.mtggoldfish.com"

# Explicit mapping from central search format IDs to MTGGoldfish metagame slugs.
MTGGOLDFISH_FORMAT_SLUGS: dict[str, str] = {
    "standard": "standard",
    "pioneer": "pioneer",
    "modern": "modern",
    "legacy": "legacy",
    "vintage": "vintage",
    "pauper": "pauper",
    "commander": "commander",
    "brawl": "brawl",
}

_ARCHETYPE_HREF_RE = re.compile(r"^/archetype/([^/?#]+)")
_META_SHARE_RE = re.compile(r"(?<![\d.])(\d+(?:\.\d+)?)\s*%")
_VOID_TAGS: frozenset[str] = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)


@dataclass(frozen=True)
class _ArchetypeEntry:
    slug: str
    name: str
    url: str
    meta_share: float | None


class _MetagameHTMLParser(HTMLParser):
    """Extract archetype links, titles, and meta share percentages from metagame HTML."""

    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self._base_url = base_url
        self._in_tile = False
        self._tile_depth = 0
        self._in_title = False
        self._title_depth = 0
        self._in_anchor = False
        self._current_href: str | None = None
        self._current_text: list[str] = []
        self._tile_archetype_href: str | None = None
        self._tile_archetype_name: str | None = None
        self._tile_text: list[str] = []
        self._entries: list[_ArchetypeEntry] = []
        self._seen_slugs: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        is_void = tag.lower() in _VOID_TAGS
        attr_map = dict(attrs)
        classes = (attr_map.get("class") or "").split()
        if tag in ("div", "article", "li") and "archetype-tile" in classes and not self._in_tile:
            self._in_tile = True
            self._tile_depth = 1
            self._in_title = False
            self._title_depth = 0
            self._tile_archetype_href = None
            self._tile_archetype_name = None
            self._tile_text = []
        elif self._in_tile and not is_void:
            self._tile_depth += 1

        if self._in_tile and not is_void:
            if "archetype-tile-title" in classes and not self._in_title:
                self._in_title = True
                self._title_depth = 1
            elif self._in_title:
                self._title_depth += 1

        if tag == "a" and self._in_title:
            href = attr_map.get("href") or ""
            if _ARCHETYPE_HREF_RE.match(href):
                self._in_anchor = True
                self._current_href = href
                self._current_text = []

    def handle_data(self, data: str) -> None:
        if self._in_anchor:
            self._current_text.append(data)
        if self._in_tile:
            self._tile_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _VOID_TAGS:
            return
        if tag == "a" and self._in_anchor:
            self._in_anchor = False
            name = " ".join("".join(self._current_text).split()).strip()
            href = self._current_href or ""
            self._current_href = None
            self._current_text = []
            if name and href and self._in_tile and self._tile_archetype_href is None:
                self._tile_archetype_href = href
                self._tile_archetype_name = name

        if self._in_title:
            self._title_depth -= 1
            if self._title_depth <= 0:
                self._in_title = False

        if self._in_tile:
            self._tile_depth -= 1
            if self._tile_depth <= 0:
                self._in_tile = False
                if self._tile_archetype_href and self._tile_archetype_name:
                    tile_blob = " ".join("".join(self._tile_text).split())
                    share_match = _META_SHARE_RE.search(tile_blob)
                    meta_share = float(share_match.group(1)) if share_match else None
                    if meta_share is not None and not (0.0 <= meta_share <= 100.0):
                        meta_share = None
                    self._record(self._tile_archetype_href, self._tile_archetype_name, meta_share)

    def _record(self, href: str, name: str, meta_share: float | None) -> None:
        match = _ARCHETYPE_HREF_RE.match(href)
        if not match:
            return
        slug = match.group(1)
        if slug in self._seen_slugs:
            return
        self._seen_slugs.add(slug)
        self._entries.append(
            _ArchetypeEntry(
                slug=slug,
                name=name[:200],
                url=urljoin(self._base_url, f"/archetype/{slug}"),
                meta_share=meta_share,
            )
        )

    @property
    def entries(self) -> list[_ArchetypeEntry]:
        return self._entries


class _EmbeddedDeckHTMLParser(HTMLParser):
    """Extract the embedded plain-text decklist from an MTGGoldfish archetype page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.deck_text: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "input" or self.deck_text is not None:
            return
        attr_map = dict(attrs)
        if attr_map.get("id") == "deck_input_deck" or attr_map.get("name") == "deck_input[deck]":
            value = attr_map.get("value")
            if value:
                self.deck_text = value


def parse_metagame_html(
    html: str, base_url: str = DEFAULT_MTGGOLDFISH_BASE_URL
) -> list[_ArchetypeEntry]:
    parser = _MetagameHTMLParser(base_url)
    parser.feed(html)
    return parser.entries


def parse_archetype_deck_text(html: str) -> str | None:
    parser = _EmbeddedDeckHTMLParser()
    parser.feed(html)
    return parser.deck_text


class MTGGoldfishDeckSource:
    """Fetch metagame reference decks from MTGGoldfish feeds."""

    source_id = "mtggoldfish"

    def __init__(
        self,
        fetcher: CachedHttpFetcher,
        *,
        base_url: str = DEFAULT_MTGGOLDFISH_BASE_URL,
        max_decks_per_format: int = 20,
    ) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Invalid MTGGoldfish base URL")
        self._fetcher = fetcher
        self._base_url = base_url.rstrip("/")
        self._max_decks_per_format = max(1, int(max_decks_per_format))

    def supported_formats(self) -> frozenset[str]:
        return frozenset(MTGGOLDFISH_FORMAT_SLUGS)

    def fetch_decks(self, formats: Sequence[str]) -> list[RawReferenceDeck]:
        decks: list[RawReferenceDeck] = []
        now = datetime.now(UTC)
        for fmt in formats:
            normalized_format = fmt.lower()
            slug = MTGGOLDFISH_FORMAT_SLUGS.get(normalized_format)
            if slug is None:
                log.info("Skipping unsupported MTGGoldfish format: %s", fmt)
                continue

            metagame_url = f"{self._base_url}/metagame/{slug}/full"
            metagame_html = self._fetcher.fetch_text(metagame_url)
            archetypes = parse_metagame_html(metagame_html, self._base_url)[
                : self._max_decks_per_format
            ]
            if not archetypes:
                raise ValueError(f"No archetypes found on MTGGoldfish metagame page for {fmt}")

            format_decks: list[RawReferenceDeck] = []
            for entry in archetypes:
                archetype_html = self._fetcher.fetch_text(entry.url)
                deck_text = parse_archetype_deck_text(archetype_html)
                if not deck_text:
                    raise ValueError(
                        f"Missing embedded decklist for MTGGoldfish archetype {entry.slug}"
                    )
                _metadata, cards = parse_decklist_text(deck_text, blank_line_starts_sideboard=True)
                if not cards:
                    raise ValueError(
                        f"Empty parsed decklist for MTGGoldfish archetype {entry.slug}"
                    )
                format_decks.append(
                    RawReferenceDeck(
                        source=self.source_id,
                        external_id=f"{normalized_format}:{entry.slug}"[:256],
                        name=entry.name,
                        format=normalized_format,
                        cards=cards,
                        archetype=entry.name,
                        source_url=entry.url[:1000],
                        meta_share=entry.meta_share,
                        source_updated_at=now,
                    )
                )
            decks.extend(format_decks)
        return decks
