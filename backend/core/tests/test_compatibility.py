"""Python transfer of neutral Golden shared compatibility cases."""

import asyncio
import copy
import json
import math
from collections.abc import Callable
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from spellbook_core.auth import create_session_auth, hash_session_token, valid_session_token
from spellbook_core.catalog import create_catalog, printing_dto
from spellbook_core.db import database_integer, iso_timestamp
from spellbook_core.errors import (
    ActorError,
    AuthError,
    CatalogPrintingNotFoundError,
    DatabaseIntegerRangeError,
    DeckNotFoundError,
    DescriptionConflictError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.fingerprint import mutation_fingerprint, serialize_mutation
from spellbook_core.models import Actor, SessionInfo
from spellbook_core.validation import (
    INVENTORY_SOURCES,
    MISSING,
    assert_bounded_text,
    assert_condition,
    assert_deck_role,
    assert_finish,
    assert_request_id,
    assert_uuid,
    js_trim,
    js_utf8,
    normalize_quantity,
    normalize_source,
    positive_quantity,
    utf16_length,
    valid_password,
)

GOLDEN = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/compatibility/golden.json").read_text()
)
UUID = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize("vector", GOLDEN["fingerprints"], ids=lambda row: row["id"])
def test_neutral_fingerprints(vector: dict[str, str]) -> None:
    payload = json.loads(vector["inputJson"])
    serialized = serialize_mutation(payload)
    assert serialized == vector["serialized"]
    assert serialized.encode("utf-8").hex() == vector["utf8Hex"]
    assert mutation_fingerprint(payload) == vector["sha256"]


def test_undefined_recipes() -> None:
    assert mutation_fingerprint({"a": MISSING, "b": 1}) == mutation_fingerprint({"b": 1})
    assert mutation_fingerprint([MISSING]) == mutation_fingerprint([None])
    with pytest.raises(ValidationError, match="Mutation payload must be JSON serializable"):
        mutation_fingerprint(MISSING)
    cyclic: list[object] = []
    cyclic.append(cyclic)
    with pytest.raises(ValidationError):
        serialize_mutation(cyclic)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1e-6, "0.000001"),
        (1e-7, "1e-7"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (-0.0, "0"),
        (math.nan, "null"),
        (math.inf, "null"),
        (9007199254740993, "9007199254740992"),
        (1000000000000000128, "1000000000000000100"),
        (5e-324, "5e-324"),
        (1.7976931348623157e308, "1.7976931348623157e+308"),
    ],
)
def test_binary64_json(value: int | float, expected: str) -> None:
    assert serialize_mutation(value) == expected


def test_utf16_sorting_numeric_indices_and_escaping() -> None:
    assert serialize_mutation({"4294967295": 1, "4294967294": 2, "00": 3, "1": 4}) == (
        '{"1":4,"4294967294":2,"00":3,"4294967295":1}'
    )
    assert serialize_mutation({"\ue000": 1, "\U00010000": 2, "a": "\ud800"}) == (
        '{"a":"\\ud800","\U00010000":2,"\ue000":1}'
    )
    assert serialize_mutation("\ud83d\udd2e") == '"🔮"'
    assert serialize_mutation('\b\t\n\f\r\x00"\\/') == '"\\b\\t\\n\\f\\r\\u0000\\"\\\\/"'


@pytest.mark.parametrize("vector", GOLDEN["tokens"], ids=lambda row: row["id"])
def test_neutral_token_digest(vector: dict[str, str]) -> None:
    assert hash_session_token(vector["token"]) == vector["sha256"]


@pytest.mark.parametrize("vector", GOLDEN["text"], ids=lambda row: row["id"])
def test_neutral_utf16_password(vector: dict[str, object]) -> None:
    assert valid_password(vector["value"]) == vector["valid"]


@pytest.mark.parametrize("vector", GOLDEN["numbers"], ids=lambda row: row["id"])
def test_neutral_integer(vector: dict[str, object]) -> None:
    if vector.get("invalid"):
        with pytest.raises(DatabaseIntegerRangeError):
            database_integer(vector["value"])
    else:
        assert database_integer(vector["value"]) == vector["expected"]


@pytest.mark.parametrize(
    "value", [True, False, None, "1.0", " 1", "1e2", Decimal(1), 2**53, math.inf]
)
def test_exact_integer_rejects_coercion(value: object) -> None:
    with pytest.raises(DatabaseIntegerRangeError):
        database_integer(value)


@pytest.mark.parametrize("value", [True, None, MISSING, "1", 1.5, math.inf, math.nan, 2147483648])
def test_quantity_rejects_coercion(value: object) -> None:
    with pytest.raises(ValidationError, match="Quantity must be a finite 32-bit integer"):
        normalize_quantity(value)


def test_scalar_contracts() -> None:
    assert normalize_quantity(-2147483647) == -2147483647
    assert normalize_quantity(-0.0) == 0
    assert positive_quantity(2.0) == 2
    with pytest.raises(ValidationError, match="Quantity must be greater than zero"):
        positive_quantity(0)
    assert assert_request_id("\ufeff request \u2029") == "request"
    assert normalize_source(MISSING, INVENTORY_SOURCES, "mobile") == "mobile"
    assert normalize_source(" web ", INVENTORY_SOURCES, "mobile") == "web"
    assert assert_finish(" foil ") == "foil"
    assert assert_condition(" NM ") == "NM"
    assert assert_deck_role(" main ") == "main"
    assert assert_uuid(UUID.upper(), "entryId") == UUID
    assert utf16_length("🔮") == 2
    assert utf16_length("\ud800") == 1
    assert assert_bounded_text("🔮", "notes", 2) == "🔮"
    with pytest.raises(ValidationError, match="at most 1 characters"):
        assert_bounded_text("🔮", "notes", 1)
    with pytest.raises(ValidationError):
        assert_uuid(" " + UUID, "entryId")
    assert js_trim("\x1cvalue\x1c") == "\x1cvalue\x1c"
    assert js_utf8("a\ud800b\udc00c") == "a�b�c".encode()
    assert js_utf8("\ud83d\udd2e") == "🔮".encode()


@pytest.mark.parametrize("value", [None, False, 1, [], {}])
def test_null_and_wrong_types_are_not_absence(value: object) -> None:
    operations: tuple[Callable[[], object], ...] = (
        lambda: assert_request_id(value),
        lambda: normalize_source(value, INVENTORY_SOURCES, "mobile"),
        lambda: assert_finish(value),
        lambda: assert_condition(value),
        lambda: assert_bounded_text(value, "notes", 4000),
    )
    for operation in operations:
        with pytest.raises(ValidationError):
            operation()


def test_session_syntax_and_utc_millisecond_projection() -> None:
    assert valid_session_token("A" * 43)
    for token in ("A" * 42, "A" * 44, "A" * 43 + "\n", "é" * 43, None):
        assert not valid_session_token(token)
    value = datetime(2026, 10, 20, 12, 30, 1, 123999, tzinfo=timezone(timedelta(hours=2)))
    assert iso_timestamp(value) == "2026-10-20T10:30:01.123Z"
    with pytest.raises(ValueError):
        iso_timestamp(datetime(2026, 10, 20))
    assert iso_timestamp(datetime(2026, 10, 20, tzinfo=UTC)) == "2026-10-20T00:00:00.000Z"


def test_actor_is_identity_only_and_dtos_have_no_credential() -> None:
    actor = Actor(UUID, "test", "", "wizard", "grove")
    other = Actor(UUID, "test", "", "wizard", "grove")
    assert actor != other
    assert actor.to_dto() == {
        "accountId": UUID,
        "username": "test",
        "email": "",
        "avatarId": "wizard",
        "artworkId": "grove",
    }
    info = SessionInfo(actor, "2026-10-20T00:00:00.000Z")
    assert set(info.to_dto()) == {"user", "expiresAt"}
    assert "token" not in repr(info).lower()
    assert "hash" not in repr(info).lower()


def test_construction_and_forged_actor_do_not_acquire() -> None:
    class UnusedPool:
        def connection(self, timeout: float | None = None) -> object:
            raise AssertionError("construction/invalid authority must not acquire")

    # Protocol is structural; this sentinel exercises only paths that must not call it.
    from typing import cast

    from spellbook_core.db import ConnectionPool

    pool = cast(ConnectionPool, UnusedPool())
    auth = create_session_auth(pool)
    create_catalog(pool)
    forged = Actor(UUID, "test", "", "wizard", "grove")

    async def check() -> None:
        assert await auth.inspect_session(None) is None
        assert await auth.inspect_session("bad") is None
        assert await auth.inspect_session("a" * 43 + "\n") is None
        for actor in (forged, copy.copy(forged)):
            with pytest.raises(ActorError):
                await auth.require_actor(actor)
            with pytest.raises(ActorError):
                await auth.actor_session(actor)

    asyncio.run(check())


def test_catalog_explicit_projection_preserves_optional_absence() -> None:
    source = {"id": UUID, "name": "Forest", "cmc": 0, "internal_fact": "private"}
    result = printing_dto(source)
    assert result == {"id": UUID, "name": "Forest", "cmc": 0}
    assert "power" not in result
    source["name"] = "later"
    assert result["name"] == "Forest"


def test_error_names_and_public_contracts() -> None:
    assert str(ActorError()) == "Authentication required"
    assert ActorError.kind == "Unauthenticated"
    assert AuthError.kind == "RateLimited"
    assert str(CatalogPrintingNotFoundError()) == "Catalog printing not found"
    assert str(DeckNotFoundError()) == "Deck or entry not found"
    assert InventoryNotFoundError.kind_of_failure == "NotFound"
    assert str(RequestConflictError()) == "Request ID was already used for a different mutation"
    notes = NotesConflictError(
        {"entryId": UUID, "notes": "é 🔮", "notesRevision": "9007199254740993"}
    )
    vector = next(row["body"] for row in GOLDEN["conflicts"] if row["id"] == "conflict-notes")
    assert notes.latest == {key: vector[key] for key in ("entryId", "notes", "notesRevision")}
    assert str(notes) == vector["message"]
    description = DescriptionConflictError({"description": "saved", "descriptionRevision": "8"})
    vector = next(
        row["body"] for row in GOLDEN["conflicts"] if row["id"] == "conflict-description"
    )
    assert str(description) == vector["message"]
    assert InventoryQuantityChangedError(None).latest_quantity is None
    assert InventoryQuantityChangedError(3).latest_quantity == 3
