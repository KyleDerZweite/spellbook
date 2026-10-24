# Datenbankoptionen ohne Wechselentscheidung

- Status: Historical
- Last Reviewed: 2026-10-24
- Source of Truth: datierte Primärquellen und verlinkte Research-Befunde
- Update Triggers: geklärte Wechselmotivation, Datenbankentscheidung, neue belegte Engine-Eigenschaften
- Related Docs: [Index](./index.md), [Prioritäten](./priorities.md), [Postgres-Owner](../architecture/postgres.md)

Am 2026-10-24 eröffnete Kyle die Datenbankdiskussion erneut und erinnerte sich an einen SQLite-Nachfolger in Rust.
Eine Engine oder Migration wählte er nicht; der Anlass seiner Unzufriedenheit blieb offen.
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
Quelle: [Research und nachgereichte Quellenbegrenzung](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-database-options-research-20261024-r1), [Roots Einordnung](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).

## Klarstellung vom 2026-10-24

Am 2026-10-24 bestätigte Kyle als theoretische Wechselmotive den separaten PostgreSQL-Service samt Betrieb, mögliche Ressourcen- oder Hostingkosten und den Wunsch nach einer portablen Datenbankdatei.
Das motivierte die Prüfung von Alternativen, belegte keine gemessenen PostgreSQL-Mängel oder Kosten und bedeutete weder eine Auswahl von SQLite oder Turso noch einen Migrationsauftrag.
Quelle: [Kyles Antwort im Strategiedialog vom 2026-10-24](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
