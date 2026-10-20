"""Concrete Psycopg transactions with caller-owned pool and bounded SQL work."""

import asyncio
import math
import re
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import UTC, datetime
from typing import Protocol

from psycopg import AsyncConnection

from .errors import DatabaseIntegerRangeError

# The transaction passed between application modules is the connection itself.
type Transaction = AsyncConnection[tuple[object, ...]]


class ConnectionPool(Protocol):
    """The API owns the actual Psycopg AsyncConnectionPool and its lifetime."""

    def connection(
        self, timeout: float | None = None
    ) -> AbstractAsyncContextManager[Transaction]: ...


@asynccontextmanager
async def transaction(
    pool: ConnectionPool, *, read_only: bool = False, repeatable_read: bool = False
) -> AsyncIterator[Transaction]:
    """Acquire an idle connection; settle commit/rollback before returning its lease."""
    async with pool.connection(timeout=2.0) as tx, asyncio.timeout(10.0), tx.transaction():
        if repeatable_read:
            await tx.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        if read_only:
            await tx.execute("SET TRANSACTION READ ONLY")
        await tx.execute("SET LOCAL statement_timeout = '5000ms'")
        await tx.execute("SET LOCAL lock_timeout = '2000ms'")
        await tx.execute("SET LOCAL idle_in_transaction_session_timeout = '10000ms'")
        await tx.execute("SET LOCAL transaction_timeout = '10000ms'")
        yield tx


def iso_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("A timezone-aware timestamp is required")
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def database_integer(value: object) -> int:
    """Decode exact aggregates without rounding, matching db/numbers.ts."""
    if isinstance(value, bool):
        raise DatabaseIntegerRangeError()
    if isinstance(value, int):
        result = value
    elif isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise DatabaseIntegerRangeError()
        result = int(value)
    elif isinstance(value, str) and re.fullmatch(r"-?[0-9]+", value):
        result = int(value)
    else:
        raise DatabaseIntegerRangeError()
    if abs(result) > 9007199254740991:
        raise DatabaseIntegerRangeError()
    return result
