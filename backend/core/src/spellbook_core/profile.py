"""Shared account preferences with the explicit MTG card/metrics projection."""

import re
from typing import TypedDict

from psycopg import sql
from psycopg.types.json import Jsonb

from .auth import ARTWORK_IDS, SessionAuth
from .db import ConnectionPool, transaction
from .errors import ProfileError
from .models import Actor, AuthUser
from .mtg.profile import SummaryRangeError, profile_card, profile_totals, validate_profile_card
from .validation import js_trim, utf16_length

AVATAR_IDS = ("wizard", "knight", "ranger", "rogue", "dragon", "slime")


class ProfileSettings(TypedDict):
    user: AuthUser
    card: dict[str, object]
    totals: dict[str, int] | None
    statsError: str | None


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

    async def get(self, actor: Actor) -> ProfileSettings:
        user = await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True) as tx:
            cursor = await tx.execute(
                "SELECT profile_card FROM user_profiles WHERE account_id=%s", (user.account_id,)
            )
            row = await cursor.fetchone()
        card = profile_card(row[0] if row else None, user.username, self._demo_mode)
        try:
            totals = await profile_totals(self._pool, user.account_id)
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
                current = profile_card(row[0] if row else None, user.username, self._demo_mode)
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
