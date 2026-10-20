"""Bounded active-generation Catalog lookup and the Node public projection."""

import re
from typing import cast

from .db import ConnectionPool, Transaction, transaction
from .errors import CatalogPrintingNotFoundError, ValidationError
from .models import CardDocument

_FIELDS = (
    "id",
    "game",
    "oracle_id",
    "name",
    "printed_name",
    "normalized_name",
    "lang",
    "released_at",
    "layout",
    "mana_cost",
    "cmc",
    "type_line",
    "oracle_text",
    "colors",
    "color_identity",
    "keywords",
    "card_types",
    "power",
    "toughness",
    "rarity",
    "set_code",
    "set_name",
    "collector_number",
    "image_uri",
    "image_uri_small",
    "is_foil_available",
    "is_nonfoil_available",
    "legalities",
    "back_face_name",
    "back_face_image_uri",
)


def _uuid(value: str) -> str:
    if not re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", value):
        raise ValidationError("Invalid catalog card ID")
    return value


def printing_dto(document: object) -> CardDocument:
    if not isinstance(document, dict):
        raise TypeError("Stored Catalog document must be an object")
    # Publication owns document validation. Preserve values and optional-field absence;
    # explicit projection prevents internal publication fields escaping the application.
    return cast(CardDocument, {field: document[field] for field in _FIELDS if field in document})


async def read_transaction_catalog_printing(tx: Transaction, printing_id: str) -> CardDocument:
    cursor = await tx.execute(
        "SELECT p.document FROM catalog_printings p "
        "JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id "
        "WHERE p.id=%s::uuid",
        (_uuid(printing_id),),
    )
    row = await cursor.fetchone()
    if not row:
        raise CatalogPrintingNotFoundError()
    return printing_dto(row[0])


class Catalog:
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    async def get_catalog_printing(self, printing_id: str) -> CardDocument:
        identifier = _uuid(printing_id)
        async with transaction(self._pool, read_only=True) as tx:
            return await read_transaction_catalog_printing(tx, identifier)


def create_catalog(pool: ConnectionPool) -> Catalog:
    return Catalog(pool)
