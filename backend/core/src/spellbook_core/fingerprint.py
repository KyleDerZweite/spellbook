"""Node request-fingerprint.ts JSON bytes, including ECMAScript number/key rules."""

import hashlib
import json
import math

from .errors import ValidationError
from .validation import MISSING


def _quote(value: str) -> str:
    # Combine valid surrogate pairs and escape isolated surrogates as well-formed JSON.stringify.
    value = value.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")
    quoted = json.dumps(value, ensure_ascii=False)
    return "".join(
        f"\\u{ord(char):04x}" if 0xD800 <= ord(char) <= 0xDFFF else char for char in quoted
    )


def _number(value: int | float) -> str:
    try:
        number = float(value)
    except OverflowError:
        return "null"
    if not math.isfinite(number):
        return "null"
    if number == 0:
        return "0"
    sign = "-" if number < 0 else ""
    # CPython repr selects the shortest round-tripping binary64 decimal, ties to even.
    # ECMAScript uses the same digits with different fixed/exponent thresholds.
    coefficient, _, exponent = repr(abs(number)).lower().partition("e")
    whole, _, fraction = coefficient.partition(".")
    digits = (whole + fraction).lstrip("0")
    point = len(whole) + (int(exponent) if exponent else 0)
    point -= len(whole + fraction) - len((whole + fraction).lstrip("0"))
    digits = digits.rstrip("0")
    if 0 < point <= 21:
        return sign + (
            digits + "0" * (point - len(digits))
            if point >= len(digits)
            else digits[:point] + "." + digits[point:]
        )
    if -6 < point <= 0:
        return sign + "0." + "0" * (-point) + digits
    power = point - 1
    mantissa = digits[0] + ("." + digits[1:] if len(digits) > 1 else "")
    return sign + mantissa + "e" + ("+" if power >= 0 else "-") + str(abs(power))


def _index(key: str) -> int | None:
    if key == "0":
        return 0
    if not key or key[0] == "0" or not key.isascii() or not key.isdigit() or len(key) > 10:
        return None
    number = int(key)
    return number if number < 4294967295 else None


def _serialize(payload: object, *, canonical: bool) -> str:
    active: set[int] = set()

    def encode(value: object) -> str:
        if value is None or value is MISSING:
            return "null"
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, str):
            return _quote(value)
        if isinstance(value, (int, float)):
            return _number(value)
        if isinstance(value, (dict, list)):
            identity = id(value)
            if identity in active:
                raise ValidationError("Mutation payload must be JSON serializable")
            active.add(identity)
            try:
                if isinstance(value, list):
                    return "[" + ",".join(encode(item) for item in value) + "]"
                if not all(isinstance(key, str) for key in value):
                    raise ValidationError("Mutation payload must be JSON serializable")
                keys = list(value)
                if canonical:
                    keys.sort(key=lambda key: key.encode("utf-16-be", "surrogatepass"))
                indices = sorted((_index(key), key) for key in keys if _index(key) is not None)
                ordered = [key for _, key in indices] + [
                    key for key in keys if _index(key) is None
                ]
                return (
                    "{"
                    + ",".join(
                        _quote(key) + ":" + encode(value[key])
                        for key in ordered
                        if value[key] is not MISSING
                    )
                    + "}"
                )
            finally:
                active.remove(identity)
        raise ValidationError("Mutation payload must be JSON serializable")

    if payload is MISSING:
        raise ValidationError("Mutation payload must be JSON serializable")
    return encode(payload)


def serialize_mutation(payload: object) -> str:
    """Recursively sort objects, then apply JSON.stringify enumeration and omission."""
    return _serialize(payload, canonical=True)


def serialize_json(payload: object) -> str:
    """Serialize DTOs with JSON.stringify numbers and ordinary property order."""
    return _serialize(payload, canonical=False)


def mutation_fingerprint(payload: object) -> str:
    return hashlib.sha256(serialize_mutation(payload).encode("utf-8")).hexdigest()
