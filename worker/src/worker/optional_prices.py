"""Explicit public Cardmarket and MTGJSON artifact adapters."""

from __future__ import annotations

import sqlite3
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID

from worker.price_artifacts import (
    DEFAULT_PRICE_LIMITS,
    ArtifactRecords,
    NumericToken,
    identifier,
    money,
)


def source_instant(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Missing source instant")
    date = datetime.fromisoformat(value)
    if date.tzinfo is None or date > datetime.now(UTC) + timedelta(minutes=5):
        raise ValueError("Invalid or future source instant")
    return date.astimezone(UTC).isoformat()


class CardmarketAdapter:
    def __init__(
        self,
        products: Path,
        guide: Path,
        staging: Path,
        limits=DEFAULT_PRICE_LIMITS,
        *,
        import_deadline=None,
    ):
        self.import_deadline = import_deadline
        self.products, self.guide, self.staging, self.limits = products, guide, staging, limits
        self.metadata = {}

    def _bounded(self):
        if time.monotonic() >= self.import_deadline:
            raise ValueError("Optional import deadline exceeded")
        total = sum(p.stat().st_size for p in (self.products, self.guide))
        total += sum(p.stat().st_size for p in self.staging.parent.glob(self.staging.name + "*"))
        if total > self.limits.staging_bytes:
            raise ValueError("Price staging byte limit exceeded")

    def __enter__(self):
        if self.import_deadline is None:
            self.import_deadline = time.monotonic() + self.limits.import_seconds
        self._bounded()
        self.db = sqlite3.connect(self.staging)
        try:
            self.db.executescript(
                "CREATE TABLE products(id TEXT PRIMARY KEY); "
                "CREATE TABLE points(id TEXT,finish TEXT,measure TEXT,amount TEXT,raw TEXT,"
                "PRIMARY KEY(id,finish));"
            )
            products = ArtifactRecords(
                self.products, "products", False, self.limits, import_deadline=self.import_deadline
            )
            for _, record in products:
                self.db.execute(
                    "INSERT INTO products VALUES (?)", (identifier(record.get("idProduct")),)
                )
                self._bounded()
            guide = ArtifactRecords(
                self.guide, "priceGuides", False, self.limits, import_deadline=self.import_deadline
            )
            for _, record in guide:
                product = identifier(record.get("idProduct"))
                for finish, measure in (("nonfoil", "trend"), ("foil", "trend-foil")):
                    amount, raw = money(record.get(measure))
                    self.db.execute(
                        "INSERT INTO points VALUES (?,?,?,?,?)",
                        (product, finish, measure, amount, raw),
                    )
                self._bounded()
            self.db.commit()
            if any(
                type(data.metadata.get("version")) is not NumericToken
                or data.metadata["version"] != "1"
                for data in (guide, products)
            ):
                raise ValueError("Unsupported or missing Cardmarket artifact version")
            self.metadata = {
                "sourceTime": source_instant(guide.metadata.get("createdAt")),
                "sourceOriginalTime": guide.metadata["createdAt"],
                "mappingTime": source_instant(products.metadata.get("createdAt")),
                "mappingOriginalTime": products.metadata["createdAt"],
                "priceDigest": guide.digest,
                "mappingDigest": products.digest,
                "artifactsEvidence": {
                    "ProductCatalogue": products.evidence(),
                    "PriceGuide": guide.evidence(),
                },
                "priceVersion": str(guide.metadata["version"]),
                "mappingArtifactVersion": str(products.metadata["version"]),
            }
            return self
        except Exception:
            self.db.close()
            raise

    def current_points(self):
        for product, finish, measure, amount, raw in self.db.execute(
            "SELECT p.id,p.finish,p.measure,p.amount,p.raw FROM points p "
            "JOIN products c ON c.id=p.id ORDER BY CAST(p.id AS INTEGER),"
            "CASE finish WHEN 'nonfoil' THEN 0 ELSE 1 END"
        ):
            yield {
                "providerId": product,
                "finish": finish,
                "measure": measure,
                "amount": amount,
                "rawValue": raw,
            }

    def __exit__(self, *_exc):
        self.db.close()


def source_date(value) -> str:
    if type(value) is not str or len(value) != 10:
        raise ValueError("Invalid source date")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value or parsed > datetime.now(UTC).date():
        raise ValueError("Invalid or future source date")
    return value


def uuid(value) -> str:
    if type(value) is not str or len(value) != 36:
        raise ValueError("Invalid source UUID")
    parsed = str(UUID(value))
    if parsed != value.lower():
        raise ValueError("Invalid source UUID")
    return parsed


class MTGJSONAdapter:
    def __init__(
        self,
        identifiers: Path,
        today: Path,
        history: Path,
        staging: Path,
        limits=DEFAULT_PRICE_LIMITS,
        *,
        import_deadline=None,
    ):
        self.import_deadline = import_deadline
        self.identifiers, self.today, self.history = identifiers, today, history
        self.staging, self.limits, self.metadata = staging, limits, {}

    def _bounded(self):
        if time.monotonic() >= self.import_deadline:
            raise ValueError("Optional import deadline exceeded")
        if (
            sum(
                p.stat().st_size
                for p in (self.identifiers, self.today, self.history, self.staging)
                if p.exists()
            )
            > self.limits.staging_bytes
        ):
            raise ValueError("Price staging byte limit exceeded")

    @staticmethod
    def _meta(artifact):
        meta = artifact.metadata.get("meta")
        if (
            not isinstance(meta, dict)
            or type(meta.get("version")) is not str
            or not 1 <= len(meta["version"]) <= 128
        ):
            raise ValueError("Missing MTGJSON artifact metadata")
        return {
            "date": source_date(meta.get("date")),
            "version": meta["version"],
            "digest": artifact.digest,
            "artifactEvidence": artifact.evidence(),
        }

    def __enter__(self):
        if self.import_deadline is None:
            self.import_deadline = time.monotonic() + self.limits.import_seconds
        self._bounded()
        self.db = sqlite3.connect(self.staging)
        try:
            self.db.executescript(
                "PRAGMA cache_size=-4096; PRAGMA temp_store=FILE;"
                "CREATE TABLE identifiers(id TEXT PRIMARY KEY,printing TEXT);"
                "CREATE INDEX identifiers_printing ON identifiers(printing);"
                "CREATE TABLE seen(kind TEXT,id TEXT,PRIMARY KEY(kind,id));"
                "CREATE TABLE points(kind TEXT,id TEXT,finish TEXT,day TEXT,amount TEXT,raw TEXT,"
                "PRIMARY KEY(kind,id,finish,day));"
            )
            crosswalk = ArtifactRecords(
                self.identifiers, "data", True, self.limits, import_deadline=self.import_deadline
            )
            for key, record in crosswalk:
                key = uuid(key)
                try:
                    printing = uuid(record.get("identifiers", {}).get("scryfallId"))
                    if record.get("uuid") != key:
                        printing = None
                except (ValueError, AttributeError):
                    printing = None
                self.db.execute("INSERT INTO identifiers VALUES (?,?)", (key, printing))
                self._bounded()
            identity_meta = self._meta(crosswalk)
            metadata = {}
            cutoff = (datetime.now(UTC).date() - timedelta(days=89)).isoformat()
            for kind, path in (("current", self.today), ("history", self.history)):
                artifact = ArtifactRecords(
                    path, "data", True, self.limits, import_deadline=self.import_deadline
                )
                for key, record in artifact:
                    key = uuid(key)
                    self.db.execute("INSERT INTO seen VALUES (?,?)", (kind, key))
                    provider = record.get("paper", {}).get("cardmarket", {})
                    if provider.get("currency") != "EUR":
                        self._bounded()
                        continue
                    retail = provider.get("retail", {})
                    for finish, series in (("nonfoil", "normal"), ("foil", "foil")):
                        points = retail.get(series, {})
                        if not isinstance(points, dict):
                            raise ValueError("Invalid MTGJSON finish series")
                        for day, value in points.items():
                            day = source_date(day)
                            amount, raw = money(value)
                            if kind == "current" or day >= cutoff:
                                self.db.execute(
                                    "INSERT INTO points VALUES (?,?,?,?,?,?)",
                                    (kind, key, finish, day, amount, raw),
                                )
                    self._bounded()
                metadata[kind] = self._meta(artifact)
            self.db.commit()
            self.metadata = {
                "sourceDate": metadata["current"]["date"],
                "priceVersion": metadata["current"]["version"],
                "priceDigest": metadata["current"]["digest"],
                "crosswalk": identity_meta,
                "history": metadata["history"],
            }
            return self
        except Exception:
            self.db.close()
            raise

    def _points(self, kind):
        query = (
            "SELECT p.id,i.printing,p.finish,p.day,p.amount,p.raw FROM points p "
            "JOIN identifiers i ON i.id=p.id WHERE p.kind=? AND i.printing IS NOT NULL "
            "AND (SELECT count(*) FROM identifiers x WHERE x.printing=i.printing)=1 "
        )
        args = [kind]
        if kind == "current":
            query += "AND p.day=? "
            args.append(self.metadata["sourceDate"])
        query += "ORDER BY p.id,p.finish,p.day"
        for product, printing, finish, day, amount, raw in self.db.execute(query, args):
            yield {
                "providerId": product,
                "printingId": printing,
                "finish": finish,
                "measure": "paper.cardmarket.retail."
                + ("normal" if finish == "nonfoil" else "foil"),
                "amount": amount,
                "rawValue": raw,
                "sourceDate": day,
            }

    def current_points(self):
        return self._points("current")

    def history_points(self):
        return self._points("history")

    def __exit__(self, *_exc):
        self.db.close()
