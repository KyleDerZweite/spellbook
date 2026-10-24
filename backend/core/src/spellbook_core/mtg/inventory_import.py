"""Arena text parsing and Catalog resolution for Inventory import previews.

The empty format used by Inventory produces no legality warnings. SQL and mutation
receipts stay with Catalog and Inventory respectively.
"""

import asyncio
import re
import unicodedata
from typing import Literal, TypedDict

from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import js_trim

type ImportRole = Literal["main", "sideboard", "commander", "companion", "maybeboard"]


class ImportLine(TypedDict):
    quantity: int
    name: str
    normalizedName: str
    setCode: str | None
    collectorNumber: str | None
    role: ImportRole
    raw: str


class MalformedLine(TypedDict):
    raw: str
    role: ImportRole


class ResolvedLine(TypedDict):
    line: ImportLine
    card: CardDocument


class UnresolvedLine(TypedDict):
    line: ImportLine | MalformedLine
    reason: str


class AmbiguousLine(TypedDict):
    line: ImportLine
    candidates: list[CardDocument]


class ImportPreview(TypedDict):
    parsed: list[ImportLine]
    resolved: list[ResolvedLine]
    unresolved: list[UnresolvedLine]
    ambiguous: list[AmbiguousLine]
    warnings: list[dict[str, str]]


class InventoryImportInput(TypedDict):
    text: str
    finish: str
    condition: str


class InventoryImportSummary(TypedDict):
    resolvedCount: int
    unresolvedCount: int
    ambiguousCount: int


_SECTIONS: dict[str, ImportRole] = {
    "deck": "main",
    "main": "main",
    "mainboard": "main",
    "maindeck": "main",
    "sideboard": "sideboard",
    "commander": "commander",
    "companion": "companion",
    "maybeboard": "maybeboard",
}
# ECMAScript \s excludes the extra C0 controls included by Python's \s.
_SPACE = r"[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"
_PREFIX = re.compile(rf"^SB:{_SPACE}*", re.IGNORECASE | re.ASCII)
_TEXT = r"[^\r\n\u2028\u2029]"
_CARD = re.compile(rf"^([0-9]+){_SPACE}*x?{_SPACE}+({_TEXT}+)$", re.IGNORECASE | re.ASCII)
_PRINTING = re.compile(rf"^({_TEXT}*?){_SPACE}+\(([A-Za-z0-9]+)\)(?:{_SPACE}+([A-Za-z0-9\-★]+))?$")


def normalize_card_name(name: str) -> str:
    lowered = name.lower().replace("\u2019", "").replace("'", "")
    words = "".join(
        char if char == "/" or unicodedata.category(char)[0] in "LN" else " " for char in lowered
    )
    return re.sub(r" +", " ", re.sub(r" */+ *", " // ", words)).strip(" ")


def _parse_line(raw: str, role: ImportRole) -> ImportLine | None:
    if _PREFIX.match(raw):
        role = "sideboard"
    match = _CARD.fullmatch(_PREFIX.sub("", raw))
    if match is None:
        return None
    # Avoid Python's decimal digit limit for malformed unbounded quantities.
    number = match[1].lstrip("0") or "0"
    if len(number) > 16:
        return None
    quantity = int(number)
    if not 0 < quantity <= 9007199254740991:
        return None
    line = js_trim(match[2])
    printing = _PRINTING.fullmatch(line)
    name = js_trim(printing[1] if printing else line)
    if not name:
        return None
    return {
        "quantity": quantity,
        "name": name,
        "normalizedName": normalize_card_name(name),
        "setCode": printing[2].lower() if printing else None,
        "collectorNumber": printing[3] if printing else None,
        "role": role,
        "raw": raw,
    }


def parse_arena_decklist(text: str) -> tuple[list[ImportLine], list[UnresolvedLine]]:
    merged: dict[str, ImportLine] = {}
    malformed: list[UnresolvedLine] = []
    role: ImportRole = "main"
    for raw_line in re.split(r"\r?\n", text):
        raw = js_trim(raw_line)
        if not raw or raw.startswith(("#", "//", ";")):
            continue
        if section := _SECTIONS.get(raw.lower()):
            role = section
            continue
        parsed = _parse_line(raw, role)
        if parsed is None:
            malformed.append(
                {"line": {"raw": raw, "role": role}, "reason": "Unrecognized card line"}
            )
            continue
        # Node joins with '|', retaining the first spelling and insertion order.
        key = "|".join(
            [
                parsed["normalizedName"],
                parsed["setCode"] or "",
                parsed["collectorNumber"] or "",
                parsed["role"],
            ]
        )
        if existing := merged.get(key):
            existing["quantity"] = int(float(existing["quantity"]) + float(parsed["quantity"]))
            existing["raw"] += "\n" + raw
        else:
            merged[key] = parsed
    return list(merged.values()), malformed


async def preview_inventory_import(catalog: Catalog, text: str) -> ImportPreview:
    lines, malformed = parse_arena_decklist(text)

    def key(line: ImportLine) -> tuple[str, str, str]:
        return line["normalizedName"], line["setCode"] or "", line["collectorNumber"] or ""

    unique: dict[tuple[str, str, str], ImportLine] = {}
    for line in lines:
        unique.setdefault(key(line), line)
    pending = iter(unique.items())
    candidates_by_key: dict[tuple[str, str, str], list[CardDocument]] = {}

    async def worker() -> None:
        for lookup_key, line in pending:
            candidates_by_key[lookup_key] = await catalog.resolve_catalog_candidates(line)

    tasks = [asyncio.create_task(worker()) for _ in range(min(8, len(unique)))]
    try:
        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    result: ImportPreview = {
        "parsed": lines,
        "resolved": [],
        "unresolved": malformed,
        "ambiguous": [],
        "warnings": [],
    }
    for line in lines:
        candidates = candidates_by_key[key(line)]
        if not candidates:
            result["unresolved"].append({"line": line, "reason": "No exact catalog match"})
        elif len(candidates) > 1:
            result["ambiguous"].append({"line": line, "candidates": candidates})
        else:
            result["resolved"].append({"line": line, "card": candidates[0]})
    return result
