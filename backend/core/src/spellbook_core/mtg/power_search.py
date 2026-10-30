"""Bounded global matching with independent public and account-owned sources."""

import re
from typing import TypedDict

from spellbook_core.auth import SessionAuth
from spellbook_core.db import ConnectionPool, database_integer, transaction
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor


class PowerSearchResponse(TypedDict):
    query: str
    accountId: str | None
    generationId: str | None
    cards: list[dict[str, object]]
    inventory: list[dict[str, object]]
    decks: list[dict[str, object]]


def query_parameters(query: str) -> tuple[str, str, str, bool]:
    if len(query.encode("utf-16-le", errors="surrogatepass")) // 2 > 300 or "\x00" in query:
        raise ValidationError("query must contain at most 300 UTF-16 units and no NUL")
    normalized = query.strip().lower()
    tokens = re.findall(r"[^\W_]+", normalized, re.UNICODE)
    # Only extracted alphanumeric tokens enter tsquery grammar, never user operators.
    prefix = " & ".join("'" + token + "'" + (":*" if token.isalpha() else "") for token in tokens)
    joined = "".join(tokens)
    fuzzy = (
        len(joined) >= 3
        and any(c.isalpha() for c in joined)
        and not any(token.isdecimal() for token in tokens)
    )
    return normalized, prefix, joined, fuzzy


# Parameters are data. strpos avoids LIKE wildcard semantics for literal input.
_PARAMETERS = (
    "WITH q AS (SELECT %s::text term, to_tsquery('simple',%s) prefix, "
    "%s::text joined, %s::boolean fuzzy), "
)


def _rank(name: str, vector: str) -> str:
    return (
        f"CASE WHEN lower({name})=q.term THEN 0 "
        f"WHEN starts_with(lower({name}),q.term) THEN 1 "
        f"WHEN to_tsvector('simple',{name}) @@ q.prefix THEN 2 "
        f"WHEN q.joined<>'' AND "
        f"regexp_replace(lower({name}),'[^[:alnum:]]','','g')=q.joined THEN 3 "
        f"WHEN strpos(lower({name}),q.term)>0 THEN 4 "
        f"WHEN q.fuzzy AND lower({name}) %% q.term THEN 5 "
        f"WHEN {vector} @@ q.prefix THEN 6 ELSE 7 END"
    )


class PowerSearch:
    def __init__(self, pool: ConnectionPool, auth: SessionAuth) -> None:
        self._pool, self._auth = pool, auth

    async def search(self, query: str, actor: Actor | None = None) -> PowerSearchResponse:
        parameters = query_parameters(query)
        async with transaction(self._pool, read_only=True, repeatable_read=True) as tx:
            user = await self._auth.require_actor(actor, tx) if actor is not None else None
            row = await (
                await tx.execute("SELECT active_generation::text FROM catalog_state WHERE id=1")
            ).fetchone()
            generation = str(row[0]) if row and row[0] is not None else None
            result: PowerSearchResponse = {
                "query": query,
                "accountId": user.account_id if user else None,
                "generationId": generation,
                "cards": [],
                "inventory": [],
                "decks": [],
            }
            if not parameters[0]:
                return result
            rank = (
                "LEAST("
                + _rank("name", "search_vector")
                + ","
                + _rank("search_name", "search_vector")
                + ")"
            )
            cursor = await tx.execute(
                _PARAMETERS
                + "matched AS MATERIALIZED (SELECT oracle_id,id,name,lang,"
                + rank
                + " rank, greatest(similarity(search_name,q.term),"
                "ts_rank_cd(search_vector,q.prefix)) quality "
                "FROM catalog_printings CROSS JOIN q WHERE generation_id=%s AND "
                "(search_vector @@ q.prefix OR search_name LIKE %s "
                "OR (q.fuzzy AND search_name %% q.term))), "
                # Do not fill an exact/name-completion result with unrelated typo hits.
                "canonical AS (SELECT DISTINCT ON (oracle_id) * FROM matched WHERE rank<7 "
                "AND (rank=0 OR NOT EXISTS(SELECT 1 FROM matched WHERE rank=0)) "
                "AND (rank<>5 OR NOT EXISTS(SELECT 1 FROM matched WHERE rank<5)) "
                "ORDER BY oracle_id,rank,quality DESC,(lang='en') DESC,id) "
                "SELECT oracle_id::text,id::text,name FROM canonical "
                "ORDER BY rank,quality DESC,name,oracle_id "
                "LIMIT 5",
                (
                    *parameters,
                    generation,
                    "%" + re.sub(r"([\\%_])", r"\\\1", parameters[0]) + "%",
                ),
            )
            result["cards"] = [
                dict(
                    kind="catalog",
                    canonicalCardId=str(r[0]),
                    catalogCardId=str(r[1]),
                    name=str(r[2]),
                )
                for r in await cursor.fetchall()
            ]
            if user is None:
                return result
            # Private aliases use the complete generation, independently of public LIMIT.
            for source in ("inventory", "deck-card"):
                table = (
                    "inventory_cards c"
                    if source == "inventory"
                    else (
                        "deck_cards c JOIN decks d ON d.id=c.deck_id "
                        "AND d.account_id=c.account_id AND d.game=c.game"
                    )
                )
                columns = "" if source == "inventory" else "c.deck_id,d.name deck_name,"
                grouping = "" if source == "inventory" else "deck_id,deck_name,"
                rank = _rank("c.name", "to_tsvector('simple',c.name)")
                cursor = await tx.execute(
                    _PARAMETERS
                    + "matched AS MATERIALIZED (SELECT "
                    + columns
                    + "c.canonical_card_id,c.name,c.quantity,"
                    + rank
                    + " rank, "
                    "EXISTS(SELECT 1 FROM catalog_printings p WHERE p.generation_id=%s "
                    "AND p.oracle_id=CASE WHEN pg_input_is_valid(c.canonical_card_id,'uuid') "
                    "THEN c.canonical_card_id::uuid END AND ("
                    + _rank("p.search_name", "p.search_vector")
                    + ")<7) alias_match "
                    "FROM " + table + " CROSS JOIN q WHERE c.account_id=%s AND c.game='mtg'), "
                    "grouped AS (SELECT "
                    + grouping
                    + "canonical_card_id,min(name) name,sum(quantity)::text quantity,"
                    "min(rank) rank,"
                    "bool_or(alias_match) alias_match FROM matched GROUP BY "
                    + grouping
                    + "canonical_card_id) SELECT "
                    + grouping
                    + "canonical_card_id::text,name,quantity FROM grouped "
                    "WHERE rank<7 OR alias_match ORDER BY rank,name,"
                    + grouping
                    + "canonical_card_id LIMIT 5",
                    (*parameters, generation, user.account_id),
                )
                for r in await cursor.fetchall():
                    offset = 0 if source == "inventory" else 2
                    hit: dict[str, object] = dict(
                        kind=source,
                        canonicalCardId=str(r[offset]),
                        name=str(r[offset + 1]),
                        quantity=database_integer(r[offset + 2]),
                    )
                    if source == "deck-card":
                        hit.update(deckId=str(r[0]), deckName=str(r[1]))
                    result["inventory" if source == "inventory" else "decks"].append(hit)
            rank = _rank("name", "to_tsvector('simple',name)")
            cursor = await tx.execute(
                _PARAMETERS
                + "matched AS MATERIALIZED (SELECT id,name,format,"
                + rank
                + " rank FROM decks CROSS JOIN q WHERE account_id=%s AND game='mtg') "
                "SELECT id::text,name,format FROM matched WHERE rank<7 "
                "ORDER BY rank,name,id LIMIT 5",
                (*parameters, user.account_id),
            )
            deck_names: list[dict[str, object]] = [
                dict(kind="deck", deckId=str(r[0]), name=str(r[1]), format=str(r[2]))
                for r in await cursor.fetchall()
            ]
            result["decks"] = deck_names + result["decks"]
            return result


def create_power_search(pool: ConnectionPool, auth: SessionAuth) -> PowerSearch:
    return PowerSearch(pool, auth)
