"""Public Scryfall evidence. Missing optional facts never prove variant equality."""

from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import UUID

EXTRACTOR_VERSION = 2
MAPPING_VERSION = 1
LAYOUTS = {"normal", "transform", "modal_dfc", "split", "adventure", "flip"}
LINK_HOSTS = {
    "cardmarket": ("Cardmarket", {"cardmarket.com", "www.cardmarket.com"}),
    "tcgplayer": ("TCGplayer", {"tcgplayer.com", "www.tcgplayer.com", "go.tcgplayer.com"}),
    "cardhoarder": ("Cardhoarder", {"cardhoarder.com", "www.cardhoarder.com"}),
}
IDENTITY_FIELDS = (
    "id",
    "oracle_id",
    "set_id",
    "set",
    "collector_number",
    "lang",
    "layout",
    "finishes",
    "variation",
    "variation_of",
    "illustration_id",
    "frame",
    "frame_effects",
    "border_color",
    "full_art",
    "textless",
    "oversized",
    "promo",
    "promo_types",
    "cardmarket_id",
    "tcgplayer_id",
    "tcgplayer_etched_id",
)


def uuid(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Invalid source UUID")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Invalid source UUID") from exc


def decimal(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise ValueError("Invalid EUR decimal")
    # Formatting Decimal, without arithmetic or context rounding, preserves source precision.
    result = format(Decimal(value), "f")
    if "." in result:
        result = result.rstrip("0").rstrip(".")
    whole, dot, fraction = result.partition(".")
    return (whole.lstrip("0") or "0") + (dot + fraction if dot else "")


def product_links(raw: dict) -> list[dict]:
    links = []
    supplied = raw.get("purchase_uris") or {}
    if not isinstance(supplied, dict):
        return links
    for key, (provider, hosts) in LINK_HOSTS.items():
        value = supplied.get(key)
        if not isinstance(value, str) or len(value) > 4096:
            continue
        try:
            url = urlsplit(value)
            if (
                url.scheme != "https"
                or url.hostname not in hosts
                or url.username is not None
                or url.password is not None
                or url.port not in (None, 443)
                or any(ord(c) < 32 for c in value)
            ):
                continue
        except ValueError:
            continue
        links.append({"provider": provider, "url": value})
    return links


def variant_key(identity: dict) -> str | None:
    if identity.get("layout") not in LAYOUTS or identity.get("variation") is not False:
        return None
    required = (
        "oracle_id",
        "set_id",
        "set",
        "collector_number",
        "layout",
        "frame",
        "border_color",
    )
    if any(not isinstance(identity.get(k), str) or not identity[k] for k in required):
        return None
    flags = ("full_art", "textless", "oversized", "promo")
    if any(type(identity.get(k)) is not bool for k in flags):
        return None
    arrays = ("frame_effects", "promo_types")
    if any(
        not isinstance(identity.get(k), list)
        or any(not isinstance(v, str) or not v for v in identity[k])
        for k in arrays
    ):
        return None
    evidence = {k: identity[k] for k in (*required, *flags)}
    for key in arrays:
        evidence[key] = sorted(set(identity[key]))
    art = identity.get("illustration_id")
    faces = identity.get("card_faces")
    if art is not None:
        try:
            evidence["art"] = uuid(art)
        except ValueError:
            return None
    elif identity["layout"] != "normal" and isinstance(faces, list) and len(faces) >= 2:
        try:
            evidence["faces"] = [uuid(face.get("illustration_id")) for face in faces]
        except (ValueError, AttributeError):
            return None
    else:
        return None
    return hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()


def project_printing(raw: dict) -> dict:
    identity = {key: raw[key] for key in IDENTITY_FIELDS if key in raw}
    for key in ("id", "oracle_id", "set_id"):
        identity[key] = uuid(raw.get(key))
    for key in ("set", "collector_number", "lang", "layout"):
        if not isinstance(raw.get(key), str) or not raw[key]:
            raise ValueError("Invalid printing identity")
    finishes = raw.get("finishes")
    if (
        not isinstance(finishes, list)
        or any(f not in ("nonfoil", "foil", "etched") for f in finishes)
        or len(set(finishes)) != len(finishes)
    ):
        raise ValueError("Invalid source finishes")
    if "card_faces" in raw and isinstance(raw["card_faces"], list):
        identity["card_faces"] = [
            {k: face[k] for k in ("illustration_id",) if k in face}
            if isinstance(face, dict)
            else {}
            for face in raw["card_faces"]
        ]
    prices = raw.get("prices")
    if prices is None:
        prices = {}
    if not isinstance(prices, dict):
        raise ValueError("Invalid source prices")
    amounts = {"nonfoil": decimal(prices.get("eur")), "foil": decimal(prices.get("eur_foil"))}
    supported = {
        "nonfoil": "nonfoil" in finishes,
        "foil": "foil" in finishes,
    }
    return {
        "id": identity["id"],
        "identity": identity,
        "variant_key": variant_key(identity),
        "amounts": amounts,
        "raw_prices": {k: prices.get(k) for k in ("eur", "eur_foil")},
        "supported": supported,
        "links": product_links(raw),
    }
