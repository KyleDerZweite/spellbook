"""Concrete Deck application, including idempotent Catalog-resolved text imports."""

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, transaction
from spellbook_core.errors import RequestConflictError, ValidationError
from spellbook_core.fingerprint import mutation_fingerprint
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import Catalog
from spellbook_core.mtg.decks.common import (
    card_identity,
    first,
    game,
    read_acknowledgement,
    require_deck,
    text,
)
from spellbook_core.mtg.decks.library import DeckLibrary
from spellbook_core.mtg.decks.models import DeckAcknowledgement, Document
from spellbook_core.mtg.decks.mutation import DeckMutations
from spellbook_core.mtg.decks.read import DeckReads
from spellbook_core.mtg.decks.rules import legality_warnings
from spellbook_core.mtg.inventory_import import ImportPreview, preview_inventory_import
from spellbook_core.mtg.valuation import Valuation, create_valuation
from spellbook_core.validation import (
    DECK_ROLES,
    DECK_SOURCES,
    MISSING,
    assert_request_id,
    js_trim,
    normalize_source,
    utf16_length,
)


class Decks(DeckReads, DeckLibrary, DeckMutations):
    def __init__(
        self, pool: ConnectionPool, catalog: Catalog, auth: SessionAuth, valuation: Valuation
    ):
        self.pool, self.catalog, self.auth, self.valuation = pool, catalog, auth, valuation

    async def preview_mtg_import(
        self, actor: Actor, value: str, format: str = ""
    ) -> ImportPreview:
        await self.auth.require_actor(actor)
        if not isinstance(value, str) or not js_trim(value) or utf16_length(value) > 100000:
            raise ValidationError("Paste a decklist of up to 100,000 characters.")
        result = await preview_inventory_import(self.catalog, value)
        result["warnings"] = legality_warnings(
            [(r["line"]["quantity"], r["line"]["role"], r["card"]) for r in result["resolved"]],
            format,
        )
        return result

    async def _replay_intent(
        self, actor: Actor, request_id: str, intent: Document
    ) -> DeckAcknowledgement | None:
        account = (await self.auth.require_actor(actor)).account_id
        assert_request_id(request_id)
        async with transaction(self.pool, read_only=True) as tx:
            previous = await first(
                tx,
                (
                    "SELECT request_hash,acknowledgement FROM deck_mutation_requests WHERE "
                    "account_id=%s AND request_id=%s LIMIT 1"
                ),
                (account, request_id),
            )
            if not previous:
                return None
            if previous["request_hash"] != mutation_fingerprint(intent):
                raise RequestConflictError()
            return read_acknowledgement(
                previous["acknowledgement"], request_id, intent.get("deckId")
            )

    @staticmethod
    def _import_operations(preview: ImportPreview) -> list[Document]:
        return [
            dict(
                op="add",
                card=card_identity(r["card"]),
                quantity=r["line"]["quantity"],
                role=r["line"]["role"],
            )
            for r in preview["resolved"]
            if r["line"]["role"] in DECK_ROLES
        ]

    @staticmethod
    def _create_input(input: Document) -> Document:
        return dict(
            name=text(input.get("name"), "name", 200),
            description=text(input.get("description"), "description", 4000, ""),
            format=text(input.get("format"), "format", 100, "Commander"),
        )

    async def import_deck(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        await self.auth.require_actor(actor)
        create = self._create_input(input)
        operations = input.get("operations")
        if not isinstance(operations, list) or any(
            not isinstance(o, dict) or o.get("op") != "add" for o in operations
        ):
            raise ValidationError("Deck import accepts only add operations")
        return await self._mutation(actor, {**input, "deckId": ""}, create=create)

    async def import_text_deck(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        await self.auth.require_actor(actor)
        game(input["game"])
        create = self._create_input(input)
        normalized = dict(
            kind="deck.text.import",
            **create,
            text=text(input.get("text"), "text", 100000),
            source=normalize_source(input.get("source", MISSING), DECK_SOURCES, "import"),
            game="mtg",
        )
        previous = await self._replay_intent(actor, input["requestId"], normalized)
        if previous is not None:
            return previous
        preview = await self.preview_mtg_import(actor, normalized["text"], create["format"])
        return await self._mutation(
            actor,
            dict(
                deckId="",
                requestId=input["requestId"],
                source=normalized["source"],
                game="mtg",
                operations=self._import_operations(preview),
            ),
            create=create,
            intent=normalized,
        )

    async def import_into_deck(self, actor: Actor, input: Document) -> DeckAcknowledgement:
        account = (await self.auth.require_actor(actor)).account_id
        normalized = dict(
            kind="deck.text",
            deckId=input["deckId"].lower(),
            text=text(input.get("text"), "text", 100000),
        )
        previous = await self._replay_intent(actor, input["requestId"], normalized)
        if previous is not None:
            return previous
        async with transaction(self.pool, read_only=True) as tx:
            deck = await require_deck(tx, account, input["deckId"])
        preview = await self.preview_mtg_import(actor, normalized["text"], deck["format"])
        return await self._mutation(
            actor,
            dict(
                deckId=str(deck["id"]),
                requestId=input["requestId"],
                source="import",
                game="mtg",
                operations=self._import_operations(preview),
            ),
            intent=normalized,
        )


def create_decks(
    pool: ConnectionPool, catalog: Catalog, auth: SessionAuth, valuation: Valuation | None = None
) -> Decks:
    """Resource-free factory; the assembler owns pool, Catalog, authority and Valuation."""
    return Decks(
        pool, catalog, auth, valuation if valuation is not None else create_valuation(pool, auth)
    )
