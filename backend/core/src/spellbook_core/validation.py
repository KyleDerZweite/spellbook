"""Scalar compatibility rules from contracts/src/validation.ts."""

import math
import re
from collections.abc import Sequence
from enum import Enum
from typing import Literal

from .errors import ValidationError


class Missing(Enum):
    VALUE = 0


MISSING = Missing.VALUE
CardFinish = Literal["nonfoil", "foil"]
CardCondition = Literal["NM", "LP", "MP", "HP", "DMG"]
DeckRole = Literal["main", "sideboard", "commander", "companion"]
InventorySource = Literal["mobile", "web", "import", "scan", "scan_review"]
VALID_FINISHES: tuple[CardFinish, ...] = ("nonfoil", "foil")
VALID_CONDITIONS: tuple[CardCondition, ...] = ("NM", "LP", "MP", "HP", "DMG")
DECK_ROLES: tuple[DeckRole, ...] = ("main", "sideboard", "commander", "companion")
INVENTORY_SOURCES: tuple[InventorySource, ...] = ("mobile", "web", "import", "scan", "scan_review")
DECK_SOURCES = ("mobile", "web", "import")
# ECMAScript WhiteSpace + LineTerminator. Python strip includes extra control characters.
_JS_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680" + (
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
_UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def js_utf8(value: str) -> bytes:
    """Node UTF-8 replaces isolated UTF-16 surrogates with U+FFFD."""
    return (
        value.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace").encode("utf-8")
    )


def js_trim(value: str) -> str:
    return value.strip(_JS_WHITESPACE)


def _string(value: object, field: str, fallback: str = "") -> str:
    if value is MISSING:
        return fallback
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    return value


def assert_request_id(value: object = MISSING) -> str:
    result = js_trim(_string(value, "requestId"))
    if not result:
        raise ValidationError("requestId is required")
    return result


def normalize_source[Choice: str](
    value: object, allowed: Sequence[Choice], fallback: Choice
) -> Choice:
    result = js_trim(_string(value, "source", fallback))
    for choice in allowed:
        if result == choice:
            return choice
    raise ValidationError(f"Invalid source: {result}")


def _enum[Choice: str](value: object, allowed: Sequence[Choice], name: str) -> Choice:
    result = js_trim(_string(value, "value"))
    for choice in allowed:
        if result == choice:
            return choice
    raise ValidationError(f"Invalid {name}: {result}")


def assert_finish(value: object = MISSING) -> CardFinish:
    return _enum(value, VALID_FINISHES, "finish")


def assert_condition(value: object = MISSING) -> CardCondition:
    return _enum(value, VALID_CONDITIONS, "condition")


def assert_deck_role(value: object = MISSING) -> DeckRole:
    return _enum(value, DECK_ROLES, "role")


def normalize_quantity(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError("Quantity must be a finite 32-bit integer")
    if abs(value) > 2147483647 or not math.isfinite(value) or value != int(value):
        raise ValidationError("Quantity must be a finite 32-bit integer")
    return int(value)


def positive_quantity(value: object) -> int:
    result = normalize_quantity(value)
    if result <= 0:
        raise ValidationError("Quantity must be greater than zero")
    return result


def assert_bounded_text(value: object, field: str, limit: int) -> str:
    if not isinstance(value, str) or utf16_length(value) > limit:
        raise ValidationError(f"{field} must be a string of at most {limit} characters")
    return value


def assert_uuid(value: object, field: str) -> str:
    result = assert_bounded_text(value, field, 36).lower()
    if not _UUID.fullmatch(result):
        raise ValidationError(f"{field} must be a UUID")
    return result


def valid_password(value: object) -> bool:
    return isinstance(value, str) and 12 <= utf16_length(value) <= 128
