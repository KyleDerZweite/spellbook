"""Complete tuple-row query seam shared by reference reads and private captures."""

from collections.abc import Awaitable, Callable, Sequence
from typing import Any
from uuid import UUID

from psycopg import AsyncRawCursor

from .db import Transaction

type ValuationQuery = Callable[
    [Transaction, str, Sequence[object]], Awaitable[list[tuple[object, ...]]]
]
type Document = dict[str, Any]


async def valuation_query(
    tx: Transaction, sql: str, parameters: Sequence[object] = ()
) -> list[tuple[object, ...]]:
    """Execute numbered SQL on this connection without acquiring or nesting a transaction."""
    async with AsyncRawCursor(tx) as cursor:
        await cursor.execute(sql, parameters)
        return list(await cursor.fetchall()) if cursor.description is not None else []


async def records(
    tx: Transaction,
    query: ValuationQuery,
    sql: str,
    parameters: Sequence[object],
    columns: Sequence[str],
) -> list[Document]:
    return [
        {
            key: str(value) if isinstance(value, UUID) else value
            for key, value in zip(columns, row, strict=True)
        }
        for row in await query(tx, sql, parameters)
    ]


BASELINE_ROWS = """
SELECT p.id AS printing_id, p.identity, p.links, o.supported, o.amount::text, o.measure,
o.raw_value, o.english_printing_id, o.mapping_reason, e.variant_key AS english_variant_key,
e.identity AS english_identity, e.links AS english_links, eo.amount::text AS english_amount,
eo.supported AS english_supported, eo.raw_value AS english_raw_value FROM unnest($2::uuid[],
$3::text[]) WITH ORDINALITY r(id, finish, ordinality) LEFT JOIN price_printings p ON
p.publication_id=$1 AND p.id=r.id LEFT JOIN price_observations o ON o.publication_id=$1 AND
o.printing_id=p.id AND o.finish=r.finish LEFT JOIN price_printings e ON e.publication_id=$1 AND
e.id=o.english_printing_id LEFT JOIN price_observations eo ON eo.publication_id=$1 AND
eo.printing_id=e.id AND eo.finish=r.finish ORDER BY r.ordinality
"""


OPTIONAL_ROWS = """
SELECT p.printing_id, p.identity, o.supported, o.amount::text, o.measure, o.raw_value,
o.provider_id, o.english_printing_id, o.mapping_reason, e.variant_key AS english_variant_key,
e.identity AS english_identity, eo.amount::text AS english_amount, eo.supported AS
english_supported, eo.raw_value AS english_raw_value, eo.provider_id AS english_provider_id FROM
unnest($2::uuid[], $3::text[]) WITH ORDINALITY r(id, finish, ordinality) LEFT JOIN
optional_price_printings p ON p.publication_id=$1 AND p.printing_id=r.id LEFT JOIN
optional_price_observations o ON o.publication_id=$1 AND o.printing_id=p.printing_id AND
o.finish=r.finish LEFT JOIN optional_price_printings e ON e.publication_id=$1 AND
e.printing_id=o.english_printing_id LEFT JOIN optional_price_observations eo ON
eo.publication_id=$1 AND eo.printing_id=e.printing_id AND eo.finish=r.finish ORDER BY r.ordinality
"""


PUBLIC_HISTORY = """
SELECT DISTINCT ON (h.source, h.day) h.source, h.printing_id, h.finish, h.day::text,
h.time_precision, h.source_instant, h.amount::text, h.measure, h.provider_id, h.publication_id,
jsonb_build_object( 'publication' , hp.evidence, 'identity' , hi.identity, 'variantKey' ,
hi.variant_key) AS evidence FROM price_source_history h JOIN unnest($5::text[], $7::uuid[],
$8::text[]) m(source, english_id, variant_key) ON m.source=h.source LEFT JOIN
price_history_publications hp ON hp.publication_id=h.publication_id AND hp.source=h.source LEFT
JOIN price_history_printings hi ON hi.publication_id=h.publication_id AND
hi.printing_id=h.printing_id WHERE h.printing_id=ANY($1::uuid[]) AND h.finish=$2 AND h.day BETWEEN
$3::date AND $4::date AND h.source=ANY($5::text[]) AND (h.printing_id=$6 OR
(h.printing_id=m.english_id AND hi.variant_key=m.variant_key)) ORDER BY h.source, h.day,
(h.printing_id=$6) DESC
"""
