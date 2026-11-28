"""Inventory-based Reference deck discovery ("SuperBrew") with missing-card budget and copy."""

import math
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Literal, TypedDict, cast
from uuid import uuid4

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, iso_timestamp, transaction
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.decks.common import (
    aggregate_quantity,
    authorize_write,
    deck_dto,
    first,
    read_cards,
    rows,
)
from spellbook_core.mtg.decks.library import advance_deck_library_revision
from spellbook_core.mtg.decks.models import Deck, Document
from spellbook_core.mtg.decks.tokens import calculate_tokens, save_tokens
from spellbook_core.mtg.errors import DeckNotFoundError
from spellbook_core.mtg.formats import MTG_FORMATS, MtgFormat
from spellbook_core.mtg.inventory_value import exact_amount, pair_key, value_estimate
from spellbook_core.mtg.reference_decks import ReferenceDeckSourceStatus
from spellbook_core.mtg.valuation import Valuation
from spellbook_core.validation import assert_uuid, js_trim, utf16_length

DeckDiscoverySort = Literal["missing_cost:asc", "ownership:desc", "meta_share:desc", "name:asc"]
DeckDiscoveryInventoryMode = Literal["all", "free"]

ALLOWED_DISCOVERY_SORTS: frozenset[str] = frozenset(
    {"missing_cost:asc", "ownership:desc", "meta_share:desc", "name:asc"}
)
ALLOWED_INVENTORY_MODES: frozenset[str] = frozenset({"all", "free"})
MAX_BUDGET_EUR = 1_000_000.0
_UNKNOWN_REFERENCE: Document = {"kind": "Unknown"}


class DeckDiscoveryItem(TypedDict):
    id: str
    source: str
    externalId: str
    name: str
    format: MtgFormat
    archetype: str | None
    sourceUrl: str | None
    metaShare: float | None
    sourceUpdatedAt: str | None
    syncedAt: str
    cardCount: int
    uniqueCardCount: int
    coverImageUri: str | None
    ownedCards: int
    missingCards: int
    ownershipPercent: float
    missingValue: Document


class DeckDiscoveryResponse(TypedDict):
    decks: list[DeckDiscoveryItem]
    total: int
    limit: int
    offset: int
    inventoryMode: DeckDiscoveryInventoryMode
    sort: DeckDiscoverySort
    assembledDeckCount: int
    valuationAvailable: bool
    evaluatedAt: str
    availableFormats: list[MtgFormat]
    sources: list[ReferenceDeckSourceStatus]


class DeckDiscoveryCopyResult(TypedDict):
    deck: Deck
    copiedCards: int
    skippedCards: int


class ReferenceDeckCandidate(TypedDict):
    id: str
    source: str
    externalId: str
    name: str
    format: MtgFormat
    archetype: str | None
    sourceUrl: str | None
    metaShare: float | None
    sourceUpdatedAt: str | None
    syncedAt: str
    coverImageUri: str | None
    cards: list[tuple[str, int]]


def _iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return str(value)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _format_label(raw_format: str) -> str:
    trimmed = js_trim(raw_format)
    return trimmed.capitalize() if trimmed else "Commander"


def _build_copy_description(source: str, archetype: str | None, source_url: str | None) -> str:
    parts = [f"Copied from {source}"]
    if archetype:
        parts.append(archetype)
    header = " - ".join(parts)
    description = f"{header}\n{source_url}" if source_url else header
    return description[:4000]


def rank_discovery_candidates(
    candidates: Sequence[ReferenceDeckCandidate],
    owned_by_oracle: Mapping[str, int],
    *,
    claimed_by_oracle: Mapping[str, int] = {},
    inventory_mode: DeckDiscoveryInventoryMode = "all",
    oracle_to_printing: Mapping[str, str] = {},
    price_references: Mapping[tuple[str, str], Document] = {},
    max_missing_cost: float | None = None,
    min_ownership: float | None = None,
    sort: DeckDiscoverySort = "missing_cost:asc",
) -> list[DeckDiscoveryItem]:
    """Compute ownership, missing-card value estimates, filter, and sort Reference decks."""
    max_cost_scaled = (
        exact_amount(f"{max_missing_cost:.6f}") if max_missing_cost is not None else None
    )
    items: list[DeckDiscoveryItem] = []

    for candidate in candidates:
        required_by_oracle: dict[str, int] = {}
        for oracle_id, quantity in candidate["cards"]:
            required_by_oracle[oracle_id] = required_by_oracle.get(oracle_id, 0) + quantity

        total_cards = sum(required_by_oracle.values())
        owned_cards = 0
        missing_holdings: list[Document] = []

        for oracle_id, req_qty in required_by_oracle.items():
            owned_qty = owned_by_oracle.get(oracle_id, 0)
            if inventory_mode == "free":
                owned_qty = max(0, owned_qty - claimed_by_oracle.get(oracle_id, 0))
            matched = min(req_qty, owned_qty)
            owned_cards += matched
            missing_qty = req_qty - matched
            if missing_qty > 0:
                printing_id = oracle_to_printing.get(oracle_id)
                reference = (
                    price_references.get((printing_id, "nonfoil"), _UNKNOWN_REFERENCE)
                    if printing_id
                    else _UNKNOWN_REFERENCE
                )
                missing_holdings.append({"quantity": missing_qty, "reference": reference})

        missing_cards = total_cards - owned_cards
        ownership_percent = (
            round((owned_cards / total_cards) * 100.0, 1) if total_cards > 0 else 0.0
        )
        missing_value = value_estimate(missing_holdings)

        if min_ownership is not None and ownership_percent < min_ownership:
            continue

        if max_cost_scaled is not None:
            if not missing_value["complete"]:
                continue
            if exact_amount(missing_value["coveredValue"]) > max_cost_scaled:
                continue

        items.append(
            {
                "id": candidate["id"],
                "source": candidate["source"],
                "externalId": candidate["externalId"],
                "name": candidate["name"],
                "format": candidate["format"],
                "archetype": candidate["archetype"],
                "sourceUrl": candidate["sourceUrl"],
                "metaShare": candidate["metaShare"],
                "sourceUpdatedAt": candidate["sourceUpdatedAt"],
                "syncedAt": candidate["syncedAt"],
                "cardCount": total_cards,
                "uniqueCardCount": len(required_by_oracle),
                "coverImageUri": candidate["coverImageUri"],
                "ownedCards": owned_cards,
                "missingCards": missing_cards,
                "ownershipPercent": ownership_percent,
                "missingValue": missing_value,
            }
        )

    def _cost_sort_key(item: DeckDiscoveryItem) -> tuple[int, int, float, float, str, str]:
        mv = item["missingValue"]
        unpriced = 1 if item["missingCards"] > 0 and mv["coveredQuantity"] == 0 else 0
        cost_scaled = 0 if item["missingCards"] == 0 else exact_amount(mv["coveredValue"])
        meta = -(item["metaShare"] if item["metaShare"] is not None else -1.0)
        return (
            unpriced,
            cost_scaled,
            -item["ownershipPercent"],
            meta,
            item["name"].lower(),
            item["id"],
        )

    if sort == "missing_cost:asc":
        items.sort(key=_cost_sort_key)
    elif sort == "ownership:desc":
        items.sort(
            key=lambda item: (
                -item["ownershipPercent"],
                1
                if item["missingCards"] > 0 and item["missingValue"]["coveredQuantity"] == 0
                else 0,
                0
                if item["missingCards"] == 0
                else exact_amount(item["missingValue"]["coveredValue"]),
                -(item["metaShare"] if item["metaShare"] is not None else -1.0),
                item["name"].lower(),
                item["id"],
            )
        )
    elif sort == "meta_share:desc":
        items.sort(
            key=lambda item: (
                0 if item["metaShare"] is not None else 1,
                -(item["metaShare"] if item["metaShare"] is not None else 0.0),
                -item["ownershipPercent"],
                item["name"].lower(),
                item["id"],
            )
        )
    else:
        items.sort(key=lambda item: (item["name"].lower(), item["id"]))

    return items


async def _load_owned_by_oracle(
    tx: Transaction, account_id: str, oracle_ids: list[str]
) -> dict[str, int]:
    if not oracle_ids:
        return {}
    result_rows = await rows(
        tx,
        """
        SELECT canonical_card_id, sum(quantity)::text AS quantity
        FROM inventory_cards
        WHERE account_id = %s AND game = 'mtg' AND canonical_card_id = ANY(%s::text[])
        GROUP BY canonical_card_id
        """,
        (account_id, oracle_ids),
    )
    return {
        cast(str, row["canonical_card_id"]): aggregate_quantity(row["quantity"])
        for row in result_rows
    }


async def _load_claimed_by_oracle(
    tx: Transaction, account_id: str, oracle_ids: list[str]
) -> dict[str, int]:
    if not oracle_ids:
        return {}
    result_rows = await rows(
        tx,
        """
        SELECT dc.canonical_card_id, sum(dc.quantity)::text AS quantity
        FROM deck_cards dc
        JOIN decks d
          ON d.id = dc.deck_id AND d.account_id = dc.account_id AND d.game = dc.game
        WHERE d.account_id = %s AND d.game = 'mtg' AND d.assembled = true
          AND dc.canonical_card_id = ANY(%s::text[])
        GROUP BY dc.canonical_card_id
        """,
        (account_id, oracle_ids),
    )
    return {
        cast(str, row["canonical_card_id"]): aggregate_quantity(row["quantity"])
        for row in result_rows
    }


async def _load_representative_printings(
    tx: Transaction, oracle_ids: list[str]
) -> dict[str, Document]:
    if not oracle_ids:
        return {}
    result_rows = await rows(
        tx,
        """
        WITH active AS MATERIALIZED (
            SELECT active_generation AS id FROM catalog_state WHERE id = 1
        )
        SELECT DISTINCT ON (p.oracle_id)
            p.oracle_id::text AS oracle_id,
            p.id::text AS printing_id,
            p.document->>'name' AS name,
            COALESCE(p.document->>'set', '') AS set_code,
            p.document->>'image_uri' AS image_uri,
            p.document->>'image_uri_art_crop' AS art_crop
        FROM catalog_printings p
        JOIN active a ON a.id = p.generation_id
        WHERE p.oracle_id = ANY(%s::uuid[])
        ORDER BY p.oracle_id, (p.lang = 'en') DESC, p.document->>'released_at' DESC, p.id ASC
        """,
        (oracle_ids,),
    )
    return {cast(str, row["oracle_id"]): row for row in result_rows}


class DeckDiscovery:
    pool: ConnectionPool
    auth: SessionAuth
    valuation: Valuation

    async def discover_reference_decks(
        self,
        actor: Actor,
        *,
        format: str | None = None,
        source: str | None = None,
        query: str | None = None,
        max_missing_cost: float | None = None,
        min_ownership: float | None = None,
        inventory_mode: str = "all",
        sort: str = "missing_cost:asc",
        limit: int = 50,
        offset: int = 0,
    ) -> DeckDiscoveryResponse:
        account_id = (await self.auth.require_actor(actor)).account_id

        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValidationError("limit must be an integer between 1 and 100")
        if isinstance(offset, bool) or not isinstance(offset, int) or not 0 <= offset <= 100000:
            raise ValidationError("offset must be an integer between 0 and 100000")
        if inventory_mode not in ALLOWED_INVENTORY_MODES:
            raise ValidationError("inventoryMode must be 'all' or 'free'")
        if sort not in ALLOWED_DISCOVERY_SORTS:
            raise ValidationError("Unsupported discovery sort")

        if max_missing_cost is not None:
            if (
                isinstance(max_missing_cost, bool)
                or not isinstance(max_missing_cost, int | float)
                or not math.isfinite(max_missing_cost)
                or not 0.0 <= float(max_missing_cost) <= MAX_BUDGET_EUR
            ):
                raise ValidationError("maxMissingCost must be a number between 0 and 1000000")
            max_missing_cost = float(max_missing_cost)

        if min_ownership is not None:
            if (
                isinstance(min_ownership, bool)
                or not isinstance(min_ownership, int | float)
                or not math.isfinite(min_ownership)
                or not 0.0 <= float(min_ownership) <= 100.0
            ):
                raise ValidationError("minOwnership must be a number between 0 and 100")
            min_ownership = float(min_ownership)

        conditions: list[str] = []
        parameters: list[object] = []

        if format is not None and js_trim(format):
            normalized_format = js_trim(format).lower()
            if normalized_format not in MTG_FORMATS:
                raise ValidationError("Unsupported reference deck format")
            conditions.append("d.format = %s")
            parameters.append(normalized_format)

        if source is not None and js_trim(source):
            normalized_source = js_trim(source)
            if len(normalized_source) > 64 or "\x00" in normalized_source:
                raise ValidationError("Invalid reference deck source")
            conditions.append("d.source = %s")
            parameters.append(normalized_source)

        if query is not None:
            if utf16_length(query) > 200 or "\x00" in query:
                raise ValidationError("query must be at most 200 characters")
            trimmed = js_trim(query)
            if trimmed:
                pattern = f"%{_escape_like(trimmed)}%"
                conditions.append(
                    "(d.name ILIKE %s ESCAPE '\\' "
                    "OR COALESCE(d.archetype, '') ILIKE %s ESCAPE '\\')"
                )
                parameters.extend([pattern, pattern])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            clock = await first(tx, "SELECT statement_timestamp() AS as_of")
            as_of = cast(datetime, clock["as_of"])

            assembled_row = await first(
                tx,
                (
                    "SELECT count(*)::int AS count FROM decks "
                    "WHERE account_id=%s AND game='mtg' AND assembled=true"
                ),
                (account_id,),
            )
            assembled_deck_count = cast(int, assembled_row["count"]) if assembled_row else 0

            source_rows = await rows(
                tx,
                """
                SELECT source, last_synced_at, deck_count
                FROM reference_deck_sources
                WHERE enabled = true OR deck_count > 0 OR last_synced_at IS NOT NULL
                ORDER BY source ASC
                """,
            )
            sources: list[ReferenceDeckSourceStatus] = [
                {
                    "source": cast(str, row["source"]),
                    "lastSyncedAt": _iso(row["last_synced_at"]),
                    "deckCount": cast(int, row["deck_count"]),
                }
                for row in source_rows
            ]

            deck_rows = await rows(
                tx,
                f"""
                SELECT
                    d.id::text AS id,
                    d.source,
                    d.external_id,
                    d.name,
                    d.format,
                    d.archetype,
                    d.source_url,
                    d.meta_share,
                    d.synced_at,
                    d.source_updated_at
                FROM reference_decks d
                {where_clause}
                ORDER BY d.meta_share DESC NULLS LAST, d.name ASC, d.id ASC
                """,
                tuple(parameters),
            )

            deck_ids = [cast(str, row["id"]) for row in deck_rows]
            cards_by_deck: dict[str, list[tuple[str, int]]] = {did: [] for did in deck_ids}
            cover_oracle_by_deck: dict[str, str] = {}
            all_oracle_ids: list[str] = []
            seen_oracles: set[str] = set()

            if deck_ids:
                card_rows = await rows(
                    tx,
                    """
                    SELECT
                        reference_deck_id::text AS deck_id,
                        oracle_id::text AS oracle_id,
                        quantity,
                        role,
                        card_name
                    FROM reference_deck_cards
                    WHERE reference_deck_id = ANY(%s::uuid[])
                    ORDER BY
                        reference_deck_id,
                        CASE role
                            WHEN 'commander' THEN 0
                            WHEN 'companion' THEN 1
                            WHEN 'main' THEN 2
                            WHEN 'sideboard' THEN 3
                            ELSE 4
                        END ASC,
                        card_name ASC,
                        oracle_id ASC
                    """,
                    (deck_ids,),
                )
                for row in card_rows:
                    did = cast(str, row["deck_id"])
                    oid = cast(str, row["oracle_id"])
                    qty = cast(int, row["quantity"])
                    cards_by_deck[did].append((oid, qty))
                    if did not in cover_oracle_by_deck:
                        cover_oracle_by_deck[did] = oid
                    if oid not in seen_oracles:
                        seen_oracles.add(oid)
                        all_oracle_ids.append(oid)

            owned_by_oracle = await _load_owned_by_oracle(tx, account_id, all_oracle_ids)
            claimed_by_oracle = (
                await _load_claimed_by_oracle(tx, account_id, all_oracle_ids)
                if inventory_mode == "free" and assembled_deck_count > 0
                else {}
            )

            # Determine which oracle_ids need representative printings (missing cards + covers)
            needed_oracles: list[str] = []
            seen_needed: set[str] = set()
            for oid in cover_oracle_by_deck.values():
                if oid not in seen_needed:
                    seen_needed.add(oid)
                    needed_oracles.append(oid)

            missing_oracles: set[str] = set()
            for did in deck_ids:
                req_map: dict[str, int] = {}
                for oid, qty in cards_by_deck[did]:
                    req_map[oid] = req_map.get(oid, 0) + qty
                for oid, req_qty in req_map.items():
                    avail = owned_by_oracle.get(oid, 0)
                    if inventory_mode == "free":
                        avail = max(0, avail - claimed_by_oracle.get(oid, 0))
                    if req_qty > avail:
                        missing_oracles.add(oid)
                        if oid not in seen_needed:
                            seen_needed.add(oid)
                            needed_oracles.append(oid)

            reps = await _load_representative_printings(tx, needed_oracles)
            oracle_to_printing = {oid: cast(str, rep["printing_id"]) for oid, rep in reps.items()}

            missing_printing_ids = list(
                dict.fromkeys(
                    oracle_to_printing[oid] for oid in missing_oracles if oid in oracle_to_printing
                )
            )
            price_references: dict[tuple[str, str], Document] = {}
            valuation_available = True
            if missing_printing_ids:
                pairs = [dict(printingId=pid, finish="nonfoil") for pid in missing_printing_ids]
                await tx.execute("SAVEPOINT discovery_missing_prices")
                try:
                    for batch_offset in range(0, len(pairs), 100):
                        frozen = await self.valuation.freeze_in_transaction(
                            tx, pairs[batch_offset : batch_offset + 100], as_of
                        )
                        price_references.update(
                            (pair_key(r), r) for r in frozen["response"]["results"]
                        )
                except Exception:
                    await tx.execute("ROLLBACK TO SAVEPOINT discovery_missing_prices")
                    price_references = {}
                    valuation_available = False
                await tx.execute("RELEASE SAVEPOINT discovery_missing_prices")

        candidates: list[ReferenceDeckCandidate] = []
        for row in deck_rows:
            did = cast(str, row["id"])
            synced_at = _iso(row["synced_at"])
            assert synced_at is not None
            cover_oid = cover_oracle_by_deck.get(did)
            cover_rep = reps.get(cover_oid) if cover_oid else None
            cover_image = (
                cast(str | None, cover_rep.get("art_crop") or cover_rep.get("image_uri"))
                if cover_rep
                else None
            )
            candidates.append(
                {
                    "id": did,
                    "source": cast(str, row["source"]),
                    "externalId": cast(str, row["external_id"]),
                    "name": cast(str, row["name"]),
                    "format": cast(MtgFormat, row["format"]),
                    "archetype": cast(str | None, row["archetype"]),
                    "sourceUrl": cast(str | None, row["source_url"]),
                    "metaShare": float(row["meta_share"])
                    if isinstance(row["meta_share"], int | float)
                    else None,
                    "sourceUpdatedAt": _iso(row["source_updated_at"]),
                    "syncedAt": synced_at,
                    "coverImageUri": cover_image,
                    "cards": cards_by_deck[did],
                }
            )

        ranked = rank_discovery_candidates(
            candidates,
            owned_by_oracle,
            claimed_by_oracle=claimed_by_oracle,
            inventory_mode=cast(DeckDiscoveryInventoryMode, inventory_mode),
            oracle_to_printing=oracle_to_printing,
            price_references=price_references,
            max_missing_cost=max_missing_cost,
            min_ownership=min_ownership,
            sort=cast(DeckDiscoverySort, sort),
        )
        total = len(ranked)
        page = ranked[offset : offset + limit]

        return {
            "decks": page,
            "total": total,
            "limit": limit,
            "offset": offset,
            "inventoryMode": cast(DeckDiscoveryInventoryMode, inventory_mode),
            "sort": cast(DeckDiscoverySort, sort),
            "assembledDeckCount": assembled_deck_count,
            "valuationAvailable": valuation_available,
            "evaluatedAt": iso_timestamp(as_of),
            "availableFormats": list(MTG_FORMATS),
            "sources": sources,
        }

    async def copy_reference_deck(
        self, actor: Actor, reference_deck_id: str
    ) -> DeckDiscoveryCopyResult:
        identifier = assert_uuid(reference_deck_id, "referenceDeckId")
        async with transaction(self.pool) as tx:
            account = await authorize_write(tx, self.auth, actor)
            joined_rows = await rows(
                tx,
                """
                SELECT
                    d.id::text AS id,
                    d.source,
                    d.name,
                    d.format,
                    d.archetype,
                    d.source_url,
                    c.oracle_id::text AS oracle_id,
                    c.role,
                    c.quantity,
                    c.card_name
                FROM reference_decks d
                LEFT JOIN reference_deck_cards c ON c.reference_deck_id = d.id
                WHERE d.id = %s::uuid
                ORDER BY c.role, c.card_name, c.oracle_id
                """,
                (identifier,),
            )
            if not joined_rows:
                raise DeckNotFoundError()

            ref_deck = joined_rows[0]
            ref_cards = [row for row in joined_rows if row["oracle_id"] is not None]
            oracle_ids = list(dict.fromkeys(cast(str, row["oracle_id"]) for row in ref_cards))
            reps = await _load_representative_printings(tx, oracle_ids)
            if any(oid not in reps for oid in oracle_ids):
                raise ValidationError("Reference deck cards are unavailable in the active catalog")

            now = datetime.now(UTC)
            deck_id = str(uuid4())
            created = await first(
                tx,
                """
                INSERT INTO decks(id, account_id, game, name, description, format, assembled)
                VALUES(%s::uuid, %s, 'mtg', %s, %s, %s, false)
                RETURNING *
                """,
                (
                    deck_id,
                    account,
                    cast(str, ref_deck["name"])[:200],
                    _build_copy_description(
                        cast(str, ref_deck["source"]),
                        cast(str | None, ref_deck["archetype"]),
                        cast(str | None, ref_deck["source_url"]),
                    ),
                    _format_label(cast(str, ref_deck["format"])),
                ),
            )

            copied_cards = 0
            for card in ref_cards:
                oid = cast(str, card["oracle_id"])
                qty = cast(int, card["quantity"])
                role = cast(str, card["role"])
                rep = reps[oid]
                await tx.execute(
                    """
                    INSERT INTO deck_cards(
                        id, account_id, deck_id, game, catalog_card_id, canonical_card_id,
                        name, set_code, image_uri, quantity, role, created_at, updated_at
                    )
                    VALUES(%s::uuid, %s, %s::uuid, 'mtg', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(deck_id, catalog_card_id, role) DO UPDATE SET
                        quantity = deck_cards.quantity + EXCLUDED.quantity,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        str(uuid4()),
                        account,
                        deck_id,
                        cast(str, rep["printing_id"]),
                        oid,
                        cast(str, rep["name"] or card["card_name"]),
                        cast(str, rep["set_code"] or ""),
                        cast(str | None, rep["image_uri"]),
                        qty,
                        role,
                        now,
                        now,
                    ),
                )
                copied_cards += qty

            await save_tokens(
                tx, deck_id, await calculate_tokens(tx, await read_cards(tx, account, deck_id))
            )
            await advance_deck_library_revision(tx, account)
            return {
                "deck": deck_dto(created),
                "copiedCards": copied_cards,
                "skippedCards": 0,
            }
