# Ersetzte Interfaces sofort entfernen

- Status: Historical
- Last Reviewed: 2026-10-24
- Source of Truth: datierte Quellenverweise; aktuelle Verträge bei den bestehenden Owners
- Update Triggers: Interface-Ersatz, Client-Upgrades, Abgrenzung zur Production-Freigabe
- Related Docs: [Index](./index.md), [Prioritäten](./priorities.md), [CI-Vereinfachung](./ci-simplification.md)

Am 2026-10-24 wählte Kyle die sofortige Entfernung ersetzter Interfaces ohne Alias, Fallback oder Deprecation Window.
Ältere Clients sollten aktualisiert werden.
Quelle: [Nutzerentscheidung im Strategiedialog](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).

Am 2026-10-24 hielten [CONTRIBUTING](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/CONTRIBUTING.md#replacing-interfaces) und [ADR-0029](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/docs/decisions/0029-remove-replaced-interfaces.md) bei `KyleDerZweite/spellbook@62c13b5c7a1c5a9a97f25f4e214271bea7ad4951` diese Policy sowie die Entfernung historischer HTTP-Aliase und flacher Browser-Routen im Kandidaten fest.
Gespeicherte Nutzerdaten, SQL-Historie und Receipt-Korrektheit blieben eigene Schutzanforderungen.
Für künftige Ersetzungen die [Contribution-Policy](../../CONTRIBUTING.md#replacing-interfaces) lesen.

Am 2026-10-24 autorisierte der Wiki-Auftrag weder Merge noch Production-Cutover, produktiven Migrator oder Ende des realen Rollback-Fensters.
Quelle: [Implementierungsauftrag](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-wiki-initial-history-20261024-r1).
Historisch nicht ausgeführte Target-Prüfungen liefern weder einen Pass noch automatisch einen neuen Blocker.
