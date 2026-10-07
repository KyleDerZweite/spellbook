"""Rolling public market facts, independent of personal holdings or capture."""

from datetime import UTC, datetime, timedelta

from psycopg.types.json import Jsonb


def prune_history(conn, source, publication=None):
    cutoff = datetime.now(UTC).date() - timedelta(days=89)
    conn.execute("DELETE FROM price_source_history WHERE source=%s AND day < %s", (source, cutoff))
    conn.execute("DELETE FROM price_history_days WHERE source=%s AND day < %s", (source, cutoff))
    if publication is not None:
        conn.execute(
            "DELETE FROM price_history_printings p WHERE publication_id=%s AND NOT EXISTS "
            "(SELECT 1 FROM price_source_history h WHERE h.source=%s "
            "AND h.publication_id=p.publication_id AND h.printing_id=p.printing_id)",
            (publication, source),
        )
    conn.execute(
        "DELETE FROM price_history_publications p WHERE source=%s AND NOT EXISTS "
        "(SELECT 1 FROM price_source_history h WHERE h.source=p.source "
        "AND h.publication_id=p.publication_id)",
        (source,),
    )


def select_instant_day(conn, source, instant, publication, ingested_at):
    day = instant.astimezone(UTC).date()
    if day < datetime.now(UTC).date() - timedelta(days=89):
        return None
    selected = conn.execute(
        "INSERT INTO price_history_days(source,day,source_instant,publication_id,ingested_at) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT(source,day) DO UPDATE SET "
        "source_instant=EXCLUDED.source_instant,publication_id=EXCLUDED.publication_id,"
        "ingested_at=EXCLUDED.ingested_at WHERE "
        "EXCLUDED.source_instant>price_history_days.source_instant OR "
        "(EXCLUDED.source_instant=price_history_days.source_instant AND "
        "EXCLUDED.ingested_at>price_history_days.ingested_at) RETURNING day",
        (source, day, instant, publication, ingested_at),
    ).fetchone()
    if not selected:
        return None
    # A complete latest view suppresses earlier same-day missing/null values.
    conn.execute("DELETE FROM price_source_history WHERE source=%s AND day=%s", (source, day))
    return day


def record_scryfall_history(conn):
    # Existing isolated 0015 publisher fixtures retain their established seam.
    if (
        conn.execute("SELECT to_regclass(current_schema()||'.price_history_days')").fetchone()[0]
        is None
    ):
        return
    raw = conn.execute(
        "SELECT p.id,p.source_updated_at,p.ingested_at,p.descriptor,p.payload_digest,"
        "p.extractor_version,p.mapping_version FROM price_state s "
        "JOIN price_publications p ON p.id=s.active_publication WHERE s.id=1"
    ).fetchone()
    if not raw:
        return
    publication, instant, ingested, descriptor, digest, extractor, mapping = raw
    day = select_instant_day(conn, "Scryfall", instant, publication, ingested)
    if day is not None:
        evidence = {
            "source": "Scryfall",
            "descriptor": descriptor,
            "payloadDigest": digest,
            "extractorVersion": extractor,
            "mappingVersion": mapping,
            "ingestedAt": ingested.isoformat(),
            "publicationId": str(publication),
            "pointArtifact": "ScryfallBulk",
            "pointPayloadDigest": digest,
        }
        conn.execute(
            "INSERT INTO price_history_publications VALUES (%s,'Scryfall',%s) "
            "ON CONFLICT DO NOTHING",
            (publication, Jsonb(evidence)),
        )
        conn.execute(
            "INSERT INTO price_history_printings "
            "SELECT p.publication_id,p.id,p.identity,p.variant_key "
            "FROM price_printings p WHERE p.publication_id=%s AND EXISTS "
            "(SELECT 1 FROM price_observations o WHERE o.publication_id=p.publication_id "
            "AND o.printing_id=p.id AND o.supported AND o.amount IS NOT NULL) "
            "ON CONFLICT DO NOTHING",
            (publication,),
        )
        conn.execute(
            "INSERT INTO price_source_history(source,printing_id,finish,day,time_precision,"
            "source_instant,amount,measure,raw_value,publication_id,evidence) "
            "SELECT 'Scryfall',o.printing_id,o.finish,%s,'Instant',%s,o.amount,o.measure,"
            "o.raw_value,o.publication_id,'{}'::jsonb "
            "FROM price_observations o JOIN price_printings p "
            "ON p.publication_id=o.publication_id AND p.id=o.printing_id "
            "WHERE o.publication_id=%s AND o.supported AND o.amount IS NOT NULL",
            (day, instant, publication),
        )
    prune_history(conn, "Scryfall", publication)
