"""Inventory query normalization and SQL ordering, shared by page and location reads."""

import math
import re
from typing import TypedDict, cast

from spellbook_core.errors import ValidationError
from spellbook_core.fingerprint import serialize_json
from spellbook_core.validation import js_trim, js_utf8, utf16_length


class InventoryQuery(TypedDict):
    finish: str
    condition: str
    sort: str
    dir: str
    variant: str | None
    variantDir: str
    view: str
    q: str
    sets: list[str]
    group: str | None
    offset: int
    limit: int


_OPTIONS = {
    "finish": ("all", "foil", "nonfoil"),
    "condition": ("all", "NM", "LP", "MP", "HP", "DMG"),
    "sort": ("name", "set", "newest"),
    "dir": ("asc", "desc"),
    "variant": ("finish", "condition", "quantity"),
    "variantDir": ("asc", "desc"),
    "view": ("cards", "groups"),
}
_DEFAULTS: InventoryQuery = {
    "finish": "all",
    "condition": "all",
    "sort": "name",
    "dir": "asc",
    "variant": None,
    "variantDir": "asc",
    "view": "cards",
    "q": "",
    "sets": [],
    "group": None,
    "offset": 0,
    "limit": 50,
}
_UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.I | re.ASCII)


def _integer(value: object, minimum: int, maximum: int) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int | float)
        and minimum <= value <= maximum
        and math.isfinite(value)
        and value == int(value)
    )


def normalize_inventory_query(value: object) -> InventoryQuery:
    if not isinstance(value, dict):
        raise ValidationError("Inventory query must be an object")
    if value.keys() - _DEFAULTS.keys():
        raise ValidationError("Unknown Inventory query option")
    q = value.get("q") if value.get("q") is not None else ""
    if not isinstance(q, str) or utf16_length(q) > 300:
        raise ValidationError("q must contain at most 300 characters")
    sets = value.get("sets") if value.get("sets") is not None else []
    if (
        not isinstance(sets, list)
        or len(sets) > 100
        or any(
            not isinstance(s, str) or not re.fullmatch(r"[a-z0-9]{1,12}", s, re.I | re.ASCII)
            for s in sets
        )
    ):
        raise ValidationError("Invalid sets")
    result = dict(_DEFAULTS)
    for key, allowed in _OPTIONS.items():
        selected = value.get(key)
        if selected is None:
            selected = result[key]
        if selected is None and key == "variant":
            continue
        if not isinstance(selected, str) or selected not in allowed:
            raise ValidationError(f"Invalid {key}")
        result[key] = selected
    offset = value.get("offset") if value.get("offset") is not None else 0
    limit = value.get("limit") if value.get("limit") is not None else 50
    if not _integer(offset, 0, 9007199254740991):
        raise ValidationError("offset must be a nonnegative integer")
    if not _integer(limit, 1, 500):
        raise ValidationError("limit must be between 1 and 500")
    group = value.get("group")
    if group is not None and (not isinstance(group, str) or not _UUID.fullmatch(group)):
        raise ValidationError("group must be a UUID")
    result.update(
        q=js_trim(q),
        sets=sorted({s.lower() for s in sets}),
        group=group.lower() if group is not None else None,
        offset=int(cast(int, offset)),
        limit=int(cast(int, limit)),
    )
    return cast(InventoryQuery, result)


def inventory_query_key(query: InventoryQuery) -> str:
    return serialize_json({**query, "offset": 0, "limit": 50})


def validate_revision(value: object) -> None:
    if value is not None and (
        not isinstance(value, str) or not re.fullmatch(r"0|[1-9][0-9]*", value)
    ):
        raise ValidationError("Invalid Inventory revision")


def selection(
    query: InventoryQuery, inventory_id: str | None, account_id: str
) -> tuple[str, str, list[object]]:
    values: list[object] = [inventory_id, account_id]
    where = ["c.inventory_id=%s AND c.account_id=%s AND c.game='mtg'"]
    if query["q"]:
        literal = re.sub(
            r"[\\%_]", lambda m: "\\" + m[0], js_utf8(query["q"].lower()).decode("utf-8")
        )
        where.append(
            "(lower(c.name) LIKE %s OR lower(c.set_code) LIKE %s OR "
            "lower(c.condition) LIKE %s OR lower(c.notes) LIKE %s)"
        )
        values.extend(["%" + literal + "%"] * 4)
    if query["sets"]:
        where.append("lower(c.set_code)=ANY(%s::text[])")
        values.append(query["sets"])
    for field in ("finish", "condition"):
        selected = query[field]
        if selected != "all":
            where.append(f"c.{field}=%s")
            values.append(selected)
    if query["group"]:
        where.append(
            "EXISTS(SELECT 1 FROM inventory_group_memberships m "
            "WHERE m.entry_id=c.id AND m.group_id=%s::uuid)"
        )
        values.append(query["group"])
    finish = "CASE c.finish WHEN 'nonfoil' THEN 0 ELSE 1 END"
    condition = (
        "CASE c.condition WHEN 'NM' THEN 0 WHEN 'LP' THEN 1 WHEN 'MP' THEN 2 "
        "WHEN 'HP' THEN 3 ELSE 4 END"
    )
    tie = f'c.catalog_card_id COLLATE "C",{finish},{condition},c.id'
    variant = ""
    if query["variant"]:
        expression = {"finish": finish, "condition": condition, "quantity": "c.quantity"}[
            query["variant"]
        ]
        variant = f"{expression} {query['variantDir']},"
    if query["sort"] == "newest":
        order = f"c.created_at DESC,{tie}"
    elif query["sort"] == "set":
        order = (
            f'c.set_code COLLATE "inventory_root" {query["dir"]},'
            f'{variant}c.name COLLATE "inventory_root",{tie}'
        )
    else:
        order = (
            f'{variant}c.name COLLATE "inventory_root" {query["dir"]},'
            f'c.set_code COLLATE "inventory_root",{tie}'
        )
    return " AND ".join(where), order, values
