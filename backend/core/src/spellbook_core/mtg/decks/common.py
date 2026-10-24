"""Deck validation, SQL projections and account write authority."""

from typing import cast

from psycopg.rows import dict_row

from spellbook_core.auth import SessionAuth
from spellbook_core.db import Transaction, database_integer, iso_timestamp
from spellbook_core.errors import (
    ActorError,
    DatabaseIntegerRangeError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.models import Actor
from spellbook_core.mtg.decks.models import (
    CardIdentity,
    Deck,
    DeckAcknowledgement,
    DeckCard,
    Document,
)
from spellbook_core.mtg.errors import DeckNotFoundError
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import (
    MISSING,
    assert_deck_role,
    assert_uuid,
    js_trim,
    normalize_quantity,
    utf16_length,
)


def read_acknowledgement(
    value: object, request_id: str, deck_id: str | None = None
) -> DeckAcknowledgement:
    """Check the stored current receipt before returning the unchanged original."""
    if (
        not isinstance(value, dict)
        or value.get("requestId") != request_id
        or not isinstance(value.get("deckId"), str)
        or (deck_id is not None and value["deckId"] != deck_id)
        or not isinstance(value.get("revision"), str)
    ):
        raise RequestConflictError()
    changes, removed = value.get("changes"), value.get("removedEntryIds")
    if (
        not isinstance(changes, list)
        or not isinstance(removed, list)
        or not all(isinstance(identifier, str) for identifier in removed)
    ):
        raise RequestConflictError()
    for change in changes:
        if (
            not isinstance(change, dict)
            or not all(
                isinstance(change.get(key), str) for key in ("entryId", "catalogCardId", "role")
            )
            or type(change.get("quantity")) is not int
            or type(change.get("delta")) is not int
        ):
            raise RequestConflictError()
    if "categoryDecisionRevision" in value and not isinstance(
        value["categoryDecisionRevision"], str
    ):
        raise RequestConflictError()
    if "categoryEntryIds" in value and (
        not isinstance(value["categoryEntryIds"], list)
        or not all(isinstance(identifier, str) for identifier in value["categoryEntryIds"])
    ):
        raise RequestConflictError()
    return cast(DeckAcknowledgement, value)


async def rows(tx: Transaction, sql: str, params: tuple[object, ...] = ()) -> list[Document]:
    async with tx.cursor(row_factory=dict_row) as cursor:
        await cursor.execute(sql, params)
        return list(await cursor.fetchall())


async def first(tx: Transaction, sql: str, params: tuple[object, ...] = ()) -> Document:
    found = await rows(tx, sql, params)
    return found[0] if found else {}


async def authorize_write(tx: Transaction, auth: SessionAuth, actor: Actor) -> str:
    account = actor.account_id
    await tx.execute(
        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (account,)
    )
    trusted = await auth.require_actor_for_write(actor, tx)
    if trusted.account_id != account:
        raise ActorError()
    return account


async def require_deck(
    tx: Transaction, account: str, deck_id: str, *, lock: bool = False
) -> Document:
    row = await first(
        tx,
        "SELECT * FROM decks WHERE id=%s::uuid AND account_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (deck_id, account),
    )
    if not row:
        raise DeckNotFoundError()
    return row


async def read_cards(tx: Transaction, account: str, deck_id: str) -> list[DeckCard]:
    await require_deck(tx, account, deck_id)
    return [
        card_dto(row)
        for row in await rows(
            tx,
            (
                "SELECT * FROM deck_cards WHERE deck_id=%s::uuid AND "
                "account_id=%s ORDER BY role,name"
            ),
            (deck_id, account),
        )
    ]


def deck_dto(row: Document) -> Deck:
    return Deck(
        id=str(row["id"]),
        accountId=row["account_id"],
        game=row["game"],
        name=row["name"],
        description=row["description"],
        format=row["format"],
        descriptionRevision=str(row["description_revision"]),
        compositionRevision=str(row["composition_revision"]),
        createdAt=iso_timestamp(row["created_at"]),
        updatedAt=iso_timestamp(row["updated_at"]),
    )


def card_dto(row: Document) -> DeckCard:
    return DeckCard(
        id=str(row["id"]),
        deckId=str(row["deck_id"]),
        accountId=row["account_id"],
        game=row["game"],
        catalogCardId=row["catalog_card_id"],
        canonicalCardId=row["canonical_card_id"],
        name=row["name"],
        setCode=row["set_code"],
        imageUri=row["image_uri"],
        quantity=row["quantity"],
        role=row["role"],
        createdAt=iso_timestamp(row["created_at"]),
        updatedAt=iso_timestamp(row["updated_at"]),
    )


def card_identity(card: CardDocument) -> CardIdentity:
    return CardIdentity(
        catalogCardId=card["id"],
        canonicalCardId=card["oracle_id"],
        name=card["name"],
        setCode=card["set_code"],
        imageUri=card["image_uri"],
    )


def text(value: object, label: str, maximum: int, fallback: str | None = None) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be a string")
    result = js_trim(value)
    if utf16_length(result) > maximum or (not result and fallback is None):
        raise ValidationError(f"Invalid {label}")
    return result or fallback or ""


def game(value: object) -> None:
    if value != "mtg":
        raise ValidationError("Only MTG is supported")


def aggregate_quantity(value: object) -> int:
    result = database_integer(value)
    if result < 0:
        raise DatabaseIntegerRangeError()
    return result


def _string(value: object, label: str) -> str:
    if value is MISSING:
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be a string")
    return js_trim(value)


def normalize_operations(value: object) -> list[Document]:
    if not isinstance(value, list) or not value:
        raise ValidationError("operations must contain at least one operation")
    result: list[Document] = []
    for raw in value:
        if not isinstance(raw, dict):
            raise ValidationError("Invalid operation: expected object")
        op = raw.get("op", "")
        if not isinstance(op, str):
            raise ValidationError("op must be a string")
        if op not in ("add", "set", "remove", "decrement", "increment", "move", "replace"):
            raise ValidationError(f"Invalid operation: {op}")
        if op == "add":
            identity = raw.get("card")
            if not isinstance(identity, dict):
                raise ValidationError(
                    "card.catalogCardId, card.canonicalCardId, and card.name are required"
                )
            card = {
                k: _string(identity.get(k, MISSING), "card." + k)
                for k in CardIdentity.__annotations__
            }
            if any(not card[k] for k in ("catalogCardId", "canonicalCardId", "name")):
                raise ValidationError(
                    "card.catalogCardId, card.canonicalCardId, and card.name are required"
                )
            quantity = normalize_quantity(raw.get("quantity"))
            if quantity <= 0:
                raise ValidationError("Quantity must be greater than 0")
            result.append(
                dict(
                    op=op,
                    card=card,
                    quantity=quantity,
                    role=assert_deck_role("main" if raw.get("role") is None else raw["role"]),
                )
            )
            continue
        target = raw.get("target")
        entry = _string(
            target.get("entryId", MISSING) if isinstance(target, dict) else MISSING,
            "target.entryId",
        )
        assert_uuid(entry, "target.entryId")
        normalized: Document = dict(op=op, target=dict(entryId=entry))
        if op in ("move", "replace"):
            normalized["role"] = assert_deck_role(raw.get("role", MISSING))
            preview = raw.get("categoryPreview", MISSING)
            if preview is not MISSING:
                if not isinstance(preview, str) or utf16_length(preview) > 12000:
                    raise ValidationError("Invalid category preview")
                normalized["categoryPreview"] = preview
        if op == "replace":
            normalized["catalogCardId"] = text(raw.get("catalogCardId"), "catalogCardId", 100)
        if op not in ("remove", "move"):
            quantity = normalize_quantity(raw.get("quantity"))
            if op in ("decrement", "increment", "replace") and quantity <= 0:
                raise ValidationError("Quantity must be greater than 0")
            normalized["quantity"] = quantity
        result.append(normalized)
    return result
