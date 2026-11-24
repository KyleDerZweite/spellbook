"""Account-owned Physical Boxes for Cardstation preview."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict, cast
from unicodedata import category
from uuid import UUID

from psycopg.types.json import Jsonb

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, transaction
from spellbook_core.errors import ActorError, RequestConflictError, ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.cardstation_sort_rule import SortPredicate, parse_sort_predicates


class PhysicalBox(TypedDict):
    id: str
    name: str
    condition: list[SortPredicate] | None


def normalize_box_name(value: object) -> str:
    if isinstance(value, str):
        name = value.strip()
        if 1 <= len(name) <= 64 and not any(
            category(char) in {"Cc", "Cf", "Cs", "Zl", "Zp"} or char in "\ufffe\uffff"
            for char in name
        ):
            return name
    raise ValidationError("Physical Box name must contain 1 to 64 printable characters")


def box_from_row(row: tuple[object, ...]) -> PhysicalBox:
    return {
        "id": str(row[0]),
        "name": cast(str, row[1]),
        "condition": cast(list[SortPredicate] | None, row[2]),
    }


class PhysicalBoxes:
    def __init__(self, pool: ConnectionPool, auth: SessionAuth) -> None:
        self._pool = pool
        self._auth = auth

    @asynccontextmanager
    async def _owner_write(self, actor: Actor) -> AsyncIterator[tuple[Transaction, str]]:
        session = await self._auth.actor_session(actor)
        if session.device is not None:
            raise ActorError()
        account = session.user.account_id
        async with transaction(self._pool) as tx:
            await tx.execute(
                "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (account,)
            )
            trusted = await self._auth.require_actor_for_write(actor, tx)
            if trusted.account_id != account:
                raise ActorError()
            yield tx, account

    async def list(self, actor: Actor) -> list[PhysicalBox]:
        session = await self._auth.actor_session(actor)
        if session.device is not None:
            raise ActorError()
        async with transaction(self._pool, read_only=True) as tx:
            owner = await self._auth.require_actor(actor, tx)
            cursor = await tx.execute(
                "SELECT id, name, condition FROM physical_boxes "
                "WHERE account_id=%s ORDER BY name, id",
                (owner.account_id,),
            )
            return [box_from_row(row) for row in await cursor.fetchall()]

    async def get(self, actor: Actor, box_id: str) -> PhysicalBox | None:
        async with transaction(self._pool, read_only=True) as tx:
            owner = await self._auth.require_actor(actor, tx)
            cursor = await tx.execute(
                "SELECT id, name, condition FROM physical_boxes WHERE id=%s AND account_id=%s",
                (box_id, owner.account_id),
            )
            row = await cursor.fetchone()
            return box_from_row(row) if row is not None else None

    async def create(self, actor: Actor, name: object, request_id: object) -> PhysicalBox:
        name = normalize_box_name(name)
        try:
            if not isinstance(request_id, str) or str(UUID(request_id)) != request_id:
                raise ValueError()
        except ValueError:
            raise ValidationError("requestId must be a canonical UUID") from None
        async with self._owner_write(actor) as (tx, account):
            previous = await tx.execute(
                "SELECT id, creation_name FROM physical_boxes "
                "WHERE account_id=%s AND request_id=%s",
                (account, request_id),
            )
            row = await previous.fetchone()
            if row is not None:
                if row[1] != name:
                    raise RequestConflictError(
                        "requestId has already been used for a different name"
                    )
                return {"id": str(row[0]), "name": name, "condition": None}
            cursor = await tx.execute(
                "INSERT INTO physical_boxes(account_id, request_id, creation_name, name) "
                "VALUES (%s, %s, %s, %s) RETURNING id, name, condition",
                (account, request_id, name, name),
            )
            row = await cursor.fetchone()
            assert row is not None
            return box_from_row(row)

    async def update(
        self, actor: Actor, box_id: str, changes: dict[str, object]
    ) -> PhysicalBox | None:
        if not changes or changes.keys() - {"name", "condition"}:
            raise ValidationError("Supply a name or condition")
        name = normalize_box_name(changes["name"]) if "name" in changes else None
        condition = changes.get("condition")
        stored_condition = (
            Jsonb(parse_sort_predicates(condition)) if condition is not None else None
        )
        async with self._owner_write(actor) as (tx, account):
            cursor = await tx.execute(
                "UPDATE physical_boxes SET name=COALESCE(%s, name), "
                "condition=CASE WHEN %s THEN %s ELSE condition END "
                "WHERE id=%s AND account_id=%s RETURNING id, name, condition",
                (name, "condition" in changes, stored_condition, box_id, account),
            )
            row = await cursor.fetchone()
            return box_from_row(row) if row is not None else None
