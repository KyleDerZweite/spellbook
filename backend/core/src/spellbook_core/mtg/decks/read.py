"""Deck snapshots retain one read-only repeatable-read ownership/value snapshot."""

import asyncio
from collections.abc import Sequence
from datetime import datetime
from typing import Literal, cast

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, Transaction, iso_timestamp, transaction
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks.common import (
    aggregate_quantity,
    card_dto,
    deck_dto,
    first,
    game,
    read_cards,
    require_deck,
    rows,
)
from spellbook_core.mtg.decks.exchange import export_deck
from spellbook_core.mtg.decks.missing import (
    MAX_MISSING_EXPORT_DECKS,
    MissingCardsExport,
    MissingDeckSummary,
    MissingExportMode,
    build_missing_cards_export,
)
from spellbook_core.mtg.decks.models import (
    AssembledDeckRequirement,
    DeckCard,
    DeckLegality,
    DeckSnapshot,
    Document,
    OwnedPrinting,
)
from spellbook_core.mtg.decks.rules import (
    allocate_deck_availability,
    canonical_quantities,
    legality_warnings,
)
from spellbook_core.mtg.decks.tokens import calculate_tokens, token_snapshot
from spellbook_core.mtg.errors import CatalogPrintingNotFoundError, DeckNotFoundError
from spellbook_core.mtg.inventory_value import estimate_holdings, pair_key
from spellbook_core.mtg.models import CardDocument
from spellbook_core.mtg.valuation import PriceReadUnavailable, Valuation
from spellbook_core.validation import assert_uuid, utf16_length


async def owned(tx: Transaction, account: str, canonical_ids: list[str]) -> list[OwnedPrinting]:
    if not canonical_ids:
        return []
    return [
        OwnedPrinting(
            catalogCardId=row["catalog_card_id"],
            canonicalCardId=row["canonical_card_id"],
            quantity=aggregate_quantity(row["quantity"]),
        )
        for row in await rows(
            tx,
            """SELECT catalog_card_id,canonical_card_id,sum(quantity)::text AS quantity
        FROM inventory_cards WHERE account_id=%s AND game='mtg' AND
            canonical_card_id=ANY(%s::text[])
        GROUP BY catalog_card_id,canonical_card_id ORDER BY catalog_card_id,canonical_card_id""",
            (account, canonical_ids),
        )
    ]


async def assembled_requirements(
    tx: Transaction,
    account: str,
    canonical_ids: list[str],
    *,
    exclude_deck_id: str | None = None,
) -> list[AssembledDeckRequirement]:
    if not canonical_ids:
        return []
    sql = (
        "SELECT dc.id,dc.deck_id,d.name AS deck_name,dc.catalog_card_id,"
        "dc.canonical_card_id,dc.quantity "
        "FROM deck_cards dc JOIN decks d "
        "ON d.id=dc.deck_id AND d.account_id=dc.account_id AND d.game=dc.game "
        "WHERE d.account_id=%s AND d.game='mtg' AND d.assembled=true "
        "AND dc.canonical_card_id=ANY(%s::text[])"
    )
    params: tuple[object, ...] = (account, canonical_ids)
    if exclude_deck_id is not None:
        sql += " AND d.id<>%s::uuid"
        params = (account, canonical_ids, exclude_deck_id)
    sql += " ORDER BY dc.id"
    return [
        AssembledDeckRequirement(
            id=str(row["id"]),
            deckId=str(row["deck_id"]),
            deckName=row["deck_name"],
            catalogCardId=row["catalog_card_id"],
            canonicalCardId=row["canonical_card_id"],
            quantity=row["quantity"],
        )
        for row in await rows(tx, sql, params)
    ]


async def deck_value_estimates(
    tx: Transaction,
    valuation: Valuation,
    cards: list[DeckCard],
    allocations: Document,
    as_of: datetime,
) -> Document:
    holdings = [
        dict(printing_id=c["catalogCardId"], finish="nonfoil", quantity=c["quantity"])
        for c in cards
    ]
    pairs = list(
        {
            c["catalogCardId"]: dict(printingId=c["catalogCardId"], finish="nonfoil")
            for c in cards
        }.values()
    )
    references: dict[tuple[str, str], Document] = {}
    for offset in range(0, len(pairs), 100):
        # Freeze owns complete, matching outcomes and checks all selected identities.
        frozen = await valuation.freeze_in_transaction(tx, pairs[offset : offset + 100], as_of)
        references.update((pair_key(r), r) for r in frozen["response"]["results"])
    return dict(
        evaluatedAt=iso_timestamp(as_of),
        required=estimate_holdings(holdings, references),
        missing=estimate_holdings(
            [
                {**h, "quantity": allocations[cards[i]["id"]]["missing"]}
                for i, h in enumerate(holdings)
            ],
            references,
        ),
    )


class DeckReads:
    pool: ConnectionPool
    auth: SessionAuth
    catalog: Catalog
    valuation: Valuation

    async def get_deck_snapshot(
        self,
        actor: Actor,
        requested_game: str = "mtg",
        selected_deck_id: str | None = None,
        *,
        independent: bool = False,
    ) -> DeckSnapshot:
        account = (await self.auth.require_actor(actor)).account_id
        game(requested_game)
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            clock = await first(tx, "SELECT statement_timestamp() AS as_of")
            user_decks = await rows(
                tx,
                "SELECT id,account_id,game,name,description,format,assembled,auto_refresh_tokens,"
                "description_revision,composition_revision,created_at,updated_at "
                "FROM decks WHERE account_id=%s AND game=%s"
                + (" AND id=%s::uuid" if independent and selected_deck_id else "")
                + " ORDER BY updated_at DESC,name",
                (account, requested_game, selected_deck_id)
                if independent and selected_deck_id
                else (account, requested_game),
            )
            if selected_deck_id and not any(str(d["id"]) == selected_deck_id for d in user_decks):
                raise DeckNotFoundError()
            summaries = await rows(
                tx,
                """SELECT e.deck_id::text,sum(e.quantity)::text AS quantity,
            (array_agg(e.image_uri ORDER BY CASE WHEN e.role='commander' THEN 0 ELSE 1
            END,e.name,e.id))[1] AS image_uri
            FROM deck_cards e JOIN decks d ON e.deck_id=d.id
            WHERE e.account_id=%s AND d.account_id=%s AND e.game='mtg'"""
                + (" AND e.deck_id=%s::uuid" if independent and selected_deck_id else "")
                + " GROUP BY e.deck_id",
                (account, account, selected_deck_id)
                if independent and selected_deck_id
                else (account, account),
            )
            cards = await read_cards(tx, account, selected_deck_id) if selected_deck_id else []
            canonical_ids = list(dict.fromkeys(c["canonicalCardId"] for c in cards))
            printings = await owned(tx, account, canonical_ids)
            selected_assembled = any(
                str(d["id"]) == selected_deck_id and bool(d.get("assembled", False))
                for d in user_decks
            )
            other_assembled = (
                await assembled_requirements(
                    tx, account, canonical_ids, exclude_deck_id=selected_deck_id
                )
                if selected_deck_id and canonical_ids
                else []
            )
            allocations = allocate_deck_availability(
                cards,
                printings,
                other_assembled=other_assembled,
                assembled=selected_assembled,
            )
            estimates = None
            failure = None
            if selected_deck_id:
                await tx.execute("SAVEPOINT deck_value_summary")
                try:
                    estimates = await deck_value_estimates(
                        tx, self.valuation, cards, dict(allocations), clock["as_of"]
                    )
                except Exception:
                    await tx.execute("ROLLBACK TO SAVEPOINT deck_value_summary")
                    error = PriceReadUnavailable()
                    failure = dict(kind=error.kind, message=str(error))
                await tx.execute("RELEASE SAVEPOINT deck_value_summary")
            persisted = (
                await first(
                    tx, "SELECT deck_tokens FROM decks WHERE id=%s::uuid", (selected_deck_id,)
                )
                if selected_deck_id
                else {}
            )
            tokens = persisted.get("deck_tokens")
            return DeckSnapshot(
                relatedTokens=token_snapshot(
                    tokens if tokens is not None else await calculate_tokens(tx, cards)
                ),
                decks=[deck_dto(d) for d in user_decks],
                deckTotals={s["deck_id"]: aggregate_quantity(s["quantity"]) for s in summaries},
                deckCovers={s["deck_id"]: dict(imageUri=s["image_uri"]) for s in summaries},
                deckCards=cards,
                availability=allocations,
                valueEstimates=estimates,
                valuationError=failure,
                ownedByCanonical=canonical_quantities(printings),
                ownedPrintings=printings,
            )

    async def get_deck(self, actor: Actor, deck_id: str) -> DeckSnapshot:
        return await self.get_deck_snapshot(
            actor, "mtg", assert_uuid(deck_id, "deckId"), independent=True
        )

    async def get_deck_cards_for_deck(self, actor: Actor, deck_id: str) -> list[DeckCard]:
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool, read_only=True) as tx:
            return await read_cards(tx, account, deck_id)

    async def availability(self, actor: Actor, deck_id: str) -> Document:
        snapshot = await self.get_deck_snapshot(actor, "mtg", deck_id, independent=True)
        entries = [
            dict(entryId=c["id"], required=c["quantity"], **snapshot["availability"][c["id"]])
            for c in snapshot["deckCards"]
        ]
        return dict(
            deckId=deck_id,
            entries=entries,
            totals={
                key: sum(e[key] for e in entries)
                for key in (
                    "required",
                    "exact",
                    "alternate",
                    "missing",
                    "free",
                    "inOtherDecks",
                    "conflict",
                )
            },
        )

    async def ownership(self, actor: Actor, canonical_ids: list[str]) -> list[OwnedPrinting]:
        account = (await self.auth.require_actor(actor)).account_id
        if (
            not isinstance(canonical_ids, list)
            or len(canonical_ids) > 100
            or any(not isinstance(c, str) or utf16_length(c) > 100 for c in canonical_ids)
        ):
            raise ValidationError("Invalid canonical IDs")
        async with transaction(self.pool, read_only=True) as tx:
            result = await owned(tx, account, canonical_ids)
            canonical_quantities(result)
            return result

    async def search(self, actor: Actor, query: str) -> Document:
        await self.auth.require_actor(actor)
        result = await self.catalog.search_catalog(query)
        hits = result["hits"]
        if not isinstance(hits, list):
            raise TypeError("Catalog search hits must be an array")
        printings = await self.ownership(actor, list(dict.fromkeys(c["oracle_id"] for c in hits)))
        return {
            **result,
            "ownedPrintings": printings,
            "ownedByCanonical": canonical_quantities(printings),
        }

    async def _resolve(self, cards: list[DeckCard]) -> dict[str, CardDocument]:
        ids = list(dict.fromkeys(c["catalogCardId"] for c in cards))
        result: dict[str, CardDocument] = {}
        for offset in range(0, len(ids), 8):
            documents = await asyncio.gather(
                *(self.catalog.get_catalog_printing(i) for i in ids[offset : offset + 8])
            )
            result.update((c["id"], c) for c in documents)
        return result

    async def get_deck_legality(self, actor: Actor, deck_id: str) -> DeckLegality:
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool, read_only=True) as tx:
            deck = await require_deck(tx, account, deck_id)
            cards = await read_cards(tx, account, deck_id)
        documents = await self._resolve(cards)
        return DeckLegality(
            warnings=legality_warnings(
                [(c["quantity"], c["role"], documents[c["catalogCardId"]]) for c in cards],
                deck["format"],
            ),
            deckDocuments=documents,
        )

    async def export_decklist(self, actor: Actor, deck_id: str, format: str = "arena") -> str:
        if format not in ("arena", "dec", "dck", "simple", "csv", "json"):
            raise ValidationError("Unsupported Deck export format")
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            deck = await require_deck(tx, account, deck_id)
            cards = await read_cards(tx, account, deck_id)
        documents = await self._resolve(cards) if format in ("arena", "dck") else {}
        return export_deck(
            deck,
            cards,
            documents,
            cast(Literal["arena", "dec", "dck", "simple", "csv", "json"], format),
        )

    async def _resolve_best_effort(self, cards: Sequence[DeckCard]) -> dict[str, CardDocument]:
        ids = list(dict.fromkeys(c["catalogCardId"] for c in cards))
        result: dict[str, CardDocument] = {}

        async def fetch(printing_id: str) -> CardDocument | None:
            try:
                return await self.catalog.get_catalog_printing(printing_id)
            except CatalogPrintingNotFoundError:
                return None

        for offset in range(0, len(ids), 8):
            documents = await asyncio.gather(*(fetch(i) for i in ids[offset : offset + 8]))
            for document in documents:
                if document is not None:
                    result[document["id"]] = document
        return result

    async def export_missing_cards(
        self,
        actor: Actor,
        deck_ids: Sequence[str],
        *,
        mode: str = "sum",
        include_printing: bool = False,
    ) -> MissingCardsExport:
        if mode not in ("sum", "max"):
            raise ValidationError("mode must be 'sum' or 'max'")
        if not isinstance(include_printing, bool):
            raise ValidationError("includePrinting must be a boolean")
        if not isinstance(deck_ids, Sequence) or isinstance(deck_ids, str | bytes) or not deck_ids:
            raise ValidationError("Select at least one Deck to export missing cards.")
        normalized_ids = list(dict.fromkeys(assert_uuid(value, "deckIds") for value in deck_ids))
        if len(normalized_ids) > MAX_MISSING_EXPORT_DECKS:
            raise ValidationError(
                f"Missing-cards export supports at most {MAX_MISSING_EXPORT_DECKS} Decks."
            )
        account = (await self.auth.require_actor(actor)).account_id
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            clock = await first(tx, "SELECT statement_timestamp() AS as_of")
            deck_rows = await rows(
                tx,
                (
                    "SELECT id::text, name FROM decks "
                    "WHERE account_id=%s AND game='mtg' AND id=ANY(%s::uuid[])"
                ),
                (account, normalized_ids),
            )
            decks_by_id = {row["id"].lower(): row["name"] for row in deck_rows}
            if len(decks_by_id) != len(normalized_ids):
                raise DeckNotFoundError()
            ordered_decks = [
                MissingDeckSummary(id=deck_id, name=decks_by_id[deck_id])
                for deck_id in normalized_ids
            ]
            card_rows = await rows(
                tx,
                (
                    "SELECT * FROM deck_cards "
                    "WHERE account_id=%s AND game='mtg' AND deck_id=ANY(%s::uuid[]) "
                    "ORDER BY deck_id, role, name, id"
                ),
                (account, normalized_ids),
            )
            cards_by_deck_id: dict[str, list[DeckCard]] = {
                deck_id: [] for deck_id in normalized_ids
            }
            all_cards: list[DeckCard] = []
            for row in card_rows:
                card = card_dto(row)
                cards_by_deck_id[card["deckId"].lower()].append(card)
                all_cards.append(card)
            owned_printings = await owned(
                tx, account, list(dict.fromkeys(c["canonicalCardId"] for c in all_cards))
            )
            deck_cards_by_deck = [cards_by_deck_id[deck_id] for deck_id in normalized_ids]
            # Collect candidate printings that have missing copies to keep valuation reads bounded.
            missing_printing_ids: list[str] = []
            seen_printings: set[str] = set()
            if all_cards:
                if mode == "sum":
                    allocs = allocate_deck_availability(all_cards, owned_printings)
                    for card in all_cards:
                        if (
                            allocs[card["id"]]["missing"] > 0
                            and card["catalogCardId"] not in seen_printings
                        ):
                            seen_printings.add(card["catalogCardId"])
                            missing_printing_ids.append(card["catalogCardId"])
                else:
                    for cards in deck_cards_by_deck:
                        allocs = allocate_deck_availability(cards, owned_printings)
                        for card in cards:
                            if (
                                allocs[card["id"]]["missing"] > 0
                                and card["catalogCardId"] not in seen_printings
                            ):
                                seen_printings.add(card["catalogCardId"])
                                missing_printing_ids.append(card["catalogCardId"])
            price_references: dict[tuple[str, str], Document] = {}
            if missing_printing_ids:
                pairs = [
                    dict(printingId=printing_id, finish="nonfoil")
                    for printing_id in missing_printing_ids
                ]
                await tx.execute("SAVEPOINT missing_cards_prices")
                try:
                    for offset in range(0, len(pairs), 100):
                        frozen = await self.valuation.freeze_in_transaction(
                            tx, pairs[offset : offset + 100], clock["as_of"]
                        )
                        price_references.update(
                            (pair_key(r), r) for r in frozen["response"]["results"]
                        )
                except Exception:
                    await tx.execute("ROLLBACK TO SAVEPOINT missing_cards_prices")
                    price_references = {}
                await tx.execute("RELEASE SAVEPOINT missing_cards_prices")
        missing_cards_for_catalog = [
            card for card in all_cards if card["catalogCardId"] in seen_printings
        ]
        documents = (
            await self._resolve_best_effort(missing_cards_for_catalog)
            if missing_cards_for_catalog
            else {}
        )
        return build_missing_cards_export(
            ordered_decks,
            deck_cards_by_deck,
            owned_printings,
            mode=cast(MissingExportMode, mode),
            include_printing=include_printing,
            documents=documents,
            price_references=price_references,
        )
