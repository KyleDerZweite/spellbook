"""The slot-free subset of the Cardstation Sort Rule v1 contract."""

import re
from typing import TypedDict

from spellbook_core.errors import ValidationError

_ALLOWED = {
    "printedColor": ("white", "blue", "black", "red", "green", "multicolor", "colorless"),
    "rarity": ("common", "uncommon", "rare", "mythic", "special", "bonus"),
}
_SET_CODE = re.compile(r"[a-z0-9]{2,6}")


class SortPredicate(TypedDict):
    field: str
    oneOf: list[str]


def parse_sort_predicates(value: object) -> list[SortPredicate]:
    if not isinstance(value, list) or not 1 <= len(value) <= 3:
        raise ValidationError("A condition needs 1 to 3 predicates")
    predicates: list[SortPredicate] = []
    fields: set[str] = set()
    for entry in value:
        if not isinstance(entry, dict) or set(entry) != {"field", "oneOf"}:
            raise ValidationError("Each predicate needs only field and oneOf")
        field, values = entry["field"], entry["oneOf"]
        if not isinstance(field, str) or (field not in _ALLOWED and field != "setCode"):
            raise ValidationError("Unknown sort predicate field")
        if field in fields:
            raise ValidationError("Repeated sort predicate field")
        fields.add(field)
        if not isinstance(values, list) or not values:
            raise ValidationError("A sort predicate needs at least one value")
        allowed = _ALLOWED.get(field)
        checked: list[str] = []
        for item in values:
            if not isinstance(item, str) or (
                item not in allowed if allowed is not None else not _SET_CODE.fullmatch(item)
            ):
                raise ValidationError("Invalid sort predicate value")
            checked.append(item)
        if len(set(checked)) != len(checked):
            raise ValidationError("Repeated sort predicate value")
        predicates.append({"field": field, "oneOf": checked})
    return predicates
