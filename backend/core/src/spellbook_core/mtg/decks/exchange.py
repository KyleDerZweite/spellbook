"""Bounded portable Deck formats. Catalog and command owners retain all authority."""

import asyncio
import csv
import io
import json
from collections.abc import Sequence
from typing import Literal, TypedDict, cast

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks.models import DeckCard, Document
from spellbook_core.mtg.decks.rules import format_arena_decklist
from spellbook_core.mtg.errors import CatalogPrintingNotFoundError
from spellbook_core.mtg.inventory_import import (
    ImportLine,
    ImportPreview,
    normalize_card_name,
    preview_inventory_import,
)
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import DECK_ROLES, assert_uuid, js_trim, utf16_length

CSV_COLUMNS = ["name", "format", "description", "catalogCardId", "quantity", "role"]
MAX_RECORDS = 1000


class DeckMetadata(TypedDict):
    name: str
    format: str
    description: str


class DeckImportPreview(ImportPreview):
    metadata: DeckMetadata | None


def bounded_text(value: object) -> str:
    if not isinstance(value, str) or not js_trim(value) or utf16_length(value) > 100000:
        raise ValidationError("Paste or upload a decklist of up to 100,000 characters.")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise ValidationError("Decklist must contain valid Unicode text") from None
    if "\x00" in value:
        raise ValidationError("Decklist must not contain NUL characters")
    return value.lstrip("\ufeff")


def metadata(value: Document) -> DeckMetadata:
    result: Document = {}
    for key, maximum in (("name", 200), ("format", 100), ("description", 4000)):
        item = value.get(key)
        if not isinstance(item, str) or utf16_length(item) > maximum or "\x00" in item:
            raise ValidationError(f"Invalid Deck {key}")
        if key != "description" and not js_trim(item):
            raise ValidationError(f"Deck {key} is required")
        result[key] = item
    return cast(DeckMetadata, result)


def _record(value: object) -> ImportLine:
    if not isinstance(value, dict) or set(value) != {"catalogCardId", "quantity", "role"}:
        raise ValidationError("Each card requires only catalogCardId, quantity and role")
    printing = assert_uuid(value["catalogCardId"], "catalogCardId")
    quantity = value["quantity"]
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 10000:
        raise ValidationError("Card quantity must be an integer between 1 and 10000")
    role = value["role"]
    if not isinstance(role, str) or role not in DECK_ROLES:
        raise ValidationError("Unsupported Deck role")
    return cast(
        ImportLine,
        dict(
            catalogCardId=printing,
            quantity=quantity,
            name=printing,
            normalizedName=printing,
            setCode=None,
            collectorNumber=None,
            role=role,
            raw=json.dumps(value, ensure_ascii=False),
        ),
    )


def _unique_object(pairs: list[tuple[str, object]]) -> Document:
    result: Document = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def _json(value: str) -> tuple[DeckMetadata, list[object]]:
    try:
        payload = json.loads(value, object_pairs_hook=_unique_object)
        # Escaped lone surrogates cannot reach UTF-8 HTTP responses or PostgreSQL.
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
    except ValueError, RecursionError:
        raise ValidationError("Malformed Spellbook Deck JSON") from None
    if not isinstance(payload, dict) or set(payload) != {
        "schema",
        "version",
        "name",
        "format",
        "description",
        "cards",
    }:
        raise ValidationError("Expected a Spellbook Deck JSON object with only portable fields")
    if (
        payload["schema"] != "spellbook.deck"
        or type(payload["version"]) is not int
        or payload["version"] != 1
    ):
        raise ValidationError("Unsupported Spellbook Deck schema or version. Expected version 1.")
    cards = payload["cards"]
    if not isinstance(cards, list):
        raise ValidationError("Deck cards must be an array")
    return metadata(payload), cards


def _csv(value: str) -> tuple[DeckMetadata, list[object]]:
    reader = csv.reader(io.StringIO(value, newline=""), strict=True)
    try:
        if next(reader, []) != CSV_COLUMNS:
            raise ValidationError(
                "CSV header must be name,format,description,catalogCardId,quantity,role"
            )
        deck: DeckMetadata | None = None
        cards: list[object] = []
        empty_rows = 0
        for row in reader:
            if len(row) != len(CSV_COLUMNS):
                raise ValidationError(
                    f"CSV record ending at line {reader.line_num} must have six fields"
                )
            fields = dict(zip(CSV_COLUMNS, row, strict=True))
            if deck is None or any(row[:3]):
                current = metadata(fields)
                if deck is not None and current != deck:
                    raise ValidationError("Repeated CSV Deck metadata must match the first record")
                deck = current
            if not any(row[3:]):
                empty_rows += 1
                continue
            quantity = fields["quantity"]
            cards.append(
                dict(
                    catalogCardId=fields["catalogCardId"],
                    quantity=int(quantity)
                    if quantity.isascii() and quantity.isdecimal() and len(quantity) <= 5
                    else quantity,
                    role=fields["role"],
                )
            )
            if len(cards) > MAX_RECORDS:
                raise ValidationError("Deck exchange supports at most 1000 card records")
        if deck is None or empty_rows > 1 or (cards and empty_rows):
            raise ValidationError(
                "CSV requires card records or one metadata-only record for an empty Deck"
            )
        return deck, cards
    except csv.Error:
        raise ValidationError(f"Malformed CSV near line {reader.line_num}") from None


def _arena(value: str) -> tuple[str, DeckMetadata | None]:
    lines: list[str] = []
    name: str | None = None
    about = False
    for raw in value.splitlines():
        line = js_trim(raw)
        if line == "About":
            about = True
            continue
        if about and line.startswith("Name "):
            if name is not None:
                raise ValidationError("Arena About contains more than one Name")
            name = js_trim(line[5:])
            if not name or utf16_length(name) > 200:
                raise ValidationError("Invalid Arena Deck name")
            continue
        if line.lower() in ("deck", "commander", "sideboard", "companion"):
            about = False
        lines.append(raw)
    return "\n".join(lines), DeckMetadata(name=name, format="", description="") if name else None


async def preview_deck_import(catalog: Catalog, value: str) -> DeckImportPreview:
    value = bounded_text(value)
    stripped = value.lstrip()
    if not stripped.startswith(("{", "[", "name,", '"name"')):
        text, deck = _arena(value)
        # Check before Catalog work, including duplicate input lines.
        headers = {
            "deck",
            "main",
            "mainboard",
            "maindeck",
            "sideboard",
            "commander",
            "companion",
            "maybeboard",
        }
        records_count = sum(
            bool(line.strip())
            and line.strip().lower() not in headers
            and not line.strip().startswith(("#", "//", ";"))
            for line in text.splitlines()
        )
        if records_count > MAX_RECORDS:
            raise ValidationError("Deck exchange supports at most 1000 card records")
        text_result = await preview_inventory_import(catalog, text)
        for line in text_result["parsed"]:
            if line["role"] not in DECK_ROLES or not 1 <= line["quantity"] <= 10000:
                text_result["unresolved"].append(
                    dict(line=line, reason="Unsupported role or quantity")
                )
        return DeckImportPreview(**text_result, metadata=deck)

    deck, records = _json(stripped) if stripped.startswith(("{", "[")) else _csv(stripped)
    if len(records) > MAX_RECORDS:
        raise ValidationError("Deck exchange supports at most 1000 card records")
    result: DeckImportPreview = dict(
        parsed=[], resolved=[], unresolved=[], ambiguous=[], warnings=[], metadata=deck
    )
    for index, raw in enumerate(records):
        try:
            result["parsed"].append(_record(raw))
        except ValidationError as failure:
            result["unresolved"].append(
                dict(
                    line=dict(
                        raw=f"Record {index + 1}: {json.dumps(raw, ensure_ascii=False)}",
                        role="main",
                    ),
                    reason=str(failure),
                )
            )
    unique = iter({cast(Document, line)["catalogCardId"] for line in result["parsed"]})
    documents: dict[str, CardDocument | None] = {}

    async def worker() -> None:
        for identifier in unique:
            try:
                documents[identifier] = await catalog.get_catalog_printing(identifier)
            except CatalogPrintingNotFoundError:
                documents[identifier] = None

    tasks = [asyncio.create_task(worker()) for _ in range(min(8, len(result["parsed"])))]
    try:
        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    totals: dict[tuple[str, str], int] = {}
    for line in result["parsed"]:
        identifier = cast(Document, line)["catalogCardId"]
        key = identifier, line["role"]
        totals[key] = totals.get(key, 0) + line["quantity"]
        if totals[key] > 10000:
            result["unresolved"].append(
                dict(line=line, reason="Combined printing/role quantity exceeds 10000")
            )
        card = documents[identifier]
        if card is None or card["id"].lower() != identifier:
            result["unresolved"].append(
                dict(line=line, reason="Exact printing unavailable in current Catalog")
            )
        else:
            line["name"] = card["name"]
            line["normalizedName"] = normalize_card_name(card["name"])
            result["resolved"].append(dict(line=line, card=card))
    return result


def export_deck(
    deck: Document,
    cards: Sequence[DeckCard],
    documents: dict[str, CardDocument],
    format: Literal["arena", "simple", "csv", "json"],
) -> str:
    if len(cards) > MAX_RECORDS:
        raise ValidationError("Deck exchange supports at most 1000 card records")
    portable = metadata(deck)
    records: list[Document] = [
        dict(catalogCardId=c["catalogCardId"], quantity=c["quantity"], role=c["role"])
        for c in cards
    ]
    # Reject unsupported persisted records instead of omitting them from any export.
    for record in records:
        _record(record)
    if format == "json":
        result = (
            json.dumps(
                dict(schema="spellbook.deck", version=1, **portable, cards=records),
                ensure_ascii=False,
                indent=2,
            )
            + "\n"
        )
    elif format == "csv":
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, lineterminator="\r\n")
        writer.writerow(CSV_COLUMNS)
        for index, record in enumerate(records or [dict(catalogCardId="", quantity="", role="")]):
            writer.writerow(
                [
                    portable["name"] if index == 0 else "",
                    portable["format"] if index == 0 else "",
                    portable["description"] if index == 0 else "",
                    record["catalogCardId"],
                    record["quantity"],
                    record["role"],
                ]
            )
        result = stream.getvalue()
    elif format == "simple":
        result = "\n".join(f"{c['quantity']} {c['name']}" for c in cards) + "\n"
    else:
        result = (
            "About\nName "
            + " ".join(portable["name"].split())
            + "\n\n"
            + format_arena_decklist(cards, documents)
        )
    if utf16_length(result) > 100000:
        raise ValidationError("Deck export exceeds the 100,000 character import limit")
    return result
