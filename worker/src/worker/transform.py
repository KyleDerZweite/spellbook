from __future__ import annotations

# Layouts to skip (not real game cards)
SKIP_LAYOUTS = frozenset(
    {
        "token",
        "double_faced_token",
        "art_series",
        "emblem",
        "planar",
        "scheme",
        "vanguard",
    }
)

# Layouts where oracle_text lives on card_faces
MULTI_FACE_LAYOUTS = frozenset(
    {
        "transform",
        "modal_dfc",
        "split",
        "adventure",
        "flip",
        "reversible_card",
    }
)


def transform_card(raw: dict) -> dict | None:
    """Transform a Scryfall card object into a flat MeiliSearch document.

    Returns None for non-game cards (tokens, art series, etc.)
    """
    layout = raw.get("layout", "")
    if layout in SKIP_LAYOUTS:
        return None

    card_id = raw.get("id", "")
    oracle_id = raw.get("oracle_id", "")
    if not card_id or not oracle_id:
        return None

    # Resolve image URIs (top-level or from front face for DFCs)
    image_uri, image_uri_small = _resolve_images(raw)

    # Resolve oracle text
    oracle_text = _resolve_oracle_text(raw, layout)

    # Resolve finishes
    finishes = raw.get("finishes", [])
    is_foil_available = "foil" in finishes or "etched" in finishes
    is_nonfoil_available = "nonfoil" in finishes

    doc = {
        "id": card_id,
        "oracle_id": oracle_id,
        "name": raw.get("name", ""),
        "lang": raw.get("lang", "en"),
        "released_at": raw.get("released_at", ""),
        "layout": layout,
        "mana_cost": raw.get("mana_cost", ""),
        "cmc": raw.get("cmc", 0.0),
        "type_line": raw.get("type_line", ""),
        "oracle_text": oracle_text,
        "colors": raw.get("colors") or [],
        "color_identity": raw.get("color_identity") or [],
        "keywords": raw.get("keywords") or [],
        "power": raw.get("power"),
        "toughness": raw.get("toughness"),
        "rarity": raw.get("rarity", ""),
        "set_code": raw.get("set", ""),
        "set_name": raw.get("set_name", ""),
        "collector_number": raw.get("collector_number", ""),
        "image_uri": image_uri,
        "image_uri_small": image_uri_small,
        "is_foil_available": is_foil_available,
        "is_nonfoil_available": is_nonfoil_available,
        "legalities": raw.get("legalities") or {},
    }

    # Add back face info for DFCs
    if layout in ("transform", "modal_dfc", "reversible_card"):
        faces = raw.get("card_faces") or []
        if len(faces) >= 2:
            back = faces[1]
            doc["back_face_name"] = back.get("name", "")
            back_imgs = back.get("image_uris") or {}
            doc["back_face_image_uri"] = back_imgs.get("normal", "")

    return doc


def _resolve_images(raw: dict) -> tuple[str, str]:
    """Get normal and small image URIs, handling DFCs."""
    # Try top-level image_uris first
    image_uris = raw.get("image_uris")
    if image_uris:
        return image_uris.get("normal", ""), image_uris.get("small", "")

    # Fall back to front face for DFCs
    faces = raw.get("card_faces") or []
    if faces:
        front_imgs = faces[0].get("image_uris") or {}
        return front_imgs.get("normal", ""), front_imgs.get("small", "")

    return "", ""


def _resolve_oracle_text(raw: dict, layout: str) -> str:
    """Get oracle text, combining faces for multi-face cards."""
    # Single-face: use top-level oracle_text
    if layout not in MULTI_FACE_LAYOUTS:
        return raw.get("oracle_text") or ""

    # Multi-face: combine face texts for searchability
    faces = raw.get("card_faces") or []
    if not faces:
        return raw.get("oracle_text") or ""

    texts = []
    for face in faces:
        text = face.get("oracle_text")
        if text:
            texts.append(text)
    return "\n\n".join(texts)
