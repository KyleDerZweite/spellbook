"""Atomic optional source views and independent recovery, using public facts only."""

from __future__ import annotations

import time
from contextlib import suppress
from datetime import UTC, datetime
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from worker.catalog import PUBLISH_LOCK
from worker.price_artifacts import DEFAULT_PRICE_LIMITS
from worker.price_connections import connect
from worker.price_history import prune_history, record_scryfall_history, select_instant_day

OPTIONAL_EXTRACTOR_VERSION = 1


def provider_source(source):
    if source not in ("Cardmarket", "MTGJSON"):
        raise ValueError("Unsupported optional price source")
    return source


class _PublicationConnection:
    """Give each statement only the remaining publication budget."""

    def __init__(self, connection, deadline):
        self.connection, self.deadline = connection, deadline

    def _timeout(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("Optional publication deadline exceeded")
        self.connection.execute(
            "SELECT set_config('statement_timeout',%s,true)",
            (str(max(1, int(remaining * 1000))),),
        )

    def execute(self, query, parameters=None):
        self._timeout()
        return self.connection.execute(query, parameters)

    def cursor(self):
        self._timeout()
        return self.connection.cursor()


class OptionalPricePublisher:
    def __init__(self, database_url, limits=DEFAULT_PRICE_LIMITS):
        self.database_url, self.limits = database_url, limits

    def set_enabled(self, source, enabled):
        provider_source(source)
        if type(enabled) is not bool:
            raise ValueError("Source opt-in must be boolean")
        with connect(
            self.database_url,
            time.monotonic() + self.limits.connect_seconds,
            self.limits.connect_seconds,
        ) as connection:
            conn = _PublicationConnection(connection, connection.deadline)
            conn.execute(
                "UPDATE optional_price_state SET enabled=%s WHERE source=%s", (enabled, source)
            )
            prune_history(conn, source)

    def record_failure(self, source, cause):
        provider_source(source)
        with connect(
            self.database_url,
            time.monotonic() + self.limits.connect_seconds,
            self.limits.connect_seconds,
        ) as connection:
            conn = _PublicationConnection(connection, connection.deadline)
            conn.execute(
                "UPDATE optional_price_state SET refresh_status=%s WHERE source=%s",
                (
                    Jsonb(
                        {
                            "kind": "Failed",
                            "attemptedAt": datetime.now(UTC).isoformat(),
                            "error": type(cause).__name__,
                        }
                    ),
                    source,
                ),
            )

    def publish_cardmarket(self, adapter):
        return self._publish("Cardmarket", adapter)

    def publish_mtgjson(self, adapter):
        return self._publish("MTGJSON", adapter)

    def restore_previous(self, source):
        provider_source(source)
        with connect(
            self.database_url,
            time.monotonic() + self.limits.connect_seconds,
            self.limits.connect_seconds,
        ) as connection:
            conn = _PublicationConnection(connection, connection.deadline)
            conn.execute("SELECT pg_advisory_xact_lock(%s,%s)", PUBLISH_LOCK)
            previous = conn.execute(
                "SELECT previous_publication FROM optional_price_state WHERE source=%s FOR UPDATE",
                (source,),
            ).fetchone()
            if not previous or previous[0] is None:
                raise ValueError("No recoverable optional source view")
            conn.execute(
                (
                    """UPDATE optional_price_state SET
                    active_publication=previous_publication,previous_publication=active_publication
                    WHERE source=%s"""
                ),
                (source,),
            )

    def _publish(self, source, adapter):
        started = time.monotonic()
        deadline = min(started + adapter.limits.publication_seconds, adapter.import_deadline)

        def bounded():
            if time.monotonic() >= deadline:
                raise ValueError("Optional publication deadline exceeded")

        try:
            with connect(
                self.database_url, deadline, adapter.limits.connect_seconds
            ) as connection:
                conn = _PublicationConnection(connection, deadline)
                conn.execute("SELECT pg_advisory_xact_lock(%s,%s)", PUBLISH_LOCK)
                state = conn.execute(
                    (
                        """SELECT enabled,active_publication FROM optional_price_state WHERE
                        source=%s FOR UPDATE"""
                    ),
                    (source,),
                ).fetchone()
                if not state or not state[0]:
                    raise ValueError("Optional source is disabled")
                baseline = conn.execute(
                    """SELECT p.id,p.mapping_version,p.payload_digest FROM price_state s JOIN
                        price_publications p ON p.id=s.active_publication WHERE s.id=1"""
                ).fetchone()
                if not baseline:
                    raise ValueError("Validated Scryfall identity view is unavailable")
                descriptor = {
                    **adapter.metadata,
                    "source": source,
                    "upstream": "Cardmarket",
                    "scryfallPublicationId": str(baseline[0]),
                    "scryfallPayloadDigest": baseline[2],
                    "mappingVersion": baseline[1],
                    "timePrecision": "Instant" if source == "Cardmarket" else "Day",
                }
                descriptor["inputFingerprint"] = {
                    key: value for key, value in descriptor.items() if key != "artifacts"
                }
                current = conn.execute(
                    (
                        """SELECT id,descriptor,extractor_version FROM optional_price_publications
                        WHERE id=%s"""
                    ),
                    (state[1],),
                ).fetchone()
                if (
                    current
                    and current[1].get("inputFingerprint") == descriptor["inputFingerprint"]
                    and current[2] == OPTIONAL_EXTRACTOR_VERSION
                ):
                    conn.execute(
                        "UPDATE optional_price_state SET refresh_status=%s WHERE source=%s",
                        (
                            Jsonb(
                                {"kind": "Succeeded", "attemptedAt": datetime.now(UTC).isoformat()}
                            ),
                            source,
                        ),
                    )
                    prune_history(conn, source, current[0])
                    return current[0]
                publication = uuid4()
                instant = (
                    datetime.fromisoformat(adapter.metadata["sourceTime"])
                    if source == "Cardmarket"
                    else None
                )
                source_date = adapter.metadata.get("sourceDate")
                ingested = datetime.now(UTC)
                conn.execute(
                    (
                        """INSERT INTO
                        optional_price_publications(id,source,time_precision,source_instant,source_date,descriptor,payload_digest,extractor_version,mapping_version,ingested_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
                    ),
                    (
                        publication,
                        source,
                        descriptor["timePrecision"],
                        instant,
                        source_date,
                        Jsonb(descriptor),
                        adapter.metadata["priceDigest"],
                        OPTIONAL_EXTRACTOR_VERSION,
                        baseline[1],
                        ingested,
                    ),
                )
                conn.execute(
                    (
                        """INSERT INTO optional_price_printings SELECT
                        %s,id,identity,finishes,variant_key FROM price_printings WHERE
                        publication_id=%s"""
                    ),
                    (publication, baseline[0]),
                )
                conn.execute(
                    """CREATE TEMP TABLE incoming_prices(provider_id text,printing_id
                        uuid,finish text,measure text,amount numeric,raw_value text,source_date
                        date) ON COMMIT DROP"""
                )
                with conn.cursor().copy("COPY incoming_prices FROM STDIN") as incoming:
                    for row in adapter.current_points(deadline=deadline):
                        bounded()
                        incoming.write_row(
                            (
                                row["providerId"],
                                row.get("printingId"),
                                row["finish"],
                                row["measure"],
                                row["amount"],
                                row["rawValue"],
                                row.get("sourceDate"),
                            )
                        )
                join = (
                    "v.provider_id=p.identity->>'cardmarket_id'"
                    if source == "Cardmarket"
                    else "v.printing_id=p.id"
                )
                conn.execute(
                    "CREATE INDEX ON incoming_prices(provider_id,finish)"
                    if source == "Cardmarket"
                    else "CREATE INDEX ON incoming_prices(printing_id,finish)"
                )
                conn.execute("ANALYZE incoming_prices")
                measure = (
                    "CASE o.finish WHEN 'nonfoil' THEN 'trend' ELSE 'trend-foil' END"
                    if source == "Cardmarket"
                    else (
                        """CASE o.finish WHEN 'nonfoil' THEN 'paper.cardmarket.retail.normal' ELSE
                        'paper.cardmarket.retail.foil' END"""
                    )
                )
                conn.execute(
                    "INSERT INTO optional_price_observations SELECT %s,p.id,o.finish,"
                    + measure
                    + (
                        """,v.amount,v.raw_value,o.supported,v.provider_id,o.english_printing_id,o.mapping_reason
                        FROM price_printings p JOIN price_observations o ON
                        o.publication_id=p.publication_id AND o.printing_id=p.id LEFT JOIN
                        incoming_prices v ON"""
                    )
                    + " "
                    + join
                    + " AND v.finish=o.finish WHERE p.publication_id=%s",
                    (publication, baseline[0]),
                )
                conn.execute("ANALYZE optional_price_printings")
                conn.execute("ANALYZE optional_price_observations")
                bounded()
                record_scryfall_history(conn)
                self._history(
                    conn,
                    source,
                    adapter,
                    publication,
                    instant,
                    ingested,
                    descriptor,
                    bounded,
                    deadline,
                )
                conn.execute(
                    (
                        """UPDATE optional_price_state SET
                        previous_publication=active_publication,active_publication=%s,refresh_status=%s
                        WHERE source=%s"""
                    ),
                    (
                        publication,
                        Jsonb({"kind": "Succeeded", "attemptedAt": datetime.now(UTC).isoformat()}),
                        source,
                    ),
                )
                conn.execute(
                    (
                        """DELETE FROM optional_price_publications WHERE source=%s AND id NOT IN
                        (SELECT active_publication FROM optional_price_state WHERE source=%s
                        UNION SELECT previous_publication FROM optional_price_state WHERE
                        source=%s AND previous_publication IS NOT NULL)"""
                    ),
                    (source, source, source),
                )
                prune_history(conn, source, publication)
                bounded()
                return publication
        except Exception as cause:
            with suppress(psycopg.Error, ValueError):
                self.record_failure(source, cause)
            raise

    @staticmethod
    def _history(
        conn, source, adapter, publication, instant, ingested, descriptor, bounded, deadline
    ):
        evidence = {
            "source": source,
            "descriptor": descriptor,
            "publicationId": str(publication),
            "payloadDigest": adapter.metadata["priceDigest"],
            "extractorVersion": OPTIONAL_EXTRACTOR_VERSION,
            "mappingVersion": descriptor["mappingVersion"],
            "ingestedAt": ingested.isoformat(),
            "pointArtifact": "CardmarketGuide" if source == "Cardmarket" else "AllPrices",
            "pointPayloadDigest": adapter.metadata["priceDigest"]
            if source == "Cardmarket"
            else adapter.metadata["history"]["digest"],
        }
        conn.execute(
            "INSERT INTO price_history_publications VALUES (%s,%s,%s)",
            (publication, source, Jsonb(evidence)),
        )
        conn.execute(
            "INSERT INTO price_history_printings "
            "SELECT publication_id,printing_id,identity,variant_key "
            "FROM optional_price_printings WHERE publication_id=%s",
            (publication,),
        )
        if source == "Cardmarket":
            day = select_instant_day(conn, source, instant, publication, ingested)
            if day is not None:
                conn.execute(
                    (
                        """INSERT INTO
                        price_source_history(source,printing_id,finish,day,time_precision,source_instant,amount,measure,raw_value,provider_id,publication_id,evidence)
                        SELECT
                        %s,o.printing_id,o.finish,%s,'Instant',%s,o.amount,o.measure,o.raw_value,o.provider_id,%s,'{}'::jsonb
                        FROM optional_price_observations o WHERE o.publication_id=%s AND
                        o.supported AND o.amount IS NOT NULL"""
                    ),
                    (source, day, instant, publication, publication),
                )
            return
        conn.execute(
            """CREATE TEMP TABLE incoming_history(provider_id text,printing_id uuid,finish
                text,measure text,amount numeric,raw_value text,source_date date) ON COMMIT
                DROP"""
        )
        with conn.cursor().copy("COPY incoming_history FROM STDIN") as incoming:
            for row in adapter.history_points(deadline=deadline):
                bounded()
                incoming.write_row(
                    (
                        row["providerId"],
                        row["printingId"],
                        row["finish"],
                        row["measure"],
                        row["amount"],
                        row["rawValue"],
                        row["sourceDate"],
                    )
                )
        conn.execute("ANALYZE incoming_history")
        conn.execute("DELETE FROM price_source_history WHERE source='MTGJSON'")
        conn.execute("DELETE FROM price_history_days WHERE source='MTGJSON'")
        conn.execute(
            (
                """INSERT INTO
                price_source_history(source,printing_id,finish,day,time_precision,amount,measure,raw_value,provider_id,publication_id,evidence)
                SELECT
                'MTGJSON',h.printing_id,h.finish,h.source_date,'Day',h.amount,h.measure,h.raw_value,h.provider_id,%s,'{}'::jsonb
                FROM incoming_history h JOIN optional_price_printings p ON p.publication_id=%s
                AND p.printing_id=h.printing_id WHERE h.amount IS NOT NULL AND
                h.finish=ANY(p.finishes)"""
            ),
            (publication, publication),
        )
        conn.execute(
            (
                """INSERT INTO price_history_days SELECT 'MTGJSON',source_date,NULL,%s,%s FROM
                incoming_history GROUP BY source_date"""
            ),
            (publication, ingested),
        )
