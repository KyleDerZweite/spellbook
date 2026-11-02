"""Direct related-token projection from a bounded, two-pass source index."""

from pathlib import Path
from uuid import UUID

from worker.bulk import _iter_bulk_cards


def token_references(raw: dict) -> list[dict]:
    parts = raw.get("all_parts") or []
    if not isinstance(parts, list):
        raise ValueError("Invalid all_parts")
    refs = {}
    for part in parts:
        if not isinstance(part, dict):
            raise ValueError("Invalid related component")
        if part.get("component") != "token":
            continue
        card_id = str(UUID(part["id"]))
        name = part.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("Invalid token name")
        refs.setdefault(card_id, {"catalogCardId": card_id, "name": name})
    return list(refs.values())


def project_token(raw: dict) -> dict:
    faces = raw.get("card_faces") or [raw]
    projected = []
    for face in faces:
        colors = face.get("colors", raw.get("colors"))
        if not isinstance(colors, list) or any(c not in ("W", "U", "B", "R", "G") for c in colors):
            raise ValueError("Invalid token face colors")
        images = (
            face.get("image_uris")
            or (raw.get("image_uris") if raw.get("layout") == "flip" else {})
            or {}
        )
        projected.append(
            {
                "name": face.get("name", ""),
                "typeLine": face.get("type_line", ""),
                "colors": colors,
                "oracleText": face.get("oracle_text") or "",
                "power": face.get("power"),
                "toughness": face.get("toughness"),
                "imageUri": images.get("normal") or None,
                "imageUriSmall": images.get("small") or None,
            }
        )
    return {
        "catalogCardId": str(UUID(raw["id"])),
        "canonicalCardId": str(UUID(raw["oracle_id"])) if raw.get("oracle_id") else None,
        "name": raw["name"],
        "layout": raw["layout"],
        "setCode": raw.get("set", ""),
        "collectorNumber": raw.get("collector_number", ""),
        "faces": projected,
    }


def build_token_index(path: Path) -> dict[str, dict]:
    targets = set()
    with path.open(encoding="utf-8") as source:
        for raw in _iter_bulk_cards(source):
            targets.update(ref["catalogCardId"] for ref in token_references(raw))
    index = {}
    with path.open(encoding="utf-8") as source:
        for raw in _iter_bulk_cards(source):
            if raw.get("id") in targets:
                index[raw["id"]] = project_token(raw)
    return index


def related_tokens(raw: dict, index: dict[str, dict] | None) -> dict:
    items, unresolved = [], []
    for ref in token_references(raw):
        token = (index or {}).get(ref["catalogCardId"])
        if token is None:
            unresolved.append(ref)
        else:
            items.append(token)
    return {"items": items, "unresolved": unresolved}
