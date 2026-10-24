"""Explicit MTG Profile card and Inventory metric projection for the shared account DTO."""

import re
from typing import cast

from spellbook_core.db import ConnectionPool, database_integer, transaction
from spellbook_core.errors import DatabaseIntegerRangeError, ProfileError
from spellbook_core.validation import js_trim, utf16_length

SUMMARY_RANGE_MESSAGE = "Your collection totals exceed the supported reporting range."
CARD_LIMITS = {
    "name": 40,
    "manaCost": 80,
    "typeLine": 60,
    "rulesText": 400,
    "flavorText": 120,
    "power": 24,
    "toughness": 24,
}
KPIS = {
    "total_owned_cards",
    "unique_card_names",
    "owned_printings",
    "owned_sets",
    "foil_copies",
    "total_decks",
}
MANA_SYMBOLS = {
    *(str(i) for i in range(21)),
    "W",
    "U",
    "B",
    "R",
    "G",
    "C",
    "X",
    "Y",
    "Z",
    "S",
    "W/U",
    "W/B",
    "U/B",
    "U/R",
    "B/R",
    "B/G",
    "R/G",
    "R/W",
    "G/W",
    "G/U",
    "2/W",
    "2/U",
    "2/B",
    "2/R",
    "2/G",
    "W/P",
    "U/P",
    "B/P",
    "R/P",
    "G/P",
    "100",
    "1000000",
    "C/W",
    "C/U",
    "C/B",
    "C/R",
    "C/G",
    "W/U/P",
    "W/B/P",
    "U/B/P",
    "U/R/P",
    "B/R/P",
    "B/G/P",
    "R/G/P",
    "R/W/P",
    "G/W/P",
    "G/U/P",
}


class SummaryRangeError(Exception):
    kind = "SummaryOutOfRange"

    def __init__(self) -> None:
        super().__init__(SUMMARY_RANGE_MESSAGE)


def default_profile_card(username: str) -> dict[str, object]:
    return {
        "template": "mtg",
        "name": username,
        "frame": "green",
        "legendary": True,
        "rarity": "rare",
        "manaCost": "{2}{G}",
        "typeLine": "Legendary Creature · Collector",
        "rulesText": (
            "I own {total_owned_cards} cards across {unique_card_names} card names.\n"
            "My collection spans {owned_sets} sets."
        ),
        "flavorText": "",
        "power": "",
        "toughness": "",
    }


def _template_error(value: str, allow_mana: bool) -> str | None:
    error = None
    for match in re.finditer(r"\{([^{}]+)\}", value):
        key = match[1]
        if key not in KPIS and not (allow_mana and key in MANA_SYMBOLS | {"T", "Q", "E"}):
            error = error or f"Unknown placeholder {match[0]}. Choose a value from Insert KPI."
    rest = re.sub(r"\{([^{}]+)\}", "", value)
    return error or (
        "Close each placeholder with braces, for example {total_owned_cards}."
        if re.search(r"[{}]", rest)
        else None
    )


def validate_profile_card(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ProfileError(
            "Check the card fields and try again.", {"form": "Choose a valid card design."}
        )
    fields = cast(dict[str, object], value)
    errors: dict[str, str] = {}
    if fields.keys() - {"template", "frame", "legendary", "rarity", *CARD_LIMITS}:
        errors["form"] = "The card contains unsupported fields."
    if fields.get("template") != "mtg":
        errors["template"] = "Magic is the available card template."
    if fields.get("frame") not in ("white", "blue", "black", "red", "green", "gold", "colorless"):
        errors["frame"] = "Choose a frame color."
    if not isinstance(fields.get("legendary"), bool):
        errors["legendary"] = "Choose a standard or legendary frame."
    if fields.get("rarity") not in ("common", "uncommon", "rare", "mythic"):
        errors["rarity"] = "Choose a rarity."
    text: dict[str, str] = {}
    for field, limit in CARD_LIMITS.items():
        original = fields.get(field)
        if not isinstance(original, str):
            errors[field] = "Enter text for this field."
            continue
        normalized = js_trim(re.sub(r"\r\n?", "\n", original))
        text[field] = normalized
        if utf16_length(normalized) > limit:
            errors[field] = f"Use at most {limit} characters."
        if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", original):
            errors[field] = "Remove control characters."
        if field not in {"rulesText", "flavorText"} and "\n" in normalized:
            errors[field] = "Use one line for this field."
    for field, limit in (("rulesText", 8), ("flavorText", 3)):
        if text.get(field) and len(text[field].split("\n")) > limit:
            errors[field] = f"Use at most {limit} lines."
    for field, label in (("name", "card name"), ("typeLine", "type line")):
        if field in text and not text[field]:
            errors[field] = f"Enter a {label}."
    if "manaCost" in text:
        cost = text["manaCost"]
        symbols = list(re.finditer(r"\{([^{}]+)\}", cost))
        if (
            len(symbols) > 8
            or "".join(m[0] for m in symbols) != cost
            or any(m[1] not in MANA_SYMBOLS for m in symbols)
        ):
            errors["manaCost"] = "Use up to 8 mana symbols in braces, for example {2}{U}."
    for field in ("rulesText", "flavorText", "power", "toughness"):
        if field in text and (
            error := _template_error(text[field], field in {"rulesText", "flavorText"})
        ):
            errors.setdefault(field, error)
    for field in ("power", "toughness"):
        power = text.get(field)
        if (
            power
            and not re.fullmatch(
                r"(?:-?[0-9]{1,7}|[*XYZ](?:[+-][0-9]{1,2})?|[0-9]{1,2}[+-][*XYZ])", power
            )
            and power not in {"{" + key + "}" for key in KPIS}
        ):
            errors.setdefault(
                field,
                "Use a number, *, X, a simple card value such as 1+*, or one KPI placeholder.",
            )
    if "power" in text and "toughness" in text and bool(text["power"]) != bool(text["toughness"]):
        errors["toughness" if text["power"] else "power"] = (
            "Fill both Power and Toughness, or leave both empty."
        )
    if errors:
        raise ProfileError("Check the card fields and try again.", errors)
    return {
        "template": "mtg",
        "frame": fields["frame"],
        "legendary": fields["legendary"],
        "rarity": fields["rarity"],
        **text,
    }


def profile_card(value: object, username: str, demo_mode: bool) -> dict[str, object]:
    try:
        return validate_profile_card(value)
    except ProfileError:
        card = default_profile_card(username)
        if demo_mode and username == "demo":
            card.update(
                name="Demo, Collection Keeper",
                rulesText=(
                    "Your inventory holds {total_owned_cards} copies.\n"
                    "{unique_card_names} card names. {total_decks} decks."
                ),
                flavorText="Every deck starts with a card worth keeping.",
            )
        return card


async def profile_totals(pool: ConnectionPool, account_id: str) -> dict[str, int]:
    async with transaction(pool, read_only=True) as tx:
        cursor = await tx.execute(
            "SELECT coalesce(sum(quantity::numeric),0)::text, "
            "count(distinct canonical_card_id)::text, "
            "count(distinct catalog_card_id)::text, count(distinct set_code)::text, "
            "coalesce(sum(quantity::numeric) FILTER(WHERE finish='foil'),0)::text, "
            "(SELECT count(*) FROM decks WHERE account_id=%s AND game='mtg')::text "
            "FROM inventory_cards WHERE account_id=%s AND game='mtg'",
            (account_id, account_id),
        )
        row = await cursor.fetchone()
    assert row is not None
    try:
        totals = {
            key: database_integer(value)
            for key, value in zip(
                ("total", "names", "printings", "sets", "foils", "decks"), row, strict=True
            )
        }
    except DatabaseIntegerRangeError:
        raise SummaryRangeError() from None
    if any(number < 0 for number in totals.values()):
        raise SummaryRangeError()
    return totals
