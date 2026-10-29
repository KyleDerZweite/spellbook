"""Versioned, explicitly static Demo references. Never a live market provider."""

import copy
import hashlib
import json
from datetime import UTC, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import TYPE_CHECKING, cast
from uuid import NAMESPACE_URL, uuid5

from spellbook_core.db import iso_timestamp
from spellbook_core.mtg.inventory_value import display_amount, exact_amount
from spellbook_core.mtg.valuation_query import Document

if TYPE_CHECKING:
    from spellbook_core.mtg.valuation import FrozenResult


@cache
def fixture() -> Document:
    return cast(Document, json.loads(Path(__file__).with_suffix(".json").read_text()))


def example_amount(amount: str, factor: int) -> str:
    return display_amount((exact_amount(amount) * factor + 500) // 1000)


def frozen(pairs: list[Document], as_of: datetime, *, factor: int = 1000) -> FrozenResult:
    data = fixture()
    publication_id = str(uuid5(NAMESPACE_URL, data["version"]))
    publication = {
        "id": publication_id,
        "source": "Demo",
        "bulkType": data["version"],
        "payloadDigest": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        "extractorVersion": 1,
        "mappingVersion": 1,
        "ingestedAt": data["retrievedAt"],
        "timePrecision": "Instant",
        "sourceTime": data["retrievedAt"],
    }
    results: list[Document] = []
    evidence: list[Document] = []
    for pair in pairs:
        card = data["cards"].get(pair["printingId"])
        amount = card.get(pair["finish"]) if card else None
        reference = {**pair, "links": []}
        if amount is None:
            reference.update(kind="Unknown", reason="AmountMissing" if card else "PrintingMissing")
        else:
            reference.update(
                kind="Known",
                amount=example_amount(amount, factor),
                currency="EUR",
                source="Demo",
                measure="fixture.eur" if pair["finish"] == "nonfoil" else "fixture.eur_foil",
                freshness="Static",
                publicationId=publication_id,
                observationId=f"{publication_id}:{pair['printingId']}:{pair['finish']}:{factor}",
                matchedPrintingId=pair["printingId"],
                matchedFinish=pair["finish"],
                provenance="Exact",
                timePrecision="Instant",
                sourceTime=data["retrievedAt"],
            )
        results.append(reference)
        known = (
            {"reference": reference, "publication": publication, "descriptor": data["note"]}
            if reference["kind"] == "Known"
            else None
        )
        evidence.append(
            copy.deepcopy(
                {
                    "reference": reference,
                    "evaluatedAt": iso_timestamp(as_of),
                    "publication": publication,
                    "descriptor": {"kind": "Demo", "note": data["note"]},
                    "selection": None,
                    "known": known,
                    "sourceSelections": [],
                }
            )
        )
    return {
        "response": {
            "evaluatedAt": iso_timestamp(as_of),
            "publications": [publication],
            "sourceStatuses": [{"source": "Demo", "enabled": True, "kind": "Succeeded"}],
            "refreshStatus": {"kind": "Succeeded"},
            "results": results,
        },
        "evidence": evidence,
    }


def history(pair: Document, days: int, as_of: datetime, sources: list[str] | None) -> Document:
    today = as_of.astimezone(UTC).date()
    start = today - timedelta(days=days - 1)
    response = frozen([pair], as_of)["response"]
    points = []
    factors = fixture()["historyFactors"]
    if sources is None or "Demo" in sources:
        for index, factor in enumerate(factors[-days:]):
            day = today - timedelta(days=min(days, len(factors)) - index - 1)
            reference = frozen([pair], as_of, factor=factor)["response"]["results"][0]
            if reference["kind"] == "Known":
                point = {
                    k: v for k, v in reference.items() if k not in ("kind", "links", "freshness")
                }
                point.update(
                    day=day.isoformat(),
                    mappingVersion=1,
                    pointArtifact="DemoFixture",
                    pointPayloadDigest=response["publications"][0]["payloadDigest"],
                )
                points.append(point)
    return {
        "asOf": iso_timestamp(as_of),
        "window": {"from": start.isoformat(), "to": today.isoformat(), "days": days},
        "sourceStatuses": response["sourceStatuses"],
        "publications": response["publications"],
        "points": points,
    }
