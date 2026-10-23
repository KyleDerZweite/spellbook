"""Category-owned JSON boundaries, errors, transactions and account locking."""

import re
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4
from weakref import WeakKeyDictionary

from psycopg import OperationalError
from psycopg.errors import LockNotAvailable, QueryCanceled
from psycopg.rows import dict_row

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, iso_timestamp
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.fingerprint import serialize_json
from spellbook_core.models import Actor
from spellbook_core.validation import js_trim

# PostgreSQL JSONB stores the public, versioned contract documents verbatim.
type Document = dict[str, Any]
UUID_PATTERN = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", re.I)
ROLES = ("main", "sideboard", "commander", "companion")
_combo_enabled: WeakKeyDictionary[object, bool] = WeakKeyDictionary()
_read_only: WeakKeyDictionary[object, bool] = WeakKeyDictionary()


class CategoryUnavailable(Exception):
    kind = "CategoryUnavailable"

    def __init__(self) -> None:
        super().__init__("Category work is temporarily unavailable. Retry the same request.")


class CategoryNotFound(Exception):
    kind = "NotFound"

    def __init__(self) -> None:
        super().__init__("Deck, entry or category not found")


class CategoryConflict(Exception):
    kind = "CategoryConflict"

    def __init__(self, latest: Document):
        self.latest = latest
        super().__init__("Category decision changed. Review the latest saved decision.")


class LibraryConflict(Exception):
    kind = "RequestConflict"

    def __init__(self) -> None:
        super().__init__("Category Library changed. Read the latest Library and retry.")


class CategoryPreviewCapacity(Exception):
    kind = "CategoryPreviewCapacity"

    def __init__(self) -> None:
        super().__init__(
            "Four Category previews are already open. Retry after one expires or is committed."
        )


class CategoryPreviewExpired(Exception):
    kind = "CategoryPreviewExpired"

    def __init__(self) -> None:
        super().__init__("This preview expired. Request a new preview before committing.")


class CategoryMergeConflict(Exception):
    kind = "CategoryMergeConflict"

    def __init__(self, preview: Document):
        self.preview = preview
        super().__init__("Review the destination category and resulting quantity before merging.")


def new_id() -> str:
    return str(uuid4())


def uuid(value: object) -> str:
    if not isinstance(value, str) or not UUID_PATTERN.fullmatch(value):
        raise ValidationError("Invalid category UUID")
    return value.lower()


def name(value: object) -> str:
    if not isinstance(value, str):
        raise ValidationError("Category name is required")
    result = unicodedata.normalize("NFC", js_trim(value))
    if not 1 <= utf16_length(result) <= 128:
        raise ValidationError("Category name must contain 1 to 128 characters")
    return result


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def normalized_name(value: str) -> str:
    return unicodedata.normalize("NFC", value).lower()


def revision(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"0|[1-9][0-9]*", value):
        raise ValidationError("Category revision is required")
    return value


def strict(value: object, allowed: list[str]) -> Document:
    if not isinstance(value, dict) or any(k not in allowed for k in value):
        raise ValidationError("Invalid category request fields")
    return value


def integer(value: object, lower: int, upper: int, message: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not lower <= value <= upper
        or int(value) != value
    ):
        raise ValidationError(message)
    return int(value)


def page_values(value: Document, label: str) -> tuple[int, int]:
    return (
        integer(
            0 if value.get("offset") is None else value["offset"],
            0,
            9007199254740991,
            f"Invalid {label} page",
        ),
        integer(
            50 if value.get("limit") is None else value["limit"], 1, 100, f"Invalid {label} page"
        ),
    )


def timestamp(value: Any) -> str | None:
    if value is None:
        return None
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    return iso_timestamp(dt)


def now() -> str:
    return iso_timestamp(datetime.now(UTC))


async def rows(tx: Transaction, sql: str, params: tuple[object, ...] = ()) -> list[Document]:
    async with tx.cursor(row_factory=dict_row) as cursor:
        await cursor.execute(sql, params)
        return list(await cursor.fetchall())


async def first(tx: Transaction, sql: str, params: tuple[object, ...] = ()) -> Document:
    found = await rows(tx, sql, params)
    return found[0] if found else {}


def configure_combo_adapter(owner: object, enabled: bool) -> None:
    _combo_enabled[owner] = enabled


def combo_enabled(owner: object) -> bool:
    return _combo_enabled.get(owner, False)


def transaction_read_only(tx: Transaction) -> bool:
    return _read_only.get(tx, False)


@asynccontextmanager
async def category_transaction(
    pool: ConnectionPool, *, read_only: bool = False, repeatable_read: bool = False
) -> AsyncIterator[Transaction]:
    """Caller-owned pool; ordinary long jobs may finish without a fixed wall-time gate."""
    try:
        async with pool.connection(timeout=2.0) as tx, tx.transaction():
            if repeatable_read:
                await tx.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            if read_only:
                await tx.execute("SET TRANSACTION READ ONLY")
            await tx.execute("SET LOCAL lock_timeout = '2000ms'")
            configure_combo_adapter(tx, combo_enabled(pool))
            _read_only[tx] = read_only
            try:
                yield tx
            finally:
                _read_only.pop(tx, None)
                _combo_enabled.pop(tx, None)
    except (OperationalError, QueryCanceled, LockNotAvailable, TimeoutError) as cause:
        raise CategoryUnavailable() from cause


async def lock_account(tx: Transaction, auth: SessionAuth, actor: Actor) -> str:
    trusted = await auth.require_actor(actor, tx)
    account = trusted.account_id
    await tx.execute(
        "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE", (account,)
    )
    await auth.require_actor_for_write(actor, tx)
    return account


async def owned(tx: Transaction, account: str, deck_id: str, *, lock: bool = False) -> str:
    row = await first(
        tx,
        "SELECT composition_revision::text FROM decks "
        "WHERE id=%s::uuid AND account_id=%s AND game='mtg'" + (" FOR UPDATE" if lock else ""),
        (deck_id, account),
    )
    if not row:
        raise CategoryNotFound()
    return str(row["composition_revision"])


async def receipt(
    tx: Transaction, account: str, request_id: str, fingerprint: str
) -> Document | None:
    row = await first(
        tx,
        "SELECT request_hash,acknowledgement FROM category_mutation_requests "
        "WHERE account_id=%s AND request_id=%s::uuid",
        (account, request_id),
    )
    if not row:
        return None
    if row["request_hash"] != fingerprint:
        raise RequestConflictError()
    return row["acknowledgement"]  # type: ignore[no-any-return]


async def store_receipt(
    tx: Transaction, account: str, request_id: str, fingerprint: str, acknowledgement: Document
) -> None:
    await tx.execute(
        "INSERT INTO "
        "category_mutation_requests(account_id,request_id,request_hash,acknowledgement)"
        " "
        "VALUES(%s,%s::uuid,%s,%s::jsonb)",
        (account, request_id, fingerprint, serialize_json(acknowledgement)),
    )


async def publish_category_change(tx: Transaction, account: str) -> None:
    await tx.execute(
        "SELECT pg_notify('spellbook_saved_state',"
        "json_build_object('accountId',%s::text,'topic','decks')::text)",
        (account,),
    )


async def advance_deck_library_revision(tx: Transaction, account: str) -> None:
    await tx.execute(
        "INSERT INTO deck_library_state(account_id,revision) VALUES(%s,1) "
        "ON CONFLICT(account_id) DO UPDATE SET revision=deck_library_state.revision+1",
        (account,),
    )
