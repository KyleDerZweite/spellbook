# Datenbankoptionen ohne Wechselentscheidung

- Status: Historical
- Last Reviewed: 2026-10-25
- Source of Truth: datierte Primärquellen und verlinkte Research-Befunde
- Update Triggers: geklärte Wechselmotivation, Datenbankentscheidung, neue belegte Engine-Eigenschaften, Gesamtbackend-Vergleich, ausdrückliche Stack-Bestätigung
- Related Docs: [Index](./index.md), [Prioritäten](./priorities.md), [Postgres-Owner](../architecture/postgres.md), [Python-Standardisierung](./python-backend-standardization.md)

Am 2026-10-24 eröffnete Kyle die Datenbankdiskussion erneut und erinnerte sich an einen SQLite-Nachfolger in Rust.
Eine Engine oder Migration wählte er nicht; der Anlass seiner Unzufriedenheit blieb offen.
Die damalige offene Engine-Auswahl wurde durch die [Bestätigung vom 2026-10-25](#bestätigung-vom-2026-10-25) überholt.
Diese offene Motivationsfrage wurde durch die [Klarstellung vom 2026-10-24](#klarstellung-vom-2026-10-24) überholt.
Der Brainstorm änderte weder Readiness noch Product-Scope.
Quelle: [Strategiedialog](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).

Am 2026-04-25 wählte [ADR-0005 bei KyleDerZweite/spellbook@7ac39ac1f8d6f71d36d498aa08e051ecfa111a6c](https://github.com/KyleDerZweite/spellbook/blob/7ac39ac1f8d6f71d36d498aa08e051ecfa111a6c/docs/decisions/0005-postgres-core-data-and-separated-play-app.md) PostgreSQL für Kerndaten und entfernte SpacetimeDB aus der Basisanwendung.
Am 2026-10-03 führte [ADR-0010 bei KyleDerZweite/spellbook@0fb144b7888638d3d2ed44df5642d3d6e497902c](https://github.com/KyleDerZweite/spellbook/blob/0fb144b7888638d3d2ed44df5642d3d6e497902c/docs/decisions/0010-postgres-catalog.md) MeiliSearch in PostgreSQL zusammen, um Services zu reduzieren und Catalog atomar zu publizieren.
Am 2026-10-24 fand der [History-Audit](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-database-history-20261024-r1) in gezielter Repository-, Git- und Issue-Suche keine frühere SQLite-/Turso-Auswahl oder Ablehnung.
Das schließt frühere Überlegungen Kyles nicht aus.

Am 2026-10-24 blieb bei `KyleDerZweite/spellbook@5e062585156292a8f2ef688bf176bb038dc8307f` PostgreSQL ausgewählt.
API, Catalog und State schrieben unabhängig.
Row-/Advisory-Locks, Job-Claims, LISTEN/NOTIFY für SavedState, Suche, ICU-Sortierung und atomare Catalog-Publikation machten einen Wechsel zur Vertragsänderung statt zum Driver-Tausch.
Belege: [Postgres-Vertrag](https://github.com/KyleDerZweite/spellbook/blob/5e062585156292a8f2ef688bf176bb038dc8307f/docs/architecture/postgres.md), [Python-Vertrag](https://github.com/KyleDerZweite/spellbook/blob/5e062585156292a8f2ef688bf176bb038dc8307f/docs/architecture/python-backend-migration.md).
Für aktuelle Wahrheit die bestehenden Owners und Code prüfen.

Am 2026-10-24 beschrieben die offiziellen [SQLite-Einsatzgebiete](https://sqlite.org/whentouse.html) und [WAL-Dokumentation](https://sqlite.org/wal.html), abgerufen an diesem Tag, lokale Servernutzung mit parallelen Lesern, einem Writer und gemeinsamem Host.
Root sah SQLite deshalb bedingt als Kandidaten hinter der zentralen Python-API.
Kurze, gestaffelte Catalog-Schreibphasen müssten private Inventory-Writes vor langen Blockaden schützen.
Kyle akzeptierte am 2026-10-23 lange Background-Jobs und kontrollierte Retries und löste strikte Performance-/Ressourcen-Proofs als Implementierungsvoraussetzung ab.
Quelle: [ADR-0027 bei KyleDerZweite/spellbook@5e062585](https://github.com/KyleDerZweite/spellbook/blob/5e062585156292a8f2ef688bf176bb038dc8307f/docs/decisions/0027-python-functional-migration-acceptance.md).

Am 2026-10-24 ordnete Root den erinnerten Rust-Nachfolger vermutlich als Turso Database, zuvor Limbo, ein.
Bei `tursodatabase/turso@607bff9fd0e547a25a97b3bf06e83bcc5d99d53c` unterschied das [README](https://github.com/tursodatabase/turso/blob/607bff9fd0e547a25a97b3bf06e83bcc5d99d53c/README.md#how-is-turso-database-different-from-tursos-libsql) den Rewrite vom SQLite-Fork libSQL.
Es kennzeichnete [Multi-process WAL](https://github.com/tursodatabase/turso/blob/607bff9fd0e547a25a97b3bf06e83bcc5d99d53c/README.md#features-and-roadmap) als experimentell; der [MVCC-Guide](https://github.com/tursodatabase/turso/blob/607bff9fd0e547a25a97b3bf06e83bcc5d99d53c/docs/agent-guides/mvcc.md) bezeichnete MVCC als unterstützten Journal-Modus.
Diese Einzelbefunde erlaubten keine pauschale Reifeaussage.

Am 2026-10-24 empfahl Root vorläufig SQLite als konservativen Vergleichskandidaten, falls weniger Serverbetrieb das Ziel wäre; Tursos benötigter Mehrprozesspfad hatte dokumentierte Vorbehalte.
Das blieb eine Empfehlung ohne Wechsel- oder Experimentauftrag.
Die spätere [Gesamtbackend-Abwägung vom 2026-10-24](#gesamtbackend-abwägung-vom-2026-10-24) präzisierte diese vorläufige Empfehlung zugunsten des bestehenden PostgreSQL-Backends.
Quelle: [Research und nachgereichte Quellenbegrenzung](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-database-options-research-20261024-r1), [Roots Einordnung](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).

## Klarstellung vom 2026-10-24

Am 2026-10-24 bestätigte Kyle als theoretische Wechselmotive den separaten PostgreSQL-Service samt Betrieb, mögliche Ressourcen- oder Hostingkosten und den Wunsch nach einer portablen Datenbankdatei.
Das motivierte die Prüfung von Alternativen, belegte keine gemessenen PostgreSQL-Mängel oder Kosten und bedeutete weder eine Auswahl von SQLite oder Turso noch einen Migrationsauftrag.
Quelle: [Kyles Antwort im Strategiedialog vom 2026-10-24](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).

## Gesamtbackend-Abwägung vom 2026-10-24

Am 2026-10-24 fragte Kyle, ob PostgreSQL Daten, Suche, Vektoren, Zeitreihen und Queues bündeln und damit die Gesamtkomplexität reduzieren könne und welche alternativen Backend-/Storage-Stacks sinnvoll wären.
Die Motive blieben theoretisch; gemessene Kosten-/Ressourcenmängel, ein Engine-/Framework-Wechsel oder ein Prototype waren nicht ausgewählt.
Quelle: [Strategiedialog](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Root empfahl für Spellbooks Gesamtanforderungen und [Maintainability-Priorität](./priorities.md), Python/FastAPI mit PostgreSQL als gemeinsamem Dienst beizubehalten.
Das war eine Empfehlung, keine neue Entscheidung oder Implementierungsfreigabe.
Der damalige Empfehlungsvorbehalt zur bevorzugten Python-/PostgreSQL-Richtung wurde durch die [Bestätigung vom 2026-10-25](#bestätigung-vom-2026-10-25) überholt; konkrete Moduländerungen blieben davon getrennt.
Grundlage waren [Repository-Audit](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-db-total-code-20261024-r1), [SQLite-Vergleich](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-db-total-sqlite-20261024-r1) und [PostgreSQL-/Backend-Vergleich](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-db-total-postgres-20261024-r1).

Bei `KyleDerZweite/spellbook@1f914e3bacbd9ef692c7826c3c899281d8d325b3` konfigurierte [Compose](https://github.com/KyleDerZweite/spellbook/blob/1f914e3bacbd9ef692c7826c3c899281d8d325b3/podman-compose.yml#L4) keinen Redis-, Search-, Broker- oder Cron-Service.
PostgreSQL bündelte bereits [Text-/Trigrammsuche](https://github.com/KyleDerZweite/spellbook/blob/1f914e3bacbd9ef692c7826c3c899281d8d325b3/backend/core/src/spellbook_core/mtg/catalog_query.py#L97), [dauerhafte coalesced Category-Jobs](https://github.com/KyleDerZweite/spellbook/blob/1f914e3bacbd9ef692c7826c3c899281d8d325b3/backend/core/src/spellbook_core/mtg/categories/jobs.py#L26) und [SavedState-Signale](https://github.com/KyleDerZweite/spellbook/blob/1f914e3bacbd9ef692c7826c3c899281d8d325b3/backend/api/src/spellbook_api/listener.py#L79).
[NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) lieferte flüchtige Commit-Signale, keine dauerhafte Queue.
Jobtabellen ersetzten keine Ausführung durch Python-Worker.
pgvector, TimescaleDB, pg_cron und PGMQ waren unkonfiguriert und sollten nicht vorsorglich hinzukommen.
Für die vorhandene tägliche History erschienen normale indizierte Tabellen ausreichend; ein Bedarf für TimescaleDB war nicht belegt.
Als spätere Option bot [pgvector](https://github.com/pgvector/pgvector#indexing) exakte und approximative Vektorsuche; Embedding-Erzeugung, Modellversionierung und Neuberechnung blieben Anwendungsarbeit.
Bild-/Object-Storage blieb separat.
Diese Repository-Befunde belegten keinen laufenden Production-Zustand.

SQLite blieb ein realer Single-Host-Gegenentwurf mit portabler Datenbankdatei und brauchte grundsätzlich weder externen Search-Service noch Queue-Broker.
Die an diesem Tag geprüften offiziellen Dokumente belegten [FTS5 samt Substrings](https://www.sqlite.org/fts5.html), [WAL mit einem Writer auf demselben Host](https://www.sqlite.org/wal.html) und [Transaktionen](https://www.sqlite.org/lang_transaction.html), auf denen Job-Leases aufbauen könnten.
Letzteres war ein Architekturvorschlag, keine native Queue.
FTS5-Trigramme ersetzten nicht automatisch die bestehende Fuzzy-Semantik.
Neue Writer-Koordination, [atomare Catalog-Publikation](https://github.com/KyleDerZweite/spellbook/blob/1f914e3bacbd9ef692c7826c3c899281d8d325b3/backend/workers/catalog/src/worker/catalog.py#L113), prozessübergreifende Signale, Suchverträge und [exakte Dezimalarithmetik](https://www.sqlite.org/datatype3.html) machten den Rewrite derzeit weniger attraktiv.
Ein denkbarer SQLite-Port müsste Catalog-Daten in kurzen Schreibphasen vorbereiten und anschließend vollständig aktivieren, ohne private Mutationen lange zu blockieren.
Ein transaktionaler Change-Log mit unabhängigem Polling je API-Prozess könnte SavedState wecken; Recovery und Cursorlücken bräuchten einen eigenen Vertrag.
Beide Formen waren ungeprüfte Entwürfe.
Die geringere Servicezahl bewies keinen geringeren Gesamtaufwand.

Managed PostgreSQL war Roots erste Option für weniger eigenen DB-Betrieb.
Kosten, Restore, Extensions und Direct-/Session-Verbindungen waren für keinen Zielanbieter verifiziert.
[Supabase Transaction-Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres) ersetzte die benötigten Listener-/Session-Advisory-Verbindungen nicht.
Als breitere Alternativen bündelte [Django](https://docs.djangoproject.com/en/6.0/intro/overview/) ORM und Admin sowie [Auth](https://docs.djangoproject.com/en/6.0/topics/auth/), benötigte aber weiterhin Datenbank und [Task-Ausführung](https://docs.djangoproject.com/en/6.0/topics/tasks/).
[Supabase](https://supabase.com/docs/guides/getting-started/architecture) bündelte Plattformdienste; Self-Hosting bedeutete mehrere Prozesse.
[PocketBase](https://pocketbase.io/docs/) mit SQLite/Go oder [Convex](https://docs.convex.dev/understanding/overview) mit TypeScript und eigenem Datenmodell verlangten erhebliche Domain-Portierung.
Diese am 2026-10-24 geprüften Fähigkeiten beseitigten Spellbooks Fachlogik nicht; Framework-/BaaS-Wechsel blieben weitergehende Optionen ohne Auftrag.
Laufzeit, Suchqualität und Einsparungen wurden nicht gemessen.

## Bestätigung vom 2026-10-25

Am 2026-10-25 bestätigte Kyle ausdrücklich Python und PostgreSQL und äußerte seine Abneigung gegen Django.
Er beauftragte die Bewertung möglicher Vereinfachungen anhand eines externen modularen Stack-Vorschlags.
Quelle: [Nutzerauftrag im Strategiedialog](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Damit ist die bevorzugte Stack-Richtung bestätigt; die frühere offene Auswahl ist historischer Kontext.
Die Bestätigung ändert den bereits akzeptierten Python-/PostgreSQL-Vertrag nicht.
Sie wählt weder Litestar, SQLAlchemy, Alembic, Authlib oder SQLAdmin noch erteilt sie einen Rewrite-Auftrag.
Die [Standardisierungsbewertung vom 2026-10-25](./python-backend-standardization.md) hält statische Befunde und Roots getrennte Vorschläge fest.
