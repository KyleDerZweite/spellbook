"""Transaction-bound direct Token references from one active Catalog generation."""

from typing import Any
from uuid import UUID

from spellbook_core.db import Transaction

type TokenFacts = dict[str, Any]

_TOKEN_FIELDS = (
    "catalogCardId",
    "canonicalCardId",
    "name",
    "layout",
    "setCode",
    "collectorNumber",
)
_FACE_FIELDS = (
    "name",
    "typeLine",
    "colors",
    "oracleText",
    "power",
    "toughness",
    "imageUri",
    "imageUriSmall",
)


def token_facts_dto(value: object) -> TokenFacts | None:
    """Absent legacy or malformed evidence cannot establish an empty reference list."""
    if not isinstance(value, dict):
        return None
    items, unresolved = value.get("items"), value.get("unresolved")
    if not isinstance(items, list) or not isinstance(unresolved, list):
        return None
    try:
        projected = []
        for token in items:
            faces = token["faces"]
            if not isinstance(token, dict) or not isinstance(faces, list) or not faces:
                return None
            projected.append(
                {
                    **{field: token[field] for field in _TOKEN_FIELDS},
                    "faces": [{field: face[field] for field in _FACE_FIELDS} for face in faces],
                }
            )
        missing = [
            {"catalogCardId": token["catalogCardId"], "name": token["name"]}
            for token in unresolved
        ]
    except TypeError, KeyError:
        return None
    return {"items": projected, "unresolved": missing}


async def read_transaction_token_facts(
    tx: Transaction, printing_ids: list[str]
) -> dict[str, TokenFacts]:
    aliases: dict[str, str] = {}
    for printing in printing_ids:
        try:
            aliases[printing] = str(UUID(printing))
        except ValueError, AttributeError:
            continue
    ids = sorted(set(aliases.values()))
    facts: dict[str, TokenFacts] = {}
    for offset in range(0, len(ids), 500):
        cursor = await tx.execute(
            "SELECT p.id::text AS id,p.document->'related_tokens' AS tokens "
            "FROM catalog_state s JOIN catalog_printings p "
            "ON p.generation_id=s.active_generation WHERE s.id=1 AND p.id=ANY(%s::uuid[])",
            (ids[offset : offset + 500],),
        )
        for printing_id, metadata in await cursor.fetchall():
            projected = token_facts_dto(metadata)
            if projected is not None and isinstance(printing_id, str):
                facts[printing_id] = projected
    return {
        original: facts[normalized]
        for original, normalized in aliases.items()
        if normalized in facts
    }
