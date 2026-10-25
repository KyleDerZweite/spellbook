# Historisches Strategie-Wiki

- Status: Historical
- Last Reviewed: 2026-10-25
- Source of Truth: datierte Quellen in den verlinkten Themenseiten
- Update Triggers: dauerhafte Erkenntnisse, Nutzerkorrekturen, strategische Entscheidungen, Wiederaufnahme, Documentation Health Review, Gesamtbackend-Vergleich, Python-/PostgreSQL-Bestätigung, native FastAPI-Freigabe, Pre-release-Verzicht, Admin-/ML-Neubewertung und native Implementierungs-/Runtime-Evidenz
- Related Docs: [Dokumentationsindex](../README.md), [Agent-Anweisungen](../../AGENTS.md)

Am 2026-10-24 beauftragte Kyle diese historische Sammlung unter `docs/wiki/`.
Quelle: [Strategiedialog](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Für die aktuelle Systembeschreibung die [bestehenden Owners](../README.md) lesen; Implementierungsfragen an Code, Tests und Configuration prüfen.
Vor strategischen Entscheidungen und Wiederaufnahme den Index und relevante Seiten lesen; danach betroffene Seiten und Index gemäß [Wiki-Pflege](./wiki-maintenance.md) fortschreiben.

## Orientierung und Pflege

- [Index](./index.md): Einstieg und vollständiges Seitenverzeichnis.
- [Wiki-Pflege](./wiki-maintenance.md): Ortswahl, Quellenregeln, Query, Ingest und periodischer Lint.

## Prioritäten und Entscheidungen

- [Prioritäten und Zusammenarbeit](./priorities.md): Maintainability vor Simplicity vor Features, Context Pointers und abgelöste Proof-Gates.
- [Android zuerst](./mobile-direction.md): Bestätigte Plattformpriorität und getrennte Kotlin-Empfehlung.
- [Interface-Entfernung](./interface-removal.md): Sofortiger Ersatz alter Interfaces, erweiterter Pre-release-Verzicht und getrennte Production-Autorität.
- [Datenbankoptionen](./database-options.md): SQLite-/Turso-Historie, theoretische Wechselmotive, Gesamtbackend-Vergleich und spätere Bestätigung von Python und PostgreSQL.
- [Python-Backend standardisieren](./python-backend-standardization.md): Nativer FastAPI-/Pydantic-Stand bei B388, bestandener HTTP-Neulauf bei AD5 und offene Admin-/ML-Vorschläge.

## Tooling und Prüfungen

- [uv statt vermutetem pip](./python-tooling.md): Datierter Audit und begrenzte Korrektur der Worker-Beispiele.
- [CI-Vereinfachung](./ci-simplification.md): Entfernte Mehrfachprüfungen und ungemessene Zeitersparnis.
