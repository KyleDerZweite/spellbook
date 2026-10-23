"""Account-scoped preferences, validated profile cards and exact collection totals."""

import re
from typing import TypedDict, cast

from psycopg import sql
from psycopg.types.json import Jsonb

from .auth import ARTWORK_IDS, SessionAuth
from .db import ConnectionPool, database_integer, transaction
from .errors import DatabaseIntegerRangeError
from .models import Actor, AuthUser
from .validation import js_trim, utf16_length

AVATAR_IDS = ("wizard", "knight", "ranger", "rogue", "dragon", "slime")
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


class ProfileSettings(TypedDict):
    user: AuthUser
    card: dict[str, object]
    totals: dict[str, int] | None
    statsError: str | None


class ProfileError(Exception):
    kind = "ValidationFailed"

    def __init__(self, message: str, fields: dict[str, str]):
        self.fields = fields
        super().__init__(message)


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


def normalize_contact_email(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    email = js_trim(value)
    if utf16_length(email) <= 254 and (
        email == ""
        or re.fullmatch(
            r"[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+",
            email,
            re.IGNORECASE | re.ASCII,
        )
    ):
        return email
    return None


class Profile:
    def __init__(self, pool: ConnectionPool, auth: SessionAuth, demo_mode: bool = False):
        self._pool = pool
        self._auth = auth
        self._demo_mode = demo_mode

    def _card_for(self, value: object, username: str) -> dict[str, object]:
        try:
            return validate_profile_card(value)
        except ProfileError:
            card = default_profile_card(username)
            if self._demo_mode and username == "demo":
                card.update(
                    name="Demo, Collection Keeper",
                    rulesText=(
                        "Your inventory holds {total_owned_cards} copies.\n"
                        "{unique_card_names} card names. {total_decks} decks."
                    ),
                    flavorText="Every deck starts with a card worth keeping.",
                )
            return card

    async def _totals(self, account_id: str) -> dict[str, int]:
        async with transaction(self._pool, read_only=True) as tx:
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

    async def get(self, actor: Actor) -> ProfileSettings:
        user = await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                "SELECT profile_card FROM user_profiles WHERE account_id=%s", (user.account_id,)
            )
            row = await cursor.fetchone()
        card = self._card_for(row[0] if row else None, user.username)
        try:
            totals = await self._totals(user.account_id)
            return {"user": user.to_dto(), "card": card, "totals": totals, "statsError": None}
        except Exception as cause:
            return {
                "user": user.to_dto(),
                "card": card,
                "totals": None,
                "statsError": str(cause)
                if isinstance(cause, SummaryRangeError)
                else "Your collection totals are temporarily unavailable.",
            }

    async def patch(self, actor: Actor, value: object) -> ProfileSettings:
        user = await self._auth.require_actor(actor)
        if not isinstance(value, dict) or value.keys() - {
            "email",
            "avatarId",
            "artworkId",
            "profileCard",
        }:
            raise ProfileError(
                "Choose the preference to save.", {"form": "Unknown profile field."}
            )
        fields: dict[str, str] = {}
        update: dict[str, object] = {}
        if "email" in value:
            email = normalize_contact_email(value["email"])
            if email is None:
                fields["email"] = "Enter a valid email address, or leave it empty."
            else:
                update["email"] = email
        if "avatarId" in value:
            if value["avatarId"] not in AVATAR_IDS:
                fields["avatarId"] = "Choose an avatar from the collection."
            else:
                update["avatar_id"] = value["avatarId"]
        if "artworkId" in value:
            if value["artworkId"] not in ARTWORK_IDS:
                fields["artworkId"] = "Choose artwork from the collection."
            else:
                update["artwork_id"] = value["artworkId"]
        if fields:
            raise ProfileError("Check the profile fields and try again.", fields)
        if not value:
            return await self.get(actor)
        async with transaction(self._pool) as tx:
            cursor = await tx.execute(
                "SELECT profile_card FROM user_profiles WHERE account_id=%s FOR UPDATE",
                (user.account_id,),
            )
            row = await cursor.fetchone()
            await self._auth.require_actor(actor, tx)
            if "profileCard" in value:
                current = self._card_for(row[0] if row else None, user.username)
                patch = value["profileCard"]
                if not isinstance(patch, dict) or patch.keys() - current.keys():
                    raise ProfileError(
                        "Check the card fields and try again.", {"form": "Unknown card field."}
                    )
                if patch:
                    update["profile_card"] = Jsonb(validate_profile_card({**current, **patch}))
            if update:
                # Columns are exclusively the fixed validated mapping above.
                await tx.execute(
                    sql.SQL("UPDATE user_profiles SET {} WHERE account_id=%s").format(
                        sql.SQL(",").join(
                            sql.SQL("{}=%s").format(sql.Identifier(key)) for key in update
                        )
                    ),
                    (*update.values(), user.account_id),
                )
        return await self.get(actor)


def create_profile(pool: ConnectionPool, auth: SessionAuth, demo_mode: bool = False) -> Profile:
    return Profile(pool, auth, demo_mode)
