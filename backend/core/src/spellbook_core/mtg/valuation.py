"""Reference selection, immutable evidence and authenticated Inventory price reads."""

import copy
import re
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import TypedDict

from spellbook_core.auth import SessionAuth
from spellbook_core.db import (
    ConnectionPool,
    Transaction,
    database_integer,
    iso_timestamp,
    transaction,
)
from spellbook_core.errors import ValidationError
from spellbook_core.models import Actor
from spellbook_core.mtg.valuation_query import (
    BASELINE_ROWS,
    OPTIONAL_ROWS,
    PUBLIC_HISTORY,
    Document,
    ValuationQuery,
    records,
    valuation_query,
)


class PriceReadUnavailable(Exception):
    kind = "PriceReadUnavailable"

    def __init__(self) -> None:
        super().__init__("Reference prices are temporarily unavailable.")


class InventoryPriceNotFound(Exception):
    kind = "InventoryPriceNotFound"

    def __init__(self) -> None:
        super().__init__("Inventory entry not found.")


class PriceResponse(TypedDict):
    evaluatedAt: str
    publications: list[Document]
    sourceStatuses: list[Document]
    refreshStatus: Document
    results: list[Document]


class FrozenResult(TypedDict):
    response: PriceResponse
    evidence: list[Document]


def price_uuid(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value
    ):
        raise ValidationError("Invalid printing or entry UUID")
    return value.lower()


def request_object(value: object, keys: Sequence[str]) -> Document:
    if not isinstance(value, dict) or set(value) - set(keys):
        raise ValidationError("Unsupported price request fields")
    return value


def price_requests(input: object) -> list[Document]:
    if not isinstance(input, list) or not 1 <= len(input) <= 100:
        raise ValidationError("Supply 1 to 100 price requests")
    result: list[Document] = []
    for item in input:
        value = request_object(item, ["printingId", "finish"])
        if value.get("finish") not in ("nonfoil", "foil"):
            raise ValidationError("Invalid finish")
        result.append(
            {"printingId": price_uuid(value.get("printingId")), "finish": value["finish"]}
        )
    if len({(p["printingId"], p["finish"]) for p in result}) != len(result):
        raise ValidationError("Duplicate price request")
    return result


def decimal_amount(value: object) -> str:
    if (
        not isinstance(value, str)
        or len(value) > 128
        or not re.fullmatch(r"[0-9]+(?:\.[0-9]{1,18})?", value)
    ):
        raise PriceReadUnavailable()
    whole, _, fraction = value.partition(".")
    fraction = fraction.rstrip("0")
    return (whole.lstrip("0") or "0") + ("." + fraction if fraction else "")


def reference_origin(source: str, finish: str, provider_id: object = None) -> Document:
    if source == "Scryfall":
        return {
            "source": source,
            "measure": "prices.eur" if finish == "nonfoil" else "prices.eur_foil",
        }
    valid = isinstance(provider_id, str) and bool(
        re.fullmatch(
            r"[1-9][0-9]{0,18}"
            if source == "Cardmarket"
            else r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",
            provider_id,
        )
    )
    if source not in ("Cardmarket", "MTGJSON") or not valid:
        raise PriceReadUnavailable()
    measure = (
        ("trend" if finish == "nonfoil" else "trend-foil")
        if source == "Cardmarket"
        else (
            "paper.cardmarket.retail.normal"
            if finish == "nonfoil"
            else "paper.cardmarket.retail.foil"
        )
    )
    return {
        "source": source,
        "measure": measure,
        "providerId": provider_id,
        "upstream": "Cardmarket",
    }


def reference_freshness(publication: Document, now: datetime) -> str | None:
    if publication["timePrecision"] == "Day":
        raw = publication["sourceDate"]
        try:
            day = date.fromisoformat(raw)
        except ValueError, TypeError:
            raise PriceReadUnavailable() from None
        if day.isoformat() != raw or day > now.astimezone(UTC).date():
            raise PriceReadUnavailable()
        source = datetime.combine(day, datetime.min.time(), UTC)
    else:
        try:
            source = datetime.fromisoformat(publication["sourceTime"])
        except ValueError, TypeError:
            raise PriceReadUnavailable() from None
        if source.tzinfo is None or source > now + timedelta(minutes=5):
            raise PriceReadUnavailable()
    age = max(timedelta(0), now - source)
    return None if age > timedelta(days=7) else "Fresh" if age <= timedelta(days=1) else "Stale"


def source_status(
    source: str, enabled: bool, health: Document | None, publication_id: object
) -> Document:
    health = health or {}
    status: Document = {
        "source": source,
        "enabled": enabled,
        "kind": "Disabled"
        if not enabled
        else health.get("kind")
        if health.get("kind") in ("Succeeded", "Failed")
        else "NeverAttempted",
    }
    if isinstance(health.get("attemptedAt"), str):
        status["attemptedAt"] = health["attemptedAt"]
    if publication_id:
        status["lastSuccessfulPublicationId"] = str(publication_id)
    return status


_BASE_COLUMNS = (
    "printing_id",
    "identity",
    "links",
    "supported",
    "amount",
    "measure",
    "raw_value",
    "english_printing_id",
    "mapping_reason",
    "english_variant_key",
    "english_identity",
    "english_links",
    "english_amount",
    "english_supported",
    "english_raw_value",
)
_OPTIONAL_COLUMNS = (
    "printing_id",
    "identity",
    "supported",
    "amount",
    "measure",
    "raw_value",
    "provider_id",
    "english_printing_id",
    "mapping_reason",
    "english_variant_key",
    "english_identity",
    "english_amount",
    "english_supported",
    "english_raw_value",
    "english_provider_id",
)


def choose_reference(
    pair: Document,
    row: Document,
    publication: Document | None,
    now: datetime,
    links: list[Document],
) -> tuple[Document, Document | None]:
    def unknown(reason: str) -> tuple[Document, None]:
        return {**pair, "links": links, "kind": "Unknown", "reason": reason}, None

    # Validate all stored amounts before availability/freshness selection.
    exact = decimal_amount(row["amount"]) if row.get("amount") is not None else None
    english = (
        decimal_amount(row["english_amount"]) if row.get("english_amount") is not None else None
    )
    if publication is None:
        return unknown("SourceUnavailable")
    if not row.get("printing_id"):
        return unknown("PrintingMissing")
    if not row.get("supported"):
        return unknown("UnsupportedFinish")
    freshness = reference_freshness(publication, now)
    if freshness is None:
        return unknown("ReferenceExpired")
    fallback = exact is None and bool(
        row.get("english_printing_id") and row.get("english_supported")
    )
    amount = english if fallback else exact
    if amount is None:
        return unknown(
            row.get("mapping_reason") or "AmountMissing"
            if (row.get("identity") or {}).get("lang") != "en"
            else "AmountMissing"
        )
    matched = str(row["english_printing_id"]) if fallback else pair["printingId"]
    origin = reference_origin(
        publication["source"],
        pair["finish"],
        row.get("english_provider_id") if fallback else row.get("provider_id"),
    )
    if row.get("measure") != origin["measure"]:
        raise PriceReadUnavailable()
    reference: Document = {
        **pair,
        **origin,
        "links": links,
        "kind": "Known",
        "amount": amount,
        "currency": "EUR",
        "freshness": freshness,
        "publicationId": publication["id"],
        "observationId": ":".join([publication["id"], matched, pair["finish"], origin["measure"]]),
        "matchedPrintingId": matched,
        "matchedFinish": pair["finish"],
        "provenance": "EnglishFallback" if fallback else "Exact",
        "timePrecision": publication["timePrecision"],
    }
    if publication["timePrecision"] == "Instant":
        reference["sourceTime"] = publication["sourceTime"]
    else:
        reference.update(
            sourceDate=publication["sourceDate"],
            asOf=iso_timestamp(now),
            freshnessPolicy="day-upper-bound-utc-start-v1",
        )
    evidence: Document = {
        "reference": reference,
        "publication": publication,
        "requestedIdentity": row["identity"],
        "matchedIdentity": row["english_identity"] if fallback else row["identity"],
        "mappingVersion": publication["mappingVersion"],
        "rawValue": row.get("english_raw_value") if fallback else row.get("raw_value"),
    }
    return reference, evidence


class Valuation:
    def __init__(
        self,
        pool: ConnectionPool,
        auth: SessionAuth,
        clock: Callable[[], datetime] | None = None,
        *,
        timezone: str = "Europe/Berlin",
    ):
        self.pool, self.auth = pool, auth
        self.clock = clock or (lambda: datetime.now(UTC))
        self.timezone = timezone

    async def freeze_in_transaction(
        self,
        tx: Transaction,
        input: object,
        as_of: datetime,
        *,
        query: ValuationQuery | None = None,
    ) -> FrozenResult:
        pairs = price_requests(input)
        if not isinstance(as_of, datetime) or as_of.tzinfo is None:
            raise ValidationError("Invalid reference evaluation instant")
        # Node Date and the public timestamp contract use millisecond precision.
        as_of = as_of.replace(microsecond=as_of.microsecond // 1000 * 1000)
        execute = query or valuation_query
        states = await records(
            tx,
            execute,
            """
            SELECT s.refresh_status, p.id, p.descriptor, p.source_type, p.source_updated_at,
            p.payload_digest, p.extractor_version, p.mapping_version, p.ingested_at FROM
            price_state s LEFT JOIN price_publications p ON p.id=s.active_publication WHERE s.id=1
            """,
            (),
            [
                "refresh_status",
                "publication_id",
                "descriptor",
                "source_type",
                "source_updated_at",
                "payload_digest",
                "extractor_version",
                "mapping_version",
                "ingested_at",
            ],
        )
        state = states[0] if states else {}
        publication: Document | None = None
        if state.get("publication_id"):
            publication = {
                "id": str(state["publication_id"]),
                "source": "Scryfall",
                "bulkType": state["source_type"],
                "sourceTime": iso_timestamp(state["source_updated_at"]),
                "timePrecision": "Instant",
                "payloadDigest": state["payload_digest"],
                "extractorVersion": state["extractor_version"],
                "mappingVersion": state["mapping_version"],
                "ingestedAt": iso_timestamp(state["ingested_at"]),
            }
        rows = (
            await records(
                tx,
                execute,
                BASELINE_ROWS,
                [
                    publication["id"],
                    [p["printingId"] for p in pairs],
                    [p["finish"] for p in pairs],
                ],
                _BASE_COLUMNS,
            )
            if publication
            else [{} for _ in pairs]
        )
        if len(rows) != len(pairs):
            raise PriceReadUnavailable()
        candidates: list[list[tuple[Document, Document | None]]] = [[] for _ in pairs]
        selections: list[list[Document]] = [[] for _ in pairs]
        for index, (pair, row) in enumerate(zip(pairs, rows, strict=True)):
            links = [
                {**link, "printingId": pair["printingId"], "provenance": "Exact"}
                for link in row.get("links") or []
            ]
            if row.get("english_printing_id"):
                for link in row.get("english_links") or []:
                    if not any(item["provider"] == link["provider"] for item in links):
                        links.append(
                            {
                                **link,
                                "printingId": str(row["english_printing_id"]),
                                "provenance": "EnglishFallback",
                            }
                        )
            reference, evidence = choose_reference(pair, row, publication, as_of, links)
            if evidence is not None:
                evidence["descriptor"] = state["descriptor"]
            candidates[index].append((reference, evidence))
            selections[index].append(
                {
                    "source": "Scryfall",
                    "enabled": True,
                    "publication": publication,
                    "descriptor": state.get("descriptor"),
                    "selection": row if publication else None,
                }
            )
        publications = [publication] if publication else []
        statuses = [
            source_status(
                "Scryfall", True, state.get("refresh_status"), state.get("publication_id")
            )
        ]
        optional_states = await records(
            tx,
            execute,
            """
            SELECT s.source, s.enabled, s.refresh_status, p.id, p.source, p.time_precision,
            p.source_instant, p.source_date::text, p.descriptor, p.payload_digest,
            p.extractor_version, p.mapping_version, p.ingested_at FROM optional_price_state s LEFT
            JOIN optional_price_publications p ON p.id=s.active_publication ORDER BY s.source
            """,
            (),
            [
                "source",
                "enabled",
                "refresh_status",
                "publication_id",
                "publication_source",
                "time_precision",
                "source_instant",
                "source_date",
                "descriptor",
                "payload_digest",
                "extractor_version",
                "mapping_version",
                "ingested_at",
            ],
        )
        for optional in optional_states:
            source = optional["source"]
            if source not in ("Cardmarket", "MTGJSON"):
                raise PriceReadUnavailable()
            statuses.append(
                source_status(
                    source,
                    optional["enabled"],
                    optional["refresh_status"],
                    optional["publication_id"],
                )
            )
            active: Document | None = None
            if optional["enabled"] and optional["publication_id"]:
                if optional["publication_source"] != source or optional["time_precision"] != (
                    "Instant" if source == "Cardmarket" else "Day"
                ):
                    raise PriceReadUnavailable()
                active = {
                    "id": str(optional["publication_id"]),
                    "source": source,
                    "bulkType": "public-price-guide"
                    if source == "Cardmarket"
                    else "AllPricesToday",
                    "payloadDigest": optional["payload_digest"],
                    "extractorVersion": optional["extractor_version"],
                    "mappingVersion": optional["mapping_version"],
                    "ingestedAt": iso_timestamp(optional["ingested_at"]),
                    "timePrecision": optional["time_precision"],
                }
                active.update(
                    {"sourceTime": iso_timestamp(optional["source_instant"])}
                    if source == "Cardmarket"
                    else {"sourceDate": optional["source_date"]}
                )
                publications.append(active)
            optional_rows = (
                await records(
                    tx,
                    execute,
                    OPTIONAL_ROWS,
                    [active["id"], [p["printingId"] for p in pairs], [p["finish"] for p in pairs]],
                    _OPTIONAL_COLUMNS,
                )
                if active
                else [{} for _ in pairs]
            )
            if len(optional_rows) != len(pairs):
                raise PriceReadUnavailable()
            for index, (pair, row) in enumerate(zip(pairs, optional_rows, strict=True)):
                selections[index].append(
                    {
                        "source": source,
                        "enabled": optional["enabled"],
                        "publication": active,
                        "descriptor": optional.get("descriptor"),
                        "selection": row if active else None,
                    }
                )
                if not optional["enabled"]:
                    continue
                reference, evidence = choose_reference(
                    pair, row, active, as_of, candidates[index][0][0]["links"]
                )
                if evidence is not None:
                    evidence["descriptor"] = optional["descriptor"]
                candidates[index].append((reference, evidence))
        results: list[Document] = []
        outcomes: list[Document] = []
        priority = {"Cardmarket": 0, "Scryfall": 1, "MTGJSON": 2}
        for index, options in enumerate(candidates):
            known = sorted(
                (candidate for candidate in options if candidate[0]["kind"] == "Known"),
                key=lambda c: (c[0]["freshness"] == "Stale", priority[c[0]["source"]]),
            )
            selected, evidence = (
                known[0]
                if known
                else next(
                    (
                        candidate
                        for candidate in options
                        if candidate[0]["reason"] not in ("SourceUnavailable", "PrintingMissing")
                    ),
                    options[0],
                )
            )
            results.append(selected)
            outcomes.append(
                copy.deepcopy(
                    {
                        "reference": selected,
                        "evaluatedAt": iso_timestamp(as_of),
                        "publication": evidence["publication"] if evidence else publication,
                        "descriptor": evidence["descriptor"]
                        if evidence
                        else state.get("descriptor"),
                        "selection": rows[index] if publication else None,
                        "known": evidence,
                        "sourceSelections": selections[index],
                    }
                )
            )
        health = state.get("refresh_status") or {}
        refresh = {
            "kind": health.get("kind")
            if health.get("kind") in ("Succeeded", "Failed")
            else "NeverAttempted"
        }
        if isinstance(health.get("attemptedAt"), str):
            refresh["attemptedAt"] = health["attemptedAt"]
        return {
            "response": {
                "evaluatedAt": iso_timestamp(as_of),
                "publications": publications,
                "sourceStatuses": statuses,
                "refreshStatus": refresh,
                "results": results,
            },
            "evidence": outcomes,
        }

    async def read_in_transaction(
        self,
        tx: Transaction,
        input: object,
        as_of: datetime,
        *,
        query: ValuationQuery | None = None,
    ) -> PriceResponse:
        return (await self.freeze_in_transaction(tx, input, as_of, query=query))["response"]

    async def printing_references(self, input: object) -> PriceResponse:
        price_requests(input)
        try:
            async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
                return await self.read_in_transaction(tx, input, self.clock())
        except ValidationError:
            raise
        except Exception:
            raise PriceReadUnavailable() from None

    async def freeze_printing_references(self, input: object) -> FrozenResult:
        price_requests(input)
        async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
            frozen = await self.freeze_in_transaction(tx, input, self.clock())
        return {
            "response": frozen["response"],
            "evidence": [e["known"] for e in frozen["evidence"] if e["known"]],
        }

    async def printing_history(self, input: object) -> Document:
        value = request_object(input, ["printingId", "finish", "days", "sources"])
        pair = price_requests(
            [{"printingId": value.get("printingId"), "finish": value.get("finish")}]
        )[0]
        days = value.get("days", 30)
        if (
            isinstance(days, bool)
            or not isinstance(days, int | float)
            or not (1 <= days <= 90 and days == int(days))
        ):
            raise ValidationError("History days must be 1 to 90")
        days = int(days)
        selected = value.get("sources")
        if "sources" in value and (
            not isinstance(selected, list)
            or not 1 <= len(selected) <= 3
            or any(source not in ("Scryfall", "Cardmarket", "MTGJSON") for source in selected)
            or len(set(selected)) != len(selected)
        ):
            raise ValidationError("Supply 1 to 3 distinct history sources")
        try:
            async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
                now = self.clock()
                to = now.astimezone(UTC).date()
                start = to - timedelta(days=days - 1)
                frozen = await self.freeze_in_transaction(tx, [pair], now)
                sources = [
                    status["source"]
                    for status in frozen["response"]["sourceStatuses"]
                    if status["enabled"] and (selected is None or status["source"] in selected)
                ]
                mappings: list[Document] = []
                for source in sources:
                    selection = (
                        next(
                            (
                                s["selection"]
                                for s in frozen["evidence"][0]["sourceSelections"]
                                if s["source"] == source
                            ),
                            None,
                        )
                        or {}
                    )
                    mappings.append(
                        {
                            "id": str(selection["english_printing_id"]),
                            "key": selection["english_variant_key"],
                        }
                        if selection.get("supported")
                        and selection.get("english_supported")
                        and selection.get("english_printing_id")
                        and isinstance(selection.get("english_variant_key"), str)
                        else {"id": None, "key": None}
                    )
                ids = list(
                    dict.fromkeys([pair["printingId"], *[m["id"] for m in mappings if m["id"]]])
                )
                rows = await records(
                    tx,
                    valuation_query,
                    PUBLIC_HISTORY,
                    [
                        ids,
                        pair["finish"],
                        start.isoformat(),
                        to.isoformat(),
                        sources,
                        pair["printingId"],
                        [m["id"] for m in mappings],
                        [m["key"] for m in mappings],
                    ],
                    [
                        "source",
                        "printing_id",
                        "finish",
                        "day",
                        "time_precision",
                        "source_instant",
                        "amount",
                        "measure",
                        "provider_id",
                        "publication_id",
                        "evidence",
                    ],
                )
                if len(rows) > days * len(sources) or len(rows) > 270:
                    raise PriceReadUnavailable()
                publications: dict[str, Document] = {}
                points: list[Document] = []
                for row in rows:
                    source = row["source"]
                    saved = (row.get("evidence") or {}).get("publication")
                    if not saved or source not in sources:
                        raise PriceReadUnavailable()
                    time: Document
                    if row["time_precision"] == "Instant":
                        time = {
                            "timePrecision": "Instant",
                            "sourceTime": iso_timestamp(row["source_instant"]),
                        }
                    elif row["time_precision"] == "Day":
                        time = {"timePrecision": "Day", "sourceDate": row["day"]}
                    else:
                        raise PriceReadUnavailable()
                    origin = reference_origin(source, pair["finish"], row["provider_id"])
                    if row["measure"] != origin["measure"]:
                        raise PriceReadUnavailable()
                    artifact = saved.get(
                        "pointArtifact",
                        {
                            "Scryfall": "ScryfallBulk",
                            "Cardmarket": "CardmarketGuide",
                            "MTGJSON": "AllPrices",
                        }[source],
                    )
                    digest = saved.get(
                        "pointPayloadDigest",
                        (saved.get("descriptor", {}).get("history") or {}).get("digest")
                        if source == "MTGJSON"
                        else saved.get("payloadDigest"),
                    )
                    if artifact not in (
                        "ScryfallBulk",
                        "CardmarketGuide",
                        "AllPrices",
                    ) or not isinstance(digest, str):
                        raise PriceReadUnavailable()
                    publication_id = str(row["publication_id"])
                    publication: Document = {
                        "id": publication_id,
                        "source": source,
                        "bulkType": saved["descriptor"]["bulkType"]
                        if source == "Scryfall"
                        else "public-price-guide"
                        if source == "Cardmarket"
                        else "AllPricesToday",
                        "payloadDigest": saved["payloadDigest"],
                        "extractorVersion": saved["extractorVersion"],
                        "mappingVersion": saved["mappingVersion"],
                        "ingestedAt": saved["ingestedAt"],
                    }
                    publication.update(
                        {"timePrecision": "Day", "sourceDate": saved["descriptor"]["sourceDate"]}
                        if source == "MTGJSON"
                        else {
                            "timePrecision": "Instant",
                            "sourceTime": time.get(
                                "sourceTime", saved["descriptor"].get("sourceTime")
                            ),
                        }
                    )
                    publications[publication_id] = publication
                    points.append(
                        {
                            **pair,
                            **origin,
                            **time,
                            "day": row["day"],
                            "amount": decimal_amount(row["amount"]),
                            "currency": "EUR",
                            "publicationId": publication_id,
                            "observationId": ":".join(
                                [
                                    publication_id,
                                    str(row["printing_id"]),
                                    pair["finish"],
                                    row["measure"],
                                    row["day"],
                                ]
                            ),
                            "matchedPrintingId": str(row["printing_id"]),
                            "matchedFinish": pair["finish"],
                            "provenance": "Exact"
                            if str(row["printing_id"]) == pair["printingId"]
                            else "EnglishFallback",
                            "mappingVersion": saved["mappingVersion"],
                            "pointArtifact": artifact,
                            "pointPayloadDigest": digest,
                        }
                    )
                points.sort(key=lambda point: (point["day"], point["source"]))
                return {
                    "asOf": iso_timestamp(now),
                    "window": {"from": start.isoformat(), "to": to.isoformat(), "days": days},
                    "sourceStatuses": frozen["response"]["sourceStatuses"],
                    "publications": list(publications.values()),
                    "points": points,
                }
        except ValidationError:
            raise
        except Exception:
            raise PriceReadUnavailable() from None

    async def inventory_references(self, actor: Actor, input: object) -> Document:
        user = await self.auth.require_actor(actor)
        value = request_object(input, ["entryIds"])
        items = value.get("entryIds")
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            raise ValidationError("Supply 1 to 100 entry IDs")
        ids = [price_uuid(item) for item in items]
        if len(set(ids)) != len(ids):
            raise ValidationError("Duplicate entry ID")
        try:
            async with transaction(self.pool, read_only=True, repeatable_read=True) as tx:
                rows = await records(
                    tx,
                    valuation_query,
                    """
                    SELECT id, catalog_card_id, finish, quantity FROM inventory_cards WHERE
                    id=ANY($1::uuid[]) AND account_id=$2 AND game= 'mtg'
                    """,
                    [ids, user.account_id],
                    ["id", "catalog_card_id", "finish", "quantity"],
                )
                if len(rows) != len(ids):
                    raise InventoryPriceNotFound()
                by_id = {str(row["id"]): row for row in rows}
                ordered = [by_id[id] for id in ids]
                try:
                    pairs = [
                        {"printingId": price_uuid(row["catalog_card_id"]), "finish": row["finish"]}
                        for row in ordered
                    ]
                    if any(pair["finish"] not in ("nonfoil", "foil") for pair in pairs):
                        raise PriceReadUnavailable()
                except ValidationError:
                    raise PriceReadUnavailable() from None
                # Multiple conditions can share a printing/finish; internal reads retain order.
                response = await self._read_repeated(tx, pairs, self.clock())
                results: list[Document] = []
                coverage = {"coveredQuantity": 0, "staleQuantity": 0, "unknownQuantity": 0}
                for row, reference in zip(ordered, response["results"], strict=True):
                    quantity = database_integer(row["quantity"])
                    if quantity < 0:
                        raise PriceReadUnavailable()
                    key = "coveredQuantity" if reference["kind"] == "Known" else "unknownQuantity"
                    coverage[key] = database_integer(coverage[key] + quantity)
                    if reference.get("freshness") == "Stale":
                        coverage["staleQuantity"] = database_integer(
                            coverage["staleQuantity"] + quantity
                        )
                    results.append(
                        {"entryId": str(row["id"]), "quantity": quantity, "reference": reference}
                    )
                return {**response, "results": results, "coverage": coverage}
        except ValidationError, InventoryPriceNotFound:
            raise
        except Exception:
            raise PriceReadUnavailable() from None

    async def _read_repeated(
        self, tx: Transaction, pairs: list[Document], as_of: datetime
    ) -> PriceResponse:
        unique = list({(p["printingId"], p["finish"]): p for p in pairs}.values())
        response = await self.read_in_transaction(tx, unique, as_of)
        references = {(r["printingId"], r["finish"]): r for r in response["results"]}
        return {**response, "results": [references[(p["printingId"], p["finish"])] for p in pairs]}


def create_valuation(
    pool: ConnectionPool,
    auth: SessionAuth,
    clock: Callable[[], datetime] | None = None,
    *,
    timezone: str = "Europe/Berlin",
) -> Valuation:
    return Valuation(pool, auth, clock, timezone=timezone)
