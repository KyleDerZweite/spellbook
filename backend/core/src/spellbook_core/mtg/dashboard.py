"""Account dashboard on one read-only snapshot, with optional summaries isolated."""

from datetime import datetime
from typing import Literal, TypedDict

from psycopg import sql

from spellbook_core.auth import SessionAuth
from spellbook_core.db import (
    ConnectionPool,
    Transaction,
    database_integer,
    iso_timestamp,
    transaction,
)
from spellbook_core.errors import DatabaseIntegerRangeError
from spellbook_core.models import Actor
from spellbook_core.mtg.decks.models import AvailabilityRequirement, OwnedPrinting
from spellbook_core.mtg.decks.read import owned
from spellbook_core.mtg.decks.rules import allocate_deck_availability
from spellbook_core.mtg.inventory_value import InventoryValues
from spellbook_core.mtg.profile import SummaryRangeError
from spellbook_core.mtg.valuation import PriceReadUnavailable
from spellbook_core.mtg.valuation_query import Document


class Distribution(TypedDict):
    label: str
    quantity: int
    share: float


class CatalogBreakdown(TypedDict):
    colors: list[Distribution]
    colorIdentity: list[Distribution]
    rarities: list[Distribution]
    primaryTypes: list[Distribution]
    matchedQuantity: int
    unknownQuantity: int
    setNames: dict[str, str]


class DashboardSummary(TypedDict):
    totals: dict[str, int]
    catalogBreakdown: CatalogBreakdown | None
    requirements: dict[str, list[dict[str, object]]]
    sets: list[Distribution]
    finishes: list[Distribution]
    conditions: list[Distribution]
    recentEntries: list[dict[str, object]]
    decks: list[dict[str, object]]
    pendingScanReviews: int | None
    inventoryValue: Document | None
    inventoryValueHistory: Document | None
    valuationError: dict[str, str] | None


def summary_number(value: object) -> int:
    try:
        number = database_integer(value)
    except DatabaseIntegerRangeError:
        raise SummaryRangeError() from None
    if number < 0:
        raise SummaryRangeError()
    return number


async def _distribution(
    tx: Transaction,
    account_id: str,
    total: int,
    column: Literal["set_code", "finish", "condition"],
    labels: tuple[str, ...] | None = None,
) -> list[Distribution]:
    cursor = await tx.execute(
        sql.SQL(
            "SELECT {column}, sum(quantity::numeric)::text FROM inventory_cards "
            "WHERE account_id=%s AND game='mtg' GROUP BY {column} "
            "ORDER BY sum(quantity::numeric) DESC, {column}"
        ).format(column=sql.Identifier(column)),
        (account_id,),
    )
    quantities = {str(row[0]): summary_number(row[1]) for row in await cursor.fetchall()}
    return [
        {
            "label": label,
            "quantity": quantities.get(label, 0),
            "share": quantities.get(label, 0) / total if total else 0,
        }
        for label in (labels if labels is not None else quantities)
    ]


_COLORS = ("White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Unknown")
_RARITIES = ("common", "uncommon", "rare", "mythic", "special", "unknown")
_TYPES = (
    "Land",
    "Creature",
    "Instant",
    "Sorcery",
    "Enchantment",
    "Artifact",
    "Planeswalker",
    "Battle",
    "Other",
    "Unknown",
)


async def _catalog_breakdown(tx: Transaction, account_id: str, total: int) -> CatalogBreakdown:
    colors = """CASE WHEN p.id IS NULL THEN 'Unknown'
     WHEN cardinality(p.colors)=0 THEN 'Colorless'
     WHEN cardinality(p.colors)>1 THEN 'Multicolor'
     ELSE CASE p.colors[1] WHEN 'W' THEN 'White' WHEN 'U' THEN 'Blue'
     WHEN 'B' THEN 'Black' WHEN 'R' THEN 'Red' WHEN 'G' THEN 'Green' ELSE 'Unknown' END END"""
    identity = """CASE WHEN p.id IS NULL OR p.color_identity_mask IS NULL THEN 'Unknown'
     WHEN p.color_identity_mask=0 THEN 'Colorless' WHEN p.color_identity_mask=1 THEN 'White'
     WHEN p.color_identity_mask=2 THEN 'Blue' WHEN p.color_identity_mask=4 THEN 'Black'
     WHEN p.color_identity_mask=8 THEN 'Red' WHEN p.color_identity_mask=16 THEN 'Green'
     ELSE 'Multicolor' END"""
    types = (
        "CASE WHEN p.id IS NULL THEN 'Unknown' "
        + " ".join(f"WHEN '{label}'=ANY(p.card_types) THEN '{label}'" for label in _TYPES[:-2])
        + " ELSE 'Other' END"
    )
    rows = await (
        await tx.execute(
            f"""WITH inventory_catalog AS (
         SELECT owned.*,p.document->>'set_name' AS set_name,{colors} AS color,
         {identity} AS identity,
         CASE WHEN p.id IS NULL THEN 'unknown'
         WHEN p.rarity IN ('common','uncommon','rare','mythic') THEN p.rarity
         ELSE 'special' END AS rarity,{types} AS primary_type
         FROM (SELECT catalog_card_id,set_code,sum(quantity::numeric) AS quantity
         FROM inventory_cards WHERE account_id=%s AND game='mtg'
         GROUP BY catalog_card_id,set_code) owned
         LEFT JOIN catalog_state s ON s.id=1 LEFT JOIN catalog_printings p
         ON p.generation_id=s.active_generation AND p.id=CASE WHEN owned.catalog_card_id
         ~* '^[0-9a-f]{{8}}(-[0-9a-f]{{4}}){{3}}-[0-9a-f]{{12}}$'
         THEN owned.catalog_card_id::uuid END
        ) SELECT dimension,label,sum(quantity)::text FROM inventory_catalog
        CROSS JOIN LATERAL (VALUES ('colors',color),('colorIdentity',identity),
        ('rarities',rarity),('primaryTypes',primary_type)) buckets(dimension,label)
        GROUP BY dimension,label
        UNION ALL SELECT 'setNames',set_code,min(set_name) FROM inventory_catalog
        WHERE set_name IS NOT NULL GROUP BY set_code""",
            (account_id,),
        )
    ).fetchall()
    quantities: dict[str, dict[str, int]] = {}
    names: dict[str, str] = {}
    for dimension, label, value in rows:
        if dimension == "setNames":
            names[str(label)] = str(value)
        else:
            quantities.setdefault(str(dimension), {})[str(label)] = summary_number(value)

    def distribution(dimension: str, labels: tuple[str, ...]) -> list[Distribution]:
        values = quantities.get(dimension, {})
        if sum(values.values()) != total:
            raise SummaryRangeError()
        return [
            {
                "label": label,
                "quantity": values.get(label, 0),
                "share": values.get(label, 0) / total if total else 0,
            }
            for label in labels
        ]

    unknown = quantities.get("colors", {}).get("Unknown", 0)
    return {
        "colors": distribution("colors", _COLORS),
        "colorIdentity": distribution("colorIdentity", _COLORS),
        "rarities": distribution("rarities", _RARITIES),
        "primaryTypes": distribution("primaryTypes", _TYPES),
        "matchedQuantity": total - unknown,
        "unknownQuantity": unknown,
        "setNames": names,
    }


class _Requirement(AvailabilityRequirement):
    deckId: str
    deckName: str
    name: str
    imageUri: str


async def _deck_availability(
    tx: Transaction, account_id: str
) -> tuple[dict[str, dict[str, int]], dict[str, list[dict[str, object]]]]:
    # Project only the fields needed by the authoritative exact-first allocator.
    # Compositions remain inside Core; only bounded requirement previews leave it.
    rows = await (
        await tx.execute(
            "SELECT dc.id,dc.deck_id,d.name,dc.catalog_card_id,dc.canonical_card_id,"
            "dc.name,dc.image_uri,dc.quantity FROM deck_cards dc JOIN decks d "
            "ON d.id=dc.deck_id AND d.account_id=dc.account_id AND d.game=dc.game "
            "WHERE d.account_id=%s AND d.game='mtg' ORDER BY dc.id",
            (account_id,),
        )
    ).fetchall()
    by_deck: dict[str, list[_Requirement]] = {}
    for row in rows:
        card = _Requirement(
            id=str(row[0]),
            deckId=str(row[1]),
            deckName=str(row[2]),
            catalogCardId=str(row[3]),
            canonicalCardId=str(row[4]),
            name=str(row[5]),
            imageUri=str(row[6]),
            quantity=summary_number(row[7]),
        )
        by_deck.setdefault(card["deckId"], []).append(card)
    canonical_ids = list(
        dict.fromkeys(c["canonicalCardId"] for cards in by_deck.values() for c in cards)
    )
    try:
        inventory = await owned(tx, account_id, canonical_ids)
    except DatabaseIntegerRangeError:
        raise SummaryRangeError() from None
    by_canonical: dict[str, list[OwnedPrinting]] = {}
    for printing in inventory:
        by_canonical.setdefault(printing["canonicalCardId"], []).append(printing)
    totals: dict[str, dict[str, int]] = {}
    previews: list[dict[str, object]] = []
    for deck_id, cards in by_deck.items():
        # The Deck reader limits ownership to this Deck's stored canonical IDs.
        relevant = {c["canonicalCardId"] for c in cards}
        printings = sorted(
            (p for identity in relevant for p in by_canonical.get(identity, [])),
            key=lambda p: (p["catalogCardId"], p["canonicalCardId"]),
        )
        allocations = allocate_deck_availability(cards, printings)
        counts = dict(required=0, exact=0, alternate=0, missing=0)
        canonical: dict[str, dict[str, object]] = {}
        for card in cards:
            allocated = allocations[card["id"]]
            values = {
                "required": card["quantity"],
                "exact": allocated["exact"],
                "alternate": allocated["alternate"],
                "missing": allocated["missing"],
            }
            preview = canonical.setdefault(
                card["canonicalCardId"],
                dict(
                    deckId=deck_id,
                    deckName=card["deckName"],
                    canonicalCardId=card["canonicalCardId"],
                    catalogCardId=card["catalogCardId"],
                    name=card["name"],
                    imageUri=card["imageUri"],
                    required=0,
                    exact=0,
                    alternate=0,
                    missing=0,
                ),
            )
            for key, value in values.items():
                counts[key] = summary_number(counts[key] + value)
                preview[key] = summary_number(summary_number(preview[key]) + value)
        totals[deck_id] = counts
        previews.extend(canonical.values())

    def bounded(key: str) -> list[dict[str, object]]:
        return sorted(
            (row for row in previews if summary_number(row[key]) > 0),
            key=lambda row: (
                -summary_number(row[key]),
                str(row["deckId"]),
                str(row["canonicalCardId"]),
            ),
        )[:8]

    return totals, dict(missing=bounded("missing"), alternate=bounded("alternate"))


class Dashboard:
    def __init__(self, pool: ConnectionPool, auth: SessionAuth, values: InventoryValues):
        self._pool, self._auth, self._values = pool, auth, values

    async def get(self, actor: Actor) -> DashboardSummary:
        user = await self._auth.require_actor(actor)
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            clock = await (await tx.execute("SELECT statement_timestamp()")).fetchone()
            assert clock is not None and isinstance(clock[0], datetime)
            as_of = clock[0]
            args = (user.account_id,)
            row = await (
                await tx.execute(
                    "SELECT coalesce(sum(quantity::numeric),0)::text, "
                    "count(distinct canonical_card_id)::text, "
                    "count(distinct catalog_card_id)::text, count(distinct set_code)::text, "
                    "coalesce(sum(quantity::numeric) FILTER(WHERE finish='foil'),0)::text, "
                    "(SELECT count(*) FROM decks WHERE account_id=%s AND game='mtg')::text "
                    "FROM inventory_cards WHERE account_id=%s AND game='mtg'",
                    (user.account_id, user.account_id),
                )
            ).fetchone()
            assert row is not None
            totals = {
                key: summary_number(value)
                for key, value in zip(
                    ("total", "names", "printings", "sets", "foils", "decks"), row, strict=True
                )
            }
            await tx.execute("SAVEPOINT catalog_summary")
            try:
                catalog_breakdown = await _catalog_breakdown(tx, user.account_id, totals["total"])
            except SummaryRangeError:
                raise
            except Exception:
                await tx.execute("ROLLBACK TO SAVEPOINT catalog_summary")
                catalog_breakdown = None
            await tx.execute("RELEASE SAVEPOINT catalog_summary")
            sets = await _distribution(tx, user.account_id, totals["total"], "set_code")
            finishes = await _distribution(
                tx, user.account_id, totals["total"], "finish", ("nonfoil", "foil")
            )
            conditions = await _distribution(
                tx, user.account_id, totals["total"], "condition", ("NM", "LP", "MP", "HP", "DMG")
            )
            recent = await (
                await tx.execute(
                    "SELECT id, catalog_card_id, canonical_card_id, name, set_code, image_uri, "
                    "quantity, finish, condition, updated_at FROM inventory_cards "
                    "WHERE account_id=%s AND game='mtg' ORDER BY updated_at DESC,id LIMIT 8",
                    args,
                )
            ).fetchall()
            entries: list[dict[str, object]] = []
            for entry in recent:
                assert isinstance(entry[9], datetime)
                entries.append(
                    {
                        **dict(
                            zip(
                                (
                                    "id",
                                    "catalogCardId",
                                    "canonicalCardId",
                                    "name",
                                    "setCode",
                                    "imageUri",
                                ),
                                (str(value) for value in entry[:6]),
                                strict=True,
                            )
                        ),
                        "quantity": summary_number(entry[6]),
                        "finish": entry[7],
                        "condition": entry[8],
                        "updatedAt": iso_timestamp(entry[9]),
                    }
                )
            deck_rows = await (
                await tx.execute(
                    """
                    SELECT d.id,d.name,d.format,
                    (SELECT coalesce(jsonb_agg(preview), '[]'::jsonb) FROM (
                        SELECT dc.catalog_card_id AS "catalogCardId", dc.name,
                        dc.image_uri AS "imageUri",
                        COALESCE(p.document->'image_uris'->>'art_crop',
                        p.document->'card_faces'->0->'image_uris'->>'art_crop') AS "artCrop",
                        p.document->'color_identity' AS "colorIdentity"
                        FROM deck_cards dc
                        LEFT JOIN catalog_state cs ON cs.id=1
                        LEFT JOIN catalog_printings p ON p.generation_id=cs.active_generation
                        AND p.id::text=dc.catalog_card_id
                        WHERE dc.deck_id=d.id AND dc.account_id=d.account_id
                        AND dc.game=d.game AND dc.role='commander'
                        ORDER BY dc.created_at,dc.id LIMIT 2
                    ) preview) AS commanders
                    FROM decks d
                    WHERE d.account_id=%s AND d.game='mtg' ORDER BY d.updated_at DESC,d.id
                    """,
                    (user.account_id,),
                )
            ).fetchall()
            availability, requirements = await _deck_availability(tx, user.account_id)
            decks: list[dict[str, object]] = [
                {
                    "id": str(deck[0]),
                    "name": deck[1],
                    "format": deck[2],
                    **availability.get(
                        str(deck[0]), dict(required=0, exact=0, alternate=0, missing=0)
                    ),
                    "commanders": deck[3],
                }
                for deck in deck_rows
            ]
            pending: int | None
            await tx.execute("SAVEPOINT scan_summary")
            try:
                scan = await (
                    await tx.execute(
                        "SELECT count(*)::text FROM scan_sessions WHERE account_id=%s "
                        "AND game='mtg' AND status='pending_review'",
                        args,
                    )
                ).fetchone()
                assert scan is not None
                pending = summary_number(scan[0])
            except SummaryRangeError:
                raise
            except Exception:
                await tx.execute("ROLLBACK TO SAVEPOINT scan_summary")
                pending = None
            await tx.execute("RELEASE SAVEPOINT scan_summary")
            current: Document | None = None
            history: Document | None = None
            valuation_error: dict[str, str] | None = None
            await tx.execute("SAVEPOINT inventory_value_summary")
            try:
                current = await self._values.current_in_transaction(tx, user.account_id, as_of)
                history = await self._values.history_in_transaction(
                    tx, user.account_id, {"days": 30}, as_of
                )
            except Exception:
                await tx.execute("ROLLBACK TO SAVEPOINT inventory_value_summary")
                current = history = None
                failure = PriceReadUnavailable()
                valuation_error = {"kind": failure.kind, "message": str(failure)}
            await tx.execute("RELEASE SAVEPOINT inventory_value_summary")
            return {
                "totals": totals,
                "catalogBreakdown": catalog_breakdown,
                "requirements": requirements,
                "sets": sets,
                "finishes": finishes,
                "conditions": conditions,
                "recentEntries": entries,
                "decks": decks,
                "pendingScanReviews": pending,
                "inventoryValue": current,
                "inventoryValueHistory": history,
                "valuationError": valuation_error,
            }


def create_dashboard(
    pool: ConnectionPool, auth: SessionAuth, values: InventoryValues
) -> Dashboard:
    return Dashboard(pool, auth, values)
