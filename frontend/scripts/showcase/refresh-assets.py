#!/usr/bin/env python3
"""Refresh the bounded public showcase, not the application catalog.

Requires Python 3 and Pillow (offline image preparation only).
From the repository root:
    python3 frontend/scripts/showcase/refresh-assets.py
    python3 frontend/scripts/showcase/refresh-assets.py ponder birds-of-paradise

Add a confirmed Scryfall printing UUID and unique slug to src/lib/showcase/cards.json
before refreshing a new card. The manifest owns provenance and display metadata.
Full frames are resized without cropping. All downloads complete before replacement.
"""

import argparse
from datetime import date
from io import BytesIO
import json
from pathlib import Path
import re
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from PIL import Image


FRONTEND = Path(__file__).resolve().parents[2]
ASSETS = FRONTEND / "static" / "showcase"
MANIFEST = FRONTEND / "src" / "lib" / "showcase" / "cards.json"
WIDTH = 560
HEADERS = {"User-Agent": "SpellbookShowcase/1.0", "Accept": "application/json,image/*"}


def download(url):
    for attempt in range(3):
        # Includes retries and image requests; safely below Scryfall's 10/s limit.
        time.sleep(0.15)
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=30) as response:
                return response.read()
        except (URLError, TimeoutError) as error:
            if isinstance(error, HTTPError) and error.code not in (429, 500, 502, 503, 504):
                raise
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="*", help="Only refresh these manifest slugs; default: all")
    args = parser.parse_args()
    cards = json.loads(MANIFEST.read_text())
    slugs = [card["slug"] for card in cards]
    if len(slugs) != len(set(slugs)) or any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) for slug in slugs):
        parser.error("Manifest slugs must be unique, lowercase path-safe identifiers")
    if set(args.slugs) - set(slugs):
        parser.error("Unknown slug: " + ", ".join(sorted(set(args.slugs) - set(slugs))))
    for card in cards:
        UUID(card["id"])

    with tempfile.TemporaryDirectory(prefix="showcase-", dir=ASSETS) as temporary:
        staging = Path(temporary)
        for card in cards:
            if args.slugs and card["slug"] not in args.slugs:
                continue
            metadata_url = f'https://api.scryfall.com/cards/{card["id"]}'
            data = json.loads(download(metadata_url))
            if data.get("id") != card["id"] or "image_uris" not in data:
                raise ValueError(f'Expected a single-faced printing: {card["slug"]}')
            image_url = data["image_uris"]["large"]
            with Image.open(BytesIO(download(image_url))) as source:
                if source.width < WIDTH or not 0.65 < source.width / source.height < 0.8:
                    raise ValueError(f'Expected a full card frame: {card["slug"]}')
                picture = source.convert("RGB")
                picture = picture.resize((WIDTH, round(source.height * WIDTH / source.width)), Image.Resampling.LANCZOS)
                picture.save(staging / f'{card["slug"]}.webp', "WEBP", quality=86, method=6)
            card.update({
                "name": data["name"], "set": data["set"].upper(),
                "setName": data["set_name"], "collectorNumber": data["collector_number"],
                "type": data["type_line"], "mana": data["mana_cost"],
                "artist": data["artist"], "source": data["scryfall_uri"],
                "metadataSource": metadata_url, "imageSource": image_url,
                "width": picture.width, "height": picture.height,
                "refreshedOn": date.today().isoformat(),
            })
            print(f'{card["slug"]}: {picture.width}x{picture.height}, {data["set"].upper()} {data["collector_number"]}')
        (staging / MANIFEST.name).write_text(json.dumps(cards, ensure_ascii=False, indent="\t") + "\n")
        for image in staging.glob("*.webp"):
            image.replace(ASSETS / image.name)
        (staging / MANIFEST.name).replace(MANIFEST)


if __name__ == "__main__":
    main()
