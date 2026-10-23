"""Deck snapshots retain one read-only repeatable-read ownership/value snapshot."""

import asyncio
from datetime import datetime

from spellbook_core.auth import SessionAuth
from spellbook_core.catalog import Catalog
from spellbook_core.db import ConnectionPool, Transaction, iso_timestamp, transaction
from spellbook_core.errors import DeckNotFoundError, ValidationError
from spellbook_core.inventory_value import estimate_holdings, pair_key
from spellbook_core.models import Actor, CardDocument
from spellbook_core.validation import assert_uuid, utf16_length
from spellbook_core.valuation import PriceReadUnavailable, Valuation

from .common import aggregate_quantity, deck_dto, first, game, read_cards, require_deck, rows
from .models import DeckCard, DeckLegality, DeckSnapshot, Document, OwnedPrinting
from .rules import (
    allocate_deck_availability,
    canonical_quantities,
    format_arena_decklist,
    legality_warnings,
)


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
        GROUP BY catalog_card_id,canonical_card_id""",
            (account, canonical_ids),
        )
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
                "SELECT * FROM decks WHERE account_id=%s AND game=%s"
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
            printings = await owned(
                tx, account, list(dict.fromkeys(c["canonicalCardId"] for c in cards))
            )
            allocations = allocate_deck_availability(cards, printings)
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
            return DeckSnapshot(
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
                for key in ("required", "exact", "alternate", "missing")
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

    async def export_decklist(self, actor: Actor, deck_id: str) -> str:
        cards = await self.get_deck_cards_for_deck(actor, deck_id)
        try:
            documents = await self._resolve(cards)
        except Exception:
            documents = {}
        return format_arena_decklist(cards, documents)
